import { useState, useEffect } from 'react'
import { getArc20Tokens, onIndexUpdate } from '../lib/indexer'
import type { Arc20Token } from '../types'

function formatSupply(n: bigint): string {
  if (n >= 1_000_000_000n) return `${(Number(n) / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000n) return `${(Number(n) / 1_000_000).toFixed(1)}M`
  if (n >= 1_000n) return `${(Number(n) / 1_000).toFixed(1)}K`
  return n.toString()
}

function progressPct(minted: bigint, max: bigint): number {
  if (max === 0n) return 0
  return Math.min(100, Number((minted * 100n) / max))
}

export default function TokensTab() {
  const [tokens, setTokens] = useState<Arc20Token[]>([])

  useEffect(() => {
    const update = () => setTokens(getArc20Tokens())
    update()
    return onIndexUpdate(update)
  }, [])

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="display text-3xl font-bold" style={{ color: 'var(--ink)' }}>ARC-20 Tokens</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--subtle)' }}>
          Fungible tokens made entirely of onchain inscriptions. No ERC-20 contract. Just calldata.
        </p>
      </div>

      {/* Protocol card */}
      <div className="rounded-2xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <h3 className="font-semibold text-sm mb-2" style={{ color: 'var(--ink-2)' }}>How ARC-20 works</h3>
        <div className="grid sm:grid-cols-3 gap-3 text-xs" style={{ color: 'var(--subtle)' }}>
          <div className="space-y-1">
            <div className="font-semibold" style={{ color: 'var(--accent)' }}>Deploy</div>
            <div>Inscribe a JSON with op=&quot;deploy&quot; to create a new ticker. You define max supply and per-mint limit.</div>
          </div>
          <div className="space-y-1">
            <div className="font-semibold" style={{ color: 'var(--accent)' }}>Mint</div>
            <div>Anyone inscribes op=&quot;mint&quot; for free (gas only). First come, first served until max supply is reached.</div>
          </div>
          <div className="space-y-1">
            <div className="font-semibold" style={{ color: 'var(--accent)' }}>Transfer</div>
            <div>Inscribe op=&quot;transfer&quot; then send that inscription to the recipient. Tokens follow the inscription.</div>
          </div>
        </div>
      </div>

      {tokens.length === 0 ? (
        <div className="py-20 text-center" style={{ color: 'var(--subtle)' }}>
          No ARC-20 tokens deployed yet. Be the first — go to Mint and choose ARC-20.
        </div>
      ) : (
        <div className="space-y-3">
          {tokens.map((token) => {
            const pct = progressPct(token.minted, token.maxSupply)
            return (
              <div
                key={token.tick}
                className="rounded-2xl p-5 space-y-4"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: 'rgba(172,198,233,0.15)', border: '1px solid rgba(172,198,233,0.25)' }}
                    >
                      <span className="display font-bold text-sm" style={{ color: 'var(--accent)' }}>{token.tick.slice(0, 2)}</span>
                    </div>
                    <div>
                      <div className="font-bold display text-lg" style={{ color: 'var(--ink)' }}>{token.tick}</div>
                      <div className="text-xs mono" style={{ color: 'var(--subtle)' }}>
                        {token.deployer.slice(0, 6)}…{token.deployer.slice(-4)}
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
                      {formatSupply(token.minted)} / {formatSupply(token.maxSupply)}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--subtle)' }}>minted</div>
                  </div>
                </div>

                {/* Progress bar */}
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span style={{ color: 'var(--subtle)' }}>Progress</span>
                    <span className="mono" style={{ color: 'var(--accent)' }}>{pct.toFixed(1)}%</span>
                  </div>
                  <div className="rounded-full h-2 overflow-hidden" style={{ background: 'var(--surface-muted)' }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        background: pct >= 100 ? 'var(--success)' : 'var(--accent)',
                      }}
                    />
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div className="rounded-xl p-3" style={{ background: 'var(--surface-muted)' }}>
                    <div className="font-semibold mono tabular-nums" style={{ color: 'var(--ink)' }}>{formatSupply(token.limit)}</div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--subtle)' }}>Mint limit</div>
                  </div>
                  <div className="rounded-xl p-3" style={{ background: 'var(--surface-muted)' }}>
                    <div className="font-semibold mono tabular-nums" style={{ color: 'var(--ink)' }}>{formatSupply(token.maxSupply)}</div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--subtle)' }}>Max supply</div>
                  </div>
                  <div className="rounded-xl p-3" style={{ background: 'var(--surface-muted)' }}>
                    <div className="font-semibold" style={{ color: pct >= 100 ? 'var(--danger)' : 'var(--success)' }}>
                      {pct >= 100 ? 'Closed' : 'Open'}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--subtle)' }}>Status</div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
