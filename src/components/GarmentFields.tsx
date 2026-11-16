import { CATEGORIES, FORMALITIES, SEASONS } from '../types'
import type { GarmentMetadata } from '../types'

interface GarmentFieldsProps {
  value: GarmentMetadata
  onChange: (patch: Partial<GarmentMetadata>) => void
}

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function GarmentFields({ value, onChange }: GarmentFieldsProps) {
  const toggleSeason = (season: string) => {
    const next = value.seasons.includes(season)
      ? value.seasons.filter((item) => item !== season)
      : [...value.seasons, season]
    onChange({ seasons: next })
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-medium text-ink-soft">
          Name
          <input className="input" value={value.name} onChange={(event) => onChange({ name: event.target.value })} placeholder="Linen shirt" />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-ink-soft">
          Category
          <select className="input" value={value.category} onChange={(event) => onChange({ category: event.target.value as GarmentMetadata['category'] })}>
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-ink-soft">
          Type
          <input className="input" value={value.type} onChange={(event) => onChange({ type: event.target.value })} placeholder="overshirt, sneakers, tote" />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-ink-soft">
          Formality
          <select className="input" value={value.formality} onChange={(event) => onChange({ formality: event.target.value as GarmentMetadata['formality'] })}>
            {FORMALITIES.map((formality) => (
              <option key={formality} value={formality}>{formality}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-ink-soft">
          Primary color
          <input className="input" value={value.primaryColor} onChange={(event) => onChange({ primaryColor: event.target.value })} placeholder="navy" />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-ink-soft">
          Secondary color
          <input className="input" value={value.secondaryColor ?? ''} onChange={(event) => onChange({ secondaryColor: event.target.value || undefined })} placeholder="optional" />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-ink-soft">
          Pattern
          <input className="input" value={value.pattern} onChange={(event) => onChange({ pattern: event.target.value })} placeholder="solid, striped, floral" />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-ink-soft">
          Style tags
          <input className="input" value={value.style.join(', ')} onChange={(event) => onChange({ style: splitList(event.target.value) })} placeholder="minimal, vintage, streetwear" />
        </label>
      </div>
      <div>
        <div className="mb-2 text-sm font-medium text-ink-soft">Seasons</div>
        <div className="flex flex-wrap gap-2">
          {SEASONS.map((season) => {
            const active = value.seasons.includes(season)
            return (
              <button
                key={season}
                type="button"
                onClick={() => toggleSeason(season)}
                className={`chip ${active ? 'border-accent bg-accent/10 text-accent-strong' : ''}`}
              >
                {season}
              </button>
            )
          })}
        </div>
      </div>
      <label className="grid gap-1.5 text-sm font-medium text-ink-soft">
        Description
        <textarea className="input min-h-24 resize-y" value={value.description} onChange={(event) => onChange({ description: event.target.value })} placeholder="Fit, fabric, condition, styling notes" />
      </label>
      <label className="grid gap-1.5 text-sm font-medium text-ink-soft">
        Tags
        <input className="input" value={value.tags.join(', ')} onChange={(event) => onChange({ tags: splitList(event.target.value) })} placeholder="workhorse, statement, gift" />
      </label>
    </div>
  )
}
