import { useState, type FormEvent } from 'react'
import { ArrowRight, CheckCircle2, Eye, EyeOff, Fingerprint, LockKeyhole, ShieldCheck, Sparkles, UserRound } from 'lucide-react'
import { api } from './api'
import type { User } from './types'

type Props = { onAuthenticated: (token: string, user: User) => void }

export default function Auth({ onAuthenticated }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [showPin, setShowPin] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ fullName: '', document: '', email: '', phone: '', pin: '', acceptedKyc: false })
  const update = (field: string, value: string | boolean) => setForm((current) => ({ ...current, [field]: value }))

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setLoading(true); setError('')
    try {
      const data = await api<{ token: string; user: User }>(`/auth/${mode}`, { method: 'POST', body: JSON.stringify(form) })
      localStorage.setItem('walletuq_token', data.token); onAuthenticated(data.token, data.user)
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Error inesperado') }
    finally { setLoading(false) }
  }

  return <div className="min-h-screen bg-[#f5f5f1] lg:grid lg:grid-cols-[1.05fr_.95fr]">
    <section className="auth-hero hidden lg:flex">
      <div className="relative z-10 max-w-xl">
        <div className="brand brand-light"><span>W</span>Wallet<strong>UQ</strong></div>
        <div className="mt-28 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs text-white/80"><Sparkles size={14}/> Tu actividad se convierte en beneficios</div>
        <h1 className="mt-6 text-6xl font-semibold leading-[1.05] tracking-[-.055em] text-white">Tu dinero.<br/><em className="font-serif font-normal text-[#a8f0cf]">Más simple.</em></h1>
        <p className="mt-6 max-w-md text-base leading-7 text-white/60">Una billetera que premia cada movimiento. Transfiere, recarga y alcanza un nuevo nivel.</p>
        <div className="mt-16 grid grid-cols-3 gap-3">
          {[['5%', 'Comisión inicial'], ['24/7', 'Siempre disponible'], ['1 punto', 'Cada $10.000']].map(([value,label]) => <div className="rounded-2xl border border-white/10 bg-white/[.07] p-4" key={label}><strong className="block text-xl text-white">{value}</strong><span className="mt-1 block text-[10px] text-white/45">{label}</span></div>)}
        </div>
      </div>
    </section>
    <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-10">
      <div className="w-full max-w-md">
        <div className="brand mb-10 lg:hidden"><span>W</span>Wallet<strong>UQ</strong></div>
        <div className="mb-7"><p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-700">{mode === 'login' ? 'Qué bueno verte' : 'Abre tu billetera'}</p><h2 className="mt-2 text-3xl font-semibold tracking-[-.035em] text-slate-900">{mode === 'login' ? 'Inicia sesión' : 'Crea tu cuenta'}</h2><p className="mt-2 text-sm text-slate-500">{mode === 'login' ? 'Accede con tu documento y PIN.' : 'Completa tus datos. Solo tomará un minuto.'}</p></div>
        <div className="mb-6 grid grid-cols-2 rounded-xl bg-slate-200/60 p-1"><button className={`auth-tab ${mode === 'login' ? 'active' : ''}`} onClick={() => { setMode('login'); setError('') }}>Ingresar</button><button className={`auth-tab ${mode === 'register' ? 'active' : ''}`} onClick={() => { setMode('register'); setError('') }}>Registrarme</button></div>
        <form className="space-y-4" onSubmit={submit}>
          {mode === 'register' && <><Field label="Nombre completo"><input required value={form.fullName} onChange={(e) => update('fullName', e.target.value)} placeholder="Ana María Torres"/></Field><div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><Field label="Correo"><input required type="email" value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="ana@email.com"/></Field><Field label="Celular"><input required inputMode="numeric" maxLength={10} value={form.phone} onChange={(e) => update('phone', e.target.value.replace(/\D/g,''))} placeholder="3001234567"/></Field></div></>}
          <Field label="Documento de identidad"><div className="input-icon"><UserRound size={17}/><input required inputMode="numeric" value={form.document} onChange={(e) => update('document', e.target.value.replace(/\D/g,''))} placeholder="Número de documento"/></div></Field>
          <Field label="PIN de 6 dígitos"><div className="input-icon"><LockKeyhole size={17}/><input required type={showPin ? 'text' : 'password'} inputMode="numeric" maxLength={6} value={form.pin} onChange={(e) => update('pin', e.target.value.replace(/\D/g,''))} placeholder="••••••"/><button type="button" onClick={() => setShowPin(!showPin)}>{showPin ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div></Field>
          {mode === 'register' && <label className="kyc-box"><input type="checkbox" checked={form.acceptedKyc} onChange={(e) => update('acceptedKyc', e.target.checked)}/><ShieldCheck size={20}/><span><strong>Validación de identidad</strong><small>Confirmo que mis datos son reales. La biometría está simulada para este demo.</small></span></label>}
          {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
          <button className="primary-action" disabled={loading}>{loading ? 'Procesando…' : mode === 'login' ? 'Entrar a mi billetera' : 'Crear mi cuenta'}<ArrowRight size={18}/></button>
        </form>
        <div className="mt-7 flex items-center justify-center gap-2 text-xs text-slate-400"><Fingerprint size={15}/><span>Datos protegidos · Sesión de 15 minutos</span></div>
      </div>
    </section>
  </div>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="field"><span>{label}</span>{children}</label> }
