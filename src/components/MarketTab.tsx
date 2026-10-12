import { useState, useEffect } from 'react'
import { useAccount, useWriteContract, useSwitchChain, useReadContract } from 'wagmi'
import { erc20Abi, parseUnits } from 'viem'
import { toast } from 'sonner'
import { TARGET_CHAIN_ID } from '../config'
import { getUsdc } from '@/onchain-facts'
import { getInscriptions, onIndexUpdate } from '../lib/indexer'
import type { Inscription } from '../types'
import InscriptionCard from './InscriptionCard'
import InscriptionModal from './InscriptionModal'

const MARKET_ABI = [
  { name: 'listings', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'inscriptionId', type: 'bytes32' }],
    outputs: [{ name: 'seller', type: 'address' }, { name: 'price', type: 'uint256' }, { name: 'active', type: 'bool' }] },
  { name: 'deposit', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'inscriptionId', type: 'bytes32' }], outputs: [] },
  { name: 'list', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'inscriptionId', type: 'bytes32' }, { name: 'priceUsdc', type: 'uint256' }], outputs: [] },
  { name: 'buy', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'inscriptionId', type: 'bytes32' }], outputs: [] },
  { name: 'delist', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'inscriptionId', type: 'bytes32' }], outputs: [] },
] as const

const MARKET_ADDRESS = (import.meta.env.VITE_MARKET_ADDRESS ?? '0x0000000000000000000000000000000000000000') as `0x${string}`
const usdcFact = getUsdc(TARGET_CHAIN_ID)
const USDC_ADDRESS = (usdcFact?.address ?? '0x3600000000000000000000000000000000000000') as `0x${string}`

// ── List Modal ────────────────────────────────────────────────────────────────

