import { useEffect } from 'react'
import { toast } from 'sonner'
import type { Inscription } from '../types'
import { TARGET_CHAIN_ID } from '../config'
import { buildTxExplorerUrl } from '@/onchain-facts'

interface Props {
  inscription: Inscription
  onClose: () => void
  onList?: () => void
  onBuy?: () => void
  onDelist?: () => void
  isOwner?: boolean
  listing?: { price: bigint; seller: string } | null
}

function formatUsdc(v: bigint) {
  return (Number(v) / 1_000_000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function renderContent(ins: Inscription) {
  const { contentType, content } = ins
  if (contentType.startsWith('image/')) {
    return (
      <img
        src={content}
        alt={ins.name ?? `#${ins.number}`}
        className="max-w-full max-h-[40vh] object-contain rounded-2xl mx-auto block"
      />
    )
  }
  if (contentType.startsWith('text/')) {
    const text = (() => {
      try {
        const comma = content.indexOf(',')
        const data = content.slice(comma + 1)
        return content.includes(';base64,') ? atob(data) : decodeURIComponent(data)
      } catch { return content }
    })()
    return (
      <div className="rounded-2xl p-6 min-h-[80px] flex items-center justify-center" style={{ background: 'var(--surface-muted)' }}>
        <p className="mono text-base leading-relaxed text-center whitespace-pre-wrap break-all" style={{ color: 'var(--ink)' }}>{text}</p>
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
      <div className="rounded-2xl p-8 flex flex-col items-center justify-center gap-2 min-h-[100px]"
        style={{ background: 'linear-gradient(135deg, #fef3c7 0%, #fffbeb 100%)', border: '1px solid #fde68a' }}>
        <span className="display text-4xl font-bold" style={{ color: '#92400e' }}>{tick}</span>
        <span className="text-sm font-semibold tracking-widest uppercase" style={{ color: '#b45309' }}>{op}</span>
      </div>
    )
  }
  return (
    <div className="rounded-2xl p-6 text-center" style={{ background: 'var(--surface-muted)' }}>
      <p className="mono text-sm" style={{ color: 'var(--subtle)' }}>{contentType}</p>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
      <span className="text-xs font-semibold uppercase tracking-wider shrink-0" style={{ color: 'var(--subtle)' }}>{label}</span>
      <div className="text-sm font-medium text-right mono break-all" style={{ color: 'var(--ink)' }}>{children}</div>
    </div>
  )
}

export default function InscriptionModal({ inscription: ins, onClose, onList, onBuy, onDelist, isOwner, listing }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const explorerTx = buildTxExplorerUrl(TARGET_CHAIN_ID, ins.id)
  const date = new Date(ins.timestamp * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })

  const shareText = `Inscription #${ins.number} — permanently inscribed on Arc. No IPFS. No servers. Just the chain. 🔗 arc-scribe.netlify.app`
  const handleShare = () => {
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`,
      '_blank',
      'width=550,height=420',
    )
  }
  const handleEmbed = () => {
    const code = `<iframe src="https://arc-scribe.netlify.app/inscription/${ins.number}" width="400" height="300" frameborder="0"></iframe>`
    navigator.clipboard.writeText(code)
      .then(() => toast.success('Embed code copied!'))
      .catch(() => toast.error('Copy failed'))
  }

  const typeLabel = ins.contentType.startsWith('image/') ? 'Image'
    : ins.contentType === 'application/json' ? 'ARC-20' : 'Text'

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
          <button onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-lg"
            style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}>
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-6" style={{ background: 'var(--surface-muted)' }}>
          {renderContent(ins)}
        </div>

        {/* Listing badge */}
        {listing && (
          <div className="mx-6 mt-4 rounded-xl p-3 flex items-center justify-between"
            style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
            <span className="text-sm font-semibold" style={{ color: '#166534' }}>Listed for sale</span>
            <span className="font-bold mono tabular-nums" style={{ color: '#166534' }}>{formatUsdc(listing.price)} USDC</span>
          </div>
        )}

        {/* Metadata */}
        <div className="px-6 py-2">
          <Row label="ID">
            <a href={explorerTx} target="_blank" rel="noopener noreferrer"
              className="hover:underline" style={{ color: 'var(--accent-bright)' }}>
              {ins.id.slice(0, 10)}…{ins.id.slice(-8)}
            </a>
          </Row>
          <Row label="Number">#{ins.number}</Row>
          <Row label="Owner">{ins.owner.slice(0, 8)}…{ins.owner.slice(-6)}</Row>
          <Row label="Creator">{ins.creator.slice(0, 8)}…{ins.creator.slice(-6)}</Row>
          <Row label="Content type">{ins.contentType}</Row>
          <Row label="Size">{(ins.size / 1024).toFixed(2)} KB</Row>
          <Row label="Block">#{ins.blockNumber.toLocaleString()}</Row>
          <Row label="Date">{date}</Row>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 flex gap-2 flex-wrap" style={{ borderTop: '1px solid var(--border)' }}>
          <a href={explorerTx} target="_blank" rel="noopener noreferrer"
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-center"
            style={{ background: 'var(--surface-muted)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
            Explorer ↗
          </a>
          <button onClick={() => { void navigator.clipboard.writeText(ins.id); }}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: 'var(--surface-muted)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
            Copy ID
          </button>
          <button onClick={handleShare}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: '#1da1f222', color: '#1da1f2' }}>
            Share ✕
          </button>
          <button onClick={handleEmbed}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: 'var(--surface-muted)', color: 'var(--subtle)', border: '1px solid var(--border)' }}>
            {'</>'}
          </button>
          {listing && onBuy && (
            <button onClick={() => { onBuy(); onClose() }}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold"
              style={{ background: 'linear-gradient(135deg,#059669,#10b981)', color: '#fff' }}>
              Buy {formatUsdc(listing.price)} USDC
            </button>
          )}
          {!listing && isOwner && onList && (
            <button onClick={() => { onList(); onClose() }}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold"
              style={{ background: 'linear-gradient(135deg,#1e3a5f,#2563eb)', color: '#fff' }}>
              List for sale
            </button>
          )}
          {listing && isOwner && onDelist && (
            <button onClick={() => { onDelist(); onClose() }}
              className="py-2.5 px-4 rounded-xl text-sm font-bold"
              style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>
              Delist
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
