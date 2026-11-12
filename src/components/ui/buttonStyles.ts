/**
 * Styles des boutons « touche d'arcade » (voir .btn-key dans index.css) :
 * relief, petit saut au survol, enfoncement au clic, reflet qui balaie le bouton.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost'

const base =
  'group inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 text-[0.98rem] font-medium ' +
  'select-none [-webkit-tap-highlight-color:transparent]'

const variants: Record<ButtonVariant, string> = {
  primary: 'btn-key btn-primary bg-blue text-on-blue hover:bg-blue-hover',
  secondary: 'btn-key border border-line-strong bg-raised text-ink hover:border-ink',
  ghost: 'text-ink transition-colors hover:text-blue',
}

export function buttonClass(variant: ButtonVariant = 'primary', className = '') {
  return `${base} ${variants[variant]} ${className}`
}
