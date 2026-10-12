/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arcTestnet, arc } from 'viem/chains'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(arcTestnet.id, arcTestnet.rpcUrls.default.http[0])
registerChain(arc.id, arc.rpcUrls.default.http[0])

export const config = createConfig({
  chains: [arc, arcTestnet, mainnet], // arc mainnet first; mainnet needed for ENS resolution
  connectors: [injected()],
  transports: {
    [arc.id]: http('https://rpc.mainnet.arc.io'),
    [arcTestnet.id]: http('https://rpc.testnet.arc.io'),
    [mainnet.id]: http(),
  },
})

// Arc mainnet chain ID
export const ARC_CHAIN_ID = arc.id       // 5042
export const ARC_TESTNET_CHAIN_ID = arcTestnet.id  // 5042002

// Default to mainnet for this app (microgrant submission)
export const TARGET_CHAIN_ID = ARC_CHAIN_ID

// Deployed contract addresses — Arc mainnet
export const INSCRIPTION_MARKET_ADDRESS = (
  import.meta.env.VITE_MARKET_ADDRESS ?? '0xcF6128Cc99C3430e75f3A9fe1eC43f6574333985'
) as `0x${string}`
