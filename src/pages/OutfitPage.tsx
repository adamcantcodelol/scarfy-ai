import { useMemo, useState } from 'react'
import { AlertTriangle, Heart, Loader2, Save, Sparkles, Thermometer, Umbrella } from 'lucide-react'
import type { Outfit, WardrobeItem } from '../types'
import { OCCASIONS } from '../types'
import { useObjectUrl } from '../lib/hooks'

interface OutfitRequest {
  occasion: string
  weather?: string
  temperatureC?: number
  dressCode?: string
  notes?: string
}

interface OutfitPageProps {
  apiKeyReady: boolean
  wardrobe: WardrobeItem[]
  onOpenSettings: () => void
  onOpenAdd: () => void
  onGenerate: (request: OutfitRequest) => Promise<Outfit[]>
  savedOutfits: Outfit[]
  onSaveOutfit: (outfit: Outfit) => void
  onToggleFavorite: (outfit: Outfit) => void
}

function ItemThumb({ item, size = 'md' }: { item?: WardrobeItem; size?: 'sm' | 'md' }) {
  const url = useObjectUrl(item?.imageBlob)
  if (!item) return <div className={`image-frame ${size === 'sm' ? 'h-16 w-16' : 'h-24 w-20'} rounded-xl border border-line bg-paper-deep`} />
  return (
    <div className={`image-frame ${size === 'sm' ? 'h-16 w-16' : 'h-28 w-24'} shrink-0 rounded-xl border border-line`}>
      {url ? <img src={url} alt={item.name} /> : <div className="h-full bg-paper-deep" />}
    </div>
  )
}

