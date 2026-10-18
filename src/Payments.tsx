import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowRight, Camera, ClipboardPaste, Download, QrCode, ShieldCheck, Store, Upload } from 'lucide-react'
import jsQR from 'jsqr'
import QRCode from 'qrcode'
import { api, errorMessage, money } from './api'
import type { Merchant, User } from './types'
import Modal from './Modal'

type MerchantInfo = { code: string; name: string; category: string }
type Preview = { merchant: MerchantInfo; fixedAmount: boolean; needsAmount: boolean; amount?: number; fee?: number; total?: number; level?: string; feeRate?: number; points?: number }
type Step = 'scan' | 'merchants' | 'amount' | 'confirm' | 'done'

function readQr(image: ImageData) {
  return jsQR(image.data, image.width, image.height)?.data ?? null
}

async function decodeImageFile(file: File) {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height
  const context = canvas.getContext('2d')
  if (!context) return null
  context.drawImage(bitmap, 0, 0)
  return readQr(context.getImageData(0, 0, canvas.width, canvas.height))
}

// Lee QR desde la cámara (IF-006). Se detiene y libera la cámara al detectar un código o al cerrarse.
function QrScanner({ onDetected }: { onDetected: (text: string) => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const detected = useRef(onDetected); detected.current = onDetected
  const [cameraError, setCameraError] = useState('')
  useEffect(() => {
    let stream: MediaStream | null = null; let timer = 0; let stopped = false
    const canvas = document.createElement('canvas'); const context = canvas.getContext('2d', { willReadFrequently: true })
    const scan = () => {
      if (stopped) return
      const element = video.current
      if (element && context && element.readyState >= 2 && element.videoWidth) {
        canvas.width = element.videoWidth; canvas.height = element.videoHeight
        context.drawImage(element, 0, 0)
        const text = readQr(context.getImageData(0, 0, canvas.width, canvas.height))
        if (text) { stopped = true; stream?.getTracks().forEach((track) => track.stop()); detected.current(text); return }
      }
      timer = window.setTimeout(scan, 200)
    }
    if (!navigator.mediaDevices?.getUserMedia) { setCameraError('Este navegador no permite usar la cámara. Sube una imagen del QR.'); return }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }).then((media) => {
      if (stopped) { media.getTracks().forEach((track) => track.stop()); return }
      stream = media
      if (video.current) { video.current.srcObject = media; video.current.play().catch(() => undefined) }
      scan()
    }).catch(() => setCameraError('No pudimos usar la cámara. Revisa el permiso del navegador o sube una imagen del QR.'))
    return () => { stopped = true; window.clearTimeout(timer); stream?.getTracks().forEach((track) => track.stop()) }
  }, [])
  return <div className="qr-scanner">{cameraError ? <div className="qr-scanner-empty"><Camera/><p>{cameraError}</p></div> : <><video ref={video} muted playsInline/><span className="qr-frame"/><small>Apunta la cámara al QR del comercio</small></>}</div>
}

function MerchantQrList({ onUse }: { onUse: (qr: string) => void }) {
  const [merchants, setMerchants] = useState<(Merchant & { image: string })[]>([]); const [error, setError] = useState('')
  useEffect(() => {
    api<{ merchants: Merchant[] }>('/merchants')
      .then(async ({ merchants: list }) => setMerchants(await Promise.all(list.map(async (merchant) => ({ ...merchant, image: await QRCode.toDataURL(merchant.qr, { width: 220, margin: 1 }) })))))
      .catch((requestError) => setError(errorMessage(requestError)))
  }, [])
  if (error) return <div className="form-error">{error}</div>
  return <div className="merchant-qr-list">{merchants.map((merchant) => <article key={merchant.code} className={merchant.status === 'active' ? '' : 'inactive'}>
    <img src={merchant.image} alt={`QR de ${merchant.name}`}/>
    <div><strong>{merchant.name}</strong><small>{merchant.category} · {merchant.qrAmount ? `Monto fijo ${money(merchant.qrAmount)}` : 'Monto libre'}</small><em>{merchant.status === 'active' ? 'Activo' : 'Inactivo'}</em>
      <span><a href={merchant.image} download={`qr-${merchant.code.toLowerCase()}.png`}><Download size={13}/>Descargar</a><button type="button" onClick={() => onUse(merchant.qr)}><QrCode size={13}/>Pagar con este QR</button></span></div>
  </article>)}</div>
}

