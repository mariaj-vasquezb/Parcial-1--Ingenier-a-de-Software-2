import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Bell, Check, ChevronRight, CircleX, Copy, CreditCard, Eye, EyeOff, Fingerprint, History, Home, Landmark, LogOut, Menu, MessageSquareText, MoreHorizontal, Plus, ReceiptText, Search, Send, ShieldCheck, Sparkles, Trophy, WalletCards, X } from 'lucide-react'
import { API_URL, TOKEN_KEY, api, errorMessage, isSessionError, money, shortDate } from './api'
import { biometricSupported, disableBiometric, enrollBiometric } from './biometric'
import type { Transaction, User } from './types'
import Modal from './Modal'
import { PayModal } from './Payments'

type Props = { user: User; onUser: (user: User) => void; onLogout: (reason?: string) => void }

const today = () => new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()).toUpperCase()

export default function Dashboard({ user, onUser, onLogout }: Props) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [modal, setModal] = useState<'deposit' | 'transfer' | 'pay' | null>(null)
  const [balanceVisible, setBalanceVisible] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [toast, setToast] = useState('')
  const load = useCallback(async (background = false) => {
    try {
      const [me, history] = await Promise.all([api<{ user: User }>('/me', { background }), api<{ transactions: Transaction[] }>('/transactions', { background })])
      onUser(me.user); setTransactions(history.transactions)
    } catch (error) { if (isSessionError(error)) onLogout(errorMessage(error)) }
  }, [onUser, onLogout])
  // SWR-003: el servidor avisa por SSE apenas cambia la billetera; el sondeo lento es solo un respaldo.
  useEffect(() => {
    load()
    const events = new EventSource(`${API_URL}/events?token=${encodeURIComponent(localStorage.getItem(TOKEN_KEY) ?? '')}`)
    events.addEventListener('wallet', () => load(true))
    const refresh = window.setInterval(() => load(true), 15_000)
    return () => { events.close(); window.clearInterval(refresh) }
  }, [load])
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 4000); return () => window.clearTimeout(timer) }, [toast])
  const firstName = user.fullName.split(' ')[0]
  const completed = (next: User) => { onUser(next); setModal(null); load() }

  return <div className="min-h-screen bg-[#f3f4f0] text-slate-900">
    <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
      <div className="brand brand-light"><span>W</span>Wallet<strong>UQ</strong></div><button className="mobile-close" onClick={() => setMenuOpen(false)}><X/></button>
      <nav><p>GENERAL</p><button className="active"><Home/>Inicio</button><button><History/>Movimientos</button><button><WalletCards/>Mis cuentas</button><p>BENEFICIOS</p><button><Trophy/>Recompensas <em>Pronto</em></button><button><Sparkles/>Mi nivel</button></nav>
      <div className="sidebar-user"><span>{user.fullName.split(' ').map((part) => part[0]).slice(0,2).join('')}</span><div><strong>{user.fullName}</strong><small>Cuenta •{user.accountNumber.slice(-4)}</small></div><button onClick={() => onLogout()} title="Cerrar sesión"><LogOut size={17}/></button></div>
    </aside>
    {menuOpen && <button className="menu-scrim" onClick={() => setMenuOpen(false)}/>}
    <main className="dashboard-main">
      <header className="topbar"><button className="menu-trigger" onClick={() => setMenuOpen(true)}><Menu/></button><div className="top-search"><Search/><input placeholder="Buscar movimientos..."/></div><div className="top-actions"><span className="environment">DEMO</span><button><Bell size={19}/><i/></button><div className="avatar">{firstName[0]}</div></div></header>
      <div className="dashboard-content">
        <section className="welcome-row"><div><span className="overline">{today()}</span><h1>Hola, {firstName} <span>👋</span></h1><p>Aquí tienes el resumen de tu billetera.</p></div><div className="welcome-pills"><BiometricPill user={user} onUser={onUser} onMessage={setToast}/><button className="account-pill"><ShieldCheck size={16}/> Cuenta verificada</button></div></section>
        <section className="hero-grid">
          <article className="balance-card"><div className="orb orb-one"/><div className="orb orb-two"/><header><div><span>SALDO DISPONIBLE</span><button onClick={() => setBalanceVisible(!balanceVisible)}>{balanceVisible ? <Eye size={16}/> : <EyeOff size={16}/>}</button></div><MoreHorizontal/></header><h2>{balanceVisible ? money(user.balance) : '$ •••••••'}</h2><p>Pesos colombianos</p><div className="account-number"><span>CUENTA WALLETUQ</span><strong>{user.accountNumber.replace(/(\d{4})(?=\d)/g, '$1 ')}</strong><button onClick={() => navigator.clipboard.writeText(user.accountNumber)}><Copy size={14}/></button></div></article>
          <article className="level-card"><header><div className="level-icon"><Trophy/></div><div><span>NIVEL ACTUAL</span><h3>{user.level}</h3></div><b>{Math.round(user.feeRate * 100)}% comisión</b></header><div className="level-progress"><div><span>Tu progreso</span><strong>{user.points.toLocaleString('es-CO')} puntos</strong></div><div className="progress-track"><i style={{ width: `${user.progress}%` }}/></div><p>{user.level === 'Platinum' ? '¡Alcanzaste el nivel máximo!' : `${user.progress}% hacia el siguiente nivel`}</p></div><footer><span><small>Límite diario</small><strong>{money(user.dailyLimit)}</strong></span><span><small>Puntos por transacción</small><strong>1 / $10K</strong></span></footer></article>
        </section>
        <section className="quick-actions"><button onClick={() => setModal('deposit')}><span className="action-icon green"><Plus/></span><span><strong>Recargar</strong><small>Agrega dinero</small></span><ChevronRight/></button><button onClick={() => setModal('transfer')}><span className="action-icon indigo"><Send/></span><span><strong>Transferir</strong><small>Envía a otra cuenta</small></span><ChevronRight/></button><button onClick={() => setModal('pay')}><span className="action-icon amber"><ReceiptText/></span><span><strong>Pagar</strong><small>Escanea un QR</small></span><ChevronRight/></button></section>
        <section className="content-grid"><article className="activity-card"><header><div><span className="overline">ACTIVIDAD</span><h2>Movimientos recientes</h2></div><button>Ver todos <ChevronRight size={15}/></button></header>{transactions.length ? <div className="transaction-list">{transactions.slice(0,6).map((tx) => <TransactionRow transaction={tx} key={tx.id}/>)}</div> : <div className="empty-state"><div><WalletCards/></div><h3>Tu billetera está lista</h3><p>Haz tu primera recarga para comenzar a mover tu dinero.</p><button onClick={() => setModal('deposit')}><Plus size={16}/> Recargar saldo</button></div>}</article>
          <aside className="tips-card"><div className="tip-art"><Sparkles/></div><span>TIP WALLETUQ</span><h3>Sube de nivel,<br/>paga menos.</h3><p>Por cada $10.000 que transfieras o pagues ganas 1 punto. Acumula puntos y reduce tu comisión.</p><div className="tier-list">{[['Bronze','5%'],['Silver','3%'],['Gold','1%'],['Platinum','0%']].map(([name,fee]) => <div className={name === user.level ? 'current' : ''} key={name}><i/><span>{name}</span><b>{fee}</b></div>)}</div></aside>
        </section>
      </div>
    </main>
    {modal === 'deposit' && <DepositModal user={user} onClose={() => setModal(null)} onComplete={completed}/>}
    {modal === 'transfer' && <TransferModal user={user} onClose={() => setModal(null)} onComplete={completed}/>}
    {modal === 'pay' && <PayModal user={user} onClose={() => setModal(null)} onComplete={completed}/>}
    {toast && <div role="status" className="toast">{toast}</div>}
  </div>
}

