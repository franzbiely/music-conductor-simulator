import { useEffect, useRef, type RefObject } from 'react'
import type { HandLandmarks21 } from './useHandTracking'
import { setVolume } from '../conductorAudio'

const WRIST = 0
const MID_MCP = 9
const TIP_T = 4
const TIP_I = 8
const TIP_M = 12
const TIP_R = 16
const TIP_P = 20

function dist3(
  lm: HandLandmarks21,
  a: number,
  b: number,
): number {
  const A = lm[a]!
  const B = lm[b]!
  const dz = (A.z ?? 0) - (B.z ?? 0)
  return Math.hypot(A.x - B.x, A.y - B.y, dz)
}

export type UseHandOpennessOptions = {
  enabled?: boolean
  /** EMA on normalized pinch distance (lower = smoother). */
  smoothPinchAlpha?: number
  smoothSpreadAlpha?: number
  /** pinchNorm below this ramps decrease strength. */
  pinchEdge?: number
  /** spreadNorm above this ramps increase strength. */
  openEdge?: number
  /** No volume push when |openAmt - pinchAmt| < deadband (after weighting). */
  deadband?: number
  minHandScale?: number
}

const def = {
  smoothPinchAlpha: 0.11,
  smoothSpreadAlpha: 0.1,
  pinchEdge: 0.4,
  openEdge: 0.55,
  deadband: 0.085,
  minHandScale: 0.045,
  integratePerS: 0.42,
  outSmooth: 0.075,
}

export function useHandOpenness(
  landmarksRef: RefObject<HandLandmarks21 | null>,
  options?: UseHandOpennessOptions,
) {
  const enabled = options?.enabled ?? true
  const aP = options?.smoothPinchAlpha ?? def.smoothPinchAlpha
  const aS = options?.smoothSpreadAlpha ?? def.smoothSpreadAlpha
  const pinchEdge = options?.pinchEdge ?? def.pinchEdge
  const openEdge = options?.openEdge ?? def.openEdge
  const deadband = options?.deadband ?? def.deadband
  const minScale = options?.minHandScale ?? def.minHandScale

  const smPinchRef = useRef<number | null>(null)
  const smSpreadRef = useRef<number | null>(null)
  const volRef = useRef(1)
  const outRef = useRef(1)
  const lastTRef = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled) {
      smPinchRef.current = null
      smSpreadRef.current = null
      lastTRef.current = null
      return
    }

    let raf = 0
    const tick = () => {
      const now = performance.now()
      const lm = landmarksRef.current
      const lastT = lastTRef.current
      lastTRef.current = now
      const dt =
        lastT === null ? 1 / 60 : Math.min(0.1, Math.max(1e-4, (now - lastT) / 1000))

      if (!lm || lm.length <= TIP_P) {
        raf = requestAnimationFrame(tick)
        return
      }

      const scale = dist3(lm, WRIST, MID_MCP)
      if (scale < minScale) {
        raf = requestAnimationFrame(tick)
        return
      }

      const pinchN = dist3(lm, TIP_T, TIP_I) / scale
      const d1 = dist3(lm, TIP_T, TIP_I)
      const d2 = dist3(lm, TIP_T, TIP_M)
      const d3 = dist3(lm, TIP_T, TIP_R)
      const d4 = dist3(lm, TIP_T, TIP_P)
      const spreadN = ((d1 + d2 + d3 + d4) / 4) / scale

      let sp = smPinchRef.current
      sp = sp === null ? pinchN : aP * pinchN + (1 - aP) * sp
      smPinchRef.current = sp

      let ss = smSpreadRef.current
      ss = ss === null ? spreadN : aS * spreadN + (1 - aS) * ss
      smSpreadRef.current = ss

      let pinchAmt = Math.max(0, (pinchEdge - sp) / pinchEdge)
      let openAmt = Math.max(0, (ss - openEdge) / Math.max(1e-6, 1 - openEdge))

      openAmt *= 1 - 0.82 * pinchAmt
      pinchAmt *= 1 - 0.55 * openAmt

      let push = openAmt - pinchAmt
      if (Math.abs(push) < deadband) {
        push = 0
      }

      let v = volRef.current
      v += push * def.integratePerS * dt
      v = Math.min(1, Math.max(0, v))
      volRef.current = v

      const o = outRef.current
      const k = def.outSmooth + 0.22 * Math.min(1, Math.abs(push))
      const next = o + (v - o) * Math.min(0.28, k)
      outRef.current = next
      setVolume(next)

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      smPinchRef.current = null
      smSpreadRef.current = null
      lastTRef.current = null
    }
  }, [
    enabled,
    landmarksRef,
    aP,
    aS,
    pinchEdge,
    openEdge,
    deadband,
    minScale,
  ])
}
