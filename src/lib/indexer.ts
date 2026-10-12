/**
 * ArcScribe Indexer — client-side / light-node version.
 *
 * A full production indexer would be a backend service that walks all blocks
 * from the genesis block. This browser-side implementation:
 *  1. Fetches recent blocks from the Arc RPC.
 *  2. Scans transaction calldata for valid data URIs.
 *  3. Derives ownership from the calldata-transfer protocol.
 *  4. Parses ARC-20 JSON inscriptions.
 *
 * For the hackathon demo, we also maintain an in-memory state that is
 * rebuilt on page load by scanning the last N blocks (configurable).
 */

import { createPublicClient, http, type Hex } from 'viem'
import { arc, arcTestnet } from 'viem/chains'
import type { Inscription, Arc20Token, Arc20Balance } from '../types'
import { TARGET_CHAIN_ID } from '../config'

// ─── Constants ───────────────────────────────────────────────────────────────

const MINT_ADDRESS = '0x0000000000000000000000000000000000004663'
const DEAD_ADDRESS = '0x000000000000000000000000000000000000dEaD'
const MAX_SCAN_BLOCKS = 300   // scan last N blocks — keep low to avoid RPC rate limits
const BATCH_SIZE = 5          // parallel block fetches per batch — low to avoid rate limits
const BATCH_DELAY_MS = 200    // ms between batches
const MAX_INSCRIPTION_SIZE = 90_000  // bytes

// ─── RPC client ──────────────────────────────────────────────────────────────

// On Netlify (or any non-localhost origin) use the proxy to avoid CORS.
// In Arc Studio sandbox (localhost / studio preview) use the RPC directly.
function getRpcUrl(): string {
  if (TARGET_CHAIN_ID !== arc.id) return 'https://rpc.testnet.arc.io'
  const host = typeof window !== 'undefined' ? window.location.hostname : ''
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.arc.io') || host.endsWith('.e2b.dev') || host.endsWith('.preview.studio.arc.io')
  return isLocal ? 'https://rpc.mainnet.arc.io' : '/api/rpc'
}

export const viemClient = createPublicClient({
  chain: TARGET_CHAIN_ID === arc.id ? arc : arcTestnet,
  transport: http(getRpcUrl()),
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hexToUtf8(hex: Hex): string {
  const bytes = hex.startsWith('0x') ? hex.slice(2) : hex
  if (!bytes) return ''
  const arr = new Uint8Array(bytes.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)))
  return new TextDecoder('utf-8', { fatal: false }).decode(arr)
}

function isDataUri(s: string): boolean {
  return s.startsWith('data:')
}

function parseDataUri(dataUri: string): { contentType: string; content: string } | null {
  // data:<mediatype>[;param=value]*[;base64],<data>
  const commaIdx = dataUri.indexOf(',')
  if (commaIdx === -1) return null
  const header = dataUri.slice(5, commaIdx) // strip "data:"
  const parts = header.split(';')
  const contentType = parts[0] || 'text/plain'
  return { contentType, content: dataUri }
}

interface Arc20Json {
  p: string
  op: string
  tick: string
  max?: string
  lim?: string
  amt?: string
}

function strField(obj: Record<string, unknown>, key: string): string {
  const v = obj[key]
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'bigint') return String(v)
  return ''
}

function tryParseArc20(content: string): Arc20Json | null {
  try {
    const commaIdx = content.indexOf(',')
    if (commaIdx === -1) return null
    const data = content.slice(commaIdx + 1)
    const json = content.includes(';base64,')
      ? atob(data)
      : decodeURIComponent(data)
    const parsed: unknown = JSON.parse(json)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const obj = parsed as Record<string, unknown>
    if (obj['p'] !== 'arc-20') return null
    const p = strField(obj, 'p')
    const op = strField(obj, 'op')
    const tick = strField(obj, 'tick')
    if (!op || !tick) return null
    const max = obj['max'] !== undefined ? strField(obj, 'max') : undefined
    const lim = obj['lim'] !== undefined ? strField(obj, 'lim') : undefined
    const amt = obj['amt'] !== undefined ? strField(obj, 'amt') : undefined
    return { p, op, tick, max, lim, amt }
  } catch {
    return null
  }
}

