import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { toast } from 'sonner'
import { getArc20Tokens, getArc20Balances, getArc20TokenHolders, onIndexUpdate } from '../lib/indexer'
import type { Arc20Token, Arc20Balance } from '../types'

function formatSupply(n: bigint): string {
  if (n >= 1_000_000_000n) return `${(Number(n) / 1_000_000_000).toFixed(2)}B`
  if (n >= 1_000_000n) return `${(Number(n) / 1_000_000).toFixed(2)}M`
  if (n >= 1_000n) return `${(Number(n) / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

function progressPct(minted: bigint, max: bigint): number {
  if (max === 0n) return 0
  return Math.min(100, Number((minted * 100n) / max))
}

function TopHolders({ token, holders }: { token: Arc20Token; holders: Arc20Balance[] }) {
  const top = holders.slice(0, 5)
  if (top.length === 0) return null
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--subtle)' }}>Top Holders</div>
      {top.map((b, i) => {
        const pct =
          token.maxSupply > 0n
            ? Number((b.balance * 10000n) / token.maxSupply) / 100
            : 0
        return (
          <div key={`${b.tick}-${i}`} className="flex items-center gap-2 text-xs">
            <span className="w-4 text-center font-bold tabular-nums" style={{ color: 'var(--subtle)' }}>
              {i + 1}
            </span>
            <div
              className="flex-1 rounded-full h-1.5 overflow-hidden"
              style={{ background: 'var(--surface-muted)' }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${pct}%`,
                  background: 'linear-gradient(90deg, #2563eb, #7c3aed)',
                }}
              />
            </div>
            <span
              className="mono tabular-nums w-16 text-right"
              style={{ color: 'var(--ink)' }}
            >
              {formatSupply(b.balance)}
            </span>
            <span style={{ color: 'var(--subtle)' }}>{pct.toFixed(1)}%</span>
          </div>
        )
      })}
    </div>
  )
}

