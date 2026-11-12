/**
 * Succès à débloquer en explorant le site.
 * Logique pure (testable) : définitions, état, règles de déblocage, lecture/écriture locale.
 * Seuls des identifiants de succès et des chemins de pages sont conservés dans le navigateur :
 * aucune donnée personnelle.
 */

export const achievementIds = [
  'start',
  'explorer',
  'bottom',
  'modes',
  'theme',
  'language',
  'loot',
  'secret',
] as const

export type AchievementId = (typeof achievementIds)[number]

/** Succès dont la description reste masquée tant qu'il n'est pas débloqué. */
export const hiddenAchievements: ReadonlySet<AchievementId> = new Set(['secret'])

/** Nombre de pages différentes à visiter pour « Explorateur ». */
export const EXPLORER_PAGES = 4
/** Modes de l'accueil à essayer pour « Touche-à-tout ». */
export const MODE_KEYS = ['dev', 'create', 'play'] as const

export type GameState = {
  version: 1
  /** Succès débloqués : identifiant → horodatage. */
  unlocked: Partial<Record<AchievementId, number>>
  /** Pages visitées (chemins normalisés, sans paramètres). */
  pages: string[]
  /** Modes essayés sur l'accueil. */
  modes: string[]
}

export const emptyState = (): GameState => ({ version: 1, unlocked: {}, pages: [], modes: [] })

export const STORAGE_KEY = 'krimossimo-achievements'

export function isUnlocked(state: GameState, id: AchievementId) {
  return state.unlocked[id] !== undefined
}

export function unlockedCount(state: GameState) {
  return achievementIds.filter((id) => isUnlocked(state, id)).length
}

type Result = { state: GameState; unlocked: AchievementId[] }

/** Débloque un succès (sans effet s'il l'est déjà). */
export function unlock(state: GameState, id: AchievementId, now = Date.now()): Result {
  if (isUnlocked(state, id)) return { state, unlocked: [] }
  return { state: { ...state, unlocked: { ...state.unlocked, [id]: now } }, unlocked: [id] }
}

/** Les pages /projects/a et /projects/b comptent comme une seule page « Projets ». */
export function normalizePath(pathname: string) {
  const parts = pathname.split('?')[0].split('#')[0].split('/').filter(Boolean)
  return '/' + (parts[0] ?? '')
}

/** Enregistre une page visitée ; débloque « Explorateur » au seuil atteint. */
export function visitPage(state: GameState, pathname: string, now = Date.now()): Result {
  const page = normalizePath(pathname)
  const pages = state.pages.includes(page) ? state.pages : [...state.pages, page]
  const next = pages === state.pages ? state : { ...state, pages }
  return pages.length >= EXPLORER_PAGES ? unlock(next, 'explorer', now) : { state: next, unlocked: [] }
}

/** Enregistre un mode essayé ; débloque « Touche-à-tout » quand les trois l'ont été. */
export function tryMode(state: GameState, mode: string, now = Date.now()): Result {
  if (!(MODE_KEYS as readonly string[]).includes(mode)) return { state, unlocked: [] }
  const modes = state.modes.includes(mode) ? state.modes : [...state.modes, mode]
  const next = modes === state.modes ? state : { ...state, modes }
  return MODE_KEYS.every((m) => modes.includes(m)) ? unlock(next, 'modes', now) : { state: next, unlocked: [] }
}

/** Lecture tolérante : toute donnée invalide est ignorée plutôt que de casser le site. */
export function parseState(raw: string | null): GameState {
  if (!raw) return emptyState()
  try {
    const data = JSON.parse(raw) as Partial<GameState> | null
    if (!data || typeof data !== 'object' || data.version !== 1) return emptyState()
    const unlocked: GameState['unlocked'] = {}
    for (const id of achievementIds) {
      const at = data.unlocked?.[id]
      if (typeof at === 'number' && Number.isFinite(at)) unlocked[id] = at
    }
    const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 50) : [])
    return { version: 1, unlocked, pages: strings(data.pages), modes: strings(data.modes) }
  } catch {
    return emptyState()
  }
}

export function loadState(): GameState {
  try {
    return parseState(localStorage.getItem(STORAGE_KEY))
  } catch {
    return emptyState()
  }
}

export function saveState(state: GameState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Stockage indisponible (navigation privée stricte) : le jeu continue sans sauvegarde.
  }
}

/** Le fameux code : ↑ ↑ ↓ ↓ ← → ← → B A. */
export const SECRET_CODE = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'b',
  'a',
] as const

/**
 * Fait avancer la saisie du code ; renvoie la nouvelle position (= longueur du code si complet).
 * En cas d'erreur, on garde le plus long début du code déjà tapé (ex. ↑ ↑ ↑ ↓ fonctionne).
 */
export function advanceCode(position: number, key: string): number {
  const k = key.length === 1 ? key.toLowerCase() : key
  const typed: string[] = [...SECRET_CODE.slice(0, position), k]
  for (let len = Math.min(typed.length, SECRET_CODE.length); len > 0; len--) {
    const tail = typed.slice(typed.length - len)
    if (tail.every((key2, i) => key2 === SECRET_CODE[i])) return len
  }
  return 0
}