// ─── State ───────────────────────────────────────────────────────────────────

let inscriptions: Inscription[] = []
let ownership: Map<string, string> = new Map()   // inscriptionId -> ownerAddress
let arc20Tokens: Map<string, Arc20Token> = new Map()
let arc20Balances: Map<string, Map<string, bigint>> = new Map() // tick -> (address -> balance)
let transferNotes: Map<string, { tick: string; amount: bigint; from: string }> = new Map() // inscriptionId -> pending transfer

let indexed = false
let indexing = false
let indexProgress = 0   // 0..100

const listeners: Array<() => void> = []

export function onIndexUpdate(fn: () => void) {
  listeners.push(fn)
  return () => { const i = listeners.indexOf(fn); if (i !== -1) listeners.splice(i, 1) }
}

function notify() {
  listeners.forEach((fn) => fn())
}

// ─── Transfer protocol ───────────────────────────────────────────────────────

function applyTransfer(newOwner: string, inscriptionId: string) {
  if (newOwner.toLowerCase() === DEAD_ADDRESS.toLowerCase()) {
    // burned
    ownership.set(inscriptionId, DEAD_ADDRESS)
    return
  }
  ownership.set(inscriptionId, newOwner.toLowerCase())
}

// ─── Process a single transaction ────────────────────────────────────────────

