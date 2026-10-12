import { useEffect } from 'react'
import type { Inscription } from '../types'
import { TARGET_CHAIN_ID } from '../config'
import { buildTxExplorerUrl, buildAddressExplorerUrl } from '@/onchain-facts'

interface Props {
  inscription: Inscription
  onClose: () => void
}

function renderContent(ins: Inscription) {
  const { contentType, content } = ins
  if (contentType.startsWith('image/')) {
    return (
      <img
        src={content}
        alt={ins.name ?? `#${ins.number}`}
        className="max-w-full max-h-[60vh] rounded-2xl object-contain mx-auto block"
        style={{ imageRendering: contentType === 'image/svg+xml' ? 'auto' : 'pixelated' }}
      />
    )
  }
  if (contentType.startsWith('text/')) {
    const text = (() => {
      try {
        const comma = content.indexOf(',')
        const data = content.slice(comma + 1)
        return content.includes(';base64,') ? atob(data) : decodeURIComponent(data)
      } catch { return '' }
    })()
    return (
      <div className="rounded-2xl p-6 font-mono text-sm leading-relaxed whitespace-pre-wrap break-all max-h-[50vh] overflow-y-auto"
        style={{ background: 'var(--surface-muted)', color: 'var(--ink)', fontSize: 14 }}>
        {text}
      </div>
    )
  }
  if (contentType === 'application/json') {
    const obj = (() => {
      try {
        const comma = content.indexOf(',')
        const data = content.slice(comma + 1)
        const raw = content.includes(';base64,') ? atob(data) : decodeURIComponent(data)
        const parsed: unknown = JSON.parse(raw)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>
        return null
      } catch { return null }
    })()
    const tick = typeof obj?.['tick'] === 'string' ? obj['tick'] : ''
    const op = typeof obj?.['op'] === 'string' ? (obj['op']).toUpperCase() : 'JSON'
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <div className="w-20 h-20 rounded-3xl flex items-center justify-center"
          style={{ background: 'var(--tag-arc20)', border: '2px solid rgba(146,64,14,0.15)' }}>
          <span className="text-3xl font-black display" style={{ color: 'var(--tag-arc20-ink)' }}>◆</span>
        </div>
        <div className="text-3xl font-black display" style={{ color: 'var(--ink)' }}>{tick}</div>
        <div className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest"
          style={{ background: 'var(--tag-arc20)', color: 'var(--tag-arc20-ink)' }}>{op}</div>
        <pre className="text-xs rounded-xl p-4 w-full max-w-sm overflow-x-auto mt-2"
          style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}>
          {JSON.stringify(obj, null, 2)}
        </pre>
      </div>
    )
  }
  return <div className="text-center py-8" style={{ color: 'var(--subtle)' }}>{contentType}</div>
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
      <span className="text-xs font-semibold uppercase tracking-wider shrink-0" style={{ color: 'var(--subtle)', letterSpacing: '0.08em' }}>{label}</span>
      <div className="text-sm font-medium text-right mono break-all" style={{ color: 'var(--ink)' }}>{children}</div>
    </div>
  )
}

export default function InscriptionModal({ inscription: ins, onClose }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const explorerTx = buildTxExplorerUrl(TARGET_CHAIN_ID, ins.id)
  const explorerOwner = buildAddressExplorerUrl(TARGET_CHAIN_ID, ins.owner)
  const date = new Date(ins.timestamp * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })

  const typeLabel = ins.contentType.startsWith('image/')
    ? 'Image'
    : ins.contentType === 'application/json'
    ? 'ARC-20'
    : 'Text'

  const tagStyle = ins.contentType.startsWith('image/')
    ? { bg: 'var(--tag-image)', ink: 'var(--tag-image-ink)' }
    : ins.contentType === 'application/json'
    ? { bg: 'var(--tag-arc20)', ink: 'var(--tag-arc20-ink)' }
    : { bg: 'var(--tag-text)', ink: 'var(--tag-text-ink)' }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(17,24,39,0.55)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl"
        style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3">
            <span className="display text-xl font-bold" style={{ color: 'var(--ink)' }}>
              {ins.name ?? `Inscription #${ins.number}`}
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold"
              style={{ background: tagStyle.bg, color: tagStyle.ink }}>{typeLabel}</span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-lg transition-all hover:scale-110"
            style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}
          >
            ×
          </button>
        </div>

        {/* Content preview */}
        <div className="p-6" style={{ background: 'var(--surface-muted)' }}>
          {renderContent(ins)}
        </div>

        {/* Metadata */}
        <div className="px-6 py-2">
          <Row label="ID">
            <a href={explorerTx} target="_blank" rel="noopener noreferrer"
              className="hover:underline" style={{ color: 'var(--accent-bright)' }}>
              {ins.id.slice(0, 10)}…{ins.id.slice(-8)}
            </a>
          </Row>
          <Row label="Number">#{ins.number}</Row>
          <Row label="Owner">
            <a href={explorerOwner} target="_blank" rel="noopener noreferrer"
              className="hover:underline" style={{ color: 'var(--accent-bright)' }}>
              {ins.owner.slice(0, 8)}…{ins.owner.slice(-6)}
            </a>
          </Row>
          <Row label="Creator">{ins.creator.slice(0, 8)}…{ins.creator.slice(-6)}</Row>
          <Row label="Content type">{ins.contentType}</Row>
          <Row label="Size">{(ins.size / 1024).toFixed(2)} KB</Row>
          <Row label="Block">#{ins.blockNumber.toLocaleString()}</Row>
          <Row label="Date">{date}</Row>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex gap-2" style={{ borderTop: '1px solid var(--border)' }}>
          <a
            href={explorerTx}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-center transition-all"
            style={{ background: 'linear-gradient(135deg,#1e3a5f,#2563eb)', color: '#fff' }}
          >
            View on Explorer
          </a>
          <button
            onClick={() => { void navigator.clipboard.writeText(ins.id) }}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
            style={{ background: 'var(--surface-muted)', color: 'var(--muted)', border: '1px solid var(--border)' }}
          >
            Copy ID
          </button>
        </div>
      </div>
    </div>
  )
}
