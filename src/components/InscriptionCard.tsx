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

function renderContent(ins: Inscription) {
  const { contentType, content } = ins

  if (contentType.startsWith('image/')) {
    return (
      <img
        src={content}
        alt={ins.name ?? `#${ins.number}`}
        className="w-full h-full object-contain"
        style={{ imageRendering: contentType === 'image/pixel' ? 'pixelated' : 'auto' }}
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
      <div className="w-full h-full flex items-center justify-center p-4 overflow-hidden">
        <p
          className="text-xs leading-relaxed text-center line-clamp-6 mono"
          style={{ color: 'var(--muted)', wordBreak: 'break-all' }}
        >
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
    const label = typeof jsonObj?.['op'] === 'string' ? jsonObj['op'].toUpperCase() : 'JSON'
    const tick  = typeof jsonObj?.['tick'] === 'string' ? jsonObj['tick'] : ''
    return (
      <div
        className="w-full h-full flex flex-col items-center justify-center gap-1"
        style={{
          background: 'linear-gradient(135deg, rgba(172,198,233,0.08) 0%, rgba(123,172,216,0.04) 100%)',
        }}
      >
        <span
          className="display font-bold tabular-nums"
          style={{ color: 'var(--accent)', fontSize: tick.length > 4 ? '1.25rem' : '1.75rem' }}
        >
          {tick || '{ }'}
        </span>
        <span
          className="text-[10px] uppercase tracking-[0.15em] font-semibold"
          style={{ color: 'var(--subtle)' }}
        >
          {label}
        </span>
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
      className="rounded-2xl overflow-hidden transition-all duration-200 flex flex-col"
      style={{
        background: 'var(--surface)',
        border: `1px solid ${hover ? 'rgba(172,198,233,0.25)' : 'var(--border)'}`,
        transform: hover ? 'translateY(-3px)' : 'none',
        boxShadow: hover
          ? '0 12px 40px rgba(0,0,0,0.4), 0 0 0 1px rgba(172,198,233,0.08)'
          : '0 2px 8px rgba(0,0,0,0.15)',
      }}
    >
      {/* Preview */}
      <div
        className="relative overflow-hidden"
        style={{
          height: compact ? 128 : 200,
          background: 'rgba(0,0,0,0.3)',
          flexShrink: 0,
        }}
      >
        {renderContent(ins)}

        {/* Number badge */}
        <span
          className="absolute top-2 left-2 mono text-xs px-2 py-0.5 rounded-lg tabular-nums"
          style={{
            background: 'rgba(0,0,0,0.6)',
            color: 'var(--accent)',
            backdropFilter: 'blur(8px)',
            fontSize: '10px',
          }}
        >
          #{ins.number}
        </span>

        {/* Price badge */}
        {listing && (
          <span
            className="absolute top-2 right-2 text-xs px-2 py-0.5 rounded-lg font-semibold tabular-nums"
            style={{
              background: 'rgba(141,216,159,0.2)',
              color: 'var(--success)',
              border: '1px solid rgba(141,216,159,0.3)',
              backdropFilter: 'blur(8px)',
              fontSize: '10px',
            }}
          >
            {formatUsdc(listing.price)}
          </span>
        )}

        {/* Hover overlay — explorer link */}
        {hover && (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-0 flex items-end justify-end p-2"
            style={{ background: 'rgba(0,0,0,0.0)' }}
          >
            <span
              className="text-xs px-2 py-1 rounded-lg font-medium"
              style={{
                background: 'rgba(0,0,0,0.7)',
                color: 'var(--accent)',
                backdropFilter: 'blur(8px)',
              }}
            >
              Explorer ↗
            </span>
          </a>
        )}
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col gap-2 flex-1">
        <div className="flex items-start justify-between gap-1">
          <span
            className="text-sm font-semibold leading-tight truncate"
            style={{ color: 'var(--ink)' }}
          >
            {ins.name ?? `Inscription #${ins.number}`}
          </span>
        </div>

        {!compact && (
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--subtle)' }}>
            <span className="mono truncate flex-1">
              {ins.owner.slice(0, 6)}…{ins.owner.slice(-4)}
            </span>
            <span className="shrink-0 tabular-nums">{(ins.size / 1024).toFixed(1)}KB</span>
          </div>
        )}

        {/* Actions */}
        {showActions && (
          <div className="flex gap-1.5 mt-auto pt-1">
            {listing && onBuy && (
              <button
                onClick={onBuy}
                className="flex-1 py-2 rounded-xl text-xs font-bold transition-all tabular-nums"
                style={{
                  background: 'var(--accent)',
                  color: '#0a1628',
                  boxShadow: '0 2px 12px rgba(172,198,233,0.25)',
                }}
              >
                Buy · {formatUsdc(listing.price)} USDC
              </button>
            )}
            {!listing && onList && (
              <button
                onClick={onList}
                className="flex-1 py-2 rounded-xl text-xs font-semibold transition-all"
                style={{
                  background: 'var(--surface-strong)',
                  color: 'var(--ink)',
                  border: '1px solid var(--border)',
                }}
              >
                List for sale
              </button>
            )}
            {listing && onDelist && (
              <button
                onClick={onDelist}
                className="py-2 px-3 rounded-xl text-xs font-semibold transition-all"
                style={{
                  background: 'rgba(232,109,122,0.10)',
                  color: 'var(--danger)',
                  border: '1px solid rgba(232,109,122,0.2)',
                }}
              >
                ✕
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
