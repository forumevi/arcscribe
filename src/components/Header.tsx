import { ConnectKitButton } from 'connectkit'
import { useAccount, useSwitchChain } from 'wagmi'
import { TARGET_CHAIN_ID } from '../config'
import type { TabId } from '../types'

interface HeaderProps {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
}

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'explore', label: 'Explore',   icon: '◎' },
  { id: 'mint',    label: 'Inscribe',  icon: '✦' },
  { id: 'market',  label: 'Market',    icon: '⇄' },
  { id: 'portfolio', label: 'Portfolio', icon: '▦' },
  { id: 'tokens',  label: 'ARC-20',   icon: '◈' },
]

export default function Header({ activeTab, onTabChange }: HeaderProps) {
  const { chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const wrongChain = chainId !== undefined && chainId !== TARGET_CHAIN_ID

  return (
    <header
      className="sticky top-0 z-40"
      style={{
        background: 'rgba(10,22,40,0.9)',
        backdropFilter: 'blur(24px) saturate(180%)',
        borderBottom: '1px solid var(--border)',
        boxShadow: '0 1px 0 rgba(172,198,233,0.06)',
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        {/* Logo */}
        <button
          onClick={() => onTabChange('explore')}
          className="flex items-center gap-2.5 shrink-0 group"
        >
          {/* Glyph mark */}
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105"
            style={{
              background: 'linear-gradient(135deg, var(--accent) 0%, #7bacd8 100%)',
              boxShadow: '0 0 16px rgba(172,198,233,0.35)',
            }}
          >
            <span className="display font-bold text-sm" style={{ color: '#0a1628' }}>#</span>
          </div>
          <div className="flex flex-col leading-none">
            <span className="display font-bold text-base tracking-tight" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>
              ArcScribe
            </span>
            <span className="text-[10px] font-medium tracking-widest uppercase" style={{ color: 'var(--subtle)' }}>
              Arc Mainnet
            </span>
          </div>
        </button>

        {/* Desktop tabs */}
        <nav className="hidden md:flex items-center gap-0.5 p-1 rounded-2xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}>
          {TABS.map((tab) => {
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className="relative px-4 py-2 rounded-xl text-sm font-medium transition-all duration-150 flex items-center gap-1.5"
                style={{
                  color: active ? 'var(--ink)' : 'var(--subtle)',
                  background: active ? 'rgba(255,255,255,0.10)' : 'transparent',
                  boxShadow: active ? 'inset 0 1px 0 rgba(255,255,255,0.08)' : 'none',
                }}
              >
                <span className="text-xs" style={{ color: active ? 'var(--accent)' : 'var(--subtle)', opacity: active ? 1 : 0.5 }}>
                  {tab.icon}
                </span>
                {tab.label}
                {active && (
                  <span
                    className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                    style={{ background: 'var(--accent)' }}
                  />
                )}
              </button>
            )
          })}
        </nav>

        {/* Right */}
        <div className="flex items-center gap-2 shrink-0">
          {wrongChain && (
            <button
              onClick={() => switchChain({ chainId: TARGET_CHAIN_ID })}
              className="text-xs px-3 py-1.5 rounded-xl font-semibold transition-all"
              style={{
                background: 'rgba(232,109,122,0.12)',
                color: 'var(--danger)',
                border: '1px solid rgba(232,109,122,0.25)',
              }}
            >
              Switch to Arc
            </button>
          )}
          <ConnectKitButton />
        </div>
      </div>

      {/* Mobile tab bar */}
      <div
        className="md:hidden flex gap-1 px-3 pb-2.5 overflow-x-auto"
        style={{ scrollbarWidth: 'none' }}
      >
        {TABS.map((tab) => {
          const active = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className="whitespace-nowrap px-3 py-1.5 rounded-xl text-sm font-medium transition-all shrink-0 flex items-center gap-1.5"
              style={{
                color: active ? 'var(--ink)' : 'var(--subtle)',
                background: active ? 'rgba(255,255,255,0.09)' : 'transparent',
                border: active ? '1px solid var(--border)' : '1px solid transparent',
              }}
            >
              <span className="text-xs" style={{ color: active ? 'var(--accent)' : 'inherit' }}>{tab.icon}</span>
              {tab.label}
            </button>
          )
        })}
      </div>
    </header>
  )
}
