import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { getOwnerInscriptions, getArc20Balances, onIndexUpdate } from '../lib/indexer'
import type { Inscription, Arc20Balance } from '../types'
import InscriptionCard from './InscriptionCard'

export default function PortfolioTab() {
  const { address, isConnected } = useAccount()
  const [inscriptions, setInscriptions] = useState<Inscription[]>([])
  const [balances, setBalances] = useState<Arc20Balance[]>([])

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
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <span className="display text-2xl font-bold" style={{ color: 'var(--accent)' }}>#</span>
        </div>
        <div>
          <h2 className="display text-2xl font-bold" style={{ color: 'var(--ink)' }}>Your Portfolio</h2>
          <p className="mt-2 text-sm" style={{ color: 'var(--subtle)' }}>Connect your wallet to see your inscriptions and ARC-20 balances.</p>
        </div>
        <ConnectKitButton />
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="display text-3xl font-bold" style={{ color: 'var(--ink)' }}>Portfolio</h1>
        <p className="mt-1 text-sm mono truncate" style={{ color: 'var(--subtle)' }}>{address}</p>
      </div>

      {/* ARC-20 balances */}
      {balances.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>ARC-20 Tokens</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {balances.map((b) => (
              <div
                key={b.tick}
                className="rounded-2xl p-4 space-y-1"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              >
                <div className="text-xl font-bold display" style={{ color: 'var(--accent)' }}>{b.tick}</div>
                <div className="text-2xl font-bold mono tabular-nums" style={{ color: 'var(--ink)' }}>
                  {b.balance.toLocaleString()}
                </div>
                <div className="text-xs" style={{ color: 'var(--subtle)' }}>balance</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Inscriptions */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
          Inscriptions <span className="text-base font-normal" style={{ color: 'var(--subtle)' }}>({inscriptions.length})</span>
        </h2>
        {inscriptions.length === 0 ? (
          <div className="py-12 text-center rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <p style={{ color: 'var(--subtle)' }}>No inscriptions yet</p>
            <p className="text-sm mt-1" style={{ color: 'var(--subtle)', opacity: 0.7 }}>Go to Mint to inscribe your first</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {inscriptions.map((ins) => (
              <InscriptionCard key={ins.id} inscription={ins} compact />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
