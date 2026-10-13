/**
 * ArcScribe Indexer — client-side / light-node version.
 *
 * Persistence strategy:
 *  1. On startup, fetch /inscriptions.json (static snapshot bundled in the
 *     repo) — this gives ALL historical inscriptions instantly, no RPC needed.
 *  2. Then scan only the blocks NEWER than the snapshot's latestBlock.
 *  3. After the live scan, continue watching for new blocks via polling.
 *  4. All state is also mirrored to localStorage so a page refresh doesn't
 *     lose the live-scan additions until the next snapshot update.
 */

import { createPublicClient, http, type Hex } from 'viem'
import { arc, arcTestnet } from 'viem/chains'
import type { Inscription, Arc20Token, Arc20Balance } from '../types'
import { TARGET_CHAIN_ID } from '../config'

// ─── Constants ───────────────────────────────────────────────────────────────

const MINT_ADDRESS = '0x0000000000000000000000000000000000004663'
const DEAD_ADDRESS = '0x000000000000000000000000000000000000dEaD'
const BATCH_SIZE = 5
const BATCH_DELAY_MS = 200
const MAX_INSCRIPTION_SIZE = 90_000  // bytes
const CACHE_KEY = 'arcscribe_index_v3'

// ─── RPC client ──────────────────────────────────────────────────────────────

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
  const commaIdx = dataUri.indexOf(',')
  if (commaIdx === -1) return null
  const header = dataUri.slice(5, commaIdx)
  const parts = header.split(';')
  const contentType = parts[0] || 'text/plain'
  return { contentType, content: dataUri }
}

interface Arc20Json {
  p: string; op: string; tick: string
  max?: string; lim?: string; amt?: string
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
    const json = content.includes(';base64,') ? atob(data) : decodeURIComponent(data)
    const parsed: unknown = JSON.parse(json)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const obj = parsed as Record<string, unknown>
    if (obj['p'] !== 'arc-20') return null
    const p = strField(obj, 'p'), op = strField(obj, 'op'), tick = strField(obj, 'tick')
    if (!op || !tick) return null
    return {
      p, op, tick,
      max: obj['max'] !== undefined ? strField(obj, 'max') : undefined,
      lim: obj['lim'] !== undefined ? strField(obj, 'lim') : undefined,
      amt: obj['amt'] !== undefined ? strField(obj, 'amt') : undefined,
    }
  } catch { return null }
}

// ─── State ───────────────────────────────────────────────────────────────────

let inscriptions: Inscription[] = []
let ownership: Map<string, string> = new Map()
let arc20Tokens: Map<string, Arc20Token> = new Map()
let arc20Balances: Map<string, Map<string, bigint>> = new Map()
let transferNotes: Map<string, { tick: string; amount: bigint; from: string }> = new Map()

let indexed = false
let indexing = false
let indexProgress = 0   // 0..100
// The latest block we have indexed up to (from snapshot or live scan)
let lastIndexedBlock = 0

const listeners: Array<() => void> = []

export function onIndexUpdate(fn: () => void) {
  listeners.push(fn)
  return () => { const i = listeners.indexOf(fn); if (i !== -1) listeners.splice(i, 1) }
}

function notify() { listeners.forEach((fn) => fn()) }

// ─── localStorage persistence ─────────────────────────────────────────────────

interface CacheEntry {
  inscriptions: Inscription[]
  ownership: [string, string][]
  arc20Tokens: [string, Arc20Token][]
  arc20Balances: [string, [string, string][]][]
  transferNotes: [string, { tick: string; amount: string; from: string }][]
  lastIndexedBlock: number
}

function saveCache() {
  try {
    const entry: CacheEntry = {
      inscriptions,
      ownership: Array.from(ownership.entries()),
      arc20Tokens: Array.from(arc20Tokens.entries()),
      arc20Balances: Array.from(arc20Balances.entries()).map(([k, v]) => [k, Array.from(v.entries()).map(([a, b]) => [a, b.toString()])]),
      transferNotes: Array.from(transferNotes.entries()).map(([k, v]) => [k, { ...v, amount: v.amount.toString() }]),
      lastIndexedBlock,
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry))
  } catch { /* quota exceeded */ }
}

