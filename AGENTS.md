# ArcScribe — Project Memory

## What is this?
ArcScribe is an onchain inscription protocol on Arc mainnet. Inspired by Bitcoin Ordinals / Ordihood.
- Inscriptions = content written into transaction calldata permanently.
- No IPFS, no servers, no smart contract needed for mint.
- ARC-20 = fungible token standard via JSON inscriptions (like BRC-20 on Bitcoin).
- Marketplace = escrow smart contract for buying/selling inscriptions.

## Deployed Contracts

| Contract | Network | Address | Deployer |
|---|---|---|---|
| InscriptionMarket | Arc Mainnet (5042) | 0xcF6128Cc99C3430e75f3A9fe1eC43f6574333985 | 0x95773C1f40B82DD8D0529471f6A6016fdfE990Aa |

## Environment Variables Needed
- `VITE_MARKET_ADDRESS` — InscriptionMarket contract address on Arc mainnet

## Arc Mainnet Facts
- Chain ID: 5042
- RPC: https://rpc.mainnet.arc.io
- Explorer: https://explorer.arc.io
- USDC: 0x3600000000000000000000000000000000000000 (6 decimals ERC-20, 18 decimals native gas)

## InscriptionMarket Constructor Args
```
usdcToken:     0x3600000000000000000000000000000000000000
_feeRecipient: <YOUR_WALLET_ADDRESS>
initialOwner:  <YOUR_WALLET_ADDRESS>
```

## Protocol Rules (from indexer)
- Inscription ID = transaction hash (bytes32)
- First owner = tx.to, unless tx.to == MINT_ADDRESS → then tx.from
- Transfer = send 32-byte inscription ID as calldata to new owner
- ARC-20 deploy: data:application/json,{"p":"arc-20","op":"deploy","tick":"...","max":"...","lim":"..."}
- ARC-20 mint:   data:application/json,{"p":"arc-20","op":"mint","tick":"...","amt":"..."}
- ARC-20 transfer: data:application/json,{"p":"arc-20","op":"transfer","tick":"...","amt":"..."} → send that inscription to recipient

## Hackathon Submission
- Arc Microgrants: https://dorahacks.io/hackathon/arc-microgrants/detail
- Deadline: October 14, 2026 23:59 ET
- Requirements: live Arc mainnet deploy + public repo + short description
