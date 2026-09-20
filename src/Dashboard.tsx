import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Bell, Check, ChevronRight, Copy, CreditCard, Eye, EyeOff, History, Home, Landmark, LogOut, Menu, MoreHorizontal, Plus, ReceiptText, Search, Send, ShieldCheck, Sparkles, Trophy, UserRound, WalletCards, X } from 'lucide-react'
import { api, money, shortDate } from './api'
import type { Transaction, User } from './types'
import Modal from './Modal'

type Props = { user: User; onUser: (user: User) => void; onLogout: () => void }

export default function Dashboard({ user, onUser, onLogout }: Props) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [modal, setModal] = useState<'deposit' | 'transfer' | null>(null)
  const [balanceVisible, setBalanceVisible] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const load = async () => { const [me, history] = await Promise.all([api<{ user: User }>('/me'), api<{ transactions: Transaction[] }>('/transactions')]); onUser(me.user); setTransactions(history.transactions) }
  useEffect(() => {
    load().catch(() => onLogout())
    const refresh = window.setInterval(() => load().catch(() => undefined), 3000)
    return () => window.clearInterval(refresh)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const firstName = user.fullName.split(' ')[0]

  return <div className="min-h-screen bg-[#f3f4f0] text-slate-900">
    <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
      <div className="brand brand-light"><span>W</span>Wallet<strong>UQ</strong></div><button className="mobile-close" onClick={() => setMenuOpen(false)}><X/></button>
      <nav><p>GENERAL</p><button className="active"><Home/>Inicio</button><button><History/>Movimientos</button><button><WalletCards/>Mis cuentas</button><p>BENEFICIOS</p><button><Trophy/>Recompensas <em>Pronto</em></button><button><Sparkles/>Mi nivel</button></nav>
      <div className="sidebar-user"><span>{user.fullName.split(' ').map((part) => part[0]).slice(0,2).join('')}</span><div><strong>{user.fullName}</strong><small>Cuenta •{user.accountNumber.slice(-4)}</small></div><button onClick={onLogout} title="Cerrar sesión"><LogOut size={17}/></button></div>
    </aside>
    {menuOpen && <button className="menu-scrim" onClick={() => setMenuOpen(false)}/>} 
    <main className="dashboard-main">
      <header className="topbar"><button className="menu-trigger" onClick={() => setMenuOpen(true)}><Menu/></button><div className="top-search"><Search/><input placeholder="Buscar movimientos..."/></div><div className="top-actions"><span className="environment">DEMO</span><button><Bell size={19}/><i/></button><div className="avatar">{firstName[0]}</div></div></header>
      <div className="dashboard-content">
        <section className="welcome-row"><div><span className="overline">SÁBADO, 20 DE SEPTIEMBRE</span><h1>Hola, {firstName} <span>👋</span></h1><p>Aquí tienes el resumen de tu billetera.</p></div><button className="account-pill"><ShieldCheck size={16}/> Cuenta verificada</button></section>
        <section className="hero-grid">
          <article className="balance-card"><div className="orb orb-one"/><div className="orb orb-two"/><header><div><span>SALDO DISPONIBLE</span><button onClick={() => setBalanceVisible(!balanceVisible)}>{balanceVisible ? <Eye size={16}/> : <EyeOff size={16}/>}</button></div><MoreHorizontal/></header><h2>{balanceVisible ? money(user.balance) : '$ •••••••'}</h2><p>Pesos colombianos</p><div className="account-number"><span>CUENTA WALLETUQ</span><strong>{user.accountNumber.replace(/(\d{4})(?=\d)/g, '$1 ')}</strong><button onClick={() => navigator.clipboard.writeText(user.accountNumber)}><Copy size={14}/></button></div></article>
          <article className="level-card"><header><div className="level-icon"><Trophy/></div><div><span>NIVEL ACTUAL</span><h3>{user.level}</h3></div><b>{Math.round(user.feeRate * 100)}% comisión</b></header><div className="level-progress"><div><span>Tu progreso</span><strong>{user.points.toLocaleString('es-CO')} puntos</strong></div><div className="progress-track"><i style={{ width: `${user.progress}%` }}/></div><p>{user.level === 'Platinum' ? '¡Alcanzaste el nivel máximo!' : `${user.progress}% hacia el siguiente nivel`}</p></div><footer><span><small>Límite diario</small><strong>{money(user.dailyLimit)}</strong></span><span><small>Puntos por transferencia</small><strong>1 / $10K</strong></span></footer></article>
        </section>
        <section className="quick-actions"><button onClick={() => setModal('deposit')}><span className="action-icon green"><Plus/></span><span><strong>Recargar</strong><small>Agrega dinero</small></span><ChevronRight/></button><button onClick={() => setModal('transfer')}><span className="action-icon indigo"><Send/></span><span><strong>Transferir</strong><small>Envía a otra cuenta</small></span><ChevronRight/></button><button><span className="action-icon amber"><ReceiptText/></span><span><strong>Pagar</strong><small>Escanea un QR</small></span><ChevronRight/></button></section>
        <section className="content-grid"><article className="activity-card"><header><div><span className="overline">ACTIVIDAD</span><h2>Movimientos recientes</h2></div><button>Ver todos <ChevronRight size={15}/></button></header>{transactions.length ? <div className="transaction-list">{transactions.slice(0,6).map((tx) => <TransactionRow transaction={tx} key={tx.id}/>)}</div> : <div className="empty-state"><div><WalletCards/></div><h3>Tu billetera está lista</h3><p>Haz tu primera recarga para comenzar a mover tu dinero.</p><button onClick={() => setModal('deposit')}><Plus size={16}/> Recargar saldo</button></div>}</article>
          <aside className="tips-card"><div className="tip-art"><Sparkles/></div><span>TIP WALLETUQ</span><h3>Sube de nivel,<br/>paga menos.</h3><p>Por cada $10.000 que transfieras ganas 1 punto. Acumula puntos y reduce tu comisión.</p><div className="tier-list">{[['Bronze','5%'],['Silver','3%'],['Gold','1%'],['Platinum','0%']].map(([name,fee]) => <div className={name === user.level ? 'current' : ''} key={name}><i/><span>{name}</span><b>{fee}</b></div>)}</div></aside>
        </section>
      </div>
    </main>
    {modal === 'deposit' && <DepositModal user={user} onClose={() => setModal(null)} onComplete={(next) => { onUser(next); setModal(null); load() }}/>} 
    {modal === 'transfer' && <TransferModal user={user} onClose={() => setModal(null)} onComplete={(next) => { onUser(next); setModal(null); load() }}/>} 
  </div>
}

function TransactionRow({ transaction: tx }: { transaction: Transaction }) {
  const incoming = tx.direction === 'in'
  return <div className="transaction-row"><span className={`transaction-icon ${incoming ? 'incoming' : 'outgoing'}`}>{incoming ? <ArrowDownLeft/> : <ArrowUpRight/>}</span><div><strong>{tx.type === 'deposit' ? 'Recarga de saldo' : incoming ? `De ${tx.counterpart}` : `A ${tx.counterpart}`}</strong><small>{shortDate(tx.createdAt)} · {tx.reference}</small></div><span className="transaction-description">{tx.description || (tx.type === 'deposit' ? 'Ingreso de fondos' : 'Transferencia')}</span><b className={incoming ? 'positive' : ''}>{incoming ? '+' : '−'}{money(tx.amount + (incoming ? 0 : tx.fee))}</b></div>
}

function DepositModal({ user, onClose, onComplete }: { user: User; onClose: () => void; onComplete: (user: User) => void }) {
  const [amount, setAmount] = useState(''); const [source, setSource] = useState<'card'|'bank'>('card'); const [loading,setLoading]=useState(false); const [error,setError]=useState(''); const [done,setDone]=useState(false)
  const submit = async (event: FormEvent) => { event.preventDefault(); setLoading(true); setError(''); try { const data=await api<{user:User}>('/deposits',{method:'POST',body:JSON.stringify({amount:Number(amount),source})}); setDone(true); setTimeout(()=>onComplete(data.user),900) } catch(e){setError(e instanceof Error?e.message:'Error')} finally{setLoading(false)} }
  return <Modal title="Recargar saldo" eyebrow="RECARGA SIMULADA" onClose={onClose}>{done ? <Success title="¡Recarga exitosa!" text={`${money(Number(amount))} ya están disponibles en tu billetera.`}/> : <form className="operation-form" onSubmit={submit}><div className="available"><span>Saldo actual</span><strong>{money(user.balance)}</strong></div><label><span>¿Cuánto quieres recargar?</span><div className="money-input"><b>$</b><input autoFocus required inputMode="numeric" value={amount} onChange={(e)=>setAmount(e.target.value.replace(/\D/g,''))} placeholder="0"/><em>COP</em></div><small>Mínimo $10.000 · Sin comisión WalletUQ</small></label><div><span className="form-label">Origen de los fondos</span><div className="source-options"><button type="button" className={source==='card'?'active':''} onClick={()=>setSource('card')}><CreditCard/><span><strong>Tarjeta débito</strong><small>Terminada en ••••</small></span>{source==='card'&&<Check/>}</button><button type="button" className={source==='bank'?'active':''} onClick={()=>setSource('bank')}><Landmark/><span><strong>Cuenta bancaria</strong><small>Conexión PSE simulada</small></span>{source==='bank'&&<Check/>}</button></div></div>{error&&<div className="form-error">{error}</div>}<button className="submit-operation" disabled={loading}>{loading?'Procesando recarga…':'Recargar ahora'}<ArrowRight/></button><p className="secure-note"><ShieldCheck/>Esta operación es una simulación académica. No procesa dinero real.</p></form>}</Modal>
}

function TransferModal({ user, onClose, onComplete }: { user: User; onClose: () => void; onComplete: (user: User) => void }) {
  const [recipient,setRecipient]=useState(''); const [amount,setAmount]=useState(''); const [description,setDescription]=useState(''); const [otp,setOtp]=useState(''); const [preview,setPreview]=useState<any>(null); const [loading,setLoading]=useState(false); const [error,setError]=useState(''); const [done,setDone]=useState(false)
  const getPreview=async(e:FormEvent)=>{e.preventDefault();setLoading(true);setError('');try{const data=await api<any>('/transfers/preview',{method:'POST',body:JSON.stringify({recipient,amount:Number(amount)})});setPreview(data.preview)}catch(err){setError(err instanceof Error?err.message:'Error')}finally{setLoading(false)}}
  const send=async()=>{setLoading(true);setError('');try{const data=await api<{user:User}>('/transfers',{method:'POST',body:JSON.stringify({recipient,amount:Number(amount),description,otp})});setDone(true);setTimeout(()=>onComplete(data.user),1000)}catch(err){setError(err instanceof Error?err.message:'Error')}finally{setLoading(false)}}
  return <Modal title="Enviar dinero" eyebrow="TRANSFERENCIA WALLETUQ" onClose={onClose}>{done?<Success title="¡Dinero enviado!" text={`${money(Number(amount))} fueron enviados correctamente.`}/>:!preview?<form className="operation-form" onSubmit={getPreview}><div className="available"><span>Disponible para enviar</span><strong>{money(user.balance)}</strong></div><label><span>Documento o número de cuenta</span><input required value={recipient} onChange={(e)=>setRecipient(e.target.value.replace(/\D/g,''))} placeholder="Ej. 1094001234"/></label><label><span>Monto</span><div className="money-input"><b>$</b><input required inputMode="numeric" value={amount} onChange={(e)=>setAmount(e.target.value.replace(/\D/g,''))} placeholder="0"/><em>COP</em></div></label><label><span>Concepto <small>(opcional)</small></span><input maxLength={80} value={description} onChange={(e)=>setDescription(e.target.value)} placeholder="¿Para qué es?"/></label>{error&&<div className="form-error">{error}</div>}<button className="submit-operation" disabled={loading}>{loading?'Validando…':'Continuar'}<ArrowRight/></button></form>:<div className="transfer-preview"><div className="recipient-avatar">{preview.recipient.fullName[0]}</div><span>VAS A ENVIAR A</span><h3>{preview.recipient.fullName}</h3><p>Cuenta •{preview.recipient.accountNumber.slice(-4)}</p><div className="preview-total"><small>RECIBE</small><strong>{money(preview.amount)}</strong></div><dl><div><dt>Monto</dt><dd>{money(preview.amount)}</dd></div><div><dt>Comisión {preview.level} ({Math.round(user.feeRate*100)}%)</dt><dd>{money(preview.fee)}</dd></div><div><dt>Puntos que ganarás</dt><dd className="points">+{preview.points} pts</dd></div><div className="total"><dt>Total a debitar</dt><dd>{money(preview.total)}</dd></div></dl>{preview.requiresOtp&&<label className="otp-field"><span>OTP de confirmación</span><input value={otp} onChange={(e)=>setOtp(e.target.value.replace(/\D/g,''))} maxLength={6} placeholder="Para el demo: 123456"/></label>}{error&&<div className="form-error">{error}</div>}<div className="preview-actions"><button onClick={()=>{setPreview(null);setError('')}}>Volver</button><button onClick={send} disabled={loading}>{loading?'Enviando…':'Confirmar envío'}<Send size={16}/></button></div></div>}</Modal>
}

function Success({title,text}:{title:string;text:string}) { return <div className="success-state"><span><Check/></span><h3>{title}</h3><p>{text}</p></div> }
