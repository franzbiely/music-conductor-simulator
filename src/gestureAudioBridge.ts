import { tryPlaySongOnWaveGesture } from './conductorAudio'
import type { GestureEvent } from './hooks/useGestureDetection'

/**
 * Wires gesture events into the audio module. Gesture code stays unaware of
 * `playSong`; audio stays unaware of landmark / wave heuristics.
 */
export function routeGestureToAudio(event: GestureEvent): void {
  console.debug('[gesture-audio] event', event.type, 't=', event.at.toFixed(1))

  if (event.type === 'wave') {
    void tryPlaySongOnWaveGesture()
  }
}
