/**
 * Dernières vidéos publiques des chaînes YouTube (YouTube Data API v3).
 *
 * Clé utilisée : VITE_YOUTUBE_API_KEY. Ce n'est PAS un secret : une clé d'API Google
 * destinée au navigateur, qui doit être restreinte dans Google Cloud (sites autorisés =
 * adresse du site, API autorisée = YouTube Data API v3 uniquement). Voir docs/integrations.md.
 *
 * Coût par actualisation : 5 unités de quota (1 channels.list pour les 3 chaînes, 1
 * playlistItems.list par chaîne, 1 videos.list pour toutes les vidéos), sur un quota
 * gratuit de 10 000 unités par jour. Le résultat est gardé 6 heures dans le navigateur
 * (données publiques uniquement) : un visiteur ne déclenche donc au plus qu'une
 * actualisation toutes les 6 heures.
 */
import type { Video } from '../types/content'

export type ChannelConfig = { key: string; channelId: string; handle: string; url: string }

export type ChannelVideos =
  | { key: string; status: 'ok'; title: string; videos: Video[] }
  | { key: string; status: 'error'; code: YouTubeErrorCode }

export type YouTubeErrorCode = 'network' | 'quota' | 'forbidden' | 'not-found' | 'bad-response'

export type YouTubeFeed = {
  channels: ChannelVideos[]
  /** Date de l'actualisation (ms). */
  fetchedAt: number
  /** Vrai si l'API a échoué et que les données affichées viennent d'une actualisation précédente. */
  stale: boolean
}

export class YouTubeError extends Error {
  constructor(readonly code: YouTubeErrorCode) {
    super(`YouTube API error: ${code}`)
    this.name = 'YouTubeError'
  }
}

const env: Partial<ImportMetaEnv> = import.meta.env ?? {}
export const youtubeApiKey = (env.VITE_YOUTUBE_API_KEY ?? '').trim()
export const isYouTubeConfigured = /^[A-Za-z0-9_-]{20,60}$/.test(youtubeApiKey)

export const YOUTUBE_CACHE_KEY = 'krimossimo-youtube'
export const YOUTUBE_CACHE_TTL_MS = 6 * 60 * 60 * 1000
/** Au-delà, une ancienne copie n'est plus affichée même en cas d'erreur. */
const STALE_MAX_MS = 7 * 24 * 60 * 60 * 1000
export const VIDEOS_PER_CHANNEL = 6

const API = 'https://www.googleapis.com/youtube/v3'
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/
const PLAYLIST_ID = /^UU[A-Za-z0-9_-]{22}$/

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const items = (data: unknown): Record<string, unknown>[] => (isRecord(data) && Array.isArray(data.items) ? data.items.filter(isRecord) : [])

/** Miniature servie par YouTube uniquement (aucune autre origine n'est acceptée). */
function thumbnailOf(snippet: Record<string, unknown>): string | undefined {
  const thumbs = isRecord(snippet.thumbnails) ? snippet.thumbnails : {}
  for (const size of ['high', 'medium', 'standard', 'default']) {
    const url = isRecord(thumbs[size]) ? thumbs[size].url : undefined
    if (typeof url === 'string' && /^https:\/\/i\d?\.ytimg\.com\//.test(url)) return url
  }
  return undefined
}

type Options = { fetch?: typeof fetch; timeoutMs?: number }

async function get(path: string, params: Record<string, string>, key: string, { fetch: doFetch = globalThis.fetch.bind(globalThis), timeoutMs = 15000 }: Options) {
  const url = `${API}/${path}?${new URLSearchParams({ ...params, key }).toString()}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let response: Response
  try {
    response = await doFetch(url, { signal: controller.signal, credentials: 'omit' })
  } catch {
    throw new YouTubeError('network')
  } finally {
    clearTimeout(timer)
  }
  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const error = isRecord(data) && isRecord(data.error) ? data.error : {}
    const reasons = (Array.isArray(error.errors) ? error.errors : []).map((e) => (isRecord(e) ? String(e.reason) : ''))
    if (reasons.some((r) => r === 'quotaExceeded' || r === 'dailyLimitExceeded' || r === 'rateLimitExceeded')) throw new YouTubeError('quota')
    if (response.status === 404) throw new YouTubeError('not-found')
    if (response.status === 400 || response.status === 401 || response.status === 403) throw new YouTubeError('forbidden')
    throw new YouTubeError('network')
  }
  return data
}

/**
 * Interroge l'API : chaînes → listes « uploads » → détails des vidéos.
 * Ne garde que les vidéos publiques déjà publiées (ni privées, ni programmées, ni en direct).
 */
export async function fetchChannelVideos(channels: readonly ChannelConfig[], key: string, options: Options = {}): Promise<ChannelVideos[]> {
  const channelData = items(await get('channels', { part: 'snippet,contentDetails', id: channels.map((c) => c.channelId).join(','), maxResults: '50' }, key, options))

  const perChannel = await Promise.all(
    channels.map(async (channel): Promise<{ channel: ChannelConfig; title: string; ids: string[] } | ChannelVideos> => {
      const found = channelData.find((c) => c.id === channel.channelId)
      const details = found && isRecord(found.contentDetails) && isRecord(found.contentDetails.relatedPlaylists) ? found.contentDetails.relatedPlaylists : null
      const uploads = details?.uploads
      if (!found || typeof uploads !== 'string' || !PLAYLIST_ID.test(uploads)) return { key: channel.key, status: 'error', code: 'not-found' }
      const title = isRecord(found.snippet) && typeof found.snippet.title === 'string' ? found.snippet.title.slice(0, 100) : channel.handle
      try {
        const list = items(await get('playlistItems', { part: 'contentDetails', playlistId: uploads, maxResults: '15' }, key, options))
        const ids = list
          .map((i) => (isRecord(i.contentDetails) ? i.contentDetails.videoId : undefined))
          .filter((id): id is string => typeof id === 'string' && VIDEO_ID.test(id))
        return { channel, title, ids }
      } catch (error) {
        // Chaîne sans aucune vidéo : YouTube répond 404 sur sa liste « uploads ».
        if (error instanceof YouTubeError && error.code === 'not-found') return { channel, title, ids: [] }
        if (error instanceof YouTubeError) return { key: channel.key, status: 'error', code: error.code }
        throw error
      }
    }),
  )

  const allIds = [...new Set(perChannel.flatMap((c) => ('ids' in c ? c.ids : [])))]
  const details = new Map<string, Video>()
  for (let i = 0; i < allIds.length; i += 50) {
    const batch = allIds.slice(i, i + 50)
    for (const v of items(await get('videos', { part: 'snippet,status', id: batch.join(','), maxResults: '50' }, key, options))) {
      const snippet = isRecord(v.snippet) ? v.snippet : null
      const status = isRecord(v.status) ? v.status : null
      if (typeof v.id !== 'string' || !VIDEO_ID.test(v.id) || !snippet || !status) continue
      if (status.privacyStatus !== 'public' || status.uploadStatus !== 'processed') continue
      if (snippet.liveBroadcastContent !== 'none') continue
      const publishedAt = typeof snippet.publishedAt === 'string' && !Number.isNaN(Date.parse(snippet.publishedAt)) ? snippet.publishedAt : null
      const title = typeof snippet.title === 'string' ? snippet.title.trim().slice(0, 200) : ''
      if (!publishedAt || !title) continue
      details.set(v.id, { youtubeId: v.id, title, publishedAt, thumbnail: thumbnailOf(snippet) })
    }
  }

  return perChannel.map((c) => {
    if (!('ids' in c)) return c
    const videos = c.ids
      .map((id) => details.get(id))
      .filter((v): v is Video => v !== undefined)
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
      .slice(0, VIDEOS_PER_CHANNEL)
    return { key: c.channel.key, status: 'ok', title: c.title, videos }
  })
}

/* ------------------------------------------------------------------- Cache */

type Stored = { v: 1; key: string; fetchedAt: number; channels: ChannelVideos[] }
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

function safeStorage(): StorageLike | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

/** Relit le cache ; ignore tout contenu altéré ou d'une autre configuration de chaînes. */
export function readCache(storage: StorageLike | null, configKey: string): Stored | null {
  try {
    const raw = storage?.getItem(YOUTUBE_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Stored
    if (parsed?.v !== 1 || parsed.key !== configKey || typeof parsed.fetchedAt !== 'number' || !Array.isArray(parsed.channels)) return null
    const valid = parsed.channels.every(
      (c) =>
        isRecord(c) &&
        c.status === 'ok' &&
        Array.isArray(c.videos) &&
        c.videos.every((v) => isRecord(v) && typeof v.youtubeId === 'string' && VIDEO_ID.test(v.youtubeId) && typeof v.title === 'string' && typeof v.publishedAt === 'string' && (v.thumbnail === undefined || (typeof v.thumbnail === 'string' && /^https:\/\/i\d?\.ytimg\.com\//.test(v.thumbnail)))),
    )
    return valid ? parsed : null
  } catch {
    return null
  }
}

function writeCache(storage: StorageLike | null, value: Stored) {
  try {
    storage?.setItem(YOUTUBE_CACHE_KEY, JSON.stringify(value))
  } catch {
    /* stockage plein ou interdit : l'affichage fonctionne sans cache */
  }
}

/**
 * Vidéos à afficher : cache de moins de 6 h, sinon nouvel appel à l'API. Si l'API échoue,
 * une copie de moins de 7 jours est affichée (marquée « stale »), sinon l'erreur est levée.
 * Seuls les résultats entièrement réussis sont mis en cache.
 */
export async function loadYouTubeFeed(
  channels: readonly ChannelConfig[],
  {
    key = youtubeApiKey,
    fetch: doFetch,
    storage = safeStorage(),
    now = Date.now,
    force = false,
  }: { key?: string; fetch?: typeof fetch; storage?: StorageLike | null; now?: () => number; force?: boolean } = {},
): Promise<YouTubeFeed> {
  const configKey = channels.map((c) => c.channelId).join(',')
  const cached = readCache(storage, configKey)
  if (!force && cached && now() - cached.fetchedAt < YOUTUBE_CACHE_TTL_MS && cached.fetchedAt <= now()) {
    return { channels: cached.channels, fetchedAt: cached.fetchedAt, stale: false }
  }
  try {
    const result = await fetchChannelVideos(channels, key, { fetch: doFetch })
    const fetchedAt = now()
    if (result.every((c) => c.status === 'ok')) {
      writeCache(storage, { v: 1, key: configKey, fetchedAt, channels: result })
      return { channels: result, fetchedAt, stale: false }
    }
    // Échec partiel : les chaînes en erreur reprennent leur dernière copie connue si elle existe.
    const recent = cached && now() - cached.fetchedAt < STALE_MAX_MS ? cached : null
    const merged = result.map((c) => (c.status === 'error' ? (recent?.channels.find((old) => old.key === c.key) ?? c) : c))
    return { channels: merged, fetchedAt, stale: merged.some((c, i) => c !== result[i]) }
  } catch (error) {
    if (cached && now() - cached.fetchedAt < STALE_MAX_MS) return { channels: cached.channels, fetchedAt: cached.fetchedAt, stale: true }
    throw error instanceof YouTubeError ? error : new YouTubeError('network')
  }
}
