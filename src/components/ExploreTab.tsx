import { useState, useEffect } from 'react'
import {
  getInscriptions, getIndexProgress, isIndexed, isIndexing,
  onIndexUpdate, getTotalInscriptions,
} from '../lib/indexer'
import type { Inscription } from '../types'
import InscriptionCard from './InscriptionCard'
import InscriptionModal from './InscriptionModal'

type Filter = 'all' | 'image' | 'text' | 'arc20'

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-6 py-3 rounded-2xl"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)', minWidth: 100 }}>
      <span className="text-xl font-bold display tabular-nums" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>
        {value}
      </span>
      <span className="text-xs font-medium" style={{ color: 'var(--subtle)', letterSpacing: '0.04em' }}>
        {label}
      </span>
    </div>
  )
}

export default function ExploreTab() {
  const [inscriptions, setInscriptions] = useState<Inscription[]>([])
  const [progress, setProgress] = useState(0)
  const [indexed, setIndexed] = useState(false)
  const [indexing, setIndexing] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Inscription | null>(null)

  useEffect(() => {
    const refresh = () => {
      setInscriptions(getInscriptions())
      setProgress(getIndexProgress())
      setIndexed(isIndexed())
      setIndexing(isIndexing())
    }
    refresh()
    return onIndexUpdate(refresh)
  }, [])

  const filtered = inscriptions.filter((ins) => {
    if (filter === 'image' && !ins.contentType.startsWith('image/')) return false
    if (filter === 'text' && ins.contentType !== 'text/plain') return false
    if (filter === 'arc20' && ins.contentType !== 'application/json') return false
    if (search) {
      const q = search.toLowerCase()
      if (!ins.id.toLowerCase().includes(q) && !(ins.name ?? '').toLowerCase().includes(q)) return false
    }
    return true
  })

  const imageCount = inscriptions.filter((i) => i.contentType.startsWith('image/')).length
  const arc20Count = inscriptions.filter((i) => i.contentType === 'application/json').length

  const FILTERS: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'image', label: 'Images' },
    { id: 'text', label: 'Text' },
    { id: 'arc20', label: 'ARC-20' },
  ]

  return (
    <>
    <div className="min-h-dvh" style={{ background: 'var(--bg-gradient)' }}>
      {/* Hero */}
      <div className="relative overflow-hidden pt-16 pb-12 px-4 text-center">
        {/* Background decoration */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full opacity-20"
            style={{ background: 'radial-gradient(ellipse, #2563eb 0%, transparent 70%)', filter: 'blur(60px)' }} />
          <div className="absolute top-0 right-0 w-72 h-72 rounded-full opacity-10"
            style={{ background: 'radial-gradient(ellipse, #7c3aed 0%, transparent 70%)', filter: 'blur(40px)' }} />
        </div>

        <div className="relative max-w-3xl mx-auto">
          <p className="text-xs font-bold uppercase tracking-widest mb-4"
            style={{ color: 'var(--accent-bright)', letterSpacing: '0.14em' }}>
            PERMANENT · VERIFIABLE · ONCHAIN
          </p>
          <h1 className="text-5xl sm:text-6xl font-bold display mb-4 grad-text"
            style={{ lineHeight: 1.05, letterSpacing: '-0.04em' }}>
            Arc Inscriptions
          </h1>
          <p className="text-base sm:text-lg max-w-xl mx-auto" style={{ color: 'var(--muted)' }}>
            Digital artifacts written directly into transaction calldata on Arc mainnet.
            No IPFS. No servers. Just the chain.
          </p>

          {/* Stats */}
          <div className="flex flex-wrap items-center justify-center gap-3 mt-8">
            <StatPill
              label="Inscriptions"
              value={isIndexed() || inscriptions.length > 0 ? getTotalInscriptions().toLocaleString() : '—'}
            />
            <StatPill
              label="Images"
              value={isIndexed() || inscriptions.length > 0 ? imageCount.toLocaleString() : '—'}
            />
            <StatPill
              label="ARC-20 Tokens"
              value={isIndexed() || inscriptions.length > 0 ? arc20Count.toLocaleString() : '—'}
            />
          </div>
        </div>
      </div>

      {/* Loading bar */}
      {indexing && (
        <div className="mx-4 mb-4 max-w-7xl mx-auto">
          <div className="h-1 w-full rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${progress}%`,
                background: 'linear-gradient(90deg, #2563eb, #7c3aed)',
              }}
            />
          </div>
          <p className="text-xs text-center mt-1.5" style={{ color: 'var(--subtle)' }}>
            Scanning Arc mainnet… {progress}%
          </p>
        </div>
      )}

      {/* Filters + Search */}
      <div className="max-w-7xl mx-auto px-4 mb-6 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className="px-4 py-2 rounded-xl text-sm font-semibold transition-all"
              style={{
                background: filter === f.id
                  ? 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)'
                  : 'var(--surface-strong)',
                color: filter === f.id ? '#fff' : 'var(--muted)',
                border: filter === f.id ? 'none' : '1px solid var(--border)',
                boxShadow: filter === f.id ? '0 2px 8px rgba(37,99,235,0.2)' : 'none',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by ID or name…"
          className="w-full sm:w-72 px-4 py-2 rounded-xl text-sm outline-none transition-all"
          style={{
            background: 'var(--surface-strong)',
            color: 'var(--ink)',
            border: '1px solid var(--border)',
            boxShadow: 'inset 0 1px 3px rgba(17,24,39,0.05)',
          }}
        />
      </div>

      {/* Grid */}
      <div className="max-w-7xl mx-auto px-4 pb-16">
        {filtered.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {filtered.map((ins) => {
              const sorted = [...inscriptions].sort((a, b) => a.number - b.number)
              const rank = sorted.findIndex((i) => i.id === ins.id)
              return (
                <InscriptionCard
                  key={ins.id}
                  inscription={ins}
                  rank={rank >= 0 && rank < 10 ? rank + 1 : null}
                  onOpen={() => setSelected(ins)}
                />
              )
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            {indexing ? (
              <>
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center animate-spin"
                  style={{ border: '3px solid var(--border)', borderTopColor: 'var(--accent-bright)' }} />
                <p className="font-semibold" style={{ color: 'var(--ink)' }}>Scanning the chain…</p>
                <p className="text-sm" style={{ color: 'var(--subtle)' }}>{progress}% complete</p>
              </>
            ) : indexed ? (
              <>
                <div className="w-16 h-16 rounded-3xl flex items-center justify-center text-3xl"
                  style={{ background: 'var(--surface-muted)' }}>◈</div>
                <p className="font-semibold text-lg display" style={{ color: 'var(--ink)' }}>No inscriptions yet</p>
                <p className="text-sm" style={{ color: 'var(--subtle)' }}>Be the first to inscribe on Arc</p>
              </>
            ) : (
              <>
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                  style={{ border: '3px solid var(--border)', borderTopColor: 'var(--accent-bright)', animation: 'spin 1s linear infinite' }} />
                <p className="text-sm" style={{ color: 'var(--subtle)' }}>Connecting to Arc…</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>

    {selected && (
      <InscriptionModal inscription={selected} onClose={() => setSelected(null)} />
    )}
  </>
  )
}
