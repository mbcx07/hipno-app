import { useState, useCallback, useRef } from 'react'

const ELEVENLABS_API_KEY = 'sk_b841c76ad14633eb9f0ed899bdd9d79cede6ae512a4dd43b'

// Texto de prueba para preview
const PREVIEW_TEXT = "Hola, esta es una muestra de cómo suena esta voz. Relájate y respira profundamente."

export function useElevenLabsTTS() {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [voices, setVoices] = useState([])
  const audioRef = useRef(null)

  // Cargar voces disponibles
  const loadVoices = useCallback(async () => {
    try {
      const response = await fetch('https://api.elevenlabs.io/v1/voices', {
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY
        }
      })
      
      if (!response.ok) throw new Error('Error cargando voces')
      
      const data = await response.json()
      const formattedVoices = data.voices.map(v => ({
        id: v.voice_id,
        name: v.name,
        labels: v.labels || {},
        preview_url: v.preview_url
      }))
      
      setVoices(formattedVoices)
      return formattedVoices
    } catch (err) {
      console.error('Error loading voices:', err)
      setError(err.message)
      return []
    }
  }, [])

  const speak = useCallback(async (text, options = {}) => {
    if (!text.trim()) return

    // Detener audio anterior si existe
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }

    setIsLoading(true)
    setError(null)

    const voiceId = options.voice || '21m00Tcm4TlvDq8ikWAM' // Rachel por defecto
    const speed = options.speed || 0.85

    try {
      console.log('ElevenLabs TTS: Generating audio...', { voiceId, speed, textLength: text.length })
      
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg'
        },
        body: JSON.stringify({
          text: text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.3,
            use_speaker_boost: true,
            speed: speed
          }
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        let errorMessage = `Error ${response.status}`
        try {
          const errorJson = JSON.parse(errorText)
          errorMessage = errorJson.detail?.message || errorJson.detail || errorMessage
        } catch (e) {
          errorMessage = errorText || errorMessage
        }
        throw new Error(errorMessage)
      }

      const audioBlob = await response.blob()
      const audioUrl = URL.createObjectURL(audioBlob)
      const audio = new Audio(audioUrl)
      audioRef.current = audio

      return new Promise((resolve, reject) => {
        audio.onplay = () => {
          setIsSpeaking(true)
          setIsLoading(false)
        }

        audio.onended = () => {
          setIsSpeaking(false)
          URL.revokeObjectURL(audioUrl)
          resolve()
        }

        audio.onerror = (e) => {
          setIsSpeaking(false)
          setIsLoading(false)
          setError('Error reproduciendo audio')
          reject(e)
        }

        audio.play().catch(reject)
      })
    } catch (err) {
      setIsLoading(false)
      setIsSpeaking(false)
      setError(err.message)
      console.error('ElevenLabs TTS error:', err)
      throw err
    }
  }, [])

  const previewVoice = useCallback(async (voiceId) => {
    try {
      await speak(PREVIEW_TEXT, { voice: voiceId, speed: 0.85 })
    } catch (e) {
      console.error('Preview error:', e)
    }
  }, [speak])

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      audioRef.current = null
    }
    setIsSpeaking(false)
    setIsLoading(false)
  }, [])

  return {
    speak,
    stop,
    previewVoice,
    loadVoices,
    isSpeaking,
    isLoading,
    error,
    voices
  }
}