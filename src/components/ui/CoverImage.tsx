import { useState } from 'react'
import { assetUrl } from '../../hooks/useLocale'
import { PixelMark } from './PixelMark'

type Props = {
  src?: string
  alt: string
  /** Graine du pixel-mark affiché si l'image manque ou ne se charge pas. */
  seed: string
  className?: string
  markClassName?: string
}

/**
 * Image de carte (projet, jeu, vidéo) recadrée dans son conteneur.
 * Sans image ou en cas d'erreur de chargement, le pixel-mark du contenu prend le relais.
 */
export function CoverImage({ src, alt, seed, className = '', markClassName = 'size-20' }: Props) {
  const [failed, setFailed] = useState(false)

  return (
    <div className={`relative flex items-center justify-center overflow-hidden bg-surface ${className}`}>
      {src && !failed ? (
        <>
          <img
            src={assetUrl(src)}
            alt={alt}
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
            className="absolute inset-0 size-full object-cover transition-transform duration-300 ease-snap group-hover:scale-[1.03]"
          />
          {/* Liseré intérieur : détache une image claire d'une carte claire (et inversement). */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-line"
          />
        </>
      ) : (
        <PixelMark
          seed={seed}
          className={`text-blue transition-transform duration-300 ease-snap group-hover:scale-105 ${markClassName}`}
        />
      )}
    </div>
  )
}
