import { useEffect, useRef, type RefObject } from 'react'
import type { TrackedHands } from './useHandTracking'

export type UseBeatDetectionOptions = {
  enabled?: boolean
  /** Fired on each detected downward stroke (after upward→downward + velocity). */
  onBeat?: () => void
  wristIndex?: number
  /** EMA blend on raw wrist y (0 = top, 1 = bottom in normalized space). */
  smoothAlpha?: number
  /** Moving-average blend with last buffer samples (0–1). */
  bufferBlend?: number
  /** Min upward velocity (norm coords / s) before arming for a down-stroke. */
  upwardVelocityThreshold?: number
  /** Min downward velocity (norm coords / s) to trigger a beat when armed. */
  downwardVelocityThreshold?: number
  /** Ignore beats within this window after the previous beat (ms). */
  cooldownMs?: number
  /** Ring buffer horizon for moving average (ms). */
  bufferMs?: number
}

type YSample = { t: number; y: number }

const DEFAULT_SMOOTH_ALPHA = 0.26
const DEFAULT_BUFFER_BLEND = 0.38
const DEFAULT_UP_V = -0.3
const DEFAULT_DOWN_V = 0.35
const DEFAULT_COOLDOWN_MS = 300
const DEFAULT_BUFFER_MS = 450
const DEFAULT_WRIST = 0
// Tracks middle-fingertip Y relative to wrist — immune to whole-arm movement
const MIDDLE_TIP = 12

/**
 * Wrist Y beat detector: upward motion (y decreasing) arms; strong downward
 * velocity (y increasing) triggers `onBeat`. Uses refs + rAF only.
 */
export function useBeatDetection(
  landmarksRef: RefObject<TrackedHands | null>,
  options?: UseBeatDetectionOptions,
) {
  const enabled = options?.enabled ?? true
  const smoothAlpha = options?.smoothAlpha ?? DEFAULT_SMOOTH_ALPHA
  const bufferBlend = options?.bufferBlend ?? DEFAULT_BUFFER_BLEND
  const upwardVelocityThreshold = options?.upwardVelocityThreshold ?? DEFAULT_UP_V
  const downwardVelocityThreshold =
    options?.downwardVelocityThreshold ?? DEFAULT_DOWN_V
  const cooldownMs = options?.cooldownMs ?? DEFAULT_COOLDOWN_MS
  const bufferMs = options?.bufferMs ?? DEFAULT_BUFFER_MS
  const wristIndex = options?.wristIndex ?? DEFAULT_WRIST

  const onBeatRef = useRef(options?.onBeat)
  onBeatRef.current = options?.onBeat

  const smoothYRef = useRef<number | null>(null)
  const bufferRef = useRef<YSample[]>([])
  const prevYRef = useRef<number | null>(null)
  const prevTimeRef = useRef<number | null>(null)
  const armedRef = useRef(false)
  const cooldownUntilRef = useRef(0)

  useEffect(() => {
    if (!enabled) {
      bufferRef.current = []
      smoothYRef.current = null
      prevYRef.current = null
      prevTimeRef.current = null
      armedRef.current = false
      return
    }

    let rafId = 0

    const tick = () => {
      const now = performance.now()
      const lm = landmarksRef.current?.[0]

      if (!lm || lm.length <= Math.max(wristIndex, MIDDLE_TIP)) {
        rafId = requestAnimationFrame(tick)
        return
      }

      // Relative Y = tip minus wrist: only wrist articulation changes this,
      // so whole-arm vertical movement cancels out.
      const rawY = lm[MIDDLE_TIP]!.y - lm[wristIndex]!.y

      const prevSmooth = smoothYRef.current
      const ySmooth =
        prevSmooth === null
          ? rawY
          : smoothAlpha * rawY + (1 - smoothAlpha) * prevSmooth
      smoothYRef.current = ySmooth

      const buf = bufferRef.current
      buf.push({ t: now, y: ySmooth })
      const cutoff = now - bufferMs
      while (buf.length > 0 && buf[0]!.t < cutoff) {
        buf.shift()
      }

      const recent = buf.length ? buf.slice(-12) : []
      let yMa = ySmooth
      if (recent.length > 0) {
        let s = 0
        for (const p of recent) {
          s += p.y
        }
        yMa = s / recent.length
      }
      const yBlend =
        (1 - bufferBlend) * ySmooth + bufferBlend * yMa

      const prevT = prevTimeRef.current
      const prevY = prevYRef.current
      prevTimeRef.current = now
      prevYRef.current = yBlend

      if (prevT === null || prevY === null) {
        rafId = requestAnimationFrame(tick)
        return
      }

      const dt = (now - prevT) / 1000
      if (dt < 1e-4) {
        rafId = requestAnimationFrame(tick)
        return
      }

      const vy = (yBlend - prevY) / dt

      if (now < cooldownUntilRef.current) {
        armedRef.current = false
        rafId = requestAnimationFrame(tick)
        return
      }

      if (!armedRef.current && vy < upwardVelocityThreshold) {
        armedRef.current = true
        console.debug('[beat] armed (upward motion)', vy.toFixed(2), 'y=', yBlend.toFixed(3))
      }

      if (armedRef.current && vy > downwardVelocityThreshold) {
        armedRef.current = false
        cooldownUntilRef.current = now + cooldownMs
        console.debug('[beat] trigger', vy.toFixed(2), 'y=', yBlend.toFixed(3))
        onBeatRef.current?.()
      }

      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(rafId)
      bufferRef.current = []
      smoothYRef.current = null
      prevYRef.current = null
      prevTimeRef.current = null
      armedRef.current = false
    }
  }, [
    enabled,
    landmarksRef,
    smoothAlpha,
    bufferBlend,
    upwardVelocityThreshold,
    downwardVelocityThreshold,
    cooldownMs,
    bufferMs,
    wristIndex,
  ])
}
