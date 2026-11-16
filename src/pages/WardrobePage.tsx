import { useMemo, useState } from 'react'
import { Plus, Search, Shirt, SlidersHorizontal } from 'lucide-react'
import type { WardrobeItem } from '../types'
import { CATEGORIES, FORMALITIES } from '../types'
import { ItemCard } from '../components/ItemCard'

interface WardrobePageProps {
  wardrobe: WardrobeItem[]
  onOpenItem: (id: string) => void
  onAdd: () => void
}

export function WardrobePage({ wardrobe, onOpenItem, onAdd }: WardrobePageProps) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [formality, setFormality] = useState('all')
  const [season, setSeason] = useState('all')
  const [showExcluded, setShowExcluded] = useState(true)

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return wardrobe.filter((item) => {
      if (!showExcluded && item.excluded) return false
      if (category !== 'all' && item.category !== category) return false
      if (formality !== 'all' && item.formality !== formality) return false
      if (season !== 'all' && !item.seasons.includes(season) && !item.seasons.includes('all-season')) return false
      if (!normalized) return true
      const haystack = [item.name, item.type, item.primaryColor, item.secondaryColor, item.pattern, item.description, ...item.style, ...item.tags]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(normalized)
    })
  }, [wardrobe, query, category, formality, season, showExcluded])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">Your closet</div>
          <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight sm:text-5xl">Wardrobe</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-soft">
            {wardrobe.length === 0
              ? 'Upload a photo of your clothes and let Gemini find the pieces inside.'
              : `${wardrobe.length} item${wardrobe.length === 1 ? '' : 's'} cataloged locally in your browser.`}
          </p>
        </div>
        <button onClick={onAdd} className="btn btn-primary">
          <Plus className="h-4 w-4" /> Add clothes
        </button>
      </div>

      {wardrobe.length > 0 && (
        <div className="card grid gap-3 p-4 lg:grid-cols-[1.4fr_1fr_1fr_1fr_auto]">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input className="input pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search names, colors, tags" />
          </label>
          <select className="input" value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="all">All categories</option>
            {CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select className="input" value={formality} onChange={(event) => setFormality(event.target.value)}>
            <option value="all">All formalities</option>
            {FORMALITIES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select className="input" value={season} onChange={(event) => setSeason(event.target.value)}>
            <option value="all">All seasons</option>
            <option value="spring">spring</option>
            <option value="summer">summer</option>
            <option value="fall">fall</option>
            <option value="winter">winter</option>
            <option value="all-season">all-season</option>
          </select>
          <button onClick={() => setShowExcluded((value) => !value)} className={`btn btn-outline ${showExcluded ? '' : 'opacity-60'}`}>
            <SlidersHorizontal className="h-4 w-4" /> Excluded
          </button>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="card fade-up flex flex-col items-center px-6 py-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-paper-deep text-ink-soft">
            {wardrobe.length === 0 ? <Shirt className="h-6 w-6" /> : <Search className="h-6 w-6" />}
          </div>
          <h2 className="font-display text-2xl font-semibold">{wardrobe.length === 0 ? 'Start your digital wardrobe' : 'No matches found'}</h2>
          <p className="mt-2 max-w-sm text-sm text-ink-soft">
            {wardrobe.length === 0
              ? 'Photograph clothes laid flat, upload them here, and approve the pieces Gemini detects.'
              : 'Try a different search or clear a filter.'}
          </p>
          {wardrobe.length === 0 && (
            <button onClick={onAdd} className="btn btn-accent mt-6">
              <Plus className="h-4 w-4" /> Upload photos
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
          {filtered.map((item) => <ItemCard key={item.id} item={item} onClick={() => onOpenItem(item.id)} />)}
        </div>
      )}
    </div>
  )
}
