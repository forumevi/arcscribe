/**
 * ArcScribe Indexer — client-side / light-node version.
 *
 * Persistence strategy (localStorage cache):
 *  - On every notify() call we persist the full state to localStorage.
 *  - On startup we restore the saved state immediately so inscriptions
 *    appear at once, then continue scanning only the NEW blocks (from
 *    the last-seen block number onwards).
 *
 * This means old inscriptions (outside the last 300 blocks) are never
 * lost after the first full scan completes.
 */

import { createPublicClient, http, type Hex } from 'viem'
import { arc, arcTestnet } from 'viem/chains'
import type { Inscription, Arc20Token, Arc20Balance } from '../types'
import { TARGET_CHAIN_ID } from '../config'

// ─── Constants ───────────────────────────────────────────────────────────────

const MINT_ADDRESS = '0x0000000000000000000000000000000000004663'
const DEAD_ADDRESS = '0x000000000000000000000000000000000000dEaD'
const MAX_SCAN_BLOCKS = 300   // scan last N blocks on FIRST load (no cache)
const BATCH_SIZE = 5          // parallel block fetches per batch
const BATCH_DELAY_MS = 200    // ms between batches
const MAX_INSCRIPTION_SIZE = 90_000  // bytes
const CACHE_KEY = 'arcscribe_index_v2'

// ─── RPC client ──────────────────────────────────────────────────────────────

function getRpcUrl(): string {
  if (TARGET_CHAIN_ID !== arc.id) return 'https://rpc.testnet.arc.io'
  const host = typeof window !== 'undefined' ? window.location.hostname : ''
  const isLocal =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.endsWith('.arc.io') ||
    host.endsWith('.e2b.dev') ||
    host.endsWith('.preview.studio.arc.io')
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
    const json = content.includes(';base64,') ? atob(data) : decodeURIComponent(data)
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

// ─── Serialisation helpers for localStorage ──────────────────────────────────

interface CacheData {
  lastBlock: number
  inscriptions: Inscription[]
  ownership: [string, string][]
  arc20Tokens: [string, { tick: string; maxSupply: string; minted: string; limit: string; deployer: string; deployBlock: number; deployTime: number }][]
  arc20Balances: [string, [string, string][]][]
  transferNotes: [string, { tick: string; amount: string; from: string }][]
}

function saveCache(): void {
  try {
    const data: CacheData = {
      lastBlock: lastScannedBlock,
      inscriptions: inscriptions,
      ownership: Array.from(ownership.entries()),
      arc20Tokens: Array.from(arc20Tokens.entries()).map(([k, v]) => [
        k,
        { ...v, maxSupply: v.maxSupply.toString(), minted: v.minted.toString(), limit: v.limit.toString() },
      ]),
      arc20Balances: Array.from(arc20Balances.entries()).map(([tick, balMap]) => [
        tick,
        Array.from(balMap.entries()).map(([addr, bal]) => [addr, bal.toString()]),
      ]),
      transferNotes: Array.from(transferNotes.entries()).map(([id, note]) => [
        id,
        { tick: note.tick, amount: note.amount.toString(), from: note.from },
      ]),
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(data))
  } catch {
    // quota exceeded or private mode — ignore
  }
}

function loadCache(): boolean {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return false
    const data: CacheData = JSON.parse(raw)

    lastScannedBlock = data.lastBlock ?? 0

    inscriptions = data.inscriptions ?? []

    ownership = new Map(data.ownership ?? [])

    arc20Tokens = new Map(
      (data.arc20Tokens ?? []).map(([k, v]) => [
        k,
        { ...v, maxSupply: BigInt(v.maxSupply), minted: BigInt(v.minted), limit: BigInt(v.limit) },
      ]),
    )

    arc20Balances = new Map(
      (data.arc20Balances ?? []).map(([tick, entries]) => [
        tick,
        new Map(entries.map(([addr, bal]) => [addr, BigInt(bal)])),
      ]),
    )

    transferNotes = new Map(
      (data.transferNotes ?? []).map(([id, note]) => [
        id,
        { tick: note.tick, amount: BigInt(note.amount), from: note.from },
      ]),
    )

    return inscriptions.length > 0 || lastScannedBlock > 0
  } catch {
    return false
  }
}

// ─── State ───────────────────────────────────────────────────────────────────

