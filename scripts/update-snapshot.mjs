/**
 * ArcScribe snapshot updater — runs in GitHub Actions every hour.
 * Reads public/inscriptions.json, scans only NEW blocks, merges, saves.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SNAPSHOT_PATH = join(__dirname, '../public/inscriptions.json')
const RPC_URL = 'https://rpc.mainnet.arc.io'
const MINT_ADDRESS = '0x0000000000000000000000000000000000004663'
const BATCH_SIZE = 20
const BATCH_DELAY_MS = 150
const MAX_INSCRIPTION_SIZE = 90_000

// ── RPC helpers ───────────────────────────────────────────────────────────────

async function rpc(method, params, retries = 4) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error.message)
      return json.result
    } catch (e) {
      if (attempt === retries - 1) throw e
      await sleep(500 * (attempt + 1))
    }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function hexToUtf8(hex) {
  const bytes = hex.startsWith('0x') ? hex.slice(2) : hex
  if (!bytes) return ''
  const arr = new Uint8Array(bytes.match(/.{1,2}/g).map((b) => parseInt(b, 16)))
  return new TextDecoder('utf-8', { fatal: false }).decode(arr)
}

function tryParseArc20(content) {
  try {
    const commaIdx = content.indexOf(',')
    if (commaIdx === -1) return null
    const data = content.slice(commaIdx + 1)
    const raw = content.includes(';base64,') ? Buffer.from(data, 'base64').toString('utf8') : decodeURIComponent(data)
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    if (parsed.p !== 'arc-20') return null
    return {
      p: parsed.p,
      op: String(parsed.op || ''),
      tick: String(parsed.tick || ''),
      max: parsed.max !== undefined ? String(parsed.max) : undefined,
      lim: parsed.lim !== undefined ? String(parsed.lim) : undefined,
      amt: parsed.amt !== undefined ? String(parsed.amt) : undefined,
    }
  } catch { return null }
}

// ── Load existing snapshot ────────────────────────────────────────────────────

let snapshot = {
  generatedAt: 0,
  genesisBlock: 25618834,
  latestBlock: 25618834,
  inscriptions: [],
  arc20Tokens: {},
  arc20Balances: {},
}

if (existsSync(SNAPSHOT_PATH)) {
  try {
    snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'))
    console.log(`Loaded snapshot: ${snapshot.inscriptions.length} inscriptions, latest block ${snapshot.latestBlock}`)
  } catch (e) {
    console.warn('Could not parse existing snapshot, starting fresh:', e.message)
  }
}

// Rebuild in-memory state from snapshot
const ownership = new Map()
const arc20Tokens = new Map(
  Object.entries(snapshot.arc20Tokens).map(([k, v]) => [k, {
    tick: v.tick,
    maxSupply: BigInt(v.maxSupply),
    minted: BigInt(v.minted),
    limit: BigInt(v.limit),
    deployer: v.deployer,
    deployBlock: v.deployBlock,
    deployTime: v.deployTime,
  }])
)
const arc20Balances = new Map(
  Object.entries(snapshot.arc20Balances).map(([tick, holders]) => [
    tick,
    new Map(Object.entries(holders).map(([addr, bal]) => [addr, BigInt(bal)]))
  ])
)
for (const ins of snapshot.inscriptions) {
  ownership.set(ins.id, ins.owner)
}

// ── Scan new blocks ───────────────────────────────────────────────────────────

const latestHex = await rpc('eth_blockNumber', [])
const latestBlock = parseInt(latestHex, 16)
const fromBlock = snapshot.latestBlock + 1

console.log(`Scanning blocks ${fromBlock} → ${latestBlock} (${latestBlock - fromBlock + 1} blocks)`)

if (fromBlock > latestBlock) {
  console.log('No new blocks to scan.')
  process.exit(0)
}

let newCount = 0
const newInscriptions = []

for (let b = fromBlock; b <= latestBlock; b += BATCH_SIZE) {
  const end = Math.min(b + BATCH_SIZE - 1, latestBlock)
  const blockNums = Array.from({ length: end - b + 1 }, (_, i) => b + i)

  const results = await Promise.all(
    blockNums.map((n) =>
      rpc('eth_getBlockByNumber', [`0x${n.toString(16)}`, true]).catch(() => null)
    )
  )

  for (const block of results) {
    if (!block) continue
    const blockNumber = parseInt(block.number, 16)
    const timestamp = parseInt(block.timestamp, 16)

    for (let txIdx = 0; txIdx < block.transactions.length; txIdx++) {
      const tx = block.transactions[txIdx]
      if (!tx.input || tx.input === '0x') continue
      if (tx.to?.toLowerCase() !== MINT_ADDRESS.toLowerCase()) continue

      const content = hexToUtf8(tx.input)
      if (!content.startsWith('data:')) continue
      if (tx.input.length / 2 > MAX_INSCRIPTION_SIZE) continue

      const commaIdx = content.indexOf(',')
      if (commaIdx === -1) continue
      const header = content.slice(5, commaIdx)
      const parts = header.split(';')
      const contentType = parts[0] || 'text/plain'

      const ins = {
        id: tx.hash,
        number: snapshot.inscriptions.length + newInscriptions.length + 1,
        owner: tx.from.toLowerCase(),
        creator: tx.from.toLowerCase(),
        contentType,
        content,
        size: Math.floor(tx.input.length / 2),
        blockNumber,
        txIndex: txIdx,
        timestamp,
      }

      if (!ownership.has(ins.id)) {
        ownership.set(ins.id, ins.owner)
        newInscriptions.push(ins)
        newCount++

        // ARC-20 processing
        if (contentType === 'application/json') {
          const arc20 = tryParseArc20(content)
          if (arc20) {
            if (arc20.op === 'deploy' && arc20.max) {
              if (!arc20Tokens.has(arc20.tick)) {
                arc20Tokens.set(arc20.tick, {
                  tick: arc20.tick,
                  maxSupply: BigInt(arc20.max),
                  minted: 0n,
                  limit: arc20.lim ? BigInt(arc20.lim) : BigInt(arc20.max),
                  deployer: tx.from.toLowerCase(),
                  deployBlock: blockNumber,
                  deployTime: timestamp,
                })
              }
            } else if (arc20.op === 'mint' && arc20.amt) {
              const token = arc20Tokens.get(arc20.tick)
              if (token) {
                const amt = BigInt(arc20.amt)
                if (token.minted + amt <= token.maxSupply && amt <= token.limit) {
                  token.minted += amt
                  const holders = arc20Balances.get(arc20.tick) ?? new Map()
                  holders.set(tx.from.toLowerCase(), (holders.get(tx.from.toLowerCase()) ?? 0n) + amt)
                  arc20Balances.set(arc20.tick, holders)
                }
              }
            }
          }
        }
      }
    }
  }

  const pct = Math.round(((end - fromBlock + 1) / (latestBlock - fromBlock + 1)) * 100)
  process.stdout.write(`\r  ${pct}% — found ${newCount} new inscriptions`)

  if (b + BATCH_SIZE <= latestBlock) await sleep(BATCH_DELAY_MS)
}

console.log(`\nDone. ${newCount} new inscriptions found.`)

// ── Merge and save ────────────────────────────────────────────────────────────

const mergedInscriptions = [...snapshot.inscriptions, ...newInscriptions]

const arc20TokensOut = {}
for (const [tick, token] of arc20Tokens.entries()) {
  arc20TokensOut[tick] = {
    tick: token.tick,
    maxSupply: token.maxSupply.toString(),
    minted: token.minted.toString(),
    limit: token.limit.toString(),
    deployer: token.deployer,
    deployBlock: token.deployBlock,
    deployTime: token.deployTime,
  }
}

const arc20BalancesOut = {}
for (const [tick, holders] of arc20Balances.entries()) {
  arc20BalancesOut[tick] = {}
  for (const [addr, bal] of holders.entries()) {
    arc20BalancesOut[tick][addr] = bal.toString()
  }
}

const newSnapshot = {
  generatedAt: Math.floor(Date.now() / 1000),
  genesisBlock: snapshot.genesisBlock,
  latestBlock,
  inscriptions: mergedInscriptions,
  arc20Tokens: arc20TokensOut,
  arc20Balances: arc20BalancesOut,
}

writeFileSync(SNAPSHOT_PATH, JSON.stringify(newSnapshot, null, 2))
console.log(`Snapshot saved: ${mergedInscriptions.length} total inscriptions, block ${latestBlock}`)
