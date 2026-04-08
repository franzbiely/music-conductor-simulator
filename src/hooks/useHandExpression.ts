import { useEffect, useRef, type RefObject } from 'react'
import type { DrawOverlayFn, TrackedHands, HandLandmarks21 } from './useHandTracking'

const WRIST = 0
const MID_MCP = 9
const TIP_T = 4
const TIP_I = 8
const TIP_M = 12
const TIP_R = 16
const TIP_P = 20
const INDEX_MCP = 5

export type PalmOrientation = 'up' | 'down' | 'neutral'

/**
 * Returns the Z depth of INDEX_MCP relative to wrist (which is z=0 in MediaPipe).
 * Negative z = closer to camera → palm facing camera (front/up).
 * Positive z = farther from camera → back of hand facing camera (down).
 */
function palmZ(lm: HandLandmarks21): number {
  return lm[INDEX_MCP]?.z ?? 0
}

function computeOpenness(lm: HandLandmarks21): number {
  const scale = Math.hypot(
    lm[WRIST]!.x - lm[MID_MCP]!.x,
    lm[WRIST]!.y - lm[MID_MCP]!.y,
  )
  if (scale < 0.03) return 0.5
  const avg =
    (Math.hypot(lm[TIP_T]!.x - lm[TIP_I]!.x, lm[TIP_T]!.y - lm[TIP_I]!.y) +
      Math.hypot(lm[TIP_T]!.x - lm[TIP_M]!.x, lm[TIP_T]!.y - lm[TIP_M]!.y) +
      Math.hypot(lm[TIP_T]!.x - lm[TIP_R]!.x, lm[TIP_T]!.y - lm[TIP_R]!.y) +
      Math.hypot(lm[TIP_T]!.x - lm[TIP_P]!.x, lm[TIP_T]!.y - lm[TIP_P]!.y)) /
    4
  return Math.min(1, Math.max(0, (avg / scale - 0.25) / 0.85))
}

function opennessToLevel(v: number): string {
  if (v < 0.1) return 'ppp'
  if (v < 0.25) return 'pp'
  if (v < 0.4) return 'p'
  if (v < 0.55) return 'mp'
  if (v < 0.7) return 'mf'
  if (v < 0.85) return 'f'
  if (v < 0.95) return 'ff'
  return 'fff'
}

function opennessToGesture(v: number, isBeat: boolean): string {
  if (isBeat) return 'Beat'
  return v >= 0.5 ? 'Crescendo' : 'Decrescendo'
}

export type UseHandExpressionOptions = {
  enabled?: boolean
  beatFlashRef?: RefObject<boolean>
}

export function useHandExpression(
  _landmarksRef: RefObject<TrackedHands | null>,
  drawOverlayRef: RefObject<DrawOverlayFn | null>,
  options?: UseHandExpressionOptions,
) {
  const enabled = options?.enabled ?? true
  const beatFlashStableRef = useRef(options?.beatFlashRef)
  beatFlashStableRef.current = options?.beatFlashRef
  const smoothRef = useRef<number[]>([])
  const palmZSmRef = useRef<number[]>([])
  const palmOrientationRef = useRef<PalmOrientation>('neutral')

  useEffect(() => {
    if (!enabled) {
      drawOverlayRef.current = null
      smoothRef.current = []
      palmZSmRef.current = []
      palmOrientationRef.current = 'neutral'
      return
    }

    drawOverlayRef.current = (ctx, box, dpr, hands) => {
      if (!hands.length) return

      const isBeat = beatFlashStableRef.current?.current ?? false
      if (isBeat && beatFlashStableRef.current) {
        beatFlashStableRef.current.current = false
      }

      ctx.save()
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'

      for (let i = 0; i < hands.length; i++) {
        const lm = hands[i]!
        if (lm.length <= TIP_P) continue

        const raw = computeOpenness(lm)
        const prev = smoothRef.current[i] ?? raw
        const smooth = 0.12 * raw + 0.88 * prev
        smoothRef.current[i] = smooth

        const rawZ = palmZ(lm)
        const prevZ = palmZSmRef.current[i] ?? rawZ
        const smZ = 0.08 * rawZ + 0.92 * prevZ
        palmZSmRef.current[i] = smZ
        // negative z = INDEX_MCP closer to camera = palm facing camera = "front/up"
        const palmOrient: PalmOrientation =
          smZ < -0.025 ? 'up' : smZ > 0.025 ? 'down' : 'neutral'
        if (i === 0) palmOrientationRef.current = palmOrient

        const gesture = i === 0 ? opennessToGesture(smooth, isBeat) : opennessToGesture(smooth, false)
        const label = `${gesture} (${opennessToLevel(smooth)})`

        const wrist = lm[WRIST]!
        const cx = (wrist.x * box.vw * box.scale + box.offsetX) * dpr
        const cy = (wrist.y * box.vh * box.scale + box.offsetY) * dpr

        const fontSize = Math.round(12 * dpr)
        ctx.font = `bold ${fontSize}px sans-serif`
        const tw = ctx.measureText(label).width
        const th = fontSize * 1.4
        const pad = 4 * dpr
        const lx = cx + 10 * dpr
        const ly = cy - 28 * dpr

        ctx.fillStyle = 'rgba(0,0,0,0.6)'
        ctx.fillRect(lx - pad, ly - th / 2 - pad, tw + pad * 2, th + pad * 2)

        ctx.fillStyle = gesture === 'Beat' ? '#ffd700' : gesture === 'Crescendo' ? '#7fffb2' : '#ffb07f'
        ctx.fillText(label, lx, ly)
      }

      ctx.restore()
    }

    return () => {
      drawOverlayRef.current = null
      smoothRef.current = []
      palmZSmRef.current = []
      palmOrientationRef.current = 'neutral'
    }
  }, [enabled, drawOverlayRef])

  return { palmOrientationRef }
}
