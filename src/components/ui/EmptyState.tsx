import type { ReactNode } from 'react'
import { PixelMark } from './PixelMark'

type Props = {
  seed: string
  title: string
  text?: string
  actions?: ReactNode
}

/** État vide : une invitation à agir plutôt qu'un écran blanc. */
export function EmptyState({ seed, title, text, actions }: Props) {
  return (
    <div className="flex flex-col items-start gap-5 rounded-[1.5rem] border border-dashed border-line-strong bg-surface p-7 sm:flex-row sm:items-center sm:p-9">
      <PixelMark seed={seed} className="size-14 shrink-0 text-blue" />
      <div className="flex-1">
        <h2 className="text-[1.25rem] font-semibold tracking-[-0.02em]">{title}</h2>
        {text && <p className="mt-2 max-w-xl text-muted">{text}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
    </div>
  )
}
