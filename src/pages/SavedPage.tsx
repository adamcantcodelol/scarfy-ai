import { useMemo, useState } from 'react'
import { Heart, Save } from 'lucide-react'
import type { Outfit, WardrobeItem } from '../types'
import { OutfitCard } from './OutfitPage'

interface SavedPageProps {
  outfits: Outfit[]
  wardrobe: WardrobeItem[]
  onToggleFavorite: (outfit: Outfit) => void
  onDeleteOutfit: (id: string) => void
  onOpenOutfitAI: () => void
}

export function SavedPage({ outfits, wardrobe, onToggleFavorite, onDeleteOutfit, onOpenOutfitAI }: SavedPageProps) {
  const [filter, setFilter] = useState<'all' | 'favorites'>('all')
  const wardrobeById = useMemo(() => new Map(wardrobe.map((item) => [item.id, item])), [wardrobe])
  const visible = filter === 'favorites' ? outfits.filter((outfit) => outfit.favorite) : outfits

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">Lookbook</div>
          <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight sm:text-5xl">Saved outfits</h1>
          <p className="mt-2 max-w-xl text-sm text-ink-soft">Keep the combinations you love and revisit them before you get dressed.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setFilter('all')} className={`btn ${filter === 'all' ? 'btn-primary' : 'btn-outline'}`}>All</button>
          <button onClick={() => setFilter('favorites')} className={`btn ${filter === 'favorites' ? 'btn-primary' : 'btn-outline'}`}>
            <Heart className="h-4 w-4" /> Favorites
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="card flex flex-col items-center px-6 py-16 text-center">
          <Save className="mb-4 h-8 w-8 text-muted" />
          <h2 className="font-display text-2xl font-semibold">{filter === 'favorites' ? 'No favorite outfits yet' : 'No saved outfits yet'}</h2>
          <p className="mt-2 max-w-sm text-sm text-ink-soft">Generate an outfit from your real wardrobe, then save the ones you want to keep.</p>
          <button onClick={onOpenOutfitAI} className="btn btn-accent mt-6">Open Outfit AI</button>
        </div>
      ) : (
        <div className="space-y-5">
          {visible.map((outfit) => (
            <OutfitCard
              key={outfit.id}
              outfit={outfit}
              wardrobeById={wardrobeById}
              isSaved
              isFavorite={outfit.favorite}
              onSave={() => {}}
              onFavorite={() => onToggleFavorite(outfit)}
              onDelete={() => onDeleteOutfit(outfit.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
