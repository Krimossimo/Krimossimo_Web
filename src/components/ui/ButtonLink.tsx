import type { ReactNode } from 'react'
import { Link } from 'react-router'

type Variant = 'primary' | 'secondary' | 'ghost'

const base =
  'group inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 text-[0.98rem] font-medium ' +
  'transition-[background-color,color,border-color,transform] duration-150 ease-snap active:translate-y-px'

const variants: Record<Variant, string> = {
  primary: 'bg-blue text-on-blue hover:bg-blue-hover',
  secondary: 'border border-line-strong bg-raised text-ink hover:border-ink',
  ghost: 'text-ink hover:text-blue',
}

type Props = {
  to: string
  children: ReactNode
  variant?: Variant
  className?: string
}

export function ButtonLink({ to, children, variant = 'primary', className = '' }: Props) {
  return (
    <Link to={to} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </Link>
  )
}