function ListModal({ inscription, onClose }: { inscription: Inscription; onClose: () => void }) {
  const { chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const [price, setPrice] = useState('')
  const [step, setStep] = useState<'deposit' | 'list' | 'done'>('deposit')
  const { writeContract, isPending } = useWriteContract()
  const wrongChain = chainId !== TARGET_CHAIN_ID

  const handleDeposit = () => {
    if (wrongChain) { switchChain({ chainId: TARGET_CHAIN_ID }); return }
    writeContract({
      address: MARKET_ADDRESS, abi: MARKET_ABI, functionName: 'deposit',
      args: [inscription.id as `0x${string}`],
    }, {
      onSuccess: () => { toast.success('Deposited to marketplace'); setStep('list') },
      onError: (e) => toast.error(e.message.slice(0, 80)),
    })
  }

  const handleList = () => {
    if (!price || parseFloat(price) <= 0) { toast.error('Enter a valid price'); return }
    writeContract({
      address: MARKET_ADDRESS, abi: MARKET_ABI, functionName: 'list',
      args: [inscription.id as `0x${string}`, parseUnits(price, 6)],
    }, {
      onSuccess: () => { toast.success('Listed for sale!'); setStep('done') },
      onError: (e) => toast.error(e.message.slice(0, 80)),
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-md rounded-3xl p-6 space-y-5"
        style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)', boxShadow: '0 24px 80px rgba(0,0,0,0.15)' }}>
        <div className="flex items-center justify-between">
          <h2 className="display text-xl font-bold" style={{ color: 'var(--ink)' }}>List for sale</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: 'var(--surface-muted)', color: 'var(--subtle)' }}>✕</button>
        </div>

        <div className="rounded-2xl p-4 text-center" style={{ background: 'var(--surface-muted)' }}>
          <p className="font-bold" style={{ color: 'var(--ink)' }}>Inscription #{inscription.number}</p>
          <p className="text-xs mono mt-0.5" style={{ color: 'var(--subtle)' }}>{inscription.id.slice(0, 18)}…</p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink-2)' }}>Price in USDC</label>
          <div className="relative">
            <input
              value={price} onChange={(e) => setPrice(e.target.value)}
              type="number" min="0" step="0.01" placeholder="0.00"
              disabled={step === 'done'}
              className="w-full rounded-xl px-4 py-3 pr-16 text-xl font-bold mono outline-none"
              style={{ background: 'var(--surface)', color: 'var(--ink)', border: '1.5px solid var(--border)' }}
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold" style={{ color: 'var(--subtle)' }}>USDC</span>
          </div>
        </div>

        {/* Progress steps */}
        <div className="flex items-center gap-2 text-xs">
          {(['deposit', 'list'] as const).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{
                    background: step === s ? 'var(--accent-bright)' : (step === 'done' || (s === 'deposit' && step === 'list')) ? 'var(--success)' : 'var(--surface-muted)',
                    color: step === s || step === 'done' || (s === 'deposit' && step === 'list') ? '#fff' : 'var(--subtle)',
                  }}>
                  {(step === 'done' || (s === 'deposit' && step === 'list')) ? '✓' : i + 1}
                </div>
                <span style={{ color: step === s ? 'var(--ink)' : 'var(--subtle)', fontWeight: step === s ? 600 : 400 }}>
                  {s === 'deposit' ? 'Deposit' : 'Set price'}
                </span>
              </div>
              {i < 1 && <div className="w-6 h-px" style={{ background: 'var(--border)' }} />}
            </div>
          ))}
        </div>

        {step === 'done' ? (
          <div className="rounded-2xl p-4 text-center" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
            <p className="font-bold" style={{ color: '#166534' }}>Listed successfully!</p>
            <p className="text-sm mt-1" style={{ color: '#15803d' }}>Buyers can now purchase your inscription</p>
            <button onClick={onClose} className="mt-3 text-sm font-medium" style={{ color: 'var(--subtle)' }}>Close</button>
          </div>
        ) : step === 'deposit' ? (
          <button onClick={handleDeposit} disabled={isPending}
            className="w-full py-3.5 rounded-2xl font-bold text-base transition-all"
            style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)', color: '#fff', opacity: isPending ? 0.7 : 1 }}>
            {isPending ? 'Confirm in wallet…' : 'Step 1: Deposit to marketplace'}
          </button>
        ) : (
          <button onClick={handleList} disabled={isPending || !price}
            className="w-full py-3.5 rounded-2xl font-bold text-base transition-all"
            style={{ background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)', color: '#fff', opacity: (isPending || !price) ? 0.7 : 1 }}>
            {isPending ? 'Confirm in wallet…' : 'Step 2: List for sale'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Buy flow ─────────────────────────────────────────────────────────────────

function useBuyFlow(inscriptionId: string) {
  const { writeContract, isPending } = useWriteContract()
  const { switchChain } = useSwitchChain()
  const { chainId } = useAccount()

  const { data: listing } = useReadContract({
    address: MARKET_ADDRESS,
    abi: MARKET_ABI,
    functionName: 'listings',
    args: [inscriptionId as `0x${string}`],
    chainId: TARGET_CHAIN_ID,
    query: { enabled: !!inscriptionId && MARKET_ADDRESS !== '0x0000000000000000000000000000000000000000' },
  })

  const isListed = listing && listing[2]
  const price = listing?.[1] ?? 0n
  const seller = listing?.[0] ?? '0x0000000000000000000000000000000000000000'

  const buy = () => {
    if (chainId !== TARGET_CHAIN_ID) { switchChain({ chainId: TARGET_CHAIN_ID }); return }
    if (!isListed) { toast.error('Not listed'); return }
    // Approve USDC then buy
    writeContract({
      address: USDC_ADDRESS, abi: erc20Abi, functionName: 'approve',
      args: [MARKET_ADDRESS, price],
    }, {
      onSuccess: () => {
        toast.info('USDC approved — confirming purchase…')
        writeContract({
          address: MARKET_ADDRESS, abi: MARKET_ABI, functionName: 'buy',
          args: [inscriptionId as `0x${string}`],
        }, {
          onSuccess: () => toast.success('Purchased!'),
          onError: (e) => toast.error(e.message.slice(0, 80)),
        })
      },
      onError: (e) => {
        if (e.message.toLowerCase().includes('user rejected')) toast.info('Cancelled')
        else toast.error('Approval failed')
      },
    })
  }

  return { isListed, price, seller, buy, isPending }
}

// ── Main tab ──────────────────────────────────────────────────────────────────

function MarketCard({ ins, address, onList }: {
  ins: Inscription
  address?: string
  onList: () => void
}) {
  const { isListed, price, seller, buy, isPending } = useBuyFlow(ins.id)
  const [modal, setModal] = useState(false)
  const isOwner = address?.toLowerCase() === ins.owner.toLowerCase()
  const isSeller = address?.toLowerCase() === seller?.toLowerCase()
  const { writeContract } = useWriteContract()

  const handleDelist = () => {
    writeContract({
      address: MARKET_ADDRESS, abi: MARKET_ABI, functionName: 'delist',
      args: [ins.id as `0x${string}`],
    }, {
      onSuccess: () => toast.success('Delisted'),
      onError: (e) => toast.error(e.message.slice(0, 80)),
    })
  }

  return (
    <>
      <InscriptionCard
        inscription={ins}
        listing={isListed ? { price, seller } : null}
        showActions
        onOpen={() => setModal(true)}
        onList={isOwner && !isListed ? onList : undefined}
        onBuy={isListed && !isSeller ? buy : undefined}
        onDelist={isSeller && isListed ? handleDelist : undefined}
      />
      {modal && (
        <InscriptionModal
          inscription={ins}
          onClose={() => setModal(false)}
          listing={isListed ? { price, seller } : null}
          isOwner={isOwner}
          onList={isOwner && !isListed ? () => { setModal(false); onList() } : undefined}
          onBuy={isListed && !isSeller && !isPending ? () => { setModal(false); buy() } : undefined}
          onDelist={isSeller && isListed ? () => { setModal(false); handleDelist() } : undefined}
        />
      )}
    </>
  )
}

export default function MarketTab() {
  const { address } = useAccount()
  const [inscriptions, setInscriptions] = useState<Inscription[]>([])
  const [listingModal, setListingModal] = useState<Inscription | null>(null)
  const [tab, setTab] = useState<'all' | 'mine'>('all')

  useEffect(() => {
    const update = () => setInscriptions(getInscriptions())
    update()
    return onIndexUpdate(update)
  }, [])

  const shown = tab === 'mine'
    ? inscriptions.filter((i) => i.owner.toLowerCase() === address?.toLowerCase())
    : inscriptions

  const isDeployed = MARKET_ADDRESS !== '0x0000000000000000000000000000000000000000'

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="display text-3xl font-bold" style={{ color: 'var(--ink)' }}>Marketplace</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--subtle)' }}>
            Buy and sell inscriptions. 2% fee on every sale.
            {!isDeployed && (
              <span className="ml-1" style={{ color: 'var(--danger)' }}>(Contract not configured)</span>
            )}
          </p>
        </div>

        {/* Tab filter */}
        <div className="flex gap-2">
          {(['all', 'mine'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className="px-4 py-2 rounded-xl text-sm font-semibold transition-all"
              style={{
                background: tab === t ? 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)' : 'var(--surface-strong)',
                color: tab === t ? '#fff' : 'var(--muted)',
                border: tab === t ? 'none' : '1px solid var(--border)',
              }}>
              {t === 'all' ? 'All Inscriptions' : 'My Inscriptions'}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="py-20 text-center rounded-3xl space-y-3"
          style={{ background: 'var(--surface)', border: '1.5px dashed var(--border)' }}>
          <div className="text-4xl opacity-30">⇌</div>
          <p className="font-semibold" style={{ color: 'var(--ink)' }}>No inscriptions indexed yet</p>
          <p className="text-sm" style={{ color: 'var(--subtle)' }}>Go to Inscribe and write something to Arc</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {shown.map((ins) => (
            <MarketCard
              key={ins.id}
              ins={ins}
              address={address}
              onList={() => setListingModal(ins)}
            />
          ))}
        </div>
      )}

      {listingModal && (
        <ListModal inscription={listingModal} onClose={() => setListingModal(null)} />
      )}
    </div>
  )
}
