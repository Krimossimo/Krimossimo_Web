import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

/** Rectangles [x, y, largeur, hauteur] sur une grille de 8×8. */
type Px = readonly [number, number, number, number]

function PixelIcon({ pixels, ...props }: IconProps & { pixels: readonly Px[] }) {
  return (
    <svg viewBox="0 0 8 8" width="18" height="18" shapeRendering="crispEdges" fill="currentColor" aria-hidden="true" {...props}>
      {pixels.map(([x, y, w, h]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={w} height={h} />
      ))}
    </svg>
  )
}

const trophy: Px[] = [
  [1, 0, 6, 3],
  [0, 1, 1, 2],
  [7, 1, 1, 2],
  [2, 3, 4, 1],
  [3, 4, 2, 2],
  [2, 6, 4, 1],
  [1, 7, 6, 1],
]

const lock: Px[] = [
  [2, 0, 4, 1],
  [2, 1, 1, 2],
  [5, 1, 1, 2],
  [1, 3, 6, 2],
  [1, 5, 2, 1],
  [5, 5, 2, 1],
  [1, 6, 6, 1],
]

/** Trophée en pixels. */
export function TrophyIcon(props: IconProps) {
  return <PixelIcon pixels={trophy} {...props} />
}

/** Cadenas en pixels. */
export function LockIcon(props: IconProps) {
  return <PixelIcon pixels={lock} {...props} />
}
