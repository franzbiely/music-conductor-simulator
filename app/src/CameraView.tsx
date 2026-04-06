import { useEffect, useRef, useState } from 'react'

function cameraErrorMessage(err: unknown): string {
  if (err instanceof DOMException) {
    if (
      err.name === 'NotAllowedError' ||
      err.name === 'PermissionDeniedError'
    ) {
      return 'Camera permission was denied. Allow camera access to use this feature.'
    }
    if (
      err.name === 'NotFoundError' ||
      err.name === 'DevicesNotFoundError'
    ) {
      return 'No camera was found.'
    }
    if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
      return 'The camera is already in use or cannot be opened.'
    }
    return err.message || 'Could not access the camera.'
  }
  if (err instanceof Error) {
    return err.message
  }
  return 'Could not access the camera.'
}

export function CameraView() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let stream: MediaStream | null = null

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Camera access is not supported in this browser.')
        return
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true })
        const video = videoRef.current
        if (!video) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        video.srcObject = stream
        var playPromise = video.play()
        if (playPromise !== undefined) {
          playPromise.then(() => {
            console.log('Playback started')
          }).catch((error) => {
            console.error('Error starting playback:', error)
          })
        }
      } catch (err) {
        if (stream) {
          stream.getTracks().forEach((t) => t.stop())
          stream = null
        }
        setError(cameraErrorMessage(err))
      }
    }

    void start()

    return () => {
      stream?.getTracks().forEach((t) => t.stop())
      const v = videoRef.current
      if (v) {
        v.srcObject = null
      }
    }
  }, [])

  if (error) {
    return (
      <div className="camera-view camera-view--error" role="alert">
        {error}
      </div>
    )
  }

  return (
    <video
      ref={videoRef}
      className="camera-view"
      autoPlay
      playsInline
      muted
      aria-label="Webcam preview"
    />
  )
}
