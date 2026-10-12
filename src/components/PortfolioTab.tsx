import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { getOwnerInscriptions, getArc20Balances, onIndexUpdate } from '../lib/indexer'
import type { Inscription, Arc20Balance } from '../types'
import InscriptionCard from './InscriptionCard'
import InscriptionModal from './InscriptionModal'

function formatBig(n: bigint): string {
  if (n >= 1_000_000_000n) return `${(Number(n) / 1_000_000_000).toFixed(2)}B`
  if (n >= 1_000_000n) return `${(Number(n) / 1_000_000).toFixed(2)}M`
  if (n >= 1_000n) return `${(Number(n) / 1_000).toFixed(1)}K`
  return n.toLocaleString()
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

export default function PortfolioTab() {
  const { address, isConnected } = useAccount()
  const [inscriptions, setInscriptions] = useState<Inscription[]>([])
  const [balances, setBalances] = useState<Arc20Balance[]>([])
  const [selected, setSelected] = useState<Inscription | null>(null)

  useEffect(() => {
    if (!address) return
    const update = () => {
      setInscriptions(getOwnerInscriptions(address))
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
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Inscriptions', value: inscriptions.length.toString() },
              { label: 'ARC-20 Tokens', value: balances.length.toString() },
              { label: 'Data stored', value: `${totalKb.toFixed(1)} KB` },
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
              <p className="text-sm" style={{ color: 'var(--subtle)' }}>Go to Mint to write your first inscription on Arc</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {inscriptions.map((ins) => (
                <InscriptionCard
                  key={ins.id}
                  inscription={ins}
                  compact
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
