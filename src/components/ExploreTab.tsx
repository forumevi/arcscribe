import { useState, useEffect } from 'react'
import {
  getInscriptions, isIndexed, isIndexing, getIndexProgress,
  onIndexUpdate, getTotalInscriptions, getArc20Tokens,
} from '../lib/indexer'
import type { Inscription } from '../types'
import InscriptionCard from './InscriptionCard'

type Filter = 'all' | 'images' | 'text' | 'arc20'

const FILTER_LABELS: Record<Filter, string> = {
  all: 'All',
  images: 'Images',
  text: 'Text',
  arc20: 'ARC-20',
}

export default function ExploreTab() {
  const [inscriptions, setInscriptions] = useState<Inscription[]>([])
  const [indexing, setIndexing] = useState(false)
  const [indexed, setIndexed] = useState(false)
  const [progress, setProgress] = useState(0)
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    const update = () => {
      setInscriptions(getInscriptions())
      setIndexing(isIndexing())
      setIndexed(isIndexed())
      setProgress(getIndexProgress())
    }
    update()
    return onIndexUpdate(update)
  }, [])

  const filtered = inscriptions.filter((ins) => {
    if (filter === 'images' && !ins.contentType.startsWith('image/')) return false
    if (filter === 'text' && !ins.contentType.startsWith('text/')) return false
    if (filter === 'arc20' && ins.contentType !== 'application/json') return false
    if (search) {
      const q = search.toLowerCase()
      if (!ins.id.toLowerCase().includes(q) && !(ins.name ?? '').toLowerCase().includes(q)) return false
    }
    return true
  })

  const tokenCount = getArc20Tokens().length
  const imageCount = inscriptions.filter((i) => i.contentType.startsWith('image/')).length
  const total = getTotalInscriptions()

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-16">

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <div className="relative pt-10 pb-12 text-center overflow-hidden">
        {/* Ambient glow */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 60% 40% at 50% 20%, rgba(172,198,233,0.08) 0%, transparent 70%)',
          }}
        />

        <p className="text-xs font-semibold uppercase tracking-[0.2em] mb-4" style={{ color: 'var(--accent)' }}>
          Permanent · Verifiable · Onchain
        </p>
        <h1
          className="display text-5xl sm:text-6xl font-bold mb-4"
          style={{ color: 'var(--ink)', letterSpacing: '-0.04em', lineHeight: 1.05 }}
        >
          Arc Inscriptions
        </h1>
        <p className="text-base max-w-md mx-auto" style={{ color: 'var(--muted)', lineHeight: 1.6 }}>
          Digital artifacts written directly into transaction calldata on Arc mainnet.
          No IPFS. No servers. Just the chain.
        </p>

        {/* Stats row */}
        <div className="flex items-center justify-center gap-8 mt-8">
          {[
            { label: 'Inscriptions', value: indexed ? total.toLocaleString() : '—' },
            { label: 'Images', value: indexed ? imageCount.toLocaleString() : '—' },
            { label: 'ARC-20 Tokens', value: indexed ? tokenCount.toLocaleString() : '—' },
          ].map((s) => (
            <div key={s.label} className="text-center">
              <p
                className="display text-2xl font-bold tabular-nums"
                style={{ color: 'var(--ink)' }}
              >
                {s.value}
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--subtle)' }}>{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Progress bar ─────────────────────────────────────────────── */}
      {indexing && (
        <div
          className="rounded-2xl p-4 mb-6"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span
                className="w-1.5 h-1.5 rounded-full animate-pulse"
                style={{ background: 'var(--accent)' }}
              />
              <span className="text-sm" style={{ color: 'var(--muted)' }}>
                Scanning Arc mainnet blocks…
              </span>
            </div>
            <span className="text-sm mono tabular-nums" style={{ color: 'var(--accent)' }}>
              {progress}%
            </span>
          </div>
          <div
            className="rounded-full overflow-hidden h-1"
            style={{ background: 'var(--surface-muted)' }}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progress}%`, background: 'linear-gradient(90deg, var(--accent), #7bacd8)' }}
            />
          </div>
        </div>
      )}

      {/* ── Toolbar ──────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between mb-6">
        {/* Filter chips */}
        <div className="flex gap-1.5 flex-wrap">
          {(Object.keys(FILTER_LABELS) as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-3.5 py-1.5 rounded-xl text-sm font-medium transition-all"
              style={{
                background: filter === f ? 'rgba(172,198,233,0.15)' : 'var(--surface)',
                color: filter === f ? 'var(--accent)' : 'var(--subtle)',
                border: `1px solid ${filter === f ? 'rgba(172,198,233,0.3)' : 'var(--border)'}`,
              }}
            >
              {FILTER_LABELS[f]}
              {f === 'all' && indexed && total > 0 && (
                <span className="ml-1.5 text-xs tabular-nums" style={{ color: 'var(--subtle)' }}>
                  {total}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-56">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by ID or name…"
            className="w-full rounded-xl px-4 py-2 text-sm outline-none pr-8"
            style={{
              background: 'var(--surface)',
              color: 'var(--ink)',
              border: '1px solid var(--border)',
            }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs"
              style={{ color: 'var(--subtle)' }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ── Grid ─────────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div
          className="rounded-3xl py-24 flex flex-col items-center gap-4"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
            style={{ background: 'var(--surface-muted)' }}
          >
            ◎
          </div>
          <p className="text-base font-medium" style={{ color: 'var(--ink)' }}>
            {indexing ? 'Scanning the chain…' : search ? 'No results' : 'No inscriptions yet'}
          </p>
          <p className="text-sm" style={{ color: 'var(--subtle)' }}>
            {indexing
              ? 'This takes a few seconds on first load'
              : search
              ? 'Try a different search term'
              : 'Be the first to inscribe on Arc'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {filtered.map((ins) => (
            <InscriptionCard key={ins.id} inscription={ins} compact />
          ))}
        </div>
      )}
    </div>
  )
}
