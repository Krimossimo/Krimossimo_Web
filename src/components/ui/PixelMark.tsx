import type { CSSProperties } from 'react'

/**
 * Pixel-mark : une signature visuelle 5×5 symétrique, générée de façon
 * déterministe à partir d'un texte (nom de projet, mode...).
 * Clin d'œil à la fois aux identicons des développeurs et aux sprites de jeu.
 */
function seededRandom(seed: string) {
  // FNV-1a puis xorshift32 : même texte, même motif.
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  let state = h >>> 0 || 1
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return ((state >>> 0) % 1000) / 1000
  }
}

type Cell = { x: number; y: number; o: number }

export function buildPixelGrid(seed: string, size = 5): Cell[] {
  const rand = seededRandom(seed)
  const half = Math.ceil(size / 2)
  const cells: Cell[] = []
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < half; x++) {
      const r = rand()
      if (r < 0.52) {
        const o = r < 0.2 ? 1 : r < 0.38 ? 0.6 : 0.28
        cells.push({ x, y, o })
        const mirror = size - 1 - x
        if (mirror !== x) cells.push({ x: mirror, y, o })
      }
    }
  }
  // Toujours au moins un pixel plein au centre pour ancrer le motif.
  if (!cells.some((c) => c.o === 1)) cells.push({ x: Math.floor(size / 2), y: Math.floor(size / 2), o: 1 })
  return cells
}

type Props = {
  seed: string
  className?: string
  title?: string
  /** Les pixels s'assemblent un à un à l'affichage (changer `seed` rejoue l'animation). */
  animate?: boolean
}

export function PixelMark({ seed, className = '', title, animate = false }: Props) {
  const cells = buildPixelGrid(seed)
  return (
    <svg
      key={animate ? seed : undefined}
      viewBox="-0.5 -0.5 6 6"
      className={`${animate ? 'pixel-pop' : ''} ${className}`}
      shapeRendering="crispEdges"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {cells.map((c) => (
        <rect
          key={`${c.x}-${c.y}`}
          x={c.x}
          y={c.y}
          width="0.9"
          height="0.9"
          rx="0.12"
          fill="currentColor"
          fillOpacity={c.o}
          style={animate ? ({ '--d': c.y * 5 + c.x } as CSSProperties) : undefined}
        />
      ))}
    </svg>
  )
}
