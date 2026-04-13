import { useState, useEffect, useCallback, useRef } from 'react'
import { useBinauralAudio, BINAURAL_PRESETS } from './hooks/useBinaural'
import { useOpenAITTS, OPENAI_VOICES } from './hooks/useOpenAITTS'
import { useSessions } from './hooks/useSessions'

function App() {
  // Estados principales
  const [text, setText] = useState('')
  const [binauralPreset, setBinauralPreset] = useState('theta')
  const [binauralVolume, setBinauralVolume] = useState(0.3)
  const [preDelay, setPreDelay] = useState(30) // segundos antes del texto
  const [postDelay, setPostDelay] = useState(60) // segundos después del texto
  const [voiceSpeed, setVoiceSpeed] = useState(0.85) // Velocidad de voz (0.25 a 4.0)
  const [selectedVoice, setSelectedVoice] = useState('nova') // Voz por defecto
  const [isPlaying, setIsPlaying] = useState(false)
  const [phase, setPhase] = useState('idle') // idle, pre, speaking, post
  const [timeRemaining, setTimeRemaining] = useState(0)
  const [sessionName, setSessionName] = useState('')
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [currentSessionId, setCurrentSessionId] = useState(null)

  // Hooks personalizados
  const { startBinaural, stopBinaural } = useBinauralAudio()
  const { speak: speakOpenAI, stop: stopOpenAI, isSpeaking: isOpenAISpeaking, isLoading, error: openAIError } = useOpenAITTS()
  const { sessions, createSession, updateSession, deleteSession, getSession } = useSessions()

  // Referencias para timers
  const timerRef = useRef(null)
  const phaseRef = useRef('idle')

  // Limpiar timers al desmontar
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [])

  // Mostrar errores
  useEffect(() => {
    if (openAIError) {
      alert(`Error: ${openAIError}`)
    }
  }, [openAIError])

  // Iniciar contador regresivo
  const startTimer = useCallback((seconds, onComplete) => {
    setTimeRemaining(seconds)
    let remaining = seconds
    timerRef.current = setInterval(() => {
      remaining -= 1
      setTimeRemaining(remaining)
      if (remaining <= 0) {
        clearInterval(timerRef.current)
        if (onComplete) onComplete()
      }
    }, 1000)
  }, [])

  // Iniciar sesión completa
  const startSession = useCallback(async () => {
    if (!text.trim()) {
      alert('Por favor escribe un texto para la sesión')
      return
    }

    setIsPlaying(true)
    phaseRef.current = 'pre'
    setPhase('pre')

    // Fase 1: Iniciar audio binaural
    startBinaural(binauralPreset, binauralVolume)

    // Fase 2: Esperar preDelay segundos antes de hablar
    startTimer(preDelay, () => {
      phaseRef.current = 'speaking'
      setPhase('speaking')

      // Fase 3: Hablar el texto con OpenAI TTS
      speakOpenAI(text, {
        voice: selectedVoice,
        speed: voiceSpeed
      })
    })
  }, [text, binauralPreset, binauralVolume, preDelay, selectedVoice, voiceSpeed, startBinaural, startTimer, speakOpenAI])

  // Efecto para detectar cuando termina el TTS
  useEffect(() => {
    if (!isOpenAISpeaking && !isLoading && phase === 'speaking') {
      // TTS terminó, iniciar fase post
      phaseRef.current = 'post'
      setPhase('post')
      startTimer(postDelay, () => {
        // Terminar sesión
        stopBinaural()
        setIsPlaying(false)
        setPhase('idle')
        setTimeRemaining(0)
      })
    }
  }, [isOpenAISpeaking, isLoading, phase, postDelay, startTimer, stopBinaural])

  // Detener todo
  const stopSession = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
    }
    stopOpenAI()
    stopBinaural()
    setIsPlaying(false)
    setPhase('idle')
    setTimeRemaining(0)
  }, [stopOpenAI, stopBinaural])

  // Guardar sesión
  const handleSaveSession = useCallback(() => {
    if (!text.trim()) {
      alert('Por favor escribe un texto para guardar')
      return
    }
    setShowSaveModal(true)
  }, [text])

  const confirmSaveSession = useCallback(() => {
    const session = createSession(
      sessionName || `Sesión ${sessions.length + 1}`,
      text,
      {
        binauralPreset,
        preDelay,
        postDelay,
        voiceSpeed,
        voiceName: selectedVoice
      }
    )
    setCurrentSessionId(session.id)
    setShowSaveModal(false)
    setSessionName('')
  }, [createSession, sessionName, sessions.length, text, binauralPreset, preDelay, postDelay, voiceSpeed, selectedVoice])

  // Cargar sesión existente
  const loadSession = useCallback((session) => {
    setText(session.text)
    setBinauralPreset(session.settings?.binauralPreset || 'theta')
    setPreDelay(session.settings?.preDelay || 30)
    setPostDelay(session.settings?.postDelay || 60)
    setVoiceSpeed(session.settings?.voiceSpeed || 0.85)
    if (session.settings?.voiceName) {
      setSelectedVoice(session.settings.voiceName)
    }
    setCurrentSessionId(session.id)
  }, [])

  // Formatear tiempo
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="container">
      <header className="header">
        <h1>🧘 Hipno App</h1>
        <p>Meditación hipnótica con frecuencias binaurales</p>
      </header>

      {/* Estado actual */}
      {isPlaying && (
        <div className="card">
          <div className="status">
            <div className={`status-icon ${isPlaying ? 'playing' : 'stopped'}`}>
              {phase === 'pre' && '⏳'}
              {phase === 'speaking' && (isLoading ? '⏳' : '🎙️')}
              {phase === 'post' && '🎵'}
            </div>
            <div className="status-text">
              <h3>
                {phase === 'pre' && 'Preparando relajación...'}
                {phase === 'speaking' && (isLoading ? 'Generando audio...' : 'Reproduciendo sesión...')}
                {phase === 'post' && 'Profundizando estado...'}
              </h3>
              <p>
                {phase === 'pre' && `${formatTime(timeRemaining)} para comenzar`}
                {phase === 'speaking' && 'Escucha y relájate'}
                {phase === 'post' && `${formatTime(timeRemaining)} restantes`}
              </p>
            </div>
            <div className="timer-display">
              {formatTime(timeRemaining)}
            </div>
          </div>
          <div className="wave-visualizer">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="wave-bar" />
            ))}
          </div>
        </div>
      )}

      {/* Editor de texto */}
      <div className="card">
        <h2>📝 Texto de hipnosis</h2>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Escribe aquí el texto de tu sesión de hipnosis...