let inscriptions: Inscription[] = []
let ownership: Map<string, string> = new Map()
let arc20Tokens: Map<string, Arc20Token> = new Map()
let arc20Balances: Map<string, Map<string, bigint>> = new Map()
let transferNotes: Map<string, { tick: string; amount: bigint; from: string }> = new Map()
let lastScannedBlock = 0   // highest block number we have fully processed

let indexed = false
let indexing = false
let indexProgress = 0

const listeners: Array<() => void> = []

export function onIndexUpdate(fn: () => void) {
  listeners.push(fn)
  return () => {
    const i = listeners.indexOf(fn)
    if (i !== -1) listeners.splice(i, 1)
  }
}

function notify(persist = true) {
  if (persist) saveCache()
  listeners.forEach((fn) => fn())
}

// ─── Transfer protocol ───────────────────────────────────────────────────────

function applyTransfer(newOwner: string, inscriptionId: string) {
  if (newOwner.toLowerCase() === DEAD_ADDRESS.toLowerCase()) {
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
  txPosition: number,
) {
  if (!calldata || calldata === '0x' || !to) return

  const raw = calldata.startsWith('0x') ? calldata.slice(2) : calldata
  const byteLen = raw.length / 2

  if (byteLen > MAX_INSCRIPTION_SIZE) return

  const text = hexToUtf8(calldata)

  // ── Transfer (32-byte inscription ID as calldata) ──
  if (byteLen === 32 || byteLen % 32 === 0) {
    const ids: string[] = []
    for (let i = 0; i < raw.length; i += 64) {
      ids.push('0x' + raw.slice(i, i + 64))
    }
    for (const id of ids) {
      if (ownership.has(id)) {
        const currentOwner = ownership.get(id)!
        if (currentOwner.toLowerCase() === from.toLowerCase()) {
          applyTransfer(to.toLowerCase(), id)

          const note = transferNotes.get(id)
          if (note && note.from.toLowerCase() === from.toLowerCase()) {
            const { tick, amount } = note
            const senderMap: Map<string, bigint> = arc20Balances.get(tick) ?? new Map<string, bigint>()
            const senderBal = senderMap.get(note.from.toLowerCase()) ?? 0n
            senderMap.set(note.from.toLowerCase(), senderBal >= amount ? senderBal - amount : 0n)
            const recipBal = senderMap.get(to.toLowerCase()) ?? 0n
            senderMap.set(to.toLowerCase(), recipBal + amount)
            arc20Balances.set(tick, senderMap)
            transferNotes.delete(id)
          }
        }
      }
    }
    if (ids.length > 0 && ownership.has(ids[0])) return
  }

  // ── Inscription (data URI in calldata) ──
  if (!isDataUri(text)) return

  const parsed = parseDataUri(text)
  if (!parsed) return

  const toAddr = to.toLowerCase()
  const isMintAddress = toAddr === MINT_ADDRESS.toLowerCase()
  const firstOwner = isMintAddress ? from.toLowerCase() : toAddr

  const inscriptionId = txHash.toLowerCase()
  if (ownership.has(inscriptionId)) return  // already indexed

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

async function fetchBlockWithRetry(
  b: bigint,
  retries = 3,
): Promise<Awaited<ReturnType<typeof viemClient.getBlock>>> {
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

  // ── Restore cache immediately ──────────────────────────────────────────────
  const hadCache = loadCache()
  if (hadCache) {
    // Fire listeners right away so UI shows cached data while we scan new blocks
    notify(false)
  }

  try {
    const latestBlock = await viemClient.getBlockNumber()

    // If we have cache: scan only from lastScannedBlock+1 to latest
    // If no cache:       scan last MAX_SCAN_BLOCKS blocks
    const fromBlock = hadCache
      ? BigInt(lastScannedBlock + 1)
      : latestBlock > BigInt(MAX_SCAN_BLOCKS)
        ? latestBlock - BigInt(MAX_SCAN_BLOCKS)
        : 0n

    const blockNums: bigint[] = []
    for (let b = fromBlock; b <= latestBlock; b++) blockNums.push(b)

    const totalBlocks = blockNums.length || 1
    let txPosition = inscriptions.length
    let done = 0

    // If nothing new to scan, mark done immediately
    if (blockNums.length === 0) {
      indexed = true
      indexing = false
      indexProgress = 100
      notify()
      watchNewBlocks()
      return
    }

    for (let i = 0; i < blockNums.length; i += BATCH_SIZE) {
      const batch = blockNums.slice(i, i + BATCH_SIZE)

      const results = await Promise.allSettled(
        batch.map((b) => fetchBlockWithRetry(b)),
      )

      const successful = results
        .map((r, j) =>
          r.status === 'fulfilled' ? { b: batch[j], block: r.value } : null,
        )
        .filter(
          (
            x,
          ): x is {
            b: bigint
            block: Awaited<ReturnType<typeof viemClient.getBlock>>
          } => x !== null,
        )
        .sort((a, c) => (a.b < c.b ? -1 : 1))

      for (const { b, block } of successful) {
        const ts = Number(block.timestamp)
        for (let ti = 0; ti < block.transactions.length; ti++) {
          const tx = block.transactions[ti] as {
            hash: string
            from: string
            to: string | null
            input: Hex
          }
          processTx(tx.hash, tx.from, tx.to, tx.input, Number(b), ti, ts, txPosition)
          txPosition++
        }
        // Track highest scanned block as we go
        if (Number(b) > lastScannedBlock) lastScannedBlock = Number(b)
      }

      done += batch.length
      indexProgress = hadCache
        ? 100  // incremental update — show 100% immediately
        : Math.round((done / totalBlocks) * 100)
      notify()

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
    setTimeout(() => {
      startIndexer().catch(console.error)
    }, 5000)
    notify(false)
  }
}

function watchNewBlocks() {
  let lastBlock = BigInt(lastScannedBlock)
  let txPosition = inscriptions.length

  const pollOnce = () => {
    viemClient
      .getBlockNumber()
      .then((latest) => {
        if (lastBlock === 0n) {
          lastBlock = latest
          scheduleNext()
          return
        }
        if (latest <= lastBlock) {
          scheduleNext()
          return
        }

        const fetchBlock = (b: bigint) => {
          viemClient
            .getBlock({ blockNumber: b, includeTransactions: true })
            .then((block) => {
              const ts = Number(block.timestamp)
              for (let ti = 0; ti < block.transactions.length; ti++) {
                const tx = block.transactions[ti] as {
                  hash: string
                  from: string
                  to: string | null
                  input: Hex
                }
                processTx(tx.hash, tx.from, tx.to, tx.input, Number(b), ti, ts, txPosition)
                txPosition++
              }
              if (Number(b) > lastScannedBlock) lastScannedBlock = Number(b)
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
            })
            .catch(() => scheduleNext())
        }
        fetchBlock(lastBlock + 1n)
      })
      .catch(() => scheduleNext())
  }

  const scheduleNext = () => {
    setTimeout(pollOnce, 3000)
  }
  scheduleNext()
}

// ─── Query API ───────────────────────────────────────────────────────────────

export function getInscriptions(): Inscription[] {
  return inscriptions
    .map((ins) => ({
      ...ins,
      owner: ownership.get(ins.id) ?? ins.owner,
    }))
    .reverse()
}

export function getInscription(id: string): Inscription | undefined {
  const ins = inscriptions.find((i) => i.id.toLowerCase() === id.toLowerCase())
  if (!ins) return undefined
  return { ...ins, owner: ownership.get(ins.id) ?? ins.owner }
}

export function getOwnerInscriptions(address: string): Inscription[] {
  return getInscriptions().filter(
    (ins) => ins.owner.toLowerCase() === address.toLowerCase(),
  )
}

export function getArc20Tokens(): Arc20Token[] {
  return Array.from(arc20Tokens.values())
}

/** All balances for a given wallet address */
export function getArc20Balances(address: string): Arc20Balance[] {
  const result: Arc20Balance[] = []
  for (const [tick, balMap] of arc20Balances.entries()) {
    const bal = balMap.get(address.toLowerCase()) ?? 0n
    if (bal > 0n) result.push({ tick, balance: bal })
  }
  return result
}

/** All holders of a specific token ticker, sorted by balance descending */
export function getArc20TokenHolders(tick: string): Arc20Balance[] {
  const balMap = arc20Balances.get(tick.toUpperCase())
  if (!balMap) return []
  return Array.from(balMap.entries())
    .map(([, balance]) => ({ tick: tick.toUpperCase(), balance }))
    .filter((b) => b.balance > 0n)
    .sort((a, b) => (b.balance > a.balance ? 1 : -1))
}

export function getIndexProgress(): number {
  return indexProgress
}
export function isIndexed(): boolean {
  return indexed
}
export function isIndexing(): boolean {
  return indexing
}
export function getTotalInscriptions(): number {
  return inscriptions.length
}

/** Clear the localStorage cache (for debugging) */
export function clearCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY)
  } catch {
    // ignore
  }
}