function processTx(
  txHash: string,
  from: string,
  to: string | null,
  calldata: Hex,
  blockNumber: number,
  txIndex: number,
  timestamp: number,
  txPosition: number,   // global sequential number counter
) {
  if (!calldata || calldata === '0x' || !to) return

  const raw = calldata.startsWith('0x') ? calldata.slice(2) : calldata
  const byteLen = raw.length / 2

  if (byteLen > MAX_INSCRIPTION_SIZE) return

  const text = hexToUtf8(calldata)

  // ── Transfer (32-byte inscription ID as calldata) ──
  if (byteLen === 32 || byteLen % 32 === 0) {
    // Could be a transfer of up to 64 inscription IDs
    const ids: string[] = []
    for (let i = 0; i < raw.length; i += 64) {
      ids.push('0x' + raw.slice(i, i + 64))
    }
    for (const id of ids) {
      if (ownership.has(id)) {
        const currentOwner = ownership.get(id)!
        if (currentOwner.toLowerCase() === from.toLowerCase()) {
          applyTransfer(to.toLowerCase(), id)

          // ARC-20 transfer note: if this inscription is a pending transfer note,
          // apply the token transfer
          const note = transferNotes.get(id)
          if (note && note.from.toLowerCase() === from.toLowerCase()) {
            const { tick, amount } = note
            // deduct from sender
            const senderMap: Map<string, bigint> = arc20Balances.get(tick) ?? new Map<string, bigint>()
            const senderBal = senderMap.get(note.from.toLowerCase()) ?? 0n
            senderMap.set(note.from.toLowerCase(), senderBal >= amount ? senderBal - amount : 0n)
            // credit recipient
            const recipBal = senderMap.get(to.toLowerCase()) ?? 0n
            senderMap.set(to.toLowerCase(), recipBal + amount)
            arc20Balances.set(tick, senderMap)
            transferNotes.delete(id)
          }
        }
      }
    }
    // If exactly 32 bytes but not an inscription ID, might be nothing — fall through
    if (ids.length > 0 && ownership.has(ids[0])) return
  }

  // ── Inscription (data URI in calldata) ──
  if (!isDataUri(text)) return

  const parsed = parseDataUri(text)
  if (!parsed) return

  // Determine first owner
  const toAddr = to.toLowerCase()
  const isMintAddress = toAddr === MINT_ADDRESS.toLowerCase()
  const firstOwner = isMintAddress ? from.toLowerCase() : toAddr

  // Register inscription
  const inscriptionId = txHash.toLowerCase()
  if (ownership.has(inscriptionId)) return  // duplicate (shouldn't happen with tx hash IDs)

  ownership.set(inscriptionId, firstOwner)

  const ins: Inscription = {
    id: inscriptionId,
    number: txPosition,
    owner: firstOwner,
    creator: firstOwner,
    contentType: parsed.contentType,
    content: parsed.content,
    size: byteLen,
    blockNumber,
    txIndex,
    timestamp,
    name: undefined,
    collectionId: undefined,
  }

  // Parse ARC-20 JSON
  const arc20 = tryParseArc20(text)
  if (arc20) {
    const op = arc20.op.toUpperCase()
    const tick = arc20.tick.toUpperCase()

    if (arc20.op === 'deploy' && tick && !arc20Tokens.has(tick)) {
      const token: Arc20Token = {
        tick,
        maxSupply: BigInt(arc20.max ?? '21000000000000'),
        minted: 0n,
        limit: BigInt(arc20.lim ?? '1000000'),
        deployer: firstOwner,
        deployBlock: blockNumber,
        deployTime: timestamp,
      }
      arc20Tokens.set(tick, token)
    } else if (arc20.op === 'mint' && tick && arc20Tokens.has(tick)) {
      const token = arc20Tokens.get(tick)!
      const amt = BigInt(arc20.amt ?? String(token.limit))
      const allowed = amt <= token.limit
      if (allowed && token.minted + amt <= token.maxSupply) {
        token.minted += amt
        const balMap: Map<string, bigint> = arc20Balances.get(tick) ?? new Map<string, bigint>()
        balMap.set(firstOwner, (balMap.get(firstOwner) ?? 0n) + amt)
        arc20Balances.set(tick, balMap)
      }
    } else if (arc20.op === 'transfer' && tick && arc20Tokens.has(tick)) {
      const amt = BigInt(arc20.amt ?? '0')
      // This inscription becomes a "transfer note" — it reserves the balance
      const balMap: Map<string, bigint> = arc20Balances.get(tick) ?? new Map<string, bigint>()
      const bal = balMap.get(firstOwner) ?? 0n
      if (bal >= amt && amt > 0n) {
        transferNotes.set(inscriptionId, { tick, amount: amt, from: firstOwner })
      }
    }

    ins.name = `${op} ${tick}`
  }

  inscriptions.push(ins)
}

// ─── Main indexer ─────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

async function fetchBlockWithRetry(b: bigint, retries = 3): Promise<Awaited<ReturnType<typeof viemClient.getBlock>>> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await viemClient.getBlock({ blockNumber: b, includeTransactions: true })
    } catch {
      if (attempt < retries - 1) await sleep(500 * (attempt + 1))
    }
  }
  throw new Error(`Failed to fetch block ${b} after ${retries} retries`)
}

