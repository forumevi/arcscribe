import { useState, useEffect } from 'react'
import Header from './components/Header'
import ExploreTab from './components/ExploreTab'
import MintTab from './components/MintTab'
import MarketTab from './components/MarketTab'
import PortfolioTab from './components/PortfolioTab'
import TokensTab from './components/TokensTab'
import { startIndexer } from './lib/indexer'
import type { TabId } from './types'

export interface MintPrefill {
  mode: 'json'
  op: 'mint'
  tick: string
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('explore')
  const [mintPrefill, setMintPrefill] = useState<MintPrefill | null>(null)

  useEffect(() => {
    startIndexer().catch(console.error)
  }, [])

  const handleMintToken = (tick: string) => {
    setMintPrefill({ mode: 'json', op: 'mint', tick })
    setActiveTab('mint')
  }

  return (
    <div className="min-h-dvh" style={{ background: 'var(--bg-gradient)' }}>
      <Header activeTab={activeTab} onTabChange={(tab) => {
        setActiveTab(tab)
        if (tab !== 'mint') setMintPrefill(null)
      }} />

      <main>
        {activeTab === 'explore' && <ExploreTab />}
        {activeTab === 'mint' && (
          <MintTab prefill={mintPrefill} onPrefillConsumed={() => setMintPrefill(null)} />
        )}
        {activeTab === 'market' && <MarketTab />}
        {activeTab === 'portfolio' && <PortfolioTab />}
        {activeTab === 'tokens' && <TokensTab onMintToken={handleMintToken} />}
      </main>
    </div>
  )
}
