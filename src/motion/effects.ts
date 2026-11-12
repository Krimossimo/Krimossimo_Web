/**
 * Effets visuels globaux, sans dépendance : apparitions au défilement,
 * inclinaison des cartes, explosions de pixels au clic.
 * Tous respectent « réduire les animations » du système.
 */

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

const finePointer = () => typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches

/* ------------------------------------------------------------------
   Apparitions au défilement : tout élément [data-reveal] reçoit .is-in
   quand il entre à l'écran. Les éléments ajoutés plus tard (contenu chargé,
   changement de page) sont pris en charge automatiquement.
   ------------------------------------------------------------------ */
export function startReveal(root: HTMLElement = document.body): () => void {
  if (typeof IntersectionObserver === 'undefined' || prefersReducedMotion()) return () => {}

  const html = document.documentElement
  // Éléments déjà apparus : si React réécrit leur className, on remet .is-in.
  const shown = new WeakSet<Element>()
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          shown.add(entry.target)
          entry.target.classList.add('is-in')
          io.unobserve(entry.target)
        }
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
  )

  const scan = (node: ParentNode) => {
    node.querySelectorAll<HTMLElement>('[data-reveal]:not(.is-in)').forEach((el) => io.observe(el))
  }

  const mo = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'attributes') {
        if (shown.has(m.target as Element) && !(m.target as Element).classList.contains('is-in')) {
          ;(m.target as Element).classList.add('is-in')
        }
        continue
      }
      m.addedNodes.forEach((n) => {
        if (n instanceof HTMLElement) {
          if (n.matches('[data-reveal]:not(.is-in)')) io.observe(n)
          scan(n)
        }
      })
    }
  })

  html.classList.add('motion-ready')
  scan(root)
  mo.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })

  return () => {
    io.disconnect()
    mo.disconnect()
    html.classList.remove('motion-ready')
  }
}

/* ------------------------------------------------------------------
   Inclinaison 3D et halo : les éléments .tilt suivent le pointeur.
   Souris uniquement (pas au doigt), et jamais avec « réduire les animations ».
   ------------------------------------------------------------------ */
export function startTilt(): () => void {
  if (!finePointer() || prefersReducedMotion()) return () => {}
  let current: HTMLElement | null = null
  let frame = 0

  const reset = (el: HTMLElement) => {
    el.classList.remove('is-tilting')
    el.style.removeProperty('--rx')
    el.style.removeProperty('--ry')
  }

  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return
    const el = (e.target as Element | null)?.closest<HTMLElement>('.tilt') ?? null
    if (current && current !== el) reset(current)
    current = el
    if (!el) return
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      const r = el.getBoundingClientRect()
      const px = (e.clientX - r.left) / r.width
      const py = (e.clientY - r.top) / r.height
      const max = Number(el.dataset.tiltMax ?? 6)
      el.classList.add('is-tilting')
      el.style.setProperty('--ry', `${((px - 0.5) * max * 2).toFixed(2)}deg`)
      el.style.setProperty('--rx', `${((0.5 - py) * max * 2).toFixed(2)}deg`)
      el.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`)
      el.style.setProperty('--my', `${(py * 100).toFixed(1)}%`)
    })
  }

  const onLeave = () => {
    if (current) reset(current)
    current = null
  }

  document.addEventListener('pointermove', onMove, { passive: true })
  document.documentElement.addEventListener('pointerleave', onLeave)
  return () => {
    cancelAnimationFrame(frame)
    document.removeEventListener('pointermove', onMove)
    document.documentElement.removeEventListener('pointerleave', onLeave)
  }
}

/* ------------------------------------------------------------------
   Explosion de pixels : au clic sur un élément [data-burst],
   ou appelée directement (succès débloqué).
   ------------------------------------------------------------------ */
const burstColors = ['var(--k-blue)', 'var(--k-blue)', 'var(--k-ink)', 'var(--k-blue-hover)']

export function pixelBurst(x: number, y: number, count = 14, spread = 70) {
  if (prefersReducedMotion()) return
  const host = document.createElement('div')
  host.className = 'k-burst'
  host.setAttribute('aria-hidden', 'true')
  host.style.left = `${x}px`
  host.style.top = `${y}px`
  for (let i = 0; i < count; i++) {
    const p = document.createElement('i')
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5
    const dist = spread * (0.55 + Math.random() * 0.6)
    p.style.setProperty('--x', `${Math.cos(angle) * dist}px`)
    p.style.setProperty('--y', `${Math.sin(angle) * dist}px`)
    p.style.setProperty('--c', burstColors[i % burstColors.length])
    host.appendChild(p)
  }
  document.body.appendChild(host)
  window.setTimeout(() => host.remove(), 700)
}

export function startBurstOnClick(): () => void {
  const onClick = (e: MouseEvent) => {
    const el = (e.target as Element | null)?.closest<HTMLElement>('[data-burst]')
    if (!el) return
    // Clic clavier (Entrée) : coordonnées nulles, on part du centre du bouton.
    if (e.detail === 0 || (e.clientX === 0 && e.clientY === 0)) {
      const r = el.getBoundingClientRect()
      pixelBurst(r.left + r.width / 2, r.top + r.height / 2)
    } else {
      pixelBurst(e.clientX, e.clientY)
    }
  }
  document.addEventListener('click', onClick)
  return () => document.removeEventListener('click', onClick)
}

/** Pluie de pixels plein écran, pour les grandes occasions. */
export function pixelRain(count = 90) {
  if (prefersReducedMotion()) return
  const host = document.createElement('div')
  host.className = 'k-rain'
  host.setAttribute('aria-hidden', 'true')
  for (let i = 0; i < count; i++) {
    const p = document.createElement('i')
    p.style.left = `${Math.random() * 100}%`
    p.style.setProperty('--s', `${6 + Math.round(Math.random() * 10)}px`)
    p.style.setProperty('--t', `${1.4 + Math.random() * 1.6}s`)
    p.style.setProperty('--d', `${Math.random() * 0.9}s`)
    p.style.setProperty('--r', `${Math.round(Math.random() * 360)}deg`)
    p.style.setProperty('--c', burstColors[i % burstColors.length])
    host.appendChild(p)
  }
  document.body.appendChild(host)
  window.setTimeout(() => host.remove(), 3800)
}
