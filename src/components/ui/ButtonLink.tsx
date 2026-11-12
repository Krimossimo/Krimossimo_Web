import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { buttonClass, type ButtonVariant } from './buttonStyles'

type Props = {
  to: string
  children: ReactNode
  variant?: ButtonVariant
  className?: string
}

/** Lien en forme de bouton d'arcade ; le bouton principal lâche une gerbe de pixels au clic. */
export function ButtonLink({ to, children, variant = 'primary', className = '' }: Props) {
  return (
    <Link to={to} data-burst={variant === 'primary' ? '' : undefined} className={buttonClass(variant, className)}>
      {children}
    </Link>
  )
}
