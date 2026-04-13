import { useState, useCallback, useEffect } from 'react'

const STORAGE_KEY = 'hipno-sessions'

export function useSessions() {
  const [sessions, setSessions] = useState([])

  // Cargar sesiones guardadas
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        setSessions(JSON.parse(saved))
      }
    } catch (e) {
      console.error('Error loading sessions:', e)
    }
  }, [])

  // Guardar sesiones
  const saveSessions = useCallback((newSessions) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newSessions))
      setSessions(newSessions)
    } catch (e) {
      console.error('Error saving sessions:', e)
    }
  }, [])

  // Crear nueva sesión
  const createSession = useCallback((name, text, settings = {}) => {
    const session = {
      id: Date.now().toString(),
      name: name || `Sesión ${sessions.length + 1}`,
      text,
      settings: {
        binauralPreset: 'theta',
        preDelay: 30,
        postDelay: 60,
        voiceRate: 0.8,
        ...settings
      },
      createdAt: new Date().toISOString()
    }
    const newSessions = [...sessions, session]
    saveSessions(newSessions)
    return session
  }, [sessions, saveSessions])

  // Actualizar sesión existente
  const updateSession = useCallback((id, updates) => {
    const newSessions = sessions.map(s => 
      s.id === id ? { ...s, ...updates } : s
    )
    saveSessions(newSessions)
  }, [sessions, saveSessions])

  // Eliminar sesión
  const deleteSession = useCallback((id) => {
    const newSessions = sessions.filter(s => s.id !== id)
    saveSessions(newSessions)
  }, [sessions, saveSessions])

  // Obtener sesión por ID
  const getSession = useCallback((id) => {
    return sessions.find(s => s.id === id)
  }, [sessions])

  return {
    sessions,
    createSession,
    updateSession,
    deleteSession,
    getSession
  }
}