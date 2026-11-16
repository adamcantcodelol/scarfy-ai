import type { ReactNode } from 'react'
import { Heart, Menu, Plus, Settings2, Shirt, Sparkles, X } from 'lucide-react'
import { useState } from 'react'
import type { Page } from '../types'

interface LayoutProps {
  page: Page
  onNavigate: (page: Page) => void
  wardrobeCount: number
  savedCount: number
  apiKeyReady: boolean
  children: ReactNode
}

const navItems: { page: Page; label: string; icon: typeof Shirt }[] = [
  { page: { name: 'wardrobe' }, label: 'Wardrobe', icon: Shirt },
  { page: { name: 'add' }, label: 'Add clothes', icon: Plus },
  { page: { name: 'outfit' }, label: 'Outfit AI', icon: Sparkles },
  { page: { name: 'saved' }, label: 'Saved', icon: Heart },
  { page: { name: 'settings' }, label: 'Settings', icon: Settings2 },
]

export function Layout({ page, onNavigate, wardrobeCount, savedCount, apiKeyReady, children }: LayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const activeName = page.name === 'item' ? 'wardrobe' : page.name

  const go = (target: Page) => {
    setMobileOpen(false)
    onNavigate(target)
  }

  const badge = (name: Page['name']) => {
    if (name === 'wardrobe') return wardrobeCount
    if (name === 'saved') return savedCount
    return undefined
  }

  return (
    <div className="min-h-dvh bg-paper text-ink">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-card/80 px-5 py-7 backdrop-blur lg:flex">
        <button onClick={() => go({ name: 'wardrobe' })} className="mb-10 text-left">
          <div className="font-display text-3xl font-semibold tracking-tight">Scarfy</div>
          <div className="mt-1 text-xs font-medium uppercase tracking-[0.22em] text-muted">AI wardrobe</div>
        </button>
        <nav className="flex flex-1 flex-col gap-1.5">
          {navItems.map(({ page: target, label, icon: Icon }) => (
            <button
              key={label}
              onClick={() => go(target)}
              className={`nav-item ${activeName === target.name ? 'nav-item-active' : ''}`}
            >
              <Icon className="h-5 w-5" />
              <span className="flex-1 text-left">{label}</span>
              {badge(target.name) !== undefined && badge(target.name)! > 0 && (
                <span className="rounded-full bg-paper-deep px-2 py-0.5 text-xs text-ink-soft">{badge(target.name)}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="rounded-2xl border border-line bg-paper p-4 text-xs leading-relaxed text-ink-soft">
          <div className="mb-1 font-semibold text-ink">Private by design</div>
          Photos and wardrobe data stay in this browser. Only images you choose to analyze are sent to Gemini.
        </div>
        {!apiKeyReady && (
          <button onClick={() => go({ name: 'settings' })} className="mt-4 rounded-2xl border border-accent/30 bg-accent/10 p-3 text-left text-xs text-accent-strong">
            Add a Gemini API key to enable AI features.
          </button>
        )}
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-line bg-paper/85 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <button onClick={() => go({ name: 'wardrobe' })} className="text-left">
              <div className="font-display text-2xl font-semibold">Scarfy</div>
            </button>
            <div className="flex items-center gap-2">
              {!apiKeyReady && (
                <button onClick={() => go({ name: 'settings' })} className="chip border-accent/40 text-accent-strong">
                  AI key needed
                </button>
              )}
              <button onClick={() => setMobileOpen((value) => !value)} className="rounded-full border border-line bg-card p-2" aria-label="Menu">
                {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
              </button>
            </div>
          </div>
          {mobileOpen && (
            <nav className="border-t border-line bg-card px-4 py-3">
              <div className="grid gap-1.5">
                {navItems.map(({ page: target, label, icon: Icon }) => (
                  <button
                    key={label}
                    onClick={() => go(target)}
                    className={`nav-item ${activeName === target.name ? 'nav-item-active' : ''}`}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="flex-1 text-left">{label}</span>
                    {badge(target.name) !== undefined && badge(target.name)! > 0 && (
                      <span className="rounded-full bg-paper-deep px-2 py-0.5 text-xs text-ink-soft">{badge(target.name)}</span>
                    )}
                  </button>
                ))}
              </div>
            </nav>
          )}
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-12 lg:pt-10">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-card/90 backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5 px-2 py-2">
          {navItems.map(({ page: target, label, icon: Icon }) => (
            <button
              key={label}
              onClick={() => go(target)}
              className={`flex flex-col items-center gap-1 rounded-2xl px-1 py-2 text-[11px] font-semibold ${
                activeName === target.name ? 'text-accent-strong' : 'text-muted'
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="max-w-full truncate">{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}
