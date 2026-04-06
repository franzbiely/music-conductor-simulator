import { playNextMelodyNote } from './conductorAudio'

/**
 * Beat-driven melody steps — hand / landmark logic stays in `useBeatDetection`.
 */
export function routeBeatToAudio(): void {
  console.debug('[beat-audio] onBeat → playNextMelodyNote')
  void playNextMelodyNote()
}
