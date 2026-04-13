import { useRef, useCallback, useEffect } from 'react'

// Frecuencias binaurales comunes para hipnosis
export const BINAURAL_PRESETS = {
  delta: { name: 'Delta (1-4 Hz)', baseFreq: 200, beatFreq: 2, description: 'Sueño profundo, sanación' },
  theta: { name: 'Theta (4-8 Hz)', baseFreq: 200, beatFreq: 6, description: 'Meditación profunda, hipnosis' },
  alpha: { name: 'Alpha (8-12 Hz)', baseFreq: 200, beatFreq: 10, description: 'Relajación, creatividad' },
  beta: { name: 'Beta (12-16 Hz)', baseFreq: 200, beatFreq: 14, description: 'Concentración, alerta' }
}

export function useBinauralAudio() {
  const audioContextRef = useRef(null)
  const leftOscRef = useRef(null)
  const rightOscRef = useRef(null)
  const gainNodeRef = useRef(null)
  const isPlayingRef = useRef(false)

  const initAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
    }
    return audioContextRef.current
  }, [])

  const startBinaural = useCallback((preset = 'theta', volume = 0.3) => {
    const ctx = initAudioContext()
    
    // Crear nodo de ganancia (volumen)
    gainNodeRef.current = ctx.createGain()
    gainNodeRef.current.gain.value = volume
    gainNodeRef.current.connect(ctx.destination)

    // Crear merger para stereo
    const merger = ctx.createChannelMerger(2)
    merger.connect(gainNodeRef.current)

    const { baseFreq, beatFreq } = BINAURAL_PRESETS[preset] || BINAURAL_PRESETS.theta

    // Oscilador izquierdo
    leftOscRef.current = ctx.createOscillator()
    leftOscRef.current.type = 'sine'
    leftOscRef.current.frequency.value = baseFreq
    
    const leftGain = ctx.createGain()
    leftGain.gain.value = 1
    leftOscRef.current.connect(leftGain)
    leftGain.connect(merger, 0, 0)

    // Oscilador derecho (con diferencia de frecuencia para el efecto binaural)
    rightOscRef.current = ctx.createOscillator()
    rightOscRef.current.type = 'sine'
    rightOscRef.current.frequency.value = baseFreq + beatFreq
    
    const rightGain = ctx.createGain()
    rightGain.gain.value = 1
    rightOscRef.current.connect(rightGain)
    rightGain.connect(merger, 0, 1)

    leftOscRef.current.start()
    rightOscRef.current.start()
    isPlayingRef.current = true
  }, [initAudioContext])

  const stopBinaural = useCallback(() => {
    if (leftOscRef.current) {
      leftOscRef.current.stop()
      leftOscRef.current.disconnect()
      leftOscRef.current = null
    }
    if (rightOscRef.current) {
      rightOscRef.current.stop()
      rightOscRef.current.disconnect()
      rightOscRef.current = null
    }
    if (gainNodeRef.current) {
      gainNodeRef.current.disconnect()
      gainNodeRef.current = null
    }
    isPlayingRef.current = false
  }, [])

  const setVolume = useCallback((volume) => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = volume
    }
  }, [])

  useEffect(() => {
    return () => {
      stopBinaural()
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
    }
  }, [stopBinaural])

  return {
    startBinaural,
    stopBinaural,
    setVolume,
    isPlaying: isPlayingRef.current,
    presets: BINAURAL_PRESETS
  }
}