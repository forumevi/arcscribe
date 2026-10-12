import { useState, useEffect } from 'react'
import {
  useAccount, useWriteContract, useSwitchChain
} from 'wagmi'
import { erc20Abi, parseUnits } from 'viem'
import { toast } from 'sonner'
import { TARGET_CHAIN_ID } from '../config'
import { getUsdc } from '@/onchain-facts'
import { getInscriptions, onIndexUpdate } from '../lib/indexer'
import type { Inscription } from '../types'
import InscriptionCard from './InscriptionCard'

// ── Contract ABI (minimal) ────────────────────────────────────────────────────
const MARKET_ABI = [
  {
    name: 'listings',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'inscriptionId', type: 'bytes32' }],
    outputs: [
      { name: 'seller', type: 'address' },
      { name: 'price', type: 'uint256' },
      { name: 'active', type: 'bool' },
    ],
  },
  {
    name: 'deposit',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'inscriptionId', type: 'bytes32' }],
    outputs: [],
  },
  {
    name: 'list',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'inscriptionId', type: 'bytes32' },
      { name: 'priceUsdc', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'buy',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'inscriptionId', type: 'bytes32' }],
    outputs: [],
  },
  {
    name: 'delist',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'inscriptionId', type: 'bytes32' }],
    outputs: [],
  },
] as const

// Replace with deployed contract address after deployment
const MARKET_ADDRESS = (import.meta.env.VITE_MARKET_ADDRESS ?? '0x0000000000000000000000000000000000000000') as `0x${string}`

const usdcFact = getUsdc(TARGET_CHAIN_ID)
const USDC_ADDRESS = (usdcFact?.address ?? '0x3600000000000000000000000000000000000000') as `0x${string}`

// ── List Modal ────────────────────────────────────────────────────────────────

