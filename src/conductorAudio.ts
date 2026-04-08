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
  { f: NOTE.C4, d: 10 },
  { f: NOTE.C4, d: 10 },
  { f: NOTE.D4, d: 10 },
  { f: NOTE.C4, d: 10 },
  { f: NOTE.F4, d: 10 },
  { f: NOTE.E4, d: 10 },
  // "Happy birthday to you"
  { f: NOTE.C4, d: 10 },
  { f: NOTE.C4, d: 10 },
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
const ATTACK_S = 0.12
const RELEASE_S = 0.28

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

/** Step index for beat-by-beat `playNextMelodyNote` (wraps at end). */
let melodyStepIndex = 0

stopSong()

function scheduleMelodyNoteAt(
  ctx: AudioContext,
  outGain: GainNode,
  startTime: number,
  f: number,
  d: number,
): number {
  const peak = 0.11
  const osc = ctx.createOscillator()
  const noteGain = ctx.createGain()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(f, startTime)
  osc.connect(noteGain)
  noteGain.connect(outGain)

  const tEnd = startTime + Math.max(d, ATTACK_S + RELEASE_S)
  const g = noteGain.gain
  g.setValueAtTime(0.0001, startTime)
  g.exponentialRampToValueAtTime(peak, startTime + ATTACK_S)
  g.setValueAtTime(peak, tEnd - RELEASE_S)
  g.exponentialRampToValueAtTime(0.0001, tEnd)

  osc.start(startTime)
  const lastStop = tEnd + 0.002
  osc.stop(lastStop)
  activeOscillators.push(osc)
  return lastStop
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
  let lastOscStop = t

  for (const { f, d } of HAPPY_BIRTHDAY_MELODY) {
    lastOscStop = scheduleMelodyNoteAt(ctx, outGain, t, f, d)
    const tEnd = lastOscStop - 0.002
    t = tEnd + 0.002
  }

  playbackEndAt = lastOscStop
}

/**
 * Plays a single melody step (Happy Birthday), advances the step index, wraps at end.
 * Does not stop other scheduled notes (overlaps allowed briefly).
 */
export async function playNextMelodyNote(): Promise<void> {
  const ctx = await ensureRunning()
  stopSong()
  const { gain: outGain } = getGraph()
  const idx = melodyStepIndex
  const note = HAPPY_BIRTHDAY_MELODY[idx]!
  const t0 = ctx.currentTime + SCHEDULE_AHEAD_S
  const lastStop = scheduleMelodyNoteAt(ctx, outGain, t0, note.f, note.d)
  melodyStepIndex = (idx + 1) % HAPPY_BIRTHDAY_MELODY.length
  playbackEndAt = Math.max(playbackEndAt, lastStop)
  console.debug(
    '[audio] beat → note',
    idx + 1,
    '/',
    HAPPY_BIRTHDAY_MELODY.length,
    'next index',
    melodyStepIndex,
  )
}

export async function playPreviousMelodyNote(): Promise<void> {
  const ctx = await ensureRunning()

  stopSong()

  const { gain: outGain } = getGraph()
  const len = HAPPY_BIRTHDAY_MELODY.length
  const idx = (melodyStepIndex - 1 + len) % len
  const note = HAPPY_BIRTHDAY_MELODY[idx]!
  const t0 = ctx.currentTime + SCHEDULE_AHEAD_S
  const lastStop = scheduleMelodyNoteAt(ctx, outGain, t0, note.f, note.d)
  melodyStepIndex = idx
  playbackEndAt = Math.max(playbackEndAt, lastStop)
  console.debug(
    '[audio] prev → note',
    idx + 1,
    '/',
    len,
    'next index',
    melodyStepIndex,
  )
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
