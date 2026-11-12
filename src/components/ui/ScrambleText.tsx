import { useEffect, useState } from 'react'
import { prefersReducedMotion } from '../../motion/effects'

const GLYPHS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#%&*+?'

/**
 * Texte qui se « décode » caractère par caractère, comme un écran de jeu qui charge.
 * Rejoue l'effet à chaque changement de texte. Le vrai texte est toujours lu par
 * les lecteurs d'écran ; l'effet est purement visuel.
 */
export function ScrambleText({ text, duration = 520 }: { text: string; duration?: number }) {
  const [display, setDisplay] = useState(text)

  useEffect(() => {
    if (prefersReducedMotion()) {
      setDisplay(text)
      return
    }
    let frame = 0
    const start = performance.now()
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration)
      const resolved = Math.floor(progress * text.length)
      let out = text.slice(0, resolved)
      for (let i = resolved; i < text.length; i++) {
        out += text[i] === ' ' ? ' ' : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]
      }
      setDisplay(out)
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [text, duration])

  return (
    <>
      <span aria-hidden="true">{display}</span>
      <span className="sr-only">{text}</span>
    </>
  )
}
