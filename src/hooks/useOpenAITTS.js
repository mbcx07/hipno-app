import { useState, useCallback, useRef } from 'react'

const OPENAI_API_KEY = 'sk_b841c76ad14633eb9f0ed899bdd9d79cede6ae512a4dd43b'

// Voces disponibles en OpenAI TTS
export const OPENAI_VOICES = [
  { id: 'alloy', name: 'Alloy', description: 'Neutra, balanceada' },
  { id: 'echo', name: 'Echo', description: 'Masculina, profunda' },
  { id: 'fable', name: 'Fable', description: 'Narrativa, expresiva' },
  { id: 'onyx', name: 'Onyx', description: 'Masculina, grave' },
  { id: 'nova', name: 'Nova', description: 'Femenina, cálida' },
  { id: 'shimmer', name: 'Shimmer', description: 'Femenina, suave' }
]

export function useOpenAITTS() {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const audioRef = useRef(null)

  const speak = useCallback(async (text, options = {}) => {
    if (!text.trim()) return

    // Detener audio anterior si existe
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }

    setIsLoading(true)
    setError(null)

    const voice = options.voice || 'nova'
    const speed = options.speed || 0.9

    try {
      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'tts-1',
          input: text,
          voice: voice,
          speed: speed
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error?.message || `Error ${response.status}`)
      }

      const audioBlob = await response.blob()
      const audioUrl = URL.createObjectURL(audioBlob)
      const audio = new Audio(audioUrl)
      audioRef.current = audio

      audio.onplay = () => {
        setIsSpeaking(true)
        setIsLoading(false)
      }

      audio.onended = () => {
        setIsSpeaking(false)
        URL.revokeObjectURL(audioUrl)
      }

      audio.onerror = () => {
        setIsSpeaking(false)
        setIsLoading(false)
        setError('Error reproduciendo audio')
      }

      await audio.play()
    } catch (err) {
      setIsLoading(false)
      setIsSpeaking(false)
      setError(err.message)
      console.error('OpenAI TTS error:', err)
    }
  }, [])

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      audioRef.current = null
    }
    setIsSpeaking(false)
  }, [])

  return {
    speak,
    stop,
    isSpeaking,
    isLoading,
    error,
    voices: OPENAI_VOICES
  }
}