function ListModal({ inscription, onClose }: { inscription: Inscription; onClose: () => void }) {
  const { chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const [price, setPrice] = useState('')
  const [step, setStep] = useState<'deposit' | 'approve' | 'list' | 'done'>('deposit')

  const { writeContract, isPending } = useWriteContract()

  const wrongChain = chainId !== TARGET_CHAIN_ID

  const handleDeposit = () => {
    if (wrongChain) { switchChain({ chainId: TARGET_CHAIN_ID }); return }
    writeContract({
      address: MARKET_ADDRESS,
      abi: MARKET_ABI,
      functionName: 'deposit',
      args: [inscription.id as `0x${string}`],
    }, {
      onSuccess: () => setStep('approve'),
      onError: (e) => toast.error(e.message.slice(0, 80)),
    })
  }

  const handleApprove = () => {
    if (!price || parseFloat(price) <= 0) { toast.error('Enter a price'); return }
    const amount = parseUnits(price, 6)
    writeContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'approve',
      args: [MARKET_ADDRESS, amount],
      chainId: TARGET_CHAIN_ID,
    }, {
      onSuccess: () => setStep('list'),
      onError: (e) => toast.error(e.message.slice(0, 80)),
    })
  }

  const handleList = () => {
    if (!price || parseFloat(price) <= 0) { toast.error('Enter a price'); return }
    const amount = parseUnits(price, 6)
    writeContract({
      address: MARKET_ADDRESS,
      abi: MARKET_ABI,
      functionName: 'list',
      args: [inscription.id as `0x${string}`, amount],
    }, {
      onSuccess: () => { toast.success('Listed!'); setStep('done') },
      onError: (e) => toast.error(e.message.slice(0, 80)),
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-md rounded-3xl p-6 space-y-5" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between">
          <h2 className="display text-xl font-bold" style={{ color: 'var(--ink)' }}>List for sale</h2>
          <button onClick={onClose} style={{ color: 'var(--subtle)' }}>✕</button>
        </div>

        <div className="rounded-xl p-3 text-center" style={{ background: 'var(--surface)' }}>
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Inscription #{inscription.number}</p>
          <p className="text-xs mono" style={{ color: 'var(--subtle)' }}>{inscription.id.slice(0, 16)}…</p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: 'var(--ink-2)' }}>Price (USDC)</label>
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            disabled={step !== 'deposit' && step !== 'approve'}
            className="w-full rounded-xl px-3 py-2.5 text-lg font-bold mono outline-none"
            style={{ background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--border)' }}
          />
        </div>

        {/* Steps */}
        <div className="space-y-2">
          {step === 'done' ? (
            <div className="rounded-xl p-4 text-center" style={{ background: 'rgba(141,216,159,0.1)', border: '1px solid rgba(141,216,159,0.3)' }}>
              <p className="font-semibold" style={{ color: 'var(--success)' }}>Listed successfully</p>
              <button onClick={onClose} className="mt-2 text-sm" style={{ color: 'var(--subtle)' }}>Close</button>
            </div>
          ) : step === 'deposit' ? (
            <button
              onClick={handleDeposit}
              disabled={isPending}
              className="w-full py-3 rounded-xl font-bold"
              style={{ background: 'var(--accent)', color: '#0d1b2f' }}
            >
              {isPending ? 'Confirm in wallet…' : 'Step 1: Deposit to marketplace'}
            </button>
          ) : step === 'approve' ? (
            <button
              onClick={handleApprove}
              disabled={isPending || !price}
              className="w-full py-3 rounded-xl font-bold"
              style={{ background: 'var(--accent)', color: '#0d1b2f' }}
            >
              {isPending ? 'Confirm in wallet…' : 'Step 2: Approve USDC'}
            </button>
          ) : (
            <button
              onClick={handleList}
              disabled={isPending || !price}
              className="w-full py-3 rounded-xl font-bold"
              style={{ background: 'var(--accent)', color: '#0d1b2f' }}
            >
              {isPending ? 'Confirm in wallet…' : 'Step 3: Confirm listing'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export default function MarketTab() {
  const { address, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const [inscriptions, setInscriptions] = useState<Inscription[]>([])
  const [listingModal, setListingModal] = useState<Inscription | null>(null)

  const wrongChain = address && chainId !== TARGET_CHAIN_ID

  const { writeContract } = useWriteContract()

  useEffect(() => {
    const update = () => setInscriptions(getInscriptions())
    update()
    return onIndexUpdate(update)
  }, [])

  const handleBuy = (ins: Inscription, _price: bigint) => {
    if (wrongChain) { switchChain({ chainId: TARGET_CHAIN_ID }); return }
    // First approve USDC, then buy (simplified: assumes approval already done or handled separately)
    writeContract({
      address: MARKET_ADDRESS,
      abi: MARKET_ABI,
      functionName: 'buy',
      args: [ins.id as `0x${string}`],
    }, {
      onSuccess: () => toast.success('Bought!'),
      onError: (e) => {
        if (e.message.toLowerCase().includes('user rejected')) toast.info('Cancelled')
        else toast.error('Buy failed. Did you approve USDC first?')
      },
    })
  }

  const handleDelist = (ins: Inscription) => {
    writeContract({
      address: MARKET_ADDRESS,
      abi: MARKET_ABI,
      functionName: 'delist',
      args: [ins.id as `0x${string}`],
    }, {
      onSuccess: () => toast.success('Delisted'),
      onError: (e) => toast.error(e.message.slice(0, 80)),
    })
  }

  // Only show inscriptions that are listed (simplified: all inscriptions shown; filter by market contract state in production)
  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="display text-3xl font-bold" style={{ color: 'var(--ink)' }}>Marketplace</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--subtle)' }}>
          Buy and sell inscriptions. 2% fee on every sale.
          {MARKET_ADDRESS === '0x0000000000000000000000000000000000000000' && (
            <span style={{ color: 'var(--danger)' }}> (Contract not deployed yet — set VITE_MARKET_ADDRESS)</span>
          )}
        </p>
      </div>

      {inscriptions.length === 0 ? (
        <div className="py-20 text-center" style={{ color: 'var(--subtle)' }}>
          No inscriptions indexed yet
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {inscriptions.map((ins) => (
            <InscriptionCard
              key={ins.id}
              inscription={ins}
              showActions
              onList={() => setListingModal(ins)}
              onBuy={() => handleBuy(ins, 0n)}
              onDelist={() => handleDelist(ins)}
            />
          ))}
        </div>
      )}

      {listingModal && (
        <ListModal
          inscription={listingModal}
          onClose={() => setListingModal(null)}
        />
      )}
    </div>
  )
}
