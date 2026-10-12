import { useState } from 'react'
import type { Inscription } from '../types'
import { TARGET_CHAIN_ID } from '../config'
import { buildTxExplorerUrl } from '@/onchain-facts'

interface InscriptionCardProps {
  inscription: Inscription
  listing?: { price: bigint; seller: string } | null
  onBuy?: () => void
  onList?: () => void
  onDelist?: () => void
  showActions?: boolean
  compact?: boolean
}

function ContentTag({ type }: { type: string }) {
  if (type.startsWith('image/')) {
    return (
      <span className="absolute top-2 left-2 text-xs font-semibold px-2 py-0.5 rounded-full"
        style={{ background: 'var(--tag-image)', color: 'var(--tag-image-ink)' }}>
        Image
      </span>
    )
  }
  if (type === 'application/json') {
    return (
      <span className="absolute top-2 left-2 text-xs font-semibold px-2 py-0.5 rounded-full"
        style={{ background: 'var(--tag-arc20)', color: 'var(--tag-arc20-ink)' }}>
        ARC-20
      </span>
    )
  }
  return (
    <span className="absolute top-2 left-2 text-xs font-semibold px-2 py-0.5 rounded-full"
      style={{ background: 'var(--tag-text)', color: 'var(--tag-text-ink)' }}>
      Text
    </span>
  )
}

function renderContent(ins: Inscription) {
  const { contentType, content } = ins

  if (contentType.startsWith('image/')) {
    return (
      <img
        src={content}
        alt={ins.name ?? `#${ins.number}`}
        className="w-full h-full object-contain p-2"
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
      />
    )
  }

  if (contentType === 'text/plain' || contentType.startsWith('text/')) {
    const text = (() => {
      try {
        const comma = content.indexOf(',')
        const data = content.slice(comma + 1)
        return content.includes(';base64,') ? atob(data) : decodeURIComponent(data)
      } catch { return '' }
    })()
    return (
      <div className="w-full h-full flex items-center justify-center p-4">
        <p className="text-sm leading-relaxed text-center line-clamp-5 mono"
          style={{ color: 'var(--ink-2)', wordBreak: 'break-all' }}>
          {text}
        </p>
      </div>
    )
  }

  if (contentType === 'application/json') {
    const jsonObj = (() => {
      try {
        const comma = content.indexOf(',')
        const data = content.slice(comma + 1)
        const raw = content.includes(';base64,') ? atob(data) : decodeURIComponent(data)
        const parsed: unknown = JSON.parse(raw)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>
        }
        return null
      } catch { return null }
    })()
    const label = (typeof jsonObj?.['op'] === 'string' ? jsonObj['op'].toUpperCase() : 'JSON')
    const tick = typeof jsonObj?.['tick'] === 'string' ? jsonObj['tick'] : ''
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-1.5">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-1"
          style={{ background: 'var(--tag-arc20)', color: 'var(--tag-arc20-ink)' }}>
          <span className="text-xl font-bold">◆</span>
        </div>
        <span className="text-xl font-bold display" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>{tick}</span>
        <span className="text-xs uppercase tracking-widest font-semibold" style={{ color: 'var(--subtle)' }}>{label}</span>
      </div>
    )
  }

  return (
    <div className="w-full h-full flex items-center justify-center">
      <span className="text-xs" style={{ color: 'var(--subtle)' }}>{contentType}</span>
    </div>
  )
}

function formatUsdc(raw: bigint): string {
  const n = Number(raw) / 1_000_000
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function InscriptionCard({
  inscription: ins,
  listing,
  onBuy,
  onList,
  onDelist,
  showActions = false,
  compact = false,
}: InscriptionCardProps) {
  const [hover, setHover] = useState(false)
  const explorerUrl = buildTxExplorerUrl(TARGET_CHAIN_ID, ins.id)

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="rounded-2xl overflow-hidden transition-all duration-200"
      style={{
        background: 'var(--surface-strong)',
        border: `1.5px solid ${hover ? 'var(--accent-bright)' : 'var(--border)'}`,
        transform: hover ? 'translateY(-3px)' : 'none',
        boxShadow: hover
          ? '0 12px 40px rgba(37,99,235,0.12), 0 4px 12px rgba(17,24,39,0.08)'
          : '0 2px 8px rgba(17,24,39,0.06)',
      }}
    >
      {/* Preview */}
      <div
        className="relative overflow-hidden"
        style={{
          height: compact ? 110 : 185,
          background: 'linear-gradient(135deg, #f8faff 0%, #f1f4fd 100%)',
        }}
      >
        {renderContent(ins)}
        <ContentTag type={ins.contentType} />
        {listing && (
          <span
            className="absolute top-2 right-2 text-xs px-2.5 py-1 rounded-full font-bold tabular-nums"
            style={{
              background: 'linear-gradient(135deg, #059669, #10b981)',
              color: '#fff',
            }}
          >
            {formatUsdc(listing.price)} USDC
          </span>
        )}
        <span
          className="absolute bottom-2 right-2 mono text-xs px-2 py-0.5 rounded-lg font-medium"
          style={{ background: 'rgba(17,24,39,0.08)', color: 'var(--subtle)' }}
        >
          #{ins.number}
        </span>
      </div>

      {/* Info */}
      <div className="p-3 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold truncate display" style={{ color: 'var(--ink)', letterSpacing: '-0.01em' }}>
            {ins.name ?? `Inscription #${ins.number}`}
          </span>
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs shrink-0 w-6 h-6 rounded-lg flex items-center justify-center transition-colors"
            style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}
            onClick={(e) => e.stopPropagation()}
          >
            ↗
          </a>
        </div>

        {!compact && (
          <div className="flex items-center gap-2 text-xs tabular-nums" style={{ color: 'var(--subtle)' }}>
            <span className="mono truncate">{ins.owner.slice(0, 6)}…{ins.owner.slice(-4)}</span>
            <span>·</span>
            <span>{(ins.size / 1024).toFixed(1)} KB</span>
          </div>
        )}

        {showActions && (
          <div className="pt-1 flex gap-2">
            {listing && onBuy && (
              <button
                onClick={onBuy}
                className="flex-1 py-2 rounded-xl text-sm font-bold transition-all"
                style={{
                  background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)',
                  color: '#fff',
                  boxShadow: '0 2px 8px rgba(37,99,235,0.25)',
                }}
              >
                Buy · {formatUsdc(listing.price)} USDC
              </button>
            )}
            {!listing && onList && (
              <button
                onClick={onList}
                className="flex-1 py-2 rounded-xl text-sm font-semibold transition-all"
                style={{
                  background: 'var(--surface-muted)',
                  color: 'var(--ink-2)',
                  border: '1px solid var(--border)',
                }}
              >
                List for sale
              </button>
            )}
            {listing && onDelist && (
              <button
                onClick={onDelist}
                className="py-2 px-3 rounded-xl text-sm font-semibold transition-all"
                style={{
                  background: '#fef2f2',
                  color: 'var(--danger)',
                  border: '1px solid #fecaca',
                }}
              >
                Delist
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
