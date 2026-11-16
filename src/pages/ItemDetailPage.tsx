import { useEffect, useState } from 'react'
import { Ban, ChevronLeft, Pencil, Save, Trash2 } from 'lucide-react'
import type { GarmentMetadata, WardrobeItem } from '../types'
import { GarmentFields } from '../components/GarmentFields'
import { useObjectUrl } from '../lib/hooks'

interface ItemDetailPageProps {
  item: WardrobeItem
  onBack: () => void
  onSave: (item: WardrobeItem) => void
  onDelete: (id: string) => void
}

export function ItemDetailPage({ item, onBack, onSave, onDelete }: ItemDetailPageProps) {
  const [draft, setDraft] = useState<WardrobeItem>(item)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const url = useObjectUrl(item.imageBlob)

  useEffect(() => {
    setDraft(item)
    setConfirmDelete(false)
  }, [item])

  const patch = (changes: Partial<GarmentMetadata>) => {
    setDraft((current) => ({ ...current, ...changes }))
  }

  const save = () => {
    onSave({ ...draft, updatedAt: Date.now() })
  }

  const toggleExcluded = () => {
    const next = { ...draft, excluded: !draft.excluded, updatedAt: Date.now() }
    setDraft(next)
    onSave(next)
  }

  const markWorn = () => {
    const next = {
      ...draft,
      timesWorn: (draft.timesWorn ?? 0) + 1,
      lastWornAt: Date.now(),
      updatedAt: Date.now(),
    }
    setDraft(next)
    onSave(next)
  }

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="btn btn-ghost -ml-3 px-3">
        <ChevronLeft className="h-4 w-4" /> Back to wardrobe
      </button>

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="card overflow-hidden">
          <div className="image-frame aspect-[4/5]">
            {url ? <img src={url} alt={draft.name} /> : <div className="h-full bg-paper-deep" />}
          </div>
          <div className="flex flex-wrap items-center gap-2 p-4 text-sm text-ink-soft">
            <span className="chip capitalize">{draft.category}</span>
            <span className="chip capitalize">{draft.formality}</span>
            {draft.seasons.map((season) => <span key={season} className="chip capitalize">{season}</span>)}
            {draft.excluded && <span className="chip border-danger/30 text-danger">excluded from AI</span>}
          </div>
        </div>

        <div className="card p-5 sm:p-6">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                <Pencil className="h-3.5 w-3.5" /> Item details
              </div>
              <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">{draft.name || 'Untitled piece'}</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={markWorn} className="btn btn-outline">Mark worn</button>
              <button onClick={toggleExcluded} className={`btn ${draft.excluded ? 'btn-accent' : 'btn-outline'}`}>
                <Ban className="h-4 w-4" /> {draft.excluded ? 'Included in AI' : 'Exclude from AI'}
              </button>
            </div>
          </div>

          <GarmentFields value={draft} onChange={patch} />

          <div className="mt-6 flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
            {confirmDelete ? (
              <div className="flex flex-1 items-center gap-3">
                <span className="text-sm text-danger">Delete this item permanently?</span>
                <button onClick={() => onDelete(item.id)} className="btn btn-accent bg-danger hover:bg-danger/90">Delete</button>
                <button onClick={() => setConfirmDelete(false)} className="btn btn-ghost">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="btn btn-ghost text-danger">
                <Trash2 className="h-4 w-4" /> Delete
              </button>
            )}
            <button onClick={save} className="btn btn-primary">
              <Save className="h-4 w-4" /> Save changes
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