Ejemplo:
'Respira profundamente... con cada exhalación, sientes cómo tu cuerpo se va relajando más y más... entra en un estado de paz y tranquilidad...'"
          disabled={isPlaying}
        />
      </div>

      {/* Controles de audio binaural */}
      <div className="card">
        <h2>🎵 Frecuencia binaural</h2>
        <div className="controls">
          <div className="control-group">
            <label>Tipo de onda</label>
            <div className="select-wrapper">
              <select
                value={binauralPreset}
                onChange={(e) => setBinauralPreset(e.target.value)}
                disabled={isPlaying}
              >
                {Object.entries(BINAURAL_PRESETS).map(([key, preset]) => (
                  <option key={key} value={key}>
                    {preset.name}
                  </option>
                ))}
              </select>
            </div>
            <small style={{ color: '#888', marginTop: '5px', display: 'block' }}>
              {BINAURAL_PRESETS[binauralPreset]?.description}
            </small>
          </div>

          <div className="control-group">
            <label>Volumen: {Math.round(binauralVolume * 100)}%</label>
            <input
              type="range"
              min="0"
              max="100"
              value={binauralVolume * 100}
              onChange={(e) => setBinauralVolume(Number(e.target.value) / 100)}
              disabled={isPlaying}
            />
          </div>
        </div>
      </div>

      {/* Controles de tiempo */}
      <div className="card">
        <h2>⏱️ Tiempos</h2>
        <div className="controls">
          <div className="control-group">
            <label>Empezar audio antes del texto (seg)</label>
            <input
              type="number"
              min="0"
              max="300"
              value={preDelay}
              onChange={(e) => setPreDelay(Number(e.target.value))}
              disabled={isPlaying}
            />
          </div>

          <div className="control-group">
            <label>Continuar audio después del texto (seg)</label>
            <input
              type="number"
              min="0"
              max="600"
              value={postDelay}
              onChange={(e) => setPostDelay(Number(e.target.value))}
              disabled={isPlaying}
            />
          </div>
        </div>
      </div>

      {/* Controles de voz OpenAI */}
      <div className="card">
        <h2>🎙️ Voz natural (OpenAI TTS)</h2>
        <div className="controls">
          <div className="control-group">
            <label>Voz</label>
            <div className="select-wrapper">
              <select
                value={selectedVoice}
                onChange={(e) => setSelectedVoice(e.target.value)}
                disabled={isPlaying}
              >
                {OPENAI_VOICES.map((voice) => (
                  <option key={voice.id} value={voice.id}>
                    {voice.name} - {voice.description}
                  </option>
                ))}
              </select>
            </div>
            <small style={{ color: '#888', marginTop: '5px', display: 'block' }}>
              Recomendado: Nova (femenina, cálida) o Echo (masculina)
            </small>
          </div>

          <div className="control-group">
            <label>Velocidad: {voiceSpeed}x</label>
            <input
              type="range"
              min="0.5"
              max="1.5"
              step="0.05"
              value={voiceSpeed}
              onChange={(e) => setVoiceSpeed(Number(e.target.value))}
              disabled={isPlaying}
            />
            <small style={{ color: '#888', marginTop: '5px', display: 'block' }}>
              0.85x = más lento y relajante
            </small>
          </div>
        </div>
      </div>

      {/* Botones de control */}
      <div className="buttons">
        {!isPlaying ? (
          <button className="btn-primary" onClick={startSession} disabled={isLoading}>
            {isLoading ? '⏳ Generando...' : '▶️ Iniciar sesión'}
          </button>
        ) : (
          <button className="btn-stop" onClick={stopSession}>
            ⏹️ Detener
          </button>
        )}
        <button
          className="btn-secondary"
          onClick={handleSaveSession}
          disabled={isPlaying || !text.trim()}
        >
          💾 Guardar sesión
        </button>
      </div>

      {/* Sesiones guardadas */}
      {sessions.length > 0 && (
        <div className="card sessions">
          <h2>📁 Sesiones guardadas ({sessions.length})</h2>
          {sessions.map((session) => (
            <div key={session.id} className="session-item">
              <h3>{session.name}</h3>
              <p>{session.text.substring(0, 100)}...</p>
              <div className="session-actions">
                <button
                  className="btn-secondary"
                  onClick={() => loadSession(session)}
                  disabled={isPlaying}
                >
                  📂 Cargar
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => deleteSession(session.id)}
                  disabled={isPlaying}
                  style={{ color: '#ff6b6b' }}
                >
                  🗑️ Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal para guardar */}
      {showSaveModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div className="card" style={{ width: '90%', maxWidth: '400px' }}>
            <h2>💾 Guardar sesión</h2>
            <input
              type="text"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              placeholder="Nombre de la sesión"
              style={{
                width: '100%',
                padding: '12px',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '1rem',
                marginBottom: '15px'
              }}
            />
            <div className="buttons">
              <button className="btn-primary" onClick={confirmSaveSession}>
                ✓ Guardar
              </button>
              <button className="btn-secondary" onClick={() => setShowSaveModal(false)}>
                ✕ Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App