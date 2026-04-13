import { useRef, useCallback, useState } from 'react'

export function useTTS() {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const utteranceRef = useRef(null)
  const synthRef = useRef(null)

  const initSynth = useCallback(() => {
    if (!synthRef.current) {
      synthRef.current = window.speechSynthesis
    }
    return synthRef.current
  }, [])

  const getVoices = useCallback(() => {
    const synth = initSynth()
    return synth.getVoices()
  }, [initSynth])

  const speak = useCallback((text, options = {}) => {
    const synth = initSynth()
    
    // Cancelar cualquier habla previa
    synth.cancel()

    const utterance = new SpeechSynthesisUtterance(text)
    utteranceRef.current = utterance

    // Configurar opciones
    if (options.voice) {
      utterance.voice = options.voice
    }
    utterance.rate = options.rate || 0.8 // Velocidad más lenta para hipnosis
    utterance.pitch = options.pitch || 0.9 // Tono más bajo, relajante
    utterance.volume = options.volume || 1

    utterance.onstart = () => setIsSpeaking(true)
    utterance.onend = () => setIsSpeaking(false)
    utterance.onerror = () => setIsSpeaking(false)

    synth.speak(utterance)
  }, [initSynth])

  const stop = useCallback(() => {
    const synth = initSynth()
    synth.cancel()
    setIsSpeaking(false)
  }, [initSynth])

  const pause = useCallback(() => {
    const synth = initSynth()
    synth.pause()
  }, [initSynth])

  const resume = useCallback(() => {
    const synth = initSynth()
    synth.resume()
  }, [initSynth])

  return {
    speak,
    stop,
    pause,
    resume,
    getVoices,
    isSpeaking
  }
}