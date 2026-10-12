import { ConnectKitButton } from 'connectkit'

import type { TabId } from '../types'

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'explore',    label: 'Explore',   icon: '◈' },
  { id: 'mint',       label: 'Inscribe',  icon: '+' },
  { id: 'market',     label: 'Market',    icon: '⇄' },
  { id: 'portfolio',  label: 'Portfolio', icon: '▦' },
  { id: 'tokens',     label: 'ARC-20',    icon: '◆' },
]

interface HeaderProps {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
}

export default function Header({ activeTab, onTabChange }: HeaderProps) {
  return (
    <header
      className="sticky top-0 z-50 w-full"
      style={{
        background: 'rgba(255,255,255,0.82)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid var(--border)',
        boxShadow: '0 1px 0 rgba(17,24,39,0.05)',
      }}
    >
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        {/* Logo */}
        <button
          onClick={() => onTabChange('explore')}
          className="flex items-center gap-2.5 shrink-0 group"
        >
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-sm font-bold display transition-transform group-hover:scale-105"
            style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)' }}
          >
            #
          </div>
          <div className="hidden sm:block">
            <div className="text-sm font-bold display" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>
              ArcScribe
            </div>
            <div className="text-xs font-medium" style={{ color: 'var(--subtle)', letterSpacing: '0.08em' }}>
              ARC MAINNET
            </div>
          </div>
        </button>

        {/* Nav tabs */}
        <nav
          className="hidden md:flex items-center gap-1 px-1.5 py-1.5 rounded-2xl"
          style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}
        >
          {TABS.map((tab) => {
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className="relative flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-150"
                style={{
                  background: active
                    ? 'var(--surface-strong)'
                    : 'transparent',
                  color: active ? 'var(--ink)' : 'var(--muted)',
                  boxShadow: active ? '0 1px 4px rgba(17,24,39,0.10)' : 'none',
                }}
              >
                <span className="text-xs opacity-60">{tab.icon}</span>
                {tab.label}
                {active && (
                  <span
                    className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                    style={{ background: 'var(--accent-bright)' }}
                  />
                )}
              </button>
            )
          })}
        </nav>

        {/* Mobile nav */}
        <nav className="flex md:hidden items-center gap-1 px-1 py-1 rounded-xl" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
          {TABS.map((tab) => {
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={{
                  background: active ? 'var(--surface-strong)' : 'transparent',
                  color: active ? 'var(--ink)' : 'var(--muted)',
                }}
              >
                {tab.icon}
              </button>
            )
          })}
        </nav>

        {/* Connect button */}
        <ConnectKitButton />
      </div>
    </header>
  )
}