function loadCache(): boolean {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return false
    const entry: CacheEntry = JSON.parse(raw)
    inscriptions = entry.inscriptions || []
    ownership = new Map(entry.ownership || [])
    arc20Tokens = new Map(entry.arc20Tokens || [])
    arc20Balances = new Map((entry.arc20Balances || []).map(([k, v]) => [k, new Map(v.map(([a, b]) => [a, BigInt(b)]))]))
    transferNotes = new Map((entry.transferNotes || []).map(([k, v]) => [k, { ...v, amount: BigInt(v.amount) }]))
    lastIndexedBlock = entry.lastIndexedBlock || 0
    return inscriptions.length > 0
  } catch { return false }
}

// ─── Snapshot loader ──────────────────────────────────────────────────────────

interface SnapshotInscription {
  id: string; number: number; owner: string; creator: string
  contentType: string; content: string; size: number
  blockNumber: number; txIndex: number; timestamp: number; name?: string
}

interface Snapshot {
  generatedAt: number
  genesisBlock: number
  latestBlock: number
  inscriptions: SnapshotInscription[]
  arc20Tokens: Record<string, { tick: string; maxSupply: string; minted: string; limit: string; deployer: string; deployBlock: number; deployTime: number }>
  arc20Balances: Record<string, Record<string, string>>
}

async function loadSnapshot(): Promise<number> {
  // Only available on mainnet
  if (TARGET_CHAIN_ID !== arc.id) return 0
  try {
    const res = await fetch('/inscriptions.json')
    if (!res.ok) return 0
    const snap: Snapshot = await res.json()

    // Only apply snapshot if it's newer than our cache
    if (snap.latestBlock <= lastIndexedBlock) return lastIndexedBlock

    // Merge snapshot into state (snapshot wins for its own blocks)
    for (const ins of snap.inscriptions) {
      if (!ownership.has(ins.id)) {
        inscriptions.push(ins as Inscription)
        ownership.set(ins.id, ins.owner)
      }
    }

    // ARC-20 tokens from snapshot
    for (const [tick, token] of Object.entries(snap.arc20Tokens)) {
      if (!arc20Tokens.has(tick)) {
        arc20Tokens.set(tick, {
          tick: token.tick,
          maxSupply: BigInt(token.maxSupply),
          minted: BigInt(token.minted),
          limit: BigInt(token.limit),
          deployer: token.deployer,
          deployBlock: token.deployBlock,
          deployTime: token.deployTime,
        })
      }
    }

    // ARC-20 balances from snapshot
    for (const [tick, balMap] of Object.entries(snap.arc20Balances)) {
      const existing = arc20Balances.get(tick) ?? new Map<string, bigint>()
      for (const [addr, bal] of Object.entries(balMap)) {
        if (!existing.has(addr)) existing.set(addr, BigInt(bal))
      }
      arc20Balances.set(tick, existing)
    }

    // Sort inscriptions by number
    inscriptions.sort((a, b) => a.number - b.number)
    lastIndexedBlock = snap.latestBlock
    notify()
    return snap.latestBlock
  } catch { return 0 }
}

// ─── Transfer protocol ───────────────────────────────────────────────────────

function applyTransfer(newOwner: string, inscriptionId: string) {
  if (newOwner.toLowerCase() === DEAD_ADDRESS.toLowerCase()) {
    ownership.set(inscriptionId, DEAD_ADDRESS); return
  }
  ownership.set(inscriptionId, newOwner.toLowerCase())
}

// ─── Process a single transaction ────────────────────────────────────────────

