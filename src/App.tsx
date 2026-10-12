import { useState, useEffect } from 'react'
import Header from './components/Header'
import ExploreTab from './components/ExploreTab'
import MintTab from './components/MintTab'
import MarketTab from './components/MarketTab'
import PortfolioTab from './components/PortfolioTab'
import TokensTab from './components/TokensTab'
import { startIndexer } from './lib/indexer'
import type { TabId } from './types'

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('explore')

  useEffect(() => {
    // Start the indexer once on mount
    startIndexer().catch(console.error)
  }, [])

  return (
    <div className="min-h-dvh" style={{ background: 'var(--bg-gradient)' }}>
      <Header activeTab={activeTab} onTabChange={setActiveTab} />

      <main>
        {activeTab === 'explore' && <ExploreTab />}
        {activeTab === 'mint' && <MintTab />}
        {activeTab === 'market' && <MarketTab />}
        {activeTab === 'portfolio' && <PortfolioTab />}
        {activeTab === 'tokens' && <TokensTab />}
      </main>
    </div>
  )
}
