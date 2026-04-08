import { useEffect, useRef, type RefObject } from 'react'
import type { TrackedHands } from './useHandTracking'

export type GestureEvent = {
  type: 'wave' | 'beat'
  /** `performance.now()` when the gesture was recognized */
  at: number
}

export type UseGestureDetectionOptions = {
  /** When false, stops the rAF loop and clears internal buffers. */
  enabled?: boolean
  /** Called when a gesture is recognized (not a React state update). */
  onGesture?: (event: GestureEvent) => void
  /** EMA blend factor for wrist x; higher = less smoothing, more latency. */
  smoothAlpha?: number
  /** Minimum horizontal delta (normalized 0–1) per swing leg. */
  minSwing?: number
  /** Max duration (ms) from first left commit to final left commit for a wave. */
  waveWindowMs?: number
  /** How long to keep samples in the ring buffer. */
  bufferMs?: number
  /** MediaPipe wrist landmark index. */
  wristIndex?: number
  /** After a wave, ignore new sequences for this long (ms). */
  cooldownMs?: number
}

type Sample = { t: number; x: number }
type YSample = { t: number; y: number }

const DEFAULT_SMOOTH_ALPHA = 0.28
const DEFAULT_MIN_SWING = 0.042
const DEFAULT_WAVE_WINDOW_MS = 1000
const DEFAULT_BUFFER_MS = 1200
const DEFAULT_WRIST = 0
const DEFAULT_COOLDOWN_MS = 450

/**
 * Reads `landmarksRef` on a `requestAnimationFrame` loop (no per-frame React state).
 * Smooths wrist x, keeps a short history buffer, and emits `wave` when the wrist
 * moves left → right → left within ~1s.
 */
