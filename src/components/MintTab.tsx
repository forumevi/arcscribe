import { useState, useCallback, useEffect, useRef } from 'react'
import { useAccount, useSendTransaction, useSwitchChain } from 'wagmi'
import { toHex } from 'viem'
import { toast } from 'sonner'
import { TARGET_CHAIN_ID } from '../config'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { viemClient } from '../lib/indexer'

const MINT_ADDRESS = '0x0000000000000000000000000000000000004663'
const MAX_SIZE_BYTES = 90_000

type MintMode = 'file' | 'text' | 'json'

function fileToDataUri(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const reader = new FileReader()
    reader.onload = () => res(reader.result as string)
    reader.onerror = () => rej(new Error(reader.error?.message ?? 'FileReader error'))
    reader.readAsDataURL(file)
  })
}

const MODE_LABELS: Record<MintMode, { label: string; desc: string; icon: string }> = {
  file:  { label: 'File',   desc: 'Image, SVG, GIF, text',   icon: '◈' },
  text:  { label: 'Text',   desc: 'Plain text inscription',   icon: '✦' },
  json:  { label: 'ARC-20', desc: 'Token deploy / mint',      icon: '◎' },
}

export default function MintTab() {
  const { chainId, isConnected } = useAccount()
  const { switchChain } = useSwitchChain()
  const { sendTransaction, data: txHash, isPending } = useSendTransaction()
  const [confirmedHash, setConfirmedHash] = useState<string | null>(null)
  const [failedHash, setFailedHash] = useState<string | null>(null)
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const attemptsRef = useRef(0)

  const isConfirming = !!txHash && txHash !== confirmedHash && txHash !== failedHash && !isPending
  const isSuccess = !!txHash && txHash === confirmedHash

  useEffect(() => {
    if (!txHash) return
    attemptsRef.current = 0
    const MAX_ATTEMPTS = 40

    const poll = () => {
      viemClient.getTransactionReceipt({ hash: txHash }).then((receipt) => {
        if (receipt?.status === 'success') {
          setConfirmedHash(txHash)
          toast.success('Inscribed on Arc!')
        } else if (receipt?.status === 'reverted') {
          setFailedHash(txHash)
          toast.error('Transaction reverted')
        } else if (attemptsRef.current < MAX_ATTEMPTS) {
          attemptsRef.current++
          pollingRef.current = setTimeout(poll, 2000)
        } else {
          setFailedHash(txHash)
          toast.error('Confirmation timed out — check the explorer')
        }
      }).catch(() => {
        if (attemptsRef.current < MAX_ATTEMPTS) {
          attemptsRef.current++
          pollingRef.current = setTimeout(poll, 2000)
        } else {
          setFailedHash(txHash)
        }
      })
    }
    pollingRef.current = setTimeout(poll, 2000)
    return () => { if (pollingRef.current) clearTimeout(pollingRef.current) }
  }, [txHash])

  const [mode, setMode] = useState<MintMode>('file')
  const [file, setFile] = useState<File | null>(null)
  const [dataUri, setDataUri] = useState('')
  const [textContent, setTextContent] = useState('')
  const [recipient, setRecipient] = useState('')
  const [dragOver, setDragOver] = useState(false)

  const [arc20Op, setArc20Op] = useState<'deploy' | 'mint' | 'transfer'>('mint')
  const [arc20Tick, setArc20Tick] = useState('')
  const [arc20Amt, setArc20Amt] = useState('')
  const [arc20Max, setArc20Max] = useState('')
  const [arc20Lim, setArc20Lim] = useState('')

  const wrongChain = isConnected && chainId !== TARGET_CHAIN_ID

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > MAX_SIZE_BYTES) { toast.error(`Max 90KB`); return }
    setFile(f)
    fileToDataUri(f).then(setDataUri).catch(() => toast.error('Failed to read file'))
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (!f) return
    if (f.size > MAX_SIZE_BYTES) { toast.error('Max 90KB'); return }
    setFile(f)
    fileToDataUri(f).then(setDataUri).catch(() => toast.error('Failed to read file'))
  }, [])

  const buildCalldata = (): string | null => {
    if (mode === 'file') return dataUri || null
    if (mode === 'text') return textContent.trim() ? `data:text/plain,${encodeURIComponent(textContent)}` : null
    if (mode === 'json') {
      const tick = arc20Tick.trim().toUpperCase()
      if (!tick) return null
      const obj: Record<string, unknown> = { p: 'arc-20', op: arc20Op, tick }
      if (arc20Op === 'deploy') {
        if (arc20Max) obj.max = arc20Max
        if (arc20Lim) obj.lim = arc20Lim
      } else {
        if (arc20Amt) obj.amt = arc20Amt
      }
      return `data:application/json,${encodeURIComponent(JSON.stringify(obj))}`
    }
    return null
  }

  const handleMint = () => {
    if (wrongChain) { switchChain({ chainId: TARGET_CHAIN_ID }); return }
    const calldata = buildCalldata()
    if (!calldata) { toast.error('Nothing to inscribe'); return }
    const byteLen = new TextEncoder().encode(calldata).length
    if (byteLen > MAX_SIZE_BYTES) { toast.error(`Too large: ${(byteLen / 1024).toFixed(1)}KB`); return }
    sendTransaction({
      to: (recipient.trim() || MINT_ADDRESS) as `0x${string}`,
      value: 0n,
      data: toHex(new TextEncoder().encode(calldata)),
    }, {
      onSuccess: () => toast.info('Transaction submitted — confirming…'),
      onError: (err) => {
        if ((err.message ?? '').toLowerCase().includes('user rejected')) toast.info('Cancelled')
        else toast.error('Transaction failed')
      },
    })
  }

  const calldataPreview = buildCalldata()
  const calldataSize = calldataPreview ? new TextEncoder().encode(calldataPreview).length : 0
  const canMint = isConnected && !!calldataPreview && calldataSize <= MAX_SIZE_BYTES && !isPending && !isConfirming

  return (
    <div className="max-w-lg mx-auto px-4 py-10 space-y-5">

      {/* Title */}
      <div className="mb-2">
        <h1 className="display text-4xl font-bold" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>
          Inscribe
        </h1>
        <p className="mt-1.5 text-sm" style={{ color: 'var(--subtle)', lineHeight: 1.6 }}>
          Write permanent content to Arc mainnet. No IPFS. No servers. Just calldata.
        </p>
      </div>

      {/* Mode selector */}
      <div
        className="grid grid-cols-3 gap-1 p-1 rounded-2xl"
        style={{ background: 'var(--surface-muted)' }}
      >
        {(Object.entries(MODE_LABELS) as [MintMode, typeof MODE_LABELS[MintMode]][]).map(([m, meta]) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className="py-3 rounded-xl flex flex-col items-center gap-0.5 transition-all"
            style={{
              background: mode === m ? 'var(--surface-strong)' : 'transparent',
              boxShadow: mode === m ? 'inset 0 1px 0 rgba(255,255,255,0.06)' : 'none',
            }}
          >
            <span style={{ color: mode === m ? 'var(--accent)' : 'var(--subtle)' }}>
              {meta.icon}
            </span>
            <span
              className="text-sm font-semibold"
              style={{ color: mode === m ? 'var(--ink)' : 'var(--subtle)' }}
            >
              {meta.label}
            </span>
            <span
              className="text-[10px]"
              style={{ color: 'var(--subtle)', opacity: mode === m ? 0.8 : 0.4 }}
            >
              {meta.desc}
            </span>
          </button>
        ))}
      </div>

      {/* Content card */}
      <div
        className="rounded-2xl p-5 space-y-4"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        {/* File mode */}
        {mode === 'file' && (
          <div>
            <label className="block text-sm font-semibold mb-3" style={{ color: 'var(--ink-2)' }}>
              Upload file
            </label>
            <div
              className="relative rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-3 cursor-pointer transition-all"
              style={{
                borderColor: dragOver ? 'var(--accent)' : 'var(--border-strong)',
                background: dragOver ? 'rgba(172,198,233,0.06)' : 'rgba(0,0,0,0.15)',
                minHeight: 160,
                padding: '2rem',
              }}
              onClick={() => document.getElementById('file-input')?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              <input
                id="file-input"
                type="file"
                accept="image/*,text/*,application/json"
                className="hidden"
                onChange={handleFileChange}
              />
              {file ? (
                <>
                  {dataUri.startsWith('data:image/') && (
                    <img src={dataUri} alt="" className="max-h-36 rounded-xl object-contain" />
                  )}
                  <div className="text-center">
                    <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{file.name}</p>
                    <p className="text-xs mt-0.5 tabular-nums" style={{ color: 'var(--subtle)' }}>
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setFile(null); setDataUri('') }}
                    className="text-xs px-3 py-1.5 rounded-lg transition-all"
                    style={{ color: 'var(--danger)', background: 'rgba(232,109,122,0.1)' }}
                  >
                    Remove
                  </button>
                </>
              ) : (
                <>
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl"
                    style={{ background: 'var(--surface-muted)', color: 'var(--accent)' }}
                  >
                    ↑
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium" style={{ color: 'var(--muted)' }}>
                      Drop a file or click to browse
                    </p>
                    <p className="text-xs mt-1" style={{ color: 'var(--subtle)' }}>
                      PNG · SVG · GIF · text · JSON · max 90KB
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Text mode */}
        {mode === 'text' && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold" style={{ color: 'var(--ink-2)' }}>
                Text content
              </label>
              <span className="text-xs tabular-nums mono" style={{ color: 'var(--subtle)' }}>
                {new TextEncoder().encode(textContent).length} bytes
              </span>
            </div>
            <textarea
              value={textContent}
              onChange={(e) => setTextContent(e.target.value)}
              placeholder="Write anything — a poem, a thought, a fact. It lives on Arc forever."
              rows={7}
              className="w-full rounded-xl p-4 text-sm resize-none outline-none leading-relaxed"
              style={{
                background: 'rgba(0,0,0,0.2)',
                color: 'var(--ink)',
                border: '1px solid var(--border)',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '13px',
              }}
            />
          </div>
        )}

        {/* ARC-20 mode */}
        {mode === 'json' && (
          <div className="space-y-4">
            {/* Op selector */}
            <div>
              <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--ink-2)' }}>
                Operation
              </label>
              <div className="flex gap-2">
                {(['deploy', 'mint', 'transfer'] as const).map((op) => (
                  <button
                    key={op}
                    onClick={() => setArc20Op(op)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold capitalize transition-all"
                    style={{
                      background: arc20Op === op ? 'rgba(172,198,233,0.15)' : 'rgba(0,0,0,0.2)',
                      color: arc20Op === op ? 'var(--accent)' : 'var(--subtle)',
                      border: arc20Op === op ? '1px solid rgba(172,198,233,0.35)' : '1px solid transparent',
                    }}
                  >
                    {op}
                  </button>
                ))}
              </div>
            </div>

            {/* Ticker */}
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--ink-2)' }}>
                Ticker
              </label>
              <input
                value={arc20Tick}
                onChange={(e) => setArc20Tick(e.target.value.toUpperCase())}
                placeholder="e.g. ARCS"
                maxLength={6}
                className="w-full rounded-xl px-3 py-2.5 text-lg font-bold mono outline-none tracking-widest"
                style={{
                  background: 'rgba(0,0,0,0.2)',
                  color: 'var(--accent)',
                  border: '1px solid var(--border)',
                  letterSpacing: '0.1em',
                }}
              />
            </div>

            {arc20Op === 'deploy' ? (
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Max supply', val: arc20Max, set: setArc20Max, ph: '21000000' },
                  { label: 'Mint limit', val: arc20Lim, set: setArc20Lim, ph: '1000' },
                ].map((f) => (
                  <div key={f.label}>
                    <label className="block text-xs font-medium mb-1" style={{ color: 'var(--subtle)' }}>
                      {f.label}
                    </label>
                    <input
                      value={f.val}
                      onChange={(e) => f.set(e.target.value)}
                      placeholder={f.ph}
                      className="w-full rounded-xl px-3 py-2.5 text-sm outline-none mono tabular-nums"
                      style={{ background: 'rgba(0,0,0,0.2)', color: 'var(--ink)', border: '1px solid var(--border)' }}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--ink-2)' }}>
                  Amount
                </label>
                <input
                  value={arc20Amt}
                  onChange={(e) => setArc20Amt(e.target.value)}
                  placeholder="1000"
                  className="w-full rounded-xl px-3 py-2.5 text-sm outline-none mono tabular-nums"
                  style={{ background: 'rgba(0,0,0,0.2)', color: 'var(--ink)', border: '1px solid var(--border)' }}
                />
              </div>
            )}

            {/* JSON preview */}
            {arc20Tick && (
              <div
                className="rounded-xl p-3 overflow-x-auto"
                style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(172,198,233,0.1)' }}
              >
                <p className="text-xs mono" style={{ color: 'var(--accent)', lineHeight: 1.6 }}>
                  {JSON.stringify({
                    p: 'arc-20', op: arc20Op, tick: arc20Tick.toUpperCase(),
                    ...(arc20Op === 'deploy'
                      ? { max: arc20Max || '21000000', lim: arc20Lim || '1000' }
                      : { amt: arc20Amt || '1000' }),
                  })}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Recipient */}
      <div
        className="rounded-2xl p-4 space-y-2"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <label className="block text-sm font-medium" style={{ color: 'var(--ink-2)' }}>
          Recipient
          <span className="ml-2 text-xs font-normal" style={{ color: 'var(--subtle)' }}>
            optional — defaults to your wallet
          </span>
        </label>
        <input
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          placeholder="0x… leave empty to inscribe to yourself"
          className="w-full rounded-xl px-3 py-2.5 text-sm outline-none mono"
          style={{ background: 'var(--surface-muted)', color: 'var(--ink)', border: '1px solid var(--border)' }}
        />
        {calldataPreview && (
          <p className="text-xs tabular-nums" style={{ color: 'var(--subtle)' }}>
            {calldataSize.toLocaleString()} bytes
            {calldataSize > MAX_SIZE_BYTES && (
              <span className="ml-1" style={{ color: 'var(--danger)' }}>— too large!</span>
            )}
          </p>
        )}
      </div>

      {/* CTA */}
      <button
        onClick={handleMint}
        disabled={!canMint && !wrongChain}
        className="w-full py-4 rounded-2xl font-bold text-base transition-all"
        style={{
          background: canMint || wrongChain
            ? 'linear-gradient(135deg, var(--accent) 0%, #7bacd8 100%)'
            : 'var(--surface-muted)',
          color: canMint || wrongChain ? '#0a1628' : 'var(--subtle)',
          boxShadow: canMint ? '0 4px 24px rgba(172,198,233,0.3)' : 'none',
          cursor: !isConnected && !wrongChain ? 'not-allowed' : 'pointer',
        }}
      >
        {!isConnected      ? 'Connect wallet to inscribe'  :
         wrongChain        ? 'Switch to Arc Mainnet'        :
         isPending         ? 'Confirm in wallet…'           :
         isConfirming      ? 'Confirming on Arc…'           :
         !calldataPreview  ? 'Add content to inscribe'      :
                             'Inscribe to Arc'}
      </button>

      {/* Success */}
      {isSuccess && txHash && (
        <div
          className="rounded-2xl p-5 space-y-3"
          style={{
            background: 'rgba(141,216,159,0.08)',
            border: '1px solid rgba(141,216,159,0.25)',
          }}
        >
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ background: 'var(--success)' }} />
            <p className="font-semibold text-sm" style={{ color: 'var(--success)' }}>
              Inscribed on Arc
            </p>
          </div>
          <a
            href={buildTxExplorerUrl(TARGET_CHAIN_ID, txHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs mono block truncate hover:underline"
            style={{ color: 'var(--accent)' }}
          >
            {txHash}
          </a>
          <p className="text-xs" style={{ color: 'var(--subtle)' }}>
            Your inscription appears in Explore after the next block.
          </p>
        </div>
      )}
    </div>
  )
}
