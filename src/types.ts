// ─── Core domain types ───────────────────────────────────────────────────────

export interface Inscription {
  id: string            // tx hash = inscription id (0x...)
  number: number        // sequential #0, #1, …
  owner: string         // current owner address
  creator: string       // first owner address
  contentType: string   // e.g. "image/png", "image/svg+xml", "text/plain", "application/json"
  content: string       // full data URI
  size: number          // calldata byte size
  blockNumber: number
  txIndex: number
  timestamp: number     // unix seconds
  name?: string         // optional name from metadata
  collectionId?: string // parent collection tx hash
}

export interface Listing {
  inscriptionId: string
  seller: string
  priceUsdc: bigint     // 6-decimal USDC units
  active: boolean
}

export interface Arc20Token {
  tick: string
  maxSupply: bigint
  minted: bigint
  limit: bigint         // per-mint limit
  deployer: string
  deployBlock: number
  deployTime: number
}

export interface Arc20Balance {
  tick: string
  balance: bigint
}

export type TabId = 'explore' | 'mint' | 'market' | 'portfolio' | 'tokens'