export function OutfitCard({
  outfit,
  wardrobeById,
  isSaved,
  isFavorite,
  onSave,
  onFavorite,
  onDelete,
}: {
  outfit: Outfit
  wardrobeById: Map<string, WardrobeItem>
  isSaved: boolean
  isFavorite: boolean
  onSave: () => void
  onFavorite: () => void
  onDelete?: () => void
}) {
  const items = outfit.items.map((entry) => wardrobeById.get(entry.itemId)).filter((item): item is WardrobeItem => Boolean(item))
  const alternatives = outfit.alternativeItemIds
    .map((ids) => ids.map((id) => wardrobeById.get(id)).filter((item): item is WardrobeItem => Boolean(item)))
    .filter((ids) => ids.length > 0)

  return (
    <article className="card fade-up overflow-hidden">
      <div className="grid gap-5 p-5 lg:grid-cols-[1fr_1.2fr]">
        <div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">{outfit.occasion}</div>
              <h3 className="mt-1 font-display text-2xl font-semibold">{outfit.title}</h3>
            </div>
            {isFavorite && <Heart className="h-5 w-5 fill-danger text-danger" />}
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5 text-xs text-ink-soft">
            {outfit.weather && <span className="chip"><Umbrella className="h-3.5 w-3.5" /> {outfit.weather}</span>}
            {outfit.temperatureC !== undefined && <span className="chip"><Thermometer className="h-3.5 w-3.5" /> {outfit.temperatureC}°C</span>}
            {outfit.dressCode && <span className="chip">{outfit.dressCode}</span>}
          </div>
          <div className="mt-5 space-y-3 text-sm leading-relaxed text-ink-soft">
            {outfit.explanation && <p>{outfit.explanation}</p>}
            {outfit.whyItWorks && <p><span className="font-semibold text-ink">Why it works:</span> {outfit.whyItWorks}</p>}
            {outfit.occasionFit && <p><span className="font-semibold text-ink">Occasion fit:</span> {outfit.occasionFit}</p>}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button onClick={onSave} className={`btn ${isSaved ? 'btn-outline' : 'btn-primary'}`}>
              <Save className="h-4 w-4" /> {isSaved ? 'Saved' : 'Save outfit'}
            </button>
            <button onClick={onFavorite} className={`btn ${isFavorite ? 'btn-accent' : 'btn-outline'}`}>
              <Heart className={`h-4 w-4 ${isFavorite ? 'fill-white' : ''}`} /> {isFavorite ? 'Favorite' : 'Favorite'}
            </button>
            {onDelete && (
              <button onClick={onDelete} className="btn btn-ghost text-danger">
                Delete
              </button>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted">Pieces from your wardrobe</div>
            {items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-line p-4 text-sm text-muted">Some items are no longer in your wardrobe.</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {items.map((item) => (
                  <div key={item.id} className="w-24">
                    <ItemThumb item={item} />
                    <div className="mt-1 truncate text-center text-[11px] text-ink-soft">{item.name}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {alternatives.length > 0 && (
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted">Alternatives</div>
              <div className="space-y-3">
                {alternatives.map((altItems, index) => (
                  <div key={index} className="rounded-2xl border border-line bg-paper p-3">
                    <div className="mb-2 text-sm font-semibold">Alternative {index + 1}</div>
                    <div className="flex flex-wrap gap-2">
                      {altItems.map((item) => (
                        <ItemThumb key={item.id} item={item} size="sm" />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </article>
  )
}

export function OutfitPage({ apiKeyReady, wardrobe, onOpenSettings, onOpenAdd, onGenerate, savedOutfits, onSaveOutfit, onToggleFavorite }: OutfitPageProps) {
  const [occasion, setOccasion] = useState<string>('casual weekend')
  const [customOccasion, setCustomOccasion] = useState('')
  const [weather, setWeather] = useState('')
  const [temperatureC, setTemperatureC] = useState('')
  const [dressCode, setDressCode] = useState('infer')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState<Outfit[]>([])

  const wardrobeById = useMemo(() => new Map(wardrobe.map((item) => [item.id, item])), [wardrobe])
  const savedIds = useMemo(() => new Set(savedOutfits.map((outfit) => outfit.id)), [savedOutfits])
  const usableCount = wardrobe.filter((item) => !item.excluded).length
  const effectiveOccasion = occasion === 'custom' ? customOccasion.trim() : occasion

  const generate = async () => {
    setError('')
    if (!apiKeyReady) {
      setError('Add your API key in Settings to generate outfits.')
      onOpenSettings()
      return
    }
    if (!effectiveOccasion) {
      setError('Describe the occasion first.')
      return
    }
    if (usableCount === 0) {
      setError('Add at least one non-excluded wardrobe item first.')
      onOpenAdd()
      return
    }
    setLoading(true)
    try {
      const temp = temperatureC.trim() ? Number(temperatureC) : undefined
      const outfits = await onGenerate({
        occasion: effectiveOccasion,
        weather: weather || undefined,
        temperatureC: temp !== undefined && Number.isFinite(temp) ? temp : undefined,
        dressCode: dressCode === 'infer' ? undefined : dressCode,
        notes: notes.trim() || undefined,
      })
      setResults(outfits)
      if (outfits.length === 0) setError('The model did not return any usable outfits. Try a different model or add more wardrobe items.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Outfit generation failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">Style engine</div>
        <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight sm:text-5xl">Outfit AI</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Recommendations use only items already in your wardrobe. Excluded pieces are never suggested.
        </p>
      </div>

      {wardrobe.length === 0 ? (
        <div className="card flex flex-col items-center px-6 py-14 text-center">
          <Sparkles className="mb-4 h-8 w-8 text-accent" />
          <h2 className="font-display text-2xl font-semibold">Your wardrobe is empty</h2>
          <p className="mt-2 max-w-sm text-sm text-ink-soft">Add clothing photos first, then Scarfy can build outfits from real pieces you own.</p>
          <button onClick={onOpenAdd} className="btn btn-accent mt-6">Add clothes</button>
        </div>
      ) : (
        <>
          <div className="card grid gap-4 p-5 lg:grid-cols-[1.2fr_1fr_1fr]">
            <label className="grid gap-1.5 text-sm font-medium text-ink-soft">
              Occasion
              <select className="input" value={occasion} onChange={(event) => setOccasion(event.target.value)}>
                {OCCASIONS.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            {occasion === 'custom' && (
              <label className="grid gap-1.5 text-sm font-medium text-ink-soft lg:col-span-2">
                Custom occasion
                <input className="input" value={customOccasion} onChange={(event) => setCustomOccasion(event.target.value)} placeholder="gallery opening, outdoor wedding, airport day" />
              </label>
            )}
            <label className="grid gap-1.5 text-sm font-medium text-ink-soft">
              Weather
              <select className="input" value={weather} onChange={(event) => setWeather(event.target.value)}>
                <option value="">Auto / not specified</option>
                <option value="sunny">sunny</option>
                <option value="cloudy">cloudy</option>
                <option value="rain">rain</option>
                <option value="snow">snow</option>
                <option value="windy">windy</option>
                <option value="hot">hot</option>
                <option value="cold">cold</option>
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-ink-soft">
              Temperature °C
              <input className="input" type="number" value={temperatureC} onChange={(event) => setTemperatureC(event.target.value)} placeholder="optional" />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-ink-soft">
              Dress code
              <select className="input" value={dressCode} onChange={(event) => setDressCode(event.target.value)}>
                <option value="infer">Infer from occasion</option>
                <option value="casual">casual</option>
                <option value="smart casual">smart casual</option>
                <option value="business casual">business casual</option>
                <option value="formal">formal</option>
                <option value="black tie">black tie</option>
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-ink-soft lg:col-span-3">
              Notes for the stylist
              <textarea className="input min-h-20 resize-y" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="I need to walk a lot, avoid heels, prefer neutrals…" />
            </label>
            <div className="flex items-end lg:col-span-3">
              <button onClick={generate} disabled={loading} className="btn btn-accent w-full sm:w-auto">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Generate outfits
              </button>
            </div>
          </div>

          {usableCount < 3 && (
            <div className="card flex items-start gap-3 border-accent/30 bg-accent/10 p-4 text-sm text-ink">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <span>Only {usableCount} non-excluded item{usableCount === 1 ? '' : 's'} available. Add more clothing for better combinations.</span>
            </div>
          )}
          {error && <div className="card border-danger/30 bg-danger/10 p-4 text-sm text-danger">{error}</div>}

          <div className="space-y-5">
            {results.map((outfit) => (
              <OutfitCard
                key={outfit.id}
                outfit={outfit}
                wardrobeById={wardrobeById}
                isSaved={savedIds.has(outfit.id)}
                isFavorite={savedOutfits.find((saved) => saved.id === outfit.id)?.favorite ?? false}
                onSave={() => onSaveOutfit(outfit)}
                onFavorite={() => onToggleFavorite(outfit)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
