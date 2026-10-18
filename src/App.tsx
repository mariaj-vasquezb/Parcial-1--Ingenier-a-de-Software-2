import { useCallback, useEffect, useState } from 'react'
import Auth from './Auth'
import Dashboard from './Dashboard'
import type { User } from './types'
import { TOKEN_KEY, api, errorMessage } from './api'

const SESSION_IDLE_MS = 15 * 60 * 1000
const PING_EVERY_MS = 60 * 1000
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [notice, setNotice] = useState('')
  const [checkingSession, setCheckingSession] = useState(Boolean(localStorage.getItem(TOKEN_KEY)))
  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) return
    api<{ user: User }>('/me').then((data) => setUser(data.user)).catch((error) => { localStorage.removeItem(TOKEN_KEY); setNotice(errorMessage(error)) }).finally(() => setCheckingSession(false))
  }, [])
  // Solo cuenta el primer cierre: una consulta que falle después no debe reemplazar el motivo mostrado.
  const logout = useCallback((reason = '') => {
    if (!localStorage.getItem(TOKEN_KEY)) return
    api('/auth/logout', { method: 'POST' }).catch(() => undefined)
    localStorage.removeItem(TOKEN_KEY); setUser(null); setNotice(reason)
  }, [])

  // SWR-002: cierra la sesión tras 15 minutos sin interacción. El sondeo del panel no cuenta como actividad,
  // así que la interacción se informa al servidor como mucho una vez por minuto.
  const signedIn = user !== null
  useEffect(() => {
    if (!signedIn) return
    let lastActivity = Date.now(); let lastPing = Date.now()
    const onActivity = () => {
      lastActivity = Date.now()
      if (lastActivity - lastPing >= PING_EVERY_MS) { lastPing = lastActivity; api('/session/ping', { method: 'POST' }).catch(() => undefined) }
    }
    ACTIVITY_EVENTS.forEach((name) => window.addEventListener(name, onActivity, { passive: true }))
    const timer = window.setInterval(() => { if (Date.now() - lastActivity >= SESSION_IDLE_MS) logout('Tu sesión se cerró tras 15 minutos de inactividad.') }, 5_000)
    return () => { ACTIVITY_EVENTS.forEach((name) => window.removeEventListener(name, onActivity)); window.clearInterval(timer) }
  }, [signedIn, logout])

  if (checkingSession) return <div className="session-loader"><span>W</span><p>Abriendo tu billetera…</p></div>
  return user ? <Dashboard user={user} onUser={setUser} onLogout={logout}/> : <Auth notice={notice} onAuthenticated={(_token, nextUser) => { setNotice(''); setUser(nextUser) }}/>
}
