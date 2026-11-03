import { describe, expect, it } from 'vitest'
import { YOUTUBE_CACHE_KEY, YOUTUBE_CACHE_TTL_MS, YouTubeError, fetchChannelVideos, loadYouTubeFeed, readCache } from './youtube'

const channels = [
  { key: 'main', channelId: 'UCaaaaaaaaaaaaaaaaaaaaaa', handle: '@A', url: 'https://www.youtube.com/@A' },
  { key: 'tech', channelId: 'UCbbbbbbbbbbbbbbbbbbbbbb', handle: '@B', url: 'https://www.youtube.com/@B' },
]
const KEY = 'AIzaTestKeyTestKeyTestKeyTest123'

const vid = (n: number) => `vid${String(n).padStart(8, '0')}`
const video = (id: string, extra: Record<string, unknown> = {}, status: Record<string, unknown> = {}) => ({
  id,
  snippet: {
    title: `Vidéo ${id}`,
    publishedAt: `2026-10-${String(10 + Number(id.slice(-2))).padStart(2, '0')}T12:00:00Z`,
    liveBroadcastContent: 'none',
    thumbnails: { high: { url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` } },
    ...extra,
  },
  status: { privacyStatus: 'public', uploadStatus: 'processed', ...status },
})

/** Faux point d'accès de l'API YouTube Data v3. */
function fakeApi({ videos = [video(vid(1)), video(vid(2)), video(vid(3))], failWith }: { videos?: unknown[]; failWith?: { status: number; reason?: string } | 'network' } = {}) {
  const calls: URL[] = []
  const impl = (async (input: string) => {
    const url = new URL(input)
    calls.push(url)
    if (failWith === 'network') throw new TypeError('Failed to fetch')
    if (failWith) return new Response(JSON.stringify({ error: { code: failWith.status, errors: [{ reason: failWith.reason ?? 'forbidden' }] } }), { status: failWith.status })
    const path = url.pathname.split('/').pop()
    let body: unknown = {}
    if (path === 'channels') {
      body = { items: url.searchParams.get('id')!.split(',').map((id) => ({ id, snippet: { title: `Chaîne ${id.slice(-1)}` }, contentDetails: { relatedPlaylists: { uploads: `UU${id.slice(2)}` } } })) }
    } else if (path === 'playlistItems') {
      const ids = url.searchParams.get('playlistId')!.endsWith('a') ? [vid(1), vid(2), vid(3)] : [vid(3)]
      body = { items: ids.map((videoId) => ({ contentDetails: { videoId } })) }
    } else if (path === 'videos') {
      const wanted = url.searchParams.get('id')!.split(',')
      body = { items: videos.filter((v) => wanted.includes((v as { id: string }).id)) }
    }
    return new Response(JSON.stringify(body), { status: 200 })
  }) as unknown as typeof fetch
  return { impl, calls }
}

function memoryStorage() {
  const map = new Map<string, string>()
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), map }
}

describe('API YouTube', () => {
  it('récupère les dernières vidéos de chaque chaîne, triées par date, avec miniature et lien', async () => {
    const api = fakeApi()
    const result = await fetchChannelVideos(channels, KEY, { fetch: api.impl })
    expect(result[0]).toMatchObject({ key: 'main', status: 'ok', title: 'Chaîne a' })
    if (result[0].status !== 'ok') throw new Error()
    expect(result[0].videos.map((v) => v.youtubeId)).toEqual([vid(3), vid(2), vid(1)])
    expect(result[0].videos[0]).toEqual({ youtubeId: vid(3), title: `Vidéo ${vid(3)}`, publishedAt: '2026-10-13T12:00:00Z', thumbnail: `https://i.ytimg.com/vi/${vid(3)}/hqdefault.jpg` })
    expect(result[1]).toMatchObject({ key: 'tech', status: 'ok' })
    // 1 appel channels + 1 playlistItems par chaîne + 1 videos = 4 unités de quota.
    expect(api.calls.map((u) => u.pathname.split('/').pop())).toEqual(['channels', 'playlistItems', 'playlistItems', 'videos'])
    expect(api.calls.every((u) => u.searchParams.get('key') === KEY && u.origin === 'https://www.googleapis.com')).toBe(true)
  })

  it('écarte les vidéos privées, non traitées, programmées ou en direct et les miniatures étrangères', async () => {
    const api = fakeApi({
      videos: [
        video(vid(1), {}, { privacyStatus: 'private' }),
        video(vid(2), { liveBroadcastContent: 'upcoming' }),
        video(vid(3), { thumbnails: { high: { url: 'https://evil.example/x.jpg' } } }),
      ],
    })
    const [main] = await fetchChannelVideos(channels, KEY, { fetch: api.impl })
    if (main.status !== 'ok') throw new Error()
    expect(main.videos.map((v) => v.youtubeId)).toEqual([vid(3)])
    expect(main.videos[0].thumbnail).toBeUndefined()
  })

  it('traduit les erreurs (quota, clé refusée, réseau)', async () => {
    await expect(fetchChannelVideos(channels, KEY, { fetch: fakeApi({ failWith: { status: 403, reason: 'quotaExceeded' } }).impl })).rejects.toMatchObject({ code: 'quota' })
    await expect(fetchChannelVideos(channels, KEY, { fetch: fakeApi({ failWith: { status: 403, reason: 'ipRefererBlocked' } }).impl })).rejects.toMatchObject({ code: 'forbidden' })
    await expect(fetchChannelVideos(channels, KEY, { fetch: fakeApi({ failWith: 'network' }).impl })).rejects.toMatchObject({ code: 'network' })
  })
})

describe('cache de 6 heures', () => {
  it('un seul appel à l’API pendant 6 heures, puis actualisation', async () => {
    const storage = memoryStorage()
    const api = fakeApi()
    let now = Date.parse('2026-11-03T10:00:00Z')
    const load = () => loadYouTubeFeed(channels, { key: KEY, fetch: api.impl, storage, now: () => now })
    const first = await load()
    expect(first.stale).toBe(false)
    const calls = api.calls.length
    now += YOUTUBE_CACHE_TTL_MS - 1000
    await load()
    expect(api.calls.length).toBe(calls)
    now += 2000
    await load()
    expect(api.calls.length).toBe(calls * 2)
    expect(JSON.parse(storage.map.get(YOUTUBE_CACHE_KEY)!).v).toBe(1)
  })

  it('API en échec : dernière copie affichée et signalée ; sans copie, erreur', async () => {
    const storage = memoryStorage()
    let now = Date.parse('2026-11-03T10:00:00Z')
    await loadYouTubeFeed(channels, { key: KEY, fetch: fakeApi().impl, storage, now: () => now })
    now += YOUTUBE_CACHE_TTL_MS + 1
    const stale = await loadYouTubeFeed(channels, { key: KEY, fetch: fakeApi({ failWith: { status: 403, reason: 'quotaExceeded' } }).impl, storage, now: () => now })
    expect(stale.stale).toBe(true)
    expect(stale.channels[0]).toMatchObject({ status: 'ok' })
    await expect(loadYouTubeFeed(channels, { key: KEY, fetch: fakeApi({ failWith: 'network' }).impl, storage: memoryStorage(), now: () => now })).rejects.toBeInstanceOf(YouTubeError)
  })

  it('cache altéré ou d’une autre configuration : ignoré', () => {
    const storage = memoryStorage()
    const key = channels.map((c) => c.channelId).join(',')
    storage.setItem(YOUTUBE_CACHE_KEY, '{pas du json')
    expect(readCache(storage, key)).toBeNull()
    const entry = { v: 1, key, fetchedAt: 1, channels: [{ key: 'main', status: 'ok', title: 'x', videos: [{ youtubeId: 'javascript:1', title: 'x', publishedAt: 'x' }] }] }
    storage.setItem(YOUTUBE_CACHE_KEY, JSON.stringify(entry))
    expect(readCache(storage, key)).toBeNull()
    storage.setItem(YOUTUBE_CACHE_KEY, JSON.stringify({ ...entry, channels: [] }))
    expect(readCache(storage, 'autre')).toBeNull()
    expect(readCache(null, key)).toBeNull()
  })
})