function processTx(
  txHash: string, from: string, to: string | null, calldata: Hex,
  blockNumber: number, txIndex: number, timestamp: number, txPosition: number,
) {
  if (!calldata || calldata === '0x' || !to) return

  const raw = calldata.startsWith('0x') ? calldata.slice(2) : calldata
  const byteLen = raw.length / 2
  if (byteLen > MAX_INSCRIPTION_SIZE) return

  const text = hexToUtf8(calldata)

  // ── Transfer (32-byte inscription ID) ──
  if (byteLen === 32 || byteLen % 32 === 0) {
    const ids: string[] = []
    for (let i = 0; i < raw.length; i += 64) ids.push('0x' + raw.slice(i, i + 64))
    for (const id of ids) {
      if (ownership.has(id)) {
        const currentOwner = ownership.get(id)!
        if (currentOwner.toLowerCase() === from.toLowerCase()) {
          applyTransfer(to.toLowerCase(), id)
          const note = transferNotes.get(id)
          if (note && note.from.toLowerCase() === from.toLowerCase()) {
            const { tick, amount } = note
            const senderMap = arc20Balances.get(tick) ?? new Map<string, bigint>()
            const senderBal = senderMap.get(note.from.toLowerCase()) ?? 0n
            senderMap.set(note.from.toLowerCase(), senderBal >= amount ? senderBal - amount : 0n)
            senderMap.set(to.toLowerCase(), (senderMap.get(to.toLowerCase()) ?? 0n) + amount)
            arc20Balances.set(tick, senderMap)
            transferNotes.delete(id)
          }
        }
      }
    }
    if (ids.length > 0 && ownership.has(ids[0])) return
  }

  // ── Inscription ──
  if (!isDataUri(text)) return
  const parsed = parseDataUri(text)
  if (!parsed) return

  const toAddr = to.toLowerCase()
  const isMintAddress = toAddr === MINT_ADDRESS.toLowerCase()
  const firstOwner = isMintAddress ? from.toLowerCase() : toAddr
  const inscriptionId = txHash.toLowerCase()
  if (ownership.has(inscriptionId)) return

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

  const arc20 = tryParseArc20(text)
  if (arc20) {
    const op = arc20.op.toUpperCase(), tick = arc20.tick.toUpperCase()
    if (arc20.op === 'deploy' && tick && !arc20Tokens.has(tick)) {
      arc20Tokens.set(tick, { tick, maxSupply: BigInt(arc20.max ?? '21000000000000'), minted: 0n, limit: BigInt(arc20.lim ?? '1000000'), deployer: firstOwner, deployBlock: blockNumber, deployTime: timestamp })
    } else if (arc20.op === 'mint' && tick && arc20Tokens.has(tick)) {
      const token = arc20Tokens.get(tick)!
      const amt = BigInt(arc20.amt ?? String(token.limit))
      if (amt <= token.limit && token.minted + amt <= token.maxSupply) {
        token.minted += amt
        const balMap = arc20Balances.get(tick) ?? new Map<string, bigint>()
        balMap.set(firstOwner, (balMap.get(firstOwner) ?? 0n) + amt)
        arc20Balances.set(tick, balMap)
      }
    } else if (arc20.op === 'transfer' && tick && arc20Tokens.has(tick)) {
      const amt = BigInt(arc20.amt ?? '0')
      const balMap = arc20Balances.get(tick) ?? new Map<string, bigint>()
      if ((balMap.get(firstOwner) ?? 0n) >= amt && amt > 0n)
        transferNotes.set(inscriptionId, { tick, amount: amt, from: firstOwner })
    }
    ins.name = `${op} ${tick}`
  }

  inscriptions.push(ins)
}

// ─── Main indexer ─────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

async function fetchBlockWithRetry(b: bigint, retries = 3): Promise<Awaited<ReturnType<typeof viemClient.getBlock>>> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try { return await viemClient.getBlock({ blockNumber: b, includeTransactions: true }) }
    catch { if (attempt < retries - 1) await sleep(500 * (attempt + 1)) }
  }
  throw new Error(`Failed to fetch block ${b}`)
}

