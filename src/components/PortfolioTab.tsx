import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { getOwnerInscriptions, getArc20Balances, getInscriptions, onIndexUpdate } from '../lib/indexer'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { TARGET_CHAIN_ID } from '../config'
import type { Inscription, Arc20Balance } from '../types'
import InscriptionCard from './InscriptionCard'
import InscriptionModal from './InscriptionModal'
import { toast } from 'sonner'

function formatBig(n: bigint): string {
  if (n >= 1_000_000_000n) return `${(Number(n) / 1_000_000_000).toFixed(2)}B`
  if (n >= 1_000_000n) return `${(Number(n) / 1_000_000).toFixed(2)}M`
  if (n >= 1_000n) return `${(Number(n) / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

/** İlk 100 içindeki global sıra (1-indexed, 0 = bulunamadı) */
function getEarlyBadge(ins: Inscription, allInscriptions: Inscription[]): number | null {
  const sorted = [...allInscriptions].sort((a, b) => a.number - b.number)
  const rank = sorted.findIndex((i) => i.id === ins.id)
  if (rank === -1 || rank >= 100) return null
  return rank + 1
}

function EarlyBadge({ rank }: { rank: number }) {
  const color =
    rank === 1 ? '#f59e0b' : rank <= 10 ? '#6366f1' : '#059669'
  const label =
    rank === 1 ? '🥇 First Inscription' : rank <= 10 ? `⚡ Top 10 — #${rank}` : `🌱 Early — #${rank}`
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full"
      style={{ background: color + '22', color }}
    >
      {label}
    </span>
  )
}