function BiometricPill({ user, onUser, onMessage }: { user: User; onUser: (user: User) => void; onMessage: (message: string) => void }) {
  const [busy, setBusy] = useState(false)
  if (!biometricSupported()) return null
  const toggle = async () => {
    if (user.biometricEnabled && !window.confirm('¿Desactivar el ingreso con biometría?')) return
    setBusy(true)
    try {
      const data = user.biometricEnabled ? await disableBiometric() : await enrollBiometric()
      onUser(data.user); onMessage(data.user.biometricEnabled ? 'Biometría activada. Ya puedes ingresar con tu huella o rostro.' : 'Biometría desactivada.')
    } catch (error) { onMessage(errorMessage(error)) }
    finally { setBusy(false) }
  }
  return <button className={`account-pill biometric-pill ${user.biometricEnabled ? 'enabled' : ''}`} disabled={busy} onClick={toggle} title={user.biometricEnabled ? 'Desactivar biometría' : 'Activar ingreso con biometría'}><Fingerprint size={16}/>{busy ? 'Esperando al dispositivo…' : user.biometricEnabled ? 'Biometría activa' : 'Activar biometría'}</button>
}

function TransactionRow({ transaction: tx }: { transaction: Transaction }) {
  const incoming = tx.direction === 'in'
  const failed = tx.status === 'failed'
  const title = tx.type === 'deposit' ? (failed ? 'Recarga rechazada' : 'Recarga de saldo') : tx.type === 'payment' ? `Pago en ${tx.counterpart}` : incoming ? `De ${tx.counterpart}` : `A ${tx.counterpart}`
  const detail = failed ? tx.failureReason : tx.description || (tx.type === 'deposit' ? 'Ingreso de fondos' : 'Transferencia')
  return <div className={`transaction-row ${failed ? 'failed' : ''}`}><span className={`transaction-icon ${failed ? 'failed' : incoming ? 'incoming' : 'outgoing'}`}>{failed ? <CircleX/> : incoming ? <ArrowDownLeft/> : <ArrowUpRight/>}</span><div><strong>{title}</strong><small>{shortDate(tx.createdAt)} · {tx.reference}</small></div><span className="transaction-description">{detail}</span><b className={failed ? 'failed' : incoming ? 'positive' : ''}>{failed ? '' : incoming ? '+' : '−'}{money(tx.amount + (incoming ? 0 : tx.fee))}</b></div>
}

