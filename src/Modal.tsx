import type { ReactNode } from 'react'
import { X } from 'lucide-react'

export default function Modal({ title, eyebrow, children, onClose }: { title: string; eyebrow: string; children: ReactNode; onClose: () => void }) {
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal-card" onMouseDown={(event) => event.stopPropagation()}><header><div><span>{eyebrow}</span><h2>{title}</h2></div><button onClick={onClose}><X size={19}/></button></header>{children}</section></div>
}