function ArcTokenCard({ b }: { b: Arc20Balance }) {
  return (
    <div
      className="rounded-2xl p-5 space-y-3 transition-all"
      style={{
        background: 'var(--surface-strong)',
        border: '1px solid var(--border)',
        boxShadow: '0 2px 8px rgba(17,24,39,0.06)',
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 font-bold display text-sm"
          style={{ background: 'linear-gradient(135deg, #dbeafe 0%, #ede9fe 100%)', color: '#1e40af' }}
        >
          {b.tick.slice(0, 2)}
        </div>
        <div>
          <div className="font-bold display text-base" style={{ color: 'var(--ink)' }}>{b.tick}</div>
          <div className="text-xs" style={{ color: 'var(--subtle)' }}>ARC-20 Token</div>
        </div>
      </div>
      <div className="rounded-xl p-3" style={{ background: 'var(--surface-muted)' }}>
        <div className="text-2xl font-bold mono tabular-nums" style={{ color: 'var(--ink)' }}>
          {formatBig(b.balance)}
        </div>
        <div className="text-xs mt-0.5" style={{ color: 'var(--subtle)' }}>balance</div>
      </div>
    </div>
  )
}

function InscriptionDetailCard({
  ins,
  rank,
  onOpen,
}: {
  ins: Inscription
  rank: number | null
  onOpen: () => void
}) {
  const explorerUrl = buildTxExplorerUrl(ins.id, TARGET_CHAIN_ID)

  const shareText = `I inscribed #${ins.number} on Arc — permanently onchain. No IPFS. No servers. Just the chain. 🔗 arc-scribe.netlify.app`

  const copyEmbed = () => {
    const embed = `<iframe src="https://arc-scribe.netlify.app/inscription/${ins.number}" width="400" height="300" frameborder="0"></iframe>`
    navigator.clipboard.writeText(embed).then(() => toast.success('Embed code copied!')).catch(() => toast.error('Copy failed'))
  }

  const shareTwitter = () => {
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`,
      '_blank',
      'width=550,height=420',
    )
  }

  return (
    <div
      className="rounded-2xl p-4 space-y-3"
      style={{
        background: 'var(--surface-strong)',
        border: '1px solid var(--border)',
        boxShadow: '0 2px 8px rgba(17,24,39,0.05)',
      }}
    >
      {/* Card preview */}
      <div
        className="rounded-xl overflow-hidden cursor-pointer"
        style={{ aspectRatio: '1', background: 'var(--surface-muted)' }}
        onClick={onOpen}
      >
        <InscriptionCard inscription={ins} compact onOpen={onOpen} />
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-1.5">
        {rank !== null && <EarlyBadge rank={rank} />}
        <span
          className="text-xs px-2 py-0.5 rounded-full font-medium"
          style={{ background: 'var(--surface-muted)', color: 'var(--subtle)' }}
        >
          #{ins.number}
        </span>
        <span
          className="text-xs px-2 py-0.5 rounded-full font-medium"
          style={{ background: 'var(--surface-muted)', color: 'var(--subtle)' }}
        >
          {(ins.size / 1024).toFixed(1)} KB
        </span>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 py-2 rounded-xl text-xs font-semibold text-center transition-all"
          style={{
            background: 'var(--surface-muted)',
            color: 'var(--ink-2)',
            border: '1px solid var(--border)',
          }}
        >
          Explorer ↗
        </a>
        <button
          onClick={shareTwitter}
          className="flex-1 py-2 rounded-xl text-xs font-semibold transition-all"
          style={{
            background: '#1da1f222',
            color: '#1da1f2',
          }}
        >
          Share ✕
        </button>
        <button
          onClick={copyEmbed}
          className="flex-1 py-2 rounded-xl text-xs font-semibold transition-all"
          style={{
            background: 'var(--surface-muted)',
            color: 'var(--subtle)',
            border: '1px solid var(--border)',
          }}
        >
          {'</>'}
        </button>
      </div>
    </div>
  )
}

export default function PortfolioTab() {
  const { address, isConnected } = useAccount()
  const [inscriptions, setInscriptions] = useState<Inscription[]>([])
  const [allInscriptions, setAllInscriptions] = useState<Inscription[]>([])
  const [balances, setBalances] = useState<Arc20Balance[]>([])
  const [selected, setSelected] = useState<Inscription | null>(null)

  useEffect(() => {
    if (!address) return
    const update = () => {
      setInscriptions(getOwnerInscriptions(address))
      setAllInscriptions(getInscriptions())
      setBalances(getArc20Balances(address))
    }
    update()
    return onIndexUpdate(update)
  }, [address])

  if (!isConnected) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 flex flex-col items-center gap-6 text-center">
        <div
          className="w-20 h-20 rounded-3xl flex items-center justify-center text-3xl"
          style={{ background: 'linear-gradient(135deg, #dbeafe 0%, #ede9fe 100%)', boxShadow: '0 8px 32px rgba(37,99,235,0.15)' }}
        >
          ◈
        </div>
        <div>
          <h2 className="display text-2xl font-bold" style={{ color: 'var(--ink)' }}>Your Portfolio</h2>
          <p className="mt-2 text-sm" style={{ color: 'var(--subtle)' }}>
            Connect your wallet to see your inscriptions and ARC-20 token balances.
          </p>
        </div>
        <ConnectKitButton />
      </div>
    )
  }

  const totalKb = inscriptions.reduce((s, i) => s + i.size, 0) / 1024
  const earlyCount = inscriptions.filter((i) => getEarlyBadge(i, allInscriptions) !== null).length

  return (
    <>
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div className="space-y-3">
          <h1 className="display text-3xl font-bold" style={{ color: 'var(--ink)' }}>Portfolio</h1>
          <div className="flex flex-wrap gap-2">
            <span className="mono text-xs px-3 py-1.5 rounded-full" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
              {address?.slice(0, 8)}…{address?.slice(-6)}
            </span>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Inscriptions', value: inscriptions.length.toString() },
              { label: 'ARC-20 Tokens', value: balances.length.toString() },
              { label: 'Data stored', value: `${totalKb.toFixed(1)} KB` },
              { label: 'Early badges', value: earlyCount.toString() },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-2xl p-4 text-center" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
                <div className="text-2xl font-bold display tabular-nums" style={{ color: 'var(--ink)' }}>{value}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--subtle)' }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ARC-20 balances */}
        {balances.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold display" style={{ color: 'var(--ink)' }}>ARC-20 Tokens</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {balances.map((b) => <ArcTokenCard key={b.tick} b={b} />)}
            </div>
          </div>
        )}

        {/* Inscriptions */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold display" style={{ color: 'var(--ink)' }}>
            Inscriptions{' '}
            <span className="text-base font-normal" style={{ color: 'var(--subtle)' }}>({inscriptions.length})</span>
          </h2>
          {inscriptions.length === 0 ? (
            <div
              className="py-16 text-center rounded-3xl space-y-3"
              style={{ background: 'var(--surface)', border: '1.5px dashed var(--border)' }}
            >
              <div className="text-4xl opacity-30">◈</div>
              <p className="font-semibold" style={{ color: 'var(--ink)' }}>No inscriptions yet</p>
              <p className="text-sm" style={{ color: 'var(--subtle)' }}>Go to Inscribe to write your first inscription on Arc</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {inscriptions.map((ins) => (
                <InscriptionDetailCard
                  key={ins.id}
                  ins={ins}
                  rank={getEarlyBadge(ins, allInscriptions)}
                  onOpen={() => setSelected(ins)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {selected && (
        <InscriptionModal
          inscription={selected}
          onClose={() => setSelected(null)}
          isOwner
        />
      )}
    </>
  )
}
