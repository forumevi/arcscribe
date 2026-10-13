# ArcScribe

**The first inscription protocol on Arc mainnet.**

Digital artifacts written permanently into transaction calldata. No IPFS. No servers. No smart contract. Just the chain.

Live at **[arc-scribe.netlify.app](https://arc-scribe.netlify.app)**

---

## What is ArcScribe?

ArcScribe brings the Ordinals/Inscriptions primitive to Arc — Circle's L2 where USDC is the native gas token. Every inscription is a `data:` URI encoded directly into a transaction's calldata, sent to a well-known mint address. The content lives on-chain forever, costs fractions of a cent to write, and requires zero backend infrastructure to read.

```
data:image/png;base64,...   →   0x0000...4663  (Arc mint address)
data:text/plain,...         →   0x0000...4663
data:application/json,...   →   0x0000...4663  (ARC-20 token ops)
```

---

## Features

| Feature | Description |
|---|---|
| **Inscribe** | Write images, SVGs, text, or ARC-20 JSON ops directly onto Arc mainnet |
| **Explore** | Browse all inscriptions ever written — full-chain indexed, cached locally |
| **ARC-20** | Fungible token protocol built entirely on inscriptions (deploy / mint / transfer) |
| **Market** | Buy and sell inscriptions with USDC — 2% fee, fully onchain |
| **Portfolio** | View your inscriptions and ARC-20 balances with early-adopter badges |

---

## ARC-20 Token Standard

ARC-20 is a fungible token protocol implemented as inscription calldata — no ERC-20 contract required.

**Deploy a token**
```json
{ "p": "arc-20", "op": "deploy", "tick": "ARCS", "max": "21000000000000", "lim": "1000000" }
```

**Mint tokens**
```json
{ "p": "arc-20", "op": "mint", "tick": "ARCS", "amt": "1000000" }
```

**Transfer tokens**
```json
{ "p": "arc-20", "op": "transfer", "tick": "ARCS", "amt": "500000" }
```

Inscribe the JSON as `data:application/json,<url-encoded-json>` to the Arc mint address. First come, first served until max supply is reached.

---

## How the Indexer Works

ArcScribe uses a two-layer indexing strategy to make inscriptions instantly available without a backend:

1. **Static snapshot** (`public/inscriptions.json`) — a pre-built snapshot of all historical inscriptions, served as a static file from the repo. Loaded instantly on page open with zero RPC calls.
2. **Live scan** — after the snapshot loads, only the blocks newer than the snapshot's `latestBlock` are scanned via the Arc RPC. This is typically a few dozen blocks, not thousands.
3. **localStorage cache** — newly scanned inscriptions are persisted to the browser, so page refreshes don't re-scan blocks already seen.
4. **GitHub Actions cron** — a workflow runs every hour, scans new blocks, updates the snapshot, and commits it back to the repo. Netlify auto-deploys on every commit.

---

## Architecture

```
Browser
├── /public/inscriptions.json   ← static snapshot (GitHub Actions updates hourly)
├── src/lib/indexer.ts          ← two-layer indexer (snapshot + live RPC scan)
├── src/components/
│   ├── ExploreTab.tsx          ← browse all inscriptions
│   ├── MintTab.tsx             ← inscribe files, text, ARC-20 ops
│   ├── MarketTab.tsx           ← buy/sell with USDC
│   ├── TokensTab.tsx           ← ARC-20 token list and mint
│   └── PortfolioTab.tsx        ← wallet's inscriptions and balances
└── contracts/
    └── InscriptionMarket.sol   ← USDC-based marketplace contract (Arc mainnet)
```

**Contract addresses (Arc mainnet)**

| Contract | Address |
|---|---|
| Inscription Market | `0xcF6128Cc99C3430e75f3A9fe1eC43f6574333985` |
| Arc Mint Address | `0x0000000000000000000000000000000000004663` |

---

## Stack

- **Chain:** Arc Mainnet (USDC as native gas)
- **Frontend:** React + TypeScript + Vite + Tailwind CSS
- **Wallet:** ConnectKit + wagmi + viem
- **Market contract:** Solidity, deployed via Circle SCP
- **Hosting:** Netlify (auto-deploy on push)
- **Snapshot automation:** GitHub Actions (hourly cron)

---

## Local Development

```bash
git clone https://github.com/forumevi/arcscribe
cd arcscribe
bun install
bun run dev
```

Add a `.env` file:
```
VITE_MARKET_ADDRESS=0xcF6128Cc99C3430e75f3A9fe1eC43f6574333985
```

---

## Snapshot Update (manual)

To update the inscription snapshot manually (outside of the hourly cron):

```bash
node scripts/update-snapshot.mjs
git add public/inscriptions.json
git commit -m "chore: update inscription snapshot"
git push
```

---

## License

MIT
