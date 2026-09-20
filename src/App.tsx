import { useEffect, useState } from 'react'
import Auth from './Auth'
import Dashboard from './Dashboard'
import type { User } from './types'
import { api } from './api'

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [checkingSession, setCheckingSession] = useState(Boolean(localStorage.getItem('walletuq_token')))
  useEffect(() => {
    if (!localStorage.getItem('walletuq_token')) return
    api<{ user: User }>('/me').then((data) => setUser(data.user)).catch(() => localStorage.removeItem('walletuq_token')).finally(() => setCheckingSession(false))
  }, [])
  const logout = () => { localStorage.removeItem('walletuq_token'); setUser(null) }
  if (checkingSession) return <div className="session-loader"><span>W</span><p>Abriendo tu billetera…</p></div>
  return user ? <Dashboard user={user} onUser={setUser} onLogout={logout}/> : <Auth onAuthenticated={(_token,nextUser)=>setUser(nextUser)}/>
}
