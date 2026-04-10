import { useCallback, useRef, useState, useSyncExternalStore } from 'react'
import { CameraView, type GestureEvent, type HandExpressionEvent } from './CameraView'
import { routeBeatToAudio } from './beatAudioBridge'
import { routeGestureToAudio } from './gestureAudioBridge'
import { playNextMelodyNote, playPreviousMelodyNote, subscribeMelodyStep, getMelodyStepIndex, getMelodyStepCount } from './conductorAudio'
import './App.css'

const LEVELS = ['ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff'] as const
const GESTURES = ['Beat', 'Crescendo', 'Decrescendo'] as const
const INITIAL_LOGS = ['Stop triggered', 'Decrescendo ppp', 'Crescendo mf', 'Beat detected']
const FINAL_MELODY_STEP = getMelodyStepCount() - 1
const CONFETTI = Array.from({ length: 28 }, (_, index) => ({
  id: index,
  left: `${(index * 3.7) % 100}%`,
  delay: `${(index % 7) * 0.18}s`,
  duration: `${3 + (index % 5) * 0.35}s`,
  rotation: `${(index % 2 === 0 ? 1 : -1) * (10 + index * 7)}deg`,
}))

function App() {
  const melodyStep = useSyncExternalStore(subscribeMelodyStep, getMelodyStepIndex)
  const [activeGesture, setActiveGesture] = useState<(typeof GESTURES)[number]>('Beat')
  const [dynamicLevel, setDynamicLevel] = useState<(typeof LEVELS)[number]>('mf')
  const [logs, setLogs] = useState<string[]>(INITIAL_LOGS)
  const lastExpressionLogRef = useRef('')
  const showConfetti = melodyStep === FINAL_MELODY_STEP

  const pushLog = useCallback((entry: string) => {
    setLogs((current) => [entry, ...current].slice(0, 20))
  }, [])

  const handleGesture = useCallback((event: GestureEvent) => {
    routeGestureToAudio(event)
  }, [])

  const handleBeat = useCallback(() => {
    setActiveGesture('Beat')
    pushLog('Beat detected')
    routeBeatToAudio()
  }, [pushLog])

  const handleExpression = useCallback((event: HandExpressionEvent) => {
    setActiveGesture(event.gesture)
    setDynamicLevel(event.level)

    if (event.stopped) {
      lastExpressionLogRef.current = ''
      pushLog('Stop triggered')
      return
    }

    if (event.gesture === 'Beat') {
      return
    }

    const nextLog = `${event.gesture} ${event.level}`
    if (nextLog !== lastExpressionLogRef.current) {
      lastExpressionLogRef.current = nextLog
      pushLog(nextLog)
    }
  }, [pushLog])

  return (
    <main className="app-shell">
      {showConfetti ? (
        <div className="confetti-layer" aria-hidden="true">
          {CONFETTI.map((piece) => (
            <span
              key={piece.id}
              className="confetti-piece"
              style={{
                left: piece.left,
                animationDelay: piece.delay,
                animationDuration: piece.duration,
                transform: `rotate(${piece.rotation})`,
              }}
            />
          ))}
        </div>
      ) : null}

      <aside className="panel glass-panel logs-panel">
        <div className="panel-heading">
          <span className="eyebrow">Session Logs</span>
          <h2>Live conductor events</h2>
        </div>
        <div className="log-list" role="log" aria-live="polite">
          {logs.map((entry, index) => (
            <div key={`${entry}-${index}`} className="log-item">
              <span className="log-index">{String(index + 1).padStart(2, '0')}</span>
              <span>{entry}</span>
            </div>
          ))}
        </div>
      </aside>

      <section className="camera-column">
        <div className="camera-copy">
          <span className="eyebrow">AI Gesture Conducting</span>
          <h1>Portfolio-grade conducting interface</h1>
        </div>

        <div className="camera-stage glass-panel">
          <CameraView
            onGesture={handleGesture}
            onBeat={handleBeat}
            onBounce={() => {}}
            onExpression={handleExpression}
          />

          <div className="camera-hud glass-panel">
            <div className="hud-section">
              <span className="hud-label">Current Gesture</span>
              <div className="gesture-pills">
                {GESTURES.map((gesture) => (
                  <span
                    key={gesture}
                    className={`gesture-pill ${activeGesture === gesture ? 'is-active' : ''}`}
                  >
                    {gesture}
                  </span>
                ))}
              </div>
            </div>

            <div className="hud-meta">
              <div className="hud-card">
                <span className="hud-label">Dynamic Level</span>
                <strong>{dynamicLevel}</strong>
              </div>
              <div className="hud-card">
                <span className="hud-label">Melody Step</span>
                <strong>{melodyStep}</strong>
              </div>
            </div>
          </div>
        </div>

        <div className="camera-controls">
          <button className="counter" onClick={() => void playPreviousMelodyNote()}>
            Prev
          </button>
          <button className="counter" onClick={() => void playNextMelodyNote()}>
            Next
          </button>
        </div>
      </section>

      <aside className="panel glass-panel info-panel">
        <section className="info-section">
          <span className="eyebrow">About</span>
          <p>AI-powered gesture conducting system using hand tracking and Web Audio API</p>
        </section>

        <section className="info-section">
          <span className="eyebrow">How It Works</span>
          <ul>
            <li>Beat = bounce motion</li>
            <li>Open hand = louder</li>
            <li>Close hand = softer</li>
            <li>Two hands closed = stop</li>
          </ul>
        </section>

        <section className="info-section">
          <span className="eyebrow">How to Test</span>
          <ol>
            <li>Allow camera</li>
            <li>Raise one hand</li>
            <li>Bounce hand to trigger beat</li>
            <li>Open hand to increase volume</li>
            <li>Close hand to decrease volume</li>
            <li>Close both hands to stop</li>
          </ol>
        </section>

        <section className="info-section">
          <span className="eyebrow">Tech Stack</span>
          <ul>
            <li>React</li>
            <li>MediaPipe / Hand tracking</li>
            <li>Web Audio API</li>
          </ul>
        </section>
      </aside>
    </main>
  )
}

export default App
