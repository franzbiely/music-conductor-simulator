/**
 * Happy Birthday + Web Audio playback (synthesized, no network fetch).
 * Uses a single AudioContext, short scheduling lookahead, and immediate stop().
 */

const NOTE = {
  C4: 261.63,
  D4: 293.66,
  E4: 329.63,
  F4: 349.23,
  G4: 392.0,
  A4: 440.0,
  Bb4: 466.16,
  C5: 523.25,
} as const

/** One entry per note: frequency (Hz), duration (s). */
const HAPPY_BIRTHDAY_MELODY: readonly { f: number; d: number }[] = [
  // "Happy birthday to you"
  { f: NOTE.C4, d: 0.18 },
  { f: NOTE.C4, d: 0.18 },
  { f: NOTE.D4, d: 0.36 },
  { f: NOTE.C4, d: 0.36 },
  { f: NOTE.F4, d: 0.36 },
  { f: NOTE.E4, d: 0.72 },
  // "Happy birthday to you"
  { f: NOTE.C4, d: 0.18 },
  { f: NOTE.C4, d: 0.18 },
  { f: NOTE.D4, d: 0.36 },
  { f: NOTE.C4, d: 0.36 },
  { f: NOTE.G4, d: 0.36 },
  { f: NOTE.F4, d: 0.72 },
  // "Happy birthday dear …"
  { f: NOTE.C4, d: 0.18 },
  { f: NOTE.C4, d: 0.18 },
  { f: NOTE.C5, d: 0.36 },
  { f: NOTE.A4, d: 0.36 },
  { f: NOTE.F4, d: 0.36 },
  { f: NOTE.E4, d: 0.36 },
  { f: NOTE.D4, d: 0.72 },
  // "Happy birthday to you"
  { f: NOTE.Bb4, d: 0.18 },
  { f: NOTE.Bb4, d: 0.18 },
  { f: NOTE.A4, d: 0.36 },
  { f: NOTE.F4, d: 0.36 },
  { f: NOTE.G4, d: 0.36 },
  { f: NOTE.F4, d: 0.84 },
]

const SCHEDULE_AHEAD_S = 0.02
const ATTACK_S = 0.012
const RELEASE_S = 0.028

let context: AudioContext | null = null
let masterGain: GainNode | null = null
const activeOscillators: OscillatorNode[] = []

/** AudioContext time after which no scheduled notes remain (exclusive). */
let playbackEndAt = 0
/** Prevents overlapping `playSong` schedules from concurrent gesture events. */
let schedulingPlayback = false

function clampVolume(v: number): number {
  if (Number.isNaN(v)) return 1
  return Math.min(1, Math.max(0, v))
}

function getGraph(): { ctx: AudioContext; gain: GainNode } {
  if (!context) {
    context = new AudioContext({ latencyHint: 'interactive' })
    masterGain = context.createGain()
    masterGain.gain.value = 1
    masterGain.connect(context.destination)
  }
  return { ctx: context, gain: masterGain! }
}

async function ensureRunning(): Promise<AudioContext> {
  const { ctx } = getGraph()
  if (ctx.state === 'suspended') {
    await ctx.resume()
  }
  return ctx
}

/**
 * Stops all currently playing note oscillators immediately (low latency).
 */
export function stopSong(): void {
  const { ctx } = getGraph()
  playbackEndAt = ctx.currentTime

  while (activeOscillators.length > 0) {
    const osc = activeOscillators.pop()
    if (!osc) continue
    try {
      osc.stop()
    } catch {
      /* already stopped */
    }
    try {
      osc.disconnect()
    } catch {
      /* noop */
    }
  }
}

/**
 * Master output level (0 = silent, 1 = full).
 */
export function setVolume(value: number): void {
  const v = clampVolume(value)
  const { ctx, gain } = getGraph()
  const t = ctx.currentTime
  gain.gain.cancelScheduledValues(t)
  gain.gain.setValueAtTime(v, t)
}

/**
 * Schedules the full melody on the audio thread. Call after a user gesture
 * so `AudioContext.resume()` succeeds. Uses ~20 ms lookahead for stable timing.
 */
export async function playSong(): Promise<void> {
  const ctx = await ensureRunning()
  stopSong()

  const { gain: outGain } = getGraph()
  let t = ctx.currentTime + SCHEDULE_AHEAD_S
  const peak = 0.11
  let lastOscStop = t

  for (const { f, d } of HAPPY_BIRTHDAY_MELODY) {
    const osc = ctx.createOscillator()
    const noteGain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(f, t)
    osc.connect(noteGain)
    noteGain.connect(outGain)

    const tEnd = t + Math.max(d, ATTACK_S + RELEASE_S)
    const g = noteGain.gain
    g.setValueAtTime(0.0001, t)
    g.exponentialRampToValueAtTime(peak, t + ATTACK_S)
    g.setValueAtTime(peak, tEnd - RELEASE_S)
    g.exponentialRampToValueAtTime(0.0001, tEnd)

    osc.start(t)
    lastOscStop = tEnd + 0.002
    osc.stop(lastOscStop)
    activeOscillators.push(osc)

    t = tEnd + 0.012
  }

  playbackEndAt = lastOscStop
}

/**
 * Entry point for external triggers (e.g. conductor gestures). Does not import
 * gesture types — keeps audio policy here.
 */
export async function tryPlaySongOnWaveGesture(): Promise<void> {
  const { ctx } = getGraph()

  if (schedulingPlayback) {
    console.debug('[audio] wave ignored (scheduling already in progress)')
    return
  }

  if (ctx.currentTime < playbackEndAt) {
    console.debug('[audio] wave ignored (song still playing)')
    return
  }

  console.debug('[audio] wave accepted → playSong()')
  schedulingPlayback = true
  try {
    await playSong()
  } finally {
    schedulingPlayback = false
  }
}
