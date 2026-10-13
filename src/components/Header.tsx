import { ConnectKitButton, useModal } from 'connectkit'
import { useAccount, useDisconnect, useEnsName } from 'wagmi'
import { useState, useRef, useEffect } from 'react'
import type { TabId } from '../types'

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'explore',   label: 'Explore',   icon: '◈' },
  { id: 'mint',      label: 'Inscribe',  icon: '+' },
  { id: 'market',    label: 'Market',    icon: '⇄' },
  { id: 'portfolio', label: 'Portfolio', icon: '▦' },
  { id: 'tokens',    label: 'ARC-20',    icon: '◆' },
]

function WalletButton() {
  const { address, isConnected } = useAccount()
  const { disconnect } = useDisconnect()
  const { data: ens } = useEnsName({ address })
  const { openProfile } = useModal()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  if (!isConnected || !address) return <ConnectKitButton />

  const label = ens ?? `${address.slice(0, 6)}…${address.slice(-4)}`

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-all"
        style={{
          background: open ? 'var(--surface-muted)' : 'var(--surface-strong)',
          border: '1px solid var(--border)',
          color: 'var(--ink)',
          boxShadow: '0 1px 4px rgba(17,24,39,0.08)',
        }}
      >
        <span
          className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
          style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)' }}
        >
          {label.slice(0, 1).toUpperCase()}
        </span>
        <span className="hidden sm:inline">{label}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
          style={{ color: 'var(--subtle)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-48 rounded-2xl overflow-hidden"
          style={{
            background: 'var(--surface-strong)',
            border: '1px solid var(--border)',
            boxShadow: '0 8px 32px rgba(17,24,39,0.12)',
            zIndex: 100,
          }}
        >
          <button
            onClick={() => { setOpen(false); openProfile() }}
            className="w-full px-4 py-3 text-sm font-medium text-left hover:bg-[var(--surface-muted)]"
            style={{ color: 'var(--ink)' }}
          >
            View profile
          </button>
          <div style={{ height: 1, background: 'var(--border)' }} />
          <button
            onClick={() => { setOpen(false); disconnect() }}
            className="w-full px-4 py-3 text-sm font-medium text-left hover:bg-red-50"
            style={{ color: 'var(--danger)' }}
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  )
}

interface HeaderProps {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
}

export default function Header({ activeTab, onTabChange }: HeaderProps) {
  return (
    <header
      className="sticky top-0 z-50 w-full"
      style={{
        background: 'rgba(255,255,255,0.88)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid var(--border)',
        boxShadow: '0 1px 0 rgba(17,24,39,0.05)',
      }}
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-4 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-4">
        {/* Logo */}
        <button
          onClick={() => onTabChange('explore')}
          className="flex items-center gap-2 shrink-0 group"
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

        {/* Desktop nav */}
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
                  background: active ? 'var(--surface-strong)' : 'transparent',
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

        {/* Mobile nav — icon + label, scrollable */}
        <nav
          className="flex md:hidden items-center gap-0.5 px-1 py-1 rounded-2xl overflow-x-auto"
          style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', maxWidth: 'calc(100vw - 140px)' }}
        >
          {TABS.map((tab) => {
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap shrink-0"
                style={{
                  background: active ? 'var(--surface-strong)' : 'transparent',
                  color: active ? 'var(--ink)' : 'var(--muted)',
                  boxShadow: active ? '0 1px 4px rgba(17,24,39,0.10)' : 'none',
                }}
              >
                <span className="text-sm leading-none">{tab.icon}</span>
                <span style={{ fontSize: '10px' }}>{tab.label}</span>
              </button>
            )
          })}
        </nav>

        {/* Wallet button */}
        <WalletButton />
      </div>
    </header>
  )
}