export function useGestureDetection(
  landmarksRef: RefObject<TrackedHands | null>,
  options?: UseGestureDetectionOptions,
) {
  const enabled = options?.enabled ?? true
  const smoothAlpha = options?.smoothAlpha ?? DEFAULT_SMOOTH_ALPHA
  const minSwing = options?.minSwing ?? DEFAULT_MIN_SWING
  const waveWindowMs = options?.waveWindowMs ?? DEFAULT_WAVE_WINDOW_MS
  const bufferMs = options?.bufferMs ?? DEFAULT_BUFFER_MS
  const wristIndex = options?.wristIndex ?? DEFAULT_WRIST
  const cooldownMs = options?.cooldownMs ?? DEFAULT_COOLDOWN_MS

  const onGestureRef = useRef(options?.onGesture)
  onGestureRef.current = options?.onGesture

  const smoothXRef = useRef<number | null>(null)
  const bufferRef = useRef<Sample[]>([])

  // — beat detection state —
  const smoothYRef = useRef<number | null>(null)
  const yBufRef = useRef<YSample[]>([])
  /** 0 idle, 1 armed (saw down), waiting for up-reversal */
  const beatPhaseRef = useRef(0)
  const beatDownStartRef = useRef(0)
  const beatPeakVyRef = useRef(0)
  const beatCooldownRef = useRef(0)

  /** 0 idle, 1 after left, 2 after right, 3 cooldown */
  const phaseRef = useRef(0)
  const seqStartRef = useRef(0)
  const extremeLowRef = useRef(0)
  const extremeHighRef = useRef(0)
  const idleFollowRef = useRef<number | null>(null)
  const cooldownUntilRef = useRef(0)

  useEffect(() => {
    if (!enabled) {
      bufferRef.current = []
      smoothXRef.current = null
      idleFollowRef.current = null
      phaseRef.current = 0
      smoothYRef.current = null
      yBufRef.current = []
      beatPhaseRef.current = 0
      return
    }

    let rafId = 0

    const tick = () => {
      const now = performance.now()
      const lm = landmarksRef.current?.[0]

      if (!lm || lm.length <= wristIndex) {
        rafId = requestAnimationFrame(tick)
        return
      }

      const rawX = lm[wristIndex]!.x

      const prevSmooth = smoothXRef.current
      const xSmooth =
        prevSmooth === null
          ? rawX
          : smoothAlpha * rawX + (1 - smoothAlpha) * prevSmooth
      smoothXRef.current = xSmooth

      const buf = bufferRef.current
      buf.push({ t: now, x: xSmooth })
      const cutoff = now - bufferMs
      while (buf.length > 0 && buf[0]!.t < cutoff) {
        buf.shift()
      }

      const recent = buf.length <= 1 ? buf : buf.slice(-10)
      let ma = xSmooth
      if (recent.length > 0) {
        let s = 0
        for (const p of recent) {
          s += p.x
        }
        ma = s / recent.length
      }
      const xForGesture = 0.62 * xSmooth + 0.38 * ma

      // — beat: bounce detection (down → up reversal) —
      const rawY = lm[wristIndex]!.y
      const prevY = smoothYRef.current
      const ySmooth = prevY === null ? rawY : 0.25 * rawY + 0.75 * prevY
      smoothYRef.current = ySmooth

      const yBuf = yBufRef.current
      yBuf.push({ t: now, y: ySmooth })
      while (yBuf.length > 8) yBuf.shift()

      if (yBuf.length >= 3 && now >= beatCooldownRef.current) {
        const older = yBuf[yBuf.length - 3]!
        const dt = Math.max(1, now - older.t) / 1000
        const vy = (ySmooth - older.y) / dt

        const BEAT_DOWN_V = 0.45
        const BEAT_UP_V = -0.35
        const BEAT_WINDOW_MS = 300

        if (beatPhaseRef.current === 0 && vy > BEAT_DOWN_V) {
          beatPhaseRef.current = 1
          beatDownStartRef.current = now
          beatPeakVyRef.current = vy
        } else if (beatPhaseRef.current === 1) {
          beatPeakVyRef.current = Math.max(beatPeakVyRef.current, vy)
          if (now - beatDownStartRef.current > BEAT_WINDOW_MS) {
            beatPhaseRef.current = 0
          } else if (vy < BEAT_UP_V && beatPeakVyRef.current > BEAT_DOWN_V) {
            onGestureRef.current?.({ type: 'beat', at: now })
            beatCooldownRef.current = now + 250
            beatPhaseRef.current = 0
          }
        }
      }

      if (now < cooldownUntilRef.current) {
        rafId = requestAnimationFrame(tick)
        return
      }

      const onGesture = onGestureRef.current
      const phase = phaseRef.current

      if (phase === 0) {
        let idle = idleFollowRef.current
        if (idle === null) {
          idle = xForGesture
        } else {
          idle += 0.04 * (xForGesture - idle)
        }
        idleFollowRef.current = idle

        if (xForGesture < idle - minSwing) {
          phaseRef.current = 1
          seqStartRef.current = now
          extremeLowRef.current = xForGesture
        }
      } else if (phase === 1) {
        if (now - seqStartRef.current > waveWindowMs) {
          phaseRef.current = 0
          idleFollowRef.current = xForGesture
        } else {
          extremeLowRef.current = Math.min(extremeLowRef.current, xForGesture)
          if (xForGesture > extremeLowRef.current + minSwing) {
            phaseRef.current = 2
            extremeHighRef.current = xForGesture
          }
        }
      } else if (phase === 2) {
        if (now - seqStartRef.current > waveWindowMs) {
          phaseRef.current = 0
          idleFollowRef.current = xForGesture
        } else {
          extremeHighRef.current = Math.max(extremeHighRef.current, xForGesture)
          if (xForGesture < extremeHighRef.current - minSwing) {
            onGesture?.({ type: 'wave', at: now })
            cooldownUntilRef.current = now + cooldownMs
            phaseRef.current = 0
            idleFollowRef.current = xForGesture
          }
        }
      }

      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(rafId)
      bufferRef.current = []
      smoothXRef.current = null
      idleFollowRef.current = null
      phaseRef.current = 0
      smoothYRef.current = null
      yBufRef.current = []
      beatPhaseRef.current = 0
    }
  }, [
    enabled,
    landmarksRef,
    smoothAlpha,
    minSwing,
    waveWindowMs,
    bufferMs,
    wristIndex,
    cooldownMs,
  ])
}
