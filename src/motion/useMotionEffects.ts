import { useEffect } from 'react'
import { startBurstOnClick, startReveal, startTilt } from './effects'

/** Active les effets globaux (apparitions, inclinaison, pixels au clic) pour tout le site public. */
export function useMotionEffects() {
  useEffect(() => {
    const stops = [startReveal(), startTilt(), startBurstOnClick()]
    return () => stops.forEach((stop) => stop())
  }, [])
}