export async function startIndexer(): Promise<void> {
  if (indexing || indexed) return
  indexing = true
  notify()

  try {
    const latestBlock = await viemClient.getBlockNumber()
    const fromBlock = latestBlock > BigInt(MAX_SCAN_BLOCKS)
      ? latestBlock - BigInt(MAX_SCAN_BLOCKS)
      : 0n

    const totalBlocks = Number(latestBlock - fromBlock) || 1
    const blockNums: bigint[] = []
    for (let b = fromBlock; b <= latestBlock; b++) blockNums.push(b)

    // Process blocks in small batches, process immediately (don't accumulate all in memory)
    let txPosition = 0
    let done = 0

    for (let i = 0; i < blockNums.length; i += BATCH_SIZE) {
      const batch = blockNums.slice(i, i + BATCH_SIZE)

      // Fetch batch in parallel, skip blocks that fail
      const results = await Promise.allSettled(
        batch.map((b) => fetchBlockWithRetry(b))
      )

      // Sort by block number and process in order
      const successful = results
        .map((r, j) => r.status === 'fulfilled' ? { b: batch[j], block: r.value } : null)
        .filter((x): x is { b: bigint; block: Awaited<ReturnType<typeof viemClient.getBlock>> } => x !== null)
        .sort((a, c) => (a.b < c.b ? -1 : 1))

      for (const { b, block } of successful) {
        const ts = Number(block.timestamp)
        for (let ti = 0; ti < block.transactions.length; ti++) {
          const tx = block.transactions[ti] as { hash: string; from: string; to: string | null; input: Hex }
          processTx(tx.hash, tx.from, tx.to, tx.input, Number(b), ti, ts, txPosition)
          txPosition++
        }
      }

      done += batch.length
      indexProgress = Math.round((done / totalBlocks) * 100)
      notify()

      // Delay between batches to avoid rate limiting
      if (i + BATCH_SIZE < blockNums.length) await sleep(BATCH_DELAY_MS)
    }

    indexed = true
    indexing = false
    indexProgress = 100
    notify()
    watchNewBlocks()
  } catch (err) {
    console.error('[indexer] error:', err)
    indexing = false
    // Retry after 5 seconds
    setTimeout(() => { startIndexer().catch(console.error) }, 5000)
    notify()
  }
}

function watchNewBlocks() {
  let lastBlock = 0n
  let txPosition = inscriptions.length

  const pollOnce = () => {
    viemClient.getBlockNumber().then((latest) => {
      if (lastBlock === 0n) { lastBlock = latest; scheduleNext(); return }
      if (latest <= lastBlock) { scheduleNext(); return }

      const fetchBlock = (b: bigint) => {
        viemClient.getBlock({ blockNumber: b, includeTransactions: true }).then((block) => {
          const ts = Number(block.timestamp)
          for (let ti = 0; ti < block.transactions.length; ti++) {
            const tx = block.transactions[ti] as {
              hash: string; from: string; to: string | null; input: Hex
            }
            processTx(tx.hash, tx.from, tx.to, tx.input, Number(b), ti, ts, txPosition)
            txPosition++
          }
          if (b < latest) {
            fetchBlock(b + 1n)
          } else {
            lastBlock = latest
            for (const ins of inscriptions) {
              ins.owner = ownership.get(ins.id) ?? ins.owner
            }
            notify()
            scheduleNext()
          }
        }).catch(() => scheduleNext())
      }
      fetchBlock(lastBlock + 1n)
    }).catch(() => scheduleNext())
  }

  const scheduleNext = () => { setTimeout(pollOnce, 3000) }
  scheduleNext()
}

// ─── Query API ───────────────────────────────────────────────────────────────

export function getInscriptions(): Inscription[] {
  // Sync owner from ownership map on every read
  return inscriptions.map((ins) => ({
    ...ins,
    owner: ownership.get(ins.id) ?? ins.owner,
  })).reverse()  // newest first
}

export function getInscription(id: string): Inscription | undefined {
  const ins = inscriptions.find((i) => i.id.toLowerCase() === id.toLowerCase())
  if (!ins) return undefined
  return { ...ins, owner: ownership.get(ins.id) ?? ins.owner }
}

export function getOwnerInscriptions(address: string): Inscription[] {
  return getInscriptions().filter(
    (ins) => ins.owner.toLowerCase() === address.toLowerCase()
  )
}

export function getArc20Tokens(): Arc20Token[] {
  return Array.from(arc20Tokens.values())
}

export function getArc20Balances(address: string): Arc20Balance[] {
  const result: Arc20Balance[] = []
  for (const [tick, balMap] of arc20Balances.entries()) {
    const bal = balMap.get(address.toLowerCase()) ?? 0n
    if (bal > 0n) result.push({ tick, balance: bal })
  }
  return result
}

export function getIndexProgress(): number { return indexProgress }
export function isIndexed(): boolean { return indexed }
export function isIndexing(): boolean { return indexing }

export function getTotalInscriptions(): number { return inscriptions.length }
