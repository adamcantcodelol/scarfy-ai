import type { WardrobeItem } from '../types'
import { useObjectUrl } from '../lib/hooks'

interface ItemCardProps {
  item: WardrobeItem
  onClick: () => void
}

export function ItemCard({ item, onClick }: ItemCardProps) {
  const url = useObjectUrl(item.imageBlob)
  return (
    <button onClick={onClick} className="card group overflow-hidden text-left transition-transform duration-200 hover:-translate-y-0.5">
      <div className="image-frame aspect-[4/5]">
        {url ? <img src={url} alt={item.name} loading="lazy" /> : <div className="h-full bg-paper-deep" />}
        {item.excluded && <div className="absolute left-3 top-3 rounded-full bg-ink/80 px-2.5 py-1 text-[11px] font-semibold text-white">Excluded</div>}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate font-display text-lg font-semibold">{item.name}</div>
            <div className="mt-0.5 text-sm capitalize text-ink-soft">{item.category} · {item.type}</div>
          </div>
          <div className="shrink-0 rounded-full bg-paper-deep px-2.5 py-1 text-[11px] font-semibold text-ink-soft">{item.formality}</div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="chip">{item.primaryColor}</span>
          {item.pattern && item.pattern !== 'solid' && <span className="chip">{item.pattern}</span>}
          {item.seasons.slice(0, 2).map((season) => <span key={season} className="chip capitalize">{season}</span>)}
        </div>
      </div>
    </button>
  )
}