export default function TokensTab() {
  const { address } = useAccount()
  const [tokens, setTokens] = useState<Arc20Token[]>([])
  const [myBalances, setMyBalances] = useState<Arc20Balance[]>([])
  const [holdersMap, setHoldersMap] = useState<Record<string, Arc20Balance[]>>({})
  const [mintingTick, setMintingTick] = useState<string | null>(null)

  useEffect(() => {
    const update = () => {
      const toks = getArc20Tokens()
      setTokens(toks)
      if (address) setMyBalances(getArc20Balances(address))

      // Build a holders map for every token we know about
      const hmap: Record<string, Arc20Balance[]> = {}
      for (const t of toks) {
        hmap[t.tick] = getArc20TokenHolders(t.tick)
      }
      setHoldersMap(hmap)
    }
    update()
    return onIndexUpdate(update)
  }, [address])

  void mintingTick  // consumed below
  void setMintingTick

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="display text-3xl font-bold" style={{ color: 'var(--ink)' }}>
          ARC-20 Tokens
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--subtle)' }}>
          Fungible tokens made entirely of onchain inscriptions. No ERC-20 contract. Just
          calldata.
        </p>
      </div>

      {/* Protocol explainer */}
      <div
        className="rounded-2xl p-5"
        style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}
      >
        <h3 className="font-bold text-sm mb-3" style={{ color: 'var(--ink)' }}>
          How ARC-20 works
        </h3>
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            {
              icon: '🚀',
              title: 'Deploy',
              desc: 'Inscribe a JSON with op="deploy" to create a new ticker. You define max supply and per-mint limit.',
            },
            {
              icon: '🪙',
              title: 'Mint',
              desc: 'Anyone inscribes op="mint" for free (gas only). First come, first served until max supply is reached.',
            },
            {
              icon: '↗',
              title: 'Transfer',
              desc: 'Inscribe op="transfer" then send that inscription to the recipient. Tokens follow the inscription.',
            },
          ].map(({ icon, title, desc }) => (
            <div
              key={title}
              className="rounded-xl p-3 space-y-1.5"
              style={{ background: 'var(--surface-muted)' }}
            >
              <div className="text-xl">{icon}</div>
              <div className="font-bold text-sm" style={{ color: 'var(--ink)' }}>
                {title}
              </div>
              <div className="text-xs leading-relaxed" style={{ color: 'var(--subtle)' }}>
                {desc}
              </div>
            </div>
          ))}
        </div>
      </div>

      {tokens.length === 0 ? (
        <div
          className="py-20 text-center rounded-3xl space-y-3"
          style={{ background: 'var(--surface)', border: '1.5px dashed var(--border)' }}
        >
          <div className="text-4xl opacity-30">◆</div>
          <p className="font-semibold" style={{ color: 'var(--ink)' }}>
            No ARC-20 tokens deployed yet
          </p>
          <p className="text-sm" style={{ color: 'var(--subtle)' }}>
            Go to Inscribe → ARC-20 → Deploy to create the first token
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {tokens.map((token) => {
            const pct = progressPct(token.minted, token.maxSupply)
            const myBal = myBalances.find((b) => b.tick === token.tick)
            const holders = holdersMap[token.tick] ?? []

            return (
              <div
                key={token.tick}
                className="rounded-3xl p-6 space-y-5"
                style={{
                  background: 'var(--surface-strong)',
                  border: '1px solid var(--border)',
                  boxShadow: '0 4px 16px rgba(17,24,39,0.06)',
                }}
              >
                {/* Token header */}
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-4">
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center font-bold display text-lg"
                      style={{
                        background: 'linear-gradient(135deg, #dbeafe 0%, #ede9fe 100%)',
                        color: '#1e40af',
                        boxShadow: '0 4px 12px rgba(37,99,235,0.15)',
                      }}
                    >
                      {token.tick.slice(0, 2)}
                    </div>
                    <div>
                      <div
                        className="font-bold display text-2xl"
                        style={{ color: 'var(--ink)' }}
                      >
                        {token.tick}
                      </div>
                      <div className="text-xs mono mt-0.5" style={{ color: 'var(--subtle)' }}>
                        by {token.deployer.slice(0, 8)}…{token.deployer.slice(-4)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {pct >= 100 ? (
                      <span
                        className="px-3 py-1 rounded-full text-xs font-bold"
                        style={{ background: '#fee2e2', color: '#dc2626' }}
                      >
                        Fully Minted
                      </span>
                    ) : (
                      <span
                        className="px-3 py-1 rounded-full text-xs font-bold"
                        style={{ background: '#dcfce7', color: '#166534' }}
                      >
                        Open for Mint
                      </span>
                    )}
                    {myBal && (
                      <span
                        className="px-3 py-1 rounded-full text-xs font-bold"
                        style={{ background: '#dbeafe', color: '#1e40af' }}
                      >
                        You: {formatSupply(myBal.balance)}
                      </span>
                    )}
                    {holders.length > 0 && (
                      <span
                        className="px-3 py-1 rounded-full text-xs font-bold"
                        style={{ background: 'var(--surface-muted)', color: 'var(--subtle)' }}
                      >
                        {holders.length} holder{holders.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>

                {/* Progress bar */}
                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span style={{ color: 'var(--subtle)' }}>
                      {formatSupply(token.minted)} / {formatSupply(token.maxSupply)} minted
                    </span>
                    <span
                      className="font-bold"
                      style={{
                        color: pct >= 100 ? 'var(--danger)' : 'var(--accent-bright)',
                      }}
                    >
                      {pct.toFixed(1)}%
                    </span>
                  </div>
                  <div
                    className="rounded-full h-3 overflow-hidden"
                    style={{ background: 'var(--surface-muted)' }}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${pct}%`,
                        background:
                          pct >= 100
                            ? 'linear-gradient(90deg, #dc2626, #ef4444)'
                            : 'linear-gradient(90deg, #2563eb, #7c3aed)',
                      }}
                    />
                  </div>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Max Supply', value: formatSupply(token.maxSupply) },
                    { label: 'Minted', value: formatSupply(token.minted) },
                    { label: 'Mint Limit', value: formatSupply(token.limit) },
                    { label: 'Remaining', value: formatSupply(token.maxSupply - token.minted) },
                  ].map(({ label, value }) => (
                    <div
                      key={label}
                      className="rounded-xl p-3 text-center"
                      style={{ background: 'var(--surface-muted)' }}
                    >
                      <div
                        className="font-bold mono tabular-nums"
                        style={{ color: 'var(--ink)' }}
                      >
                        {value}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--subtle)' }}>
                        {label}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Real holders */}
                {holders.length > 0 && <TopHolders token={token} holders={holders} />}

                {/* Mint CTA */}
                {!address ? (
                  <p className="text-xs text-center" style={{ color: 'var(--subtle)' }}>
                    Connect wallet to mint
                  </p>
                ) : (
                  <button
                    onClick={() => {
                      if (pct >= 100) return
                      toast.info(
                        `Go to Inscribe → ARC-20 → Mint, enter tick "${token.tick}"`,
                      )
                    }}
                    disabled={pct >= 100}
                    className="w-full py-3 rounded-2xl text-sm font-bold transition-all"
                    style={{
                      background:
                        pct >= 100
                          ? 'var(--surface-muted)'
                          : 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                      color: pct >= 100 ? 'var(--subtle)' : '#fff',
                      cursor: pct >= 100 ? 'not-allowed' : 'pointer',
                      boxShadow:
                        pct >= 100 ? 'none' : '0 4px 16px rgba(5,150,105,0.25)',
                    }}
                  >
                    {pct >= 100
                      ? 'Fully minted'
                      : `Mint ${formatSupply(token.limit)} ${token.tick}`}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
