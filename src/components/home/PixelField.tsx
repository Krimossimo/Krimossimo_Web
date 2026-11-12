import { useEffect, useRef, type RefObject } from 'react'
import { prefersReducedMotion } from '../../motion/effects'

/**
 * Fond du hero : une grille de pixels qui s'allument sous le pointeur (ou le doigt)
 * et laissent une traînée, avec quelques étincelles au repos.
 * Dessiné sur un <canvas>, en pause hors écran ou onglet masqué.
 * Avec « réduire les animations » : grille fixe, sans mouvement.
 */
const CELL = 26

type Rgb = [number, number, number]

function toRgb(value: string, fallback: Rgb): Rgb {
  const hex = value.trim().replace('#', '')
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)]
  }
  return fallback
}

export function PixelField({ areaRef }: { areaRef: RefObject<HTMLElement | null> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const area = areaRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !area || !ctx) return

    const reduced = prefersReducedMotion()
    let cols = 0
    let rows = 0
    let energy = new Float32Array(0)
    let blue: Rgb = [23, 72, 208]
    let dot: Rgb = [201, 207, 219]
    let dark = false
    let frame = 0
    let running = false
    let visible = true
    const pointer = { x: -9999, y: -9999, active: false }

    const readColors = () => {
      const css = getComputedStyle(document.documentElement)
      blue = toRgb(css.getPropertyValue('--k-blue'), blue)
      dot = toRgb(css.getPropertyValue('--k-line-strong'), dot)
      dark = document.documentElement.classList.contains('dark')
    }

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const { width, height } = canvas.getBoundingClientRect()
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      cols = Math.ceil(width / CELL) + 1
      rows = Math.ceil(height / CELL) + 1
      energy = new Float32Array(cols * rows)
      draw()
    }

    const draw = () => {
      const { width, height } = canvas.getBoundingClientRect()
      ctx.clearRect(0, 0, width, height)
      const offX = (width % CELL) / 2
      const offY = (height % CELL) / 2
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const e = energy[y * cols + x]
          const cx = offX + x * CELL
          const cy = offY + y * CELL
          if (e > 0.02) {
            const size = 3 + e * (CELL - 9)
            ctx.fillStyle = `rgb(${blue[0]} ${blue[1]} ${blue[2]} / ${Math.min(1, 0.15 + e * (dark ? 0.85 : 0.75))})`
            ctx.fillRect(cx - size / 2, cy - size / 2, size, size)
          } else {
            ctx.fillStyle = `rgb(${dot[0]} ${dot[1]} ${dot[2]} / ${dark ? 0.9 : 0.75})`
            ctx.fillRect(cx - 1.5, cy - 1.5, 3, 3)
          }
        }
      }
    }

    const step = () => {
      const { width, height } = canvas.getBoundingClientRect()
      const offX = (width % CELL) / 2
      const offY = (height % CELL) / 2
      // Le pointeur charge les cellules proches.
      if (pointer.active) {
        const px = Math.round((pointer.x - offX) / CELL)
        const py = Math.round((pointer.y - offY) / CELL)
        const radius = 3
        for (let y = py - radius; y <= py + radius; y++) {
          for (let x = px - radius; x <= px + radius; x++) {
            if (x < 0 || y < 0 || x >= cols || y >= rows) continue
            const d = Math.hypot(x - px, y - py)
            if (d > radius) continue
            const i = y * cols + x
            energy[i] = Math.max(energy[i], 1 - d / (radius + 0.5))
          }
        }
      }
      // Étincelles au repos.
      if (Math.random() < 0.18) {
        const i = Math.floor(Math.random() * energy.length)
        energy[i] = Math.max(energy[i], 0.45 + Math.random() * 0.4)
      }
      // Décroissance (traînée).
      for (let i = 0; i < energy.length; i++) energy[i] *= 0.93
      draw()
      frame = requestAnimationFrame(step)
    }

    const start = () => {
      if (reduced || running || !visible || document.hidden) return
      running = true
      frame = requestAnimationFrame(step)
    }
    const stop = () => {
      running = false
      cancelAnimationFrame(frame)
    }

    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      pointer.x = e.clientX - r.left
      pointer.y = e.clientY - r.top
      pointer.active = true
    }
    const onLeave = () => {
      pointer.active = false
    }
    const onUp = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') pointer.active = false
    }
    const onVisibility = () => (document.hidden ? stop() : start())

    readColors()
    resize()

    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      if (visible) start()
      else stop()
    })
    io.observe(canvas)
    const themeObserver = new MutationObserver(() => {
      readColors()
      draw()
    })
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

    if (!reduced) {
      area.addEventListener('pointermove', onMove, { passive: true })
      area.addEventListener('pointerdown', onMove, { passive: true })
      area.addEventListener('pointerleave', onLeave)
      area.addEventListener('pointerup', onUp)
    }
    document.addEventListener('visibilitychange', onVisibility)
    start()

    return () => {
      stop()
      ro.disconnect()
      io.disconnect()
      themeObserver.disconnect()
      area.removeEventListener('pointermove', onMove)
      area.removeEventListener('pointerdown', onMove)
      area.removeEventListener('pointerleave', onLeave)
      area.removeEventListener('pointerup', onUp)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [areaRef])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 size-full [mask-image:radial-gradient(ellipse_75%_70%_at_50%_40%,#000_35%,transparent_100%)]"
    />
  )
}
