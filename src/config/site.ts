export const navItems = [
  { key: 'about', path: '/about' },
  { key: 'projects', path: '/projects' },
  { key: 'shop', path: '/shop' },
  { key: 'games', path: '/games' },
  { key: 'activities', path: '/activities' },
  { key: 'contact', path: '/contact' },
] as const

export type NavKey = (typeof navItems)[number]['key']

/** Icône d'un réseau (plusieurs liens peuvent partager la même icône, ex. les chaînes YouTube). */
export type SocialIcon = 'x' | 'twitch' | 'youtube' | 'instagram' | 'tiktok' | 'github'

/** Profils officiels de la marque (liste fournie par Krimossimo). */
export const socials: ReadonlyArray<{ id: string; icon: SocialIcon; label: string; url: string }> = [
  { id: 'youtube', icon: 'youtube', label: 'YouTube', url: 'https://www.youtube.com/@Krimossimo' },
  { id: 'youtube-replay', icon: 'youtube', label: 'YouTube Replay', url: 'https://www.youtube.com/@KrimossimoReplay' },
  { id: 'youtube-tech', icon: 'youtube', label: 'YouTube Tech', url: 'https://www.youtube.com/@KrimossimoTech' },
  { id: 'twitch', icon: 'twitch', label: 'Twitch', url: 'https://www.twitch.tv/krimossimo' },
  { id: 'x', icon: 'x', label: 'X', url: 'https://x.com/krimossimo_' },
  { id: 'instagram', icon: 'instagram', label: 'Instagram', url: 'https://www.instagram.com/krimossimo_/' },
  { id: 'tiktok', icon: 'tiktok', label: 'TikTok', url: 'https://www.tiktok.com/@krimossimo' },
  { id: 'github', icon: 'github', label: 'GitHub', url: 'https://github.com/Krimossimo' },
]

/**
 * Chaînes YouTube dont les dernières vidéos s'affichent sur la page Activités.
 * Identifiants de chaîne (UC…) relevés sur les pages publiques des chaînes ; ils
 * restent valables même si le nom d'utilisateur (@…) change.
 */
export const youtubeChannels = [
  { key: 'main', channelId: 'UCynAEWeQTWW38HHo8MFX9_g', handle: '@Krimossimo', url: 'https://www.youtube.com/@Krimossimo' },
  { key: 'replay', channelId: 'UCmllvEeosCaoSpDjsvuuWBQ', handle: '@KrimossimoReplay', url: 'https://www.youtube.com/@KrimossimoReplay' },
  { key: 'tech', channelId: 'UCeTlLisyYaXQYPklmgJhN0w', handle: '@KrimossimoTech', url: 'https://www.youtube.com/@KrimossimoTech' },
] as const

export type YouTubeChannel = (typeof youtubeChannels)[number]