export async function startIndexer(): Promise<void> {
  if (indexing || indexed) return
  indexing = true
  notify()

  try {
    // Step 1: Restore from localStorage cache
    const hadCache = loadCache()
    if (hadCache) notify()  // show cached inscriptions immediately

    // Step 2: Load static snapshot (if newer than cache)
    const snapshotBlock = await loadSnapshot()
    if (snapshotBlock > lastIndexedBlock) lastIndexedBlock = snapshotBlock

    // Step 3: Scan only blocks newer than snapshot/cache
    const latestBlock = await viemClient.getBlockNumber()

    const fromBlock = lastIndexedBlock > 0
      ? BigInt(lastIndexedBlock + 1)
      : latestBlock > 300n ? latestBlock - 300n : 0n  // fallback for testnet

    if (fromBlock <= latestBlock) {
      const totalBlocks = Number(latestBlock - fromBlock) + 1
      const blockNums: bigint[] = []
      for (let b = fromBlock; b <= latestBlock; b++) blockNums.push(b)

      let txPosition = inscriptions.length
      let done = 0

      for (let i = 0; i < blockNums.length; i += BATCH_SIZE) {
        const batch = blockNums.slice(i, i + BATCH_SIZE)
        const results = await Promise.allSettled(batch.map((b) => fetchBlockWithRetry(b)))

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
        lastIndexedBlock = Number(fromBlock) + done - 1
        notify()
        saveCache()

        if (i + BATCH_SIZE < blockNums.length) await sleep(BATCH_DELAY_MS)
      }
    }

    lastIndexedBlock = Number(latestBlock)
    indexed = true
    indexing = false
    indexProgress = 100
    saveCache()
    notify()
    watchNewBlocks()
  } catch (err) {
    console.error('[indexer] error:', err)
    indexing = false
    setTimeout(() => { startIndexer().catch(console.error) }, 5000)
    notify()
  }
}

function watchNewBlocks() {
  let txPosition = inscriptions.length

  const pollOnce = () => {
    viemClient.getBlockNumber().then((latest) => {
      if (latest <= BigInt(lastIndexedBlock)) { scheduleNext(); return }

      const fetchBlock = (b: bigint) => {
        viemClient.getBlock({ blockNumber: b, includeTransactions: true }).then((block) => {
          const ts = Number(block.timestamp)
          for (let ti = 0; ti < block.transactions.length; ti++) {
            const tx = block.transactions[ti] as { hash: string; from: string; to: string | null; input: Hex }
            processTx(tx.hash, tx.from, tx.to, tx.input, Number(b), ti, ts, txPosition)
            txPosition++
          }
          if (b < latest) {
            fetchBlock(b + 1n)
          } else {
            lastIndexedBlock = Number(latest)
            for (const ins of inscriptions) ins.owner = ownership.get(ins.id) ?? ins.owner
            saveCache()
            notify()
            scheduleNext()
          }
        }).catch(() => scheduleNext())
      }
      fetchBlock(BigInt(lastIndexedBlock + 1))
    }).catch(() => scheduleNext())
  }

  const scheduleNext = () => { setTimeout(pollOnce, 3000) }
  scheduleNext()
}

// ─── Query API ───────────────────────────────────────────────────────────────

export function getInscriptions(): Inscription[] {
  return inscriptions.map((ins) => ({ ...ins, owner: ownership.get(ins.id) ?? ins.owner })).reverse()
}

export function getInscription(id: string): Inscription | undefined {
  const ins = inscriptions.find((i) => i.id.toLowerCase() === id.toLowerCase())
  if (!ins) return undefined
  return { ...ins, owner: ownership.get(ins.id) ?? ins.owner }
}

export function getOwnerInscriptions(address: string): Inscription[] {
  return getInscriptions().filter((ins) => ins.owner.toLowerCase() === address.toLowerCase())
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

export function getArc20TokenHolders(tick: string): Array<{ address: string; balance: bigint }> {
  const balMap = arc20Balances.get(tick.toUpperCase())
  if (!balMap) return []
  return Array.from(balMap.entries())
    .filter(([, b]) => b > 0n)
    .map(([address, balance]) => ({ address, balance }))
    .sort((a, c) => (c.balance > a.balance ? 1 : -1))
}

export function getIndexProgress(): number { return indexProgress }
export function isIndexed(): boolean { return indexed }
export function isIndexing(): boolean { return indexing }
export function getTotalInscriptions(): number { return inscriptions.length }