export function PayModal({ user, onClose, onComplete }: { user: User; onClose: () => void; onComplete: (user: User) => void }) {
  const [step, setStep] = useState<Step>('scan')
  const [qr, setQr] = useState(''); const [pasted, setPasted] = useState(''); const [amount, setAmount] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null); const [loading, setLoading] = useState(false); const [error, setError] = useState('')
  // Tras un QR rechazado la cámara queda en pausa; si no, volvería a leer el mismo código en bucle.
  const [scanPaused, setScanPaused] = useState(false)

  const requestPreview = async (code: string, value?: number) => {
    setLoading(true); setError('')
    try {
      const data = await api<{ preview: Preview }>('/payments/preview', { method: 'POST', body: JSON.stringify({ qr: code, amount: value }) })
      setQr(code); setPreview(data.preview); setStep(data.preview.needsAmount ? 'amount' : 'confirm')
    } catch (requestError) { setError(errorMessage(requestError)); setScanPaused(true); setStep((current) => current === 'merchants' ? 'scan' : current) }
    finally { setLoading(false) }
  }
  const onFile = async (file?: File) => {
    if (!file) return
    setError('')
    const text = await decodeImageFile(file).catch(() => null)
    if (text) requestPreview(text); else setError('No encontramos un código QR en esa imagen.')
  }
  const submitAmount = (event: FormEvent) => { event.preventDefault(); requestPreview(qr, Number(amount)) }
  const pay = async () => {
    setLoading(true); setError('')
    try {
      const data = await api<{ user: User }>('/payments', { method: 'POST', body: JSON.stringify({ qr, amount: preview?.amount }) })
      setStep('done'); setTimeout(() => onComplete(data.user), 1000)
    } catch (requestError) { setError(errorMessage(requestError)) }
    finally { setLoading(false) }
  }

  return <Modal title="Pagar con QR" eyebrow="COMERCIOS AFILIADOS" onClose={onClose}>
    {step === 'done' && preview ? <div className="success-state"><span><ShieldCheck/></span><h3>¡Pago realizado!</h3><p>Pagaste {money(preview.amount ?? 0)} en {preview.merchant.name}.</p></div>
    : step === 'scan' ? <div className="operation-form">
        {loading ? <div className="qr-scanner"><div className="qr-scanner-empty"><QrCode/><p>Validando el código…</p></div></div>
          : scanPaused ? <div className="qr-scanner"><div className="qr-scanner-empty"><Camera/><button type="button" className="link-action" onClick={() => { setError(''); setScanPaused(false) }}>Escanear otro código</button></div></div>
          : <QrScanner onDetected={(text) => requestPreview(text)}/>}
        <div className="qr-alternatives">
          <label className="qr-upload"><Upload size={15}/>Subir imagen del QR<input type="file" accept="image/*" onChange={(event) => { onFile(event.target.files?.[0]); event.target.value = '' }}/></label>
          <form onSubmit={(event) => { event.preventDefault(); if (pasted.trim()) requestPreview(pasted.trim()) }}><ClipboardPaste size={15}/><input value={pasted} onChange={(event) => setPasted(event.target.value)} placeholder="o pega el código walletuq://…"/><button disabled={loading || !pasted.trim()}>Usar</button></form>
        </div>
        {error && <div className="form-error">{error}</div>}
        <button type="button" className="link-action" onClick={() => { setError(''); setStep('merchants') }}><Store size={14}/>Ver QR de comercios de prueba</button>
      </div>
    : step === 'merchants' ? <div className="operation-form"><p className="secure-note">QR de demostración. Descárgalos para escanearlos desde otro dispositivo o úsalos directamente.</p><MerchantQrList onUse={(code) => requestPreview(code)}/><button type="button" className="link-action" onClick={() => setStep('scan')}>Volver al escáner</button></div>
    : step === 'amount' && preview ? <form className="operation-form" onSubmit={submitAmount}>
        <MerchantHeader merchant={preview.merchant}/>
        <div className="available"><span>Saldo disponible</span><strong>{money(user.balance)}</strong></div>
        <label><span>¿Cuánto vas a pagar?</span><div className="money-input"><b>$</b><input autoFocus required inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value.replace(/\D/g, ''))} placeholder="0"/><em>COP</em></div><small>Comisión según tu nivel: {Math.round(user.feeRate * 100)}%</small></label>
        {error && <div className="form-error">{error}</div>}
        <button className="submit-operation" disabled={loading}>{loading ? 'Calculando…' : 'Continuar'}<ArrowRight/></button>
      </form>
    : preview && <div className="transfer-preview">
        <MerchantHeader merchant={preview.merchant}/>
        <div className="preview-total"><small>{preview.fixedAmount ? 'MONTO DEL QR' : 'PAGAS'}</small><strong>{money(preview.amount ?? 0)}</strong></div>
        <dl><div><dt>Monto</dt><dd>{money(preview.amount ?? 0)}</dd></div><div><dt>Comisión {preview.level} ({Math.round((preview.feeRate ?? 0) * 100)}%)</dt><dd>{money(preview.fee ?? 0)}</dd></div><div><dt>Puntos que ganarás</dt><dd className="points">+{preview.points} pts</dd></div><div className="total"><dt>Total a debitar</dt><dd>{money(preview.total ?? 0)}</dd></div></dl>
        {error && <div className="form-error">{error}</div>}
        <div className="preview-actions"><button onClick={() => { setPreview(null); setAmount(''); setError(''); setStep('scan') }}>Cancelar</button><button onClick={pay} disabled={loading}>{loading ? 'Pagando…' : 'Confirmar pago'}<ArrowRight size={16}/></button></div>
      </div>}
  </Modal>
}

function MerchantHeader({ merchant }: { merchant: MerchantInfo }) {
  return <div className="merchant-header"><span><Store/></span><div><small>PAGAR A</small><strong>{merchant.name}</strong><p>{merchant.category} · Comercio afiliado</p></div></div>
}
