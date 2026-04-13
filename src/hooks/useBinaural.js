import { useRef, useCallback, useEffect } from 'react'

// Frecuencias binaurales EXACTAS para hipnosis
export const BINAURAL_PRESETS = {
  delta_1: { name: 'Delta 1 Hz', baseFreq: 200, beatFreq: 1, description: 'Sueño profundo' },
  delta_2: { name: 'Delta 2 Hz', baseFreq: 200, beatFreq: 2, description: 'Sueño profundo' },
  delta_3: { name: 'Delta 3 Hz', baseFreq: 200, beatFreq: 3, description: 'Sueño profundo' },
  delta_4: { name: 'Delta 4 Hz', baseFreq: 200, beatFreq: 4, description: 'Sueño profundo' },
  theta_4: { name: 'Theta 4 Hz', baseFreq: 200, beatFreq: 4, description: 'Meditación profunda' },
  theta_5: { name: 'Theta 5 Hz', baseFreq: 200, beatFreq: 5, description: 'Meditación profunda' },
  theta_6: { name: 'Theta 6 Hz', baseFreq: 200, beatFreq: 6, description: 'Hipnosis, visualización' },
  theta_7: { name: 'Theta 7 Hz', baseFreq: 200, beatFreq: 7, description: 'Hipnosis, visualización' },
  theta_8: { name: 'Theta 8 Hz', baseFreq: 200, beatFreq: 8, description: 'Creatividad, intuición' },
  alpha_8: { name: 'Alpha 8 Hz', baseFreq: 200, beatFreq: 8, description: 'Relajación ligera' },
  alpha_9: { name: 'Alpha 9 Hz', baseFreq: 200, beatFreq: 9, description: 'Relajación ligera' },
  alpha_10: { name: 'Alpha 10 Hz', baseFreq: 200, beatFreq: 10, description: 'Relajación, calma' },
  alpha_11: { name: 'Alpha 11 Hz', baseFreq: 200, beatFreq: 11, description: 'Relajación, calma' },
  alpha_12: { name: 'Alpha 12 Hz', baseFreq: 200, beatFreq: 12, description: 'Concentración relajada' },
  beta_13: { name: 'Beta 13 Hz', baseFreq: 200, beatFreq: 13, description: 'Alerta, concentración' },
  beta_14: { name: 'Beta 14 Hz', baseFreq: 200, beatFreq: 14, description: 'Concentración activa' },
  beta_15: { name: 'Beta 15 Hz', baseFreq: 200, beatFreq: 15, description: 'Concentración activa' },
  beta_16: { name: 'Beta 16 Hz', baseFreq: 200, beatFreq: 16, description: 'Alerta, enfoque' }
}

export function useBinauralAudio() {
  const audioContextRef = useRef(null)
  const leftOscRef = useRef(null)
  const rightOscRef = useRef(null)
  const gainNodeRef = useRef(null)
  const isPlayingRef = useRef(false)

  const initAudioContext = useCallback(() => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
    }
    // Reanudar si está suspendido
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume()
    }
    return audioContextRef.current
  }, [])

  const startBinaural = useCallback((preset = 'theta_6', volume = 0.3) => {
    const ctx = initAudioContext()
    
    // Detener cualquier audio previo
    stopBinaural()

    // Crear nodo de ganancia (volumen)
    gainNodeRef.current = ctx.createGain()
    gainNodeRef.current.gain.value = volume
    gainNodeRef.current.connect(ctx.destination)

    // Crear merger para stereo
    const merger = ctx.createChannelMerger(2)
    merger.connect(gainNodeRef.current)

    const presetData = BINAURAL_PRESETS[preset] || BINAURAL_PRESETS.theta_6
    const { baseFreq, beatFreq } = presetData

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
    try {
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
    } catch (e) {
      // Ignorar errores si ya está detenido
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