/**
 * Logo officiel Krimossimo (image d'origine, non retouchée) associé au nom.
 * - L'image est affichée dans ses proportions carrées d'origine ; seuls les coins
 *   sont légèrement arrondis à l'affichage, comme une icône d'application.
 * - En mode sombre, un liseré discret détache le coin noir du logo du fond noir.
 * - Le nom est masqué sous 360 px de large pour garder le header sur une ligne.
 */
const base = import.meta.env.BASE_URL

type Props = {
  /** Taille du logo : header (sm) ou footer (md). */
  size?: 'sm' | 'md'
  className?: string
}

export function BrandLogo({ size = 'sm', className = '' }: Props) {
  const box = size === 'md' ? 'size-11 rounded-[11px]' : 'size-9 rounded-[9px] sm:size-10 sm:rounded-[10px]'
  const text = size === 'md' ? 'text-[1.3rem]' : 'text-[1.15rem] sm:text-[1.25rem]'

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <img
        src={`${base}images/krimossimo-logo-128.webp`}
        srcSet={`${base}images/krimossimo-logo-128.webp 128w, ${base}images/krimossimo-logo-256.webp 256w`}
        sizes={size === 'md' ? '44px' : '40px'}
        width={128}
        height={128}
        alt=""
        decoding="async"
        className={`${box} shrink-0 object-contain dark:ring-1 dark:ring-line-strong`}
      />
      <span
        className={`font-display font-semibold leading-none tracking-[-0.03em] text-ink max-[359px]:hidden ${text}`}
      >
        Krimossimo
      </span>
    </span>
  )
}