const cardNumberView = (value: string) => value.replace(/(\d{4})(?=\d)/g, '$1 ')
const expiryView = (value: string) => { const digits = value.replace(/\D/g, '').slice(0, 4); return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits }

function DepositModal({ user, onClose, onComplete }: { user: User; onClose: () => void; onComplete: (user: User) => void }) {
  const [amount, setAmount] = useState(''); const [source, setSource] = useState<'card'|'bank'>('card'); const [loading,setLoading]=useState(false); const [error,setError]=useState(''); const [done,setDone]=useState(false)
  const [card, setCard] = useState({ number: '', expiry: '', cvv: '' }); const [banks, setBanks] = useState<{ id: string; name: string }[]>([]); const [bank, setBank] = useState('')
  useEffect(() => { api<{ banks: { id: string; name: string }[] }>('/deposits/banks').then((data) => setBanks(data.banks)).catch(() => undefined) }, [])
  const submit = async (event: FormEvent) => { event.preventDefault(); setLoading(true); setError(''); try { const data=await api<{user:User}>('/deposits',{method:'POST',body:JSON.stringify({amount:Number(amount),source,...(source==='card'?{card}:{bank})})}); setDone(true); setTimeout(()=>onComplete(data.user),900) } catch(e){setError(errorMessage(e))} finally{setLoading(false)} }
  return <Modal title="Recargar saldo" eyebrow="RECARGA SIMULADA" onClose={onClose}>{done ? <Success title="¡Recarga exitosa!" text={`${money(Number(amount))} ya están disponibles en tu billetera.`}/> : <form className="operation-form" onSubmit={submit}><div className="available"><span>Saldo actual</span><strong>{money(user.balance)}</strong></div><label><span>¿Cuánto quieres recargar?</span><div className="money-input"><b>$</b><input autoFocus required inputMode="numeric" value={amount} onChange={(e)=>setAmount(e.target.value.replace(/\D/g,''))} placeholder="0"/><em>COP</em></div><small>Mínimo $10.000 · Sin comisión WalletUQ</small></label><div><span className="form-label">Origen de los fondos</span><div className="source-options"><button type="button" className={source==='card'?'active':''} onClick={()=>setSource('card')}><CreditCard/><span><strong>Tarjeta débito o crédito</strong><small>Pasarela de pagos simulada</small></span>{source==='card'&&<Check/>}</button><button type="button" className={source==='bank'?'active':''} onClick={()=>setSource('bank')}><Landmark/><span><strong>Cuenta bancaria</strong><small>Conexión PSE simulada</small></span>{source==='bank'&&<Check/>}</button></div></div>
    {source === 'card' ? <div className="card-fields"><label><span>Número de tarjeta</span><input required inputMode="numeric" autoComplete="cc-number" value={cardNumberView(card.number)} onChange={(e)=>setCard({...card, number: e.target.value.replace(/\D/g,'').slice(0,19)})} placeholder="4242 4242 4242 4242"/></label><label><span>Vence</span><input required inputMode="numeric" autoComplete="cc-exp" value={card.expiry} onChange={(e)=>setCard({...card, expiry: expiryView(e.target.value)})} placeholder="MM/AA"/></label><label><span>CVV</span><input required type="password" inputMode="numeric" autoComplete="cc-csc" maxLength={4} value={card.cvv} onChange={(e)=>setCard({...card, cvv: e.target.value.replace(/\D/g,'')})} placeholder="•••"/></label><small>Prueba: 4242 4242 4242 4242 se aprueba; 4000 0000 0000 0002 se rechaza.</small></div>
    : <label><span>Banco</span><select required className="bank-select" value={bank} onChange={(e)=>setBank(e.target.value)}><option value="" disabled>Selecciona tu banco</option>{banks.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
    {error&&<div className="form-error">{error}</div>}<button className="submit-operation" disabled={loading}>{loading?'Procesando recarga…':'Recargar ahora'}<ArrowRight/></button><p className="secure-note"><ShieldCheck/>Esta operación es una simulación académica. No procesa dinero real.</p></form>}</Modal>
}

type TransferPreview = { recipient: { fullName: string; accountNumber: string }; amount: number; fee: number; total: number; level: string; feeRate: number; points: number; requiresOtp: boolean }
type OtpDelivery = { sentTo: string; demoCode: string }

function TransferModal({ user, onClose, onComplete }: { user: User; onClose: () => void; onComplete: (user: User) => void }) {
  const [recipient,setRecipient]=useState(''); const [amount,setAmount]=useState(''); const [description,setDescription]=useState(''); const [otp,setOtp]=useState(''); const [preview,setPreview]=useState<TransferPreview|null>(null); const [loading,setLoading]=useState(false); const [error,setError]=useState(''); const [done,setDone]=useState(false)
  const [delivery,setDelivery]=useState<OtpDelivery|null>(null)
  const requestOtp=async()=>{setError('');setOtp('');try{setDelivery(await api<OtpDelivery>('/transfers/otp',{method:'POST',body:JSON.stringify({recipient,amount:Number(amount)})}))}catch(err){setError(errorMessage(err))}}
  const getPreview=async(e:FormEvent)=>{e.preventDefault();setLoading(true);setError('');try{const data=await api<{preview:TransferPreview}>('/transfers/preview',{method:'POST',body:JSON.stringify({recipient,amount:Number(amount)})});setPreview(data.preview);if(data.preview.requiresOtp)await requestOtp()}catch(err){setError(errorMessage(err))}finally{setLoading(false)}}
  const send=async()=>{setLoading(true);setError('');try{const data=await api<{user:User}>('/transfers',{method:'POST',body:JSON.stringify({recipient,amount:Number(amount),description,otp})});setDone(true);setTimeout(()=>onComplete(data.user),1000)}catch(err){setError(errorMessage(err))}finally{setLoading(false)}}
  return <Modal title="Enviar dinero" eyebrow="TRANSFERENCIA WALLETUQ" onClose={onClose}>{done?<Success title="¡Dinero enviado!" text={`${money(Number(amount))} fueron enviados correctamente.`}/>:!preview?<form className="operation-form" onSubmit={getPreview}><div className="available"><span>Disponible para enviar</span><strong>{money(user.balance)}</strong></div><label><span>Documento o número de cuenta</span><input required value={recipient} onChange={(e)=>setRecipient(e.target.value.replace(/\D/g,''))} placeholder="Ej. 1094001234"/></label><label><span>Monto</span><div className="money-input"><b>$</b><input required inputMode="numeric" value={amount} onChange={(e)=>setAmount(e.target.value.replace(/\D/g,''))} placeholder="0"/><em>COP</em></div><small>Montos superiores a $1.000.000 requieren un código enviado por SMS.</small></label><label><span>Concepto <small>(opcional)</small></span><input maxLength={80} value={description} onChange={(e)=>setDescription(e.target.value)} placeholder="¿Para qué es?"/></label>{error&&<div className="form-error">{error}</div>}<button className="submit-operation" disabled={loading}>{loading?'Validando…':'Continuar'}<ArrowRight/></button></form>:<div className="transfer-preview"><div className="recipient-avatar">{preview.recipient.fullName[0]}</div><span>VAS A ENVIAR A</span><h3>{preview.recipient.fullName}</h3><p>Cuenta •{preview.recipient.accountNumber.slice(-4)}</p><div className="preview-total"><small>RECIBE</small><strong>{money(preview.amount)}</strong></div><dl><div><dt>Monto</dt><dd>{money(preview.amount)}</dd></div><div><dt>Comisión {preview.level} ({Math.round(preview.feeRate*100)}%)</dt><dd>{money(preview.fee)}</dd></div><div><dt>Puntos que ganarás</dt><dd className="points">+{preview.points} pts</dd></div><div className="total"><dt>Total a debitar</dt><dd>{money(preview.total)}</dd></div></dl>{preview.requiresOtp&&<div className="otp-field">{delivery&&<div className="sms-preview"><MessageSquareText size={15}/><span>Enviamos un código a tu celular {delivery.sentTo}.<b>SMS simulado · Código {delivery.demoCode}</b></span></div>}<label><span>Código de confirmación</span><input value={otp} onChange={(e)=>setOtp(e.target.value.replace(/\D/g,''))} maxLength={6} inputMode="numeric" autoComplete="one-time-code" placeholder="6 dígitos"/></label><button type="button" className="link-action" onClick={requestOtp}>Reenviar código</button></div>}{error&&<div className="form-error">{error}</div>}<div className="preview-actions"><button onClick={()=>{setPreview(null);setDelivery(null);setOtp('');setError('')}}>Volver</button><button onClick={send} disabled={loading||(preview.requiresOtp&&otp.length!==6)}>{loading?'Enviando…':'Confirmar envío'}<Send size={16}/></button></div></div>}</Modal>
}

function Success({title,text}:{title:string;text:string}) { return <div className="success-state"><span><Check/></span><h3>{title}</h3><p>{text}</p></div> }
