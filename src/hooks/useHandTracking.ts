import {
  FilesetResolver,
  HandLandmarker,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision'
import { useEffect, useRef, useState, type RefObject } from 'react'

/** Pin to the installed tasks-vision version so WASM matches the JS bundle. */
const TASKS_VISION_VERSION = '0.10.34'
const WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task'

export type HandLandmark = NormalizedLandmark

/** When non-null, this is the 21 landmarks for one hand (MediaPipe order). */
export type HandLandmarks21 = readonly NormalizedLandmark[]

type VideoFit = 'cover' | 'contain'

function computeVideoFitBox(
  video: HTMLVideoElement,
  objectFit: VideoFit,
): {
  scale: number
  offsetX: number
  offsetY: number
  vw: number
  vh: number
} | null {
  const vw = video.videoWidth
  const vh = video.videoHeight
  const cw = video.clientWidth
  const ch = video.clientHeight
  if (!vw || !vh || !cw || !ch) return null

  if (objectFit === 'cover') {
    const scale = Math.max(cw / vw, ch / vh)
    const dw = vw * scale
    const dh = vh * scale
    return {
      scale,
      offsetX: (cw - dw) / 2,
      offsetY: (ch - dh) / 2,
      vw,
      vh,
    }
  }

  const scale = Math.min(cw / vw, ch / vh)
  const dw = vw * scale
  const dh = vh * scale
  return {
    scale,
    offsetX: (cw - dw) / 2,
    offsetY: (ch - dh) / 2,
    vw,
    vh,
  }
}

function landmarkToCanvas(
  lm: NormalizedLandmark,
  box: NonNullable<ReturnType<typeof computeVideoFitBox>>,
  dpr: number,
): [number, number] {
  const x = (lm.x * box.vw * box.scale + box.offsetX) * dpr
  const y = (lm.y * box.vh * box.scale + box.offsetY) * dpr
  return [x, y]
}

function drawLandmarksOnCanvas(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  landmarks: HandLandmarks21,
  objectFit: VideoFit,
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const dpr = window.devicePixelRatio || 1
  const bw = Math.max(1, Math.round(video.clientWidth * dpr))
  const bh = Math.max(1, Math.round(video.clientHeight * dpr))
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw
    canvas.height = bh
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height)

  const box = computeVideoFitBox(video, objectFit)
  if (!box) return

  const pts = landmarks.map((lm) => landmarkToCanvas(lm, box, dpr))

  ctx.strokeStyle = 'rgba(0, 220, 130, 0.9)'
  ctx.fillStyle = 'rgba(255, 90, 90, 0.95)'
  ctx.lineWidth = Math.max(1.5, 2 * dpr)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  for (const { start, end } of HandLandmarker.HAND_CONNECTIONS) {
    const pa = pts[start]
    const pb = pts[end]
    if (!pa || !pb) continue
    ctx.beginPath()
    ctx.moveTo(pa[0], pa[1])
    ctx.lineTo(pb[0], pb[1])
    ctx.stroke()
  }

  const r = Math.max(2, 3 * dpr)
  for (const p of pts) {
    ctx.beginPath()
    ctx.arc(p[0], p[1], r, 0, Math.PI * 2)
    ctx.fill()
  }
}

export function useHandTracking(
  videoRef: RefObject<HTMLVideoElement | null>,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  options?: { objectFit?: VideoFit; enabled?: boolean },
) {
  const objectFit = options?.objectFit ?? 'cover'
  const enabled = options?.enabled ?? true
  const landmarksRef = useRef<HandLandmarks21 | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) {
      landmarksRef.current = null
      return
    }

    let cancelled = false
    let rafId = 0
    let landmarker: HandLandmarker | null = null

    async function setup() {
      try {
        const wasm = await FilesetResolver.forVisionTasks(WASM_BASE)
        if (cancelled) return
        landmarker = await HandLandmarker.createFromOptions(wasm, {
          baseOptions: { modelAssetPath: MODEL_URL },
          numHands: 1,
          runningMode: 'VIDEO',
        })
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : 'Failed to initialize hand tracking',
          )
        }
        return
      }

      if (cancelled) {
        landmarker?.close()
        return
      }

      const frame = () => {
        if (cancelled) return

        const video = videoRef.current
        const canvas = canvasRef.current

        if (!landmarker || !video || !canvas) {
          rafId = requestAnimationFrame(frame)
          return
        }

        if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
          rafId = requestAnimationFrame(frame)
          return
        }

        const result = landmarker.detectForVideo(video, performance.now())
        const hand = result.landmarks[0]

        if (hand) {
          landmarksRef.current = hand
          drawLandmarksOnCanvas(canvas, video, hand, objectFit)
        } else {
          landmarksRef.current = null
          const dpr = window.devicePixelRatio || 1
          const bw = Math.max(1, Math.round(video.clientWidth * dpr))
          const bh = Math.max(1, Math.round(video.clientHeight * dpr))
          if (canvas.width !== bw || canvas.height !== bh) {
            canvas.width = bw
            canvas.height = bh
          }
          const ctx = canvas.getContext('2d')
          ctx?.clearRect(0, 0, canvas.width, canvas.height)
        }

        rafId = requestAnimationFrame(frame)
      }

      rafId = requestAnimationFrame(frame)
    }

    void setup()

    return () => {
      cancelled = true
      cancelAnimationFrame(rafId)
      landmarker?.close()
      landmarker = null
      landmarksRef.current = null
      const c = canvasRef.current
      const ctx = c?.getContext('2d')
      if (c && ctx) {
        ctx.clearRect(0, 0, c.width, c.height)
      }
    }
  }, [enabled, videoRef, canvasRef, objectFit])

  return { landmarksRef, error }
}
