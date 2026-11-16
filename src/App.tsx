import { useEffect, useMemo, useRef, useState } from 'react'
import type { Outfit, Page, Preferences, Settings, WardrobeItem } from './types'
import { DEFAULT_MODELS, connectionFromSettings, type ProviderId } from './lib/providers'
import {
  clearAllLocalData,
  deleteOutfit,
  deleteWardrobeItem,
  getAllOutfits,
  getAllWardrobe,
  getPreferences,
  getRecentOutfitSignatures,
  getSettings,
  getUsage,
  putOutfit,
  putPreferences,
  putRecentOutfitSignatures,
  putSettings,
  putUsage,
  putWardrobeItem,
} from './lib/db'
import { generateOutfits, generatedToOutfit, type GeneratedOutfit } from './lib/ai'
import { outfitSignature } from './lib/image'
import { defaultPreferences, defaultSettings } from './lib/defaults'
import { Layout } from './components/Layout'
import { WardrobePage } from './pages/WardrobePage'
import { AddPage } from './pages/AddPage'
import { ItemDetailPage } from './pages/ItemDetailPage'
import { OutfitPage } from './pages/OutfitPage'
import { SavedPage } from './pages/SavedPage'
import { SettingsPage } from './pages/SettingsPage'
import { ToastHost } from './components/ToastHost'
import { showToast } from './lib/toasts'
import { ingestFiles } from './lib/ingest'
import {
  extractImagesFromClipboardEvent,
  extractImagesFromDataTransfer,
  isEditableTarget,
} from './lib/clipboard-images'

const SESSION_KEY = 'scarfy.apiKey'
const PERSIST_KEY = 'scarfy.apiKey.persist'

interface UsageState {
  requests: number
  lastUsedAt?: number
  byKind?: Record<string, number>
}

export default function App() {
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState<Page>({ name: 'wardrobe' })
  const [wardrobe, setWardrobe] = useState<WardrobeItem[]>([])
  const [outfits, setOutfits] = useState<Outfit[]>([])
  const [preferences, setPreferences] = useState<Preferences>(defaultPreferences())
  const [settings, setSettings] = useState<Settings>(defaultSettings())
  const [recentSignatures, setRecentSignatures] = useState<string[]>([])
  const [usage, setUsage] = useState<UsageState>({ requests: 0 })
  const [loadError, setLoadError] = useState('')
  const usageRef = useRef<UsageState>({ requests: 0 })
  const [dragging, setDragging] = useState(false)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const dragDepthRef = useRef(0)

  useEffect(() => {
    usageRef.current = usage
  }, [usage])

  useEffect(() => {
    const hasDraggedImages = (transfer: DataTransfer | null) => {
      if (!transfer) return false
      const types = Array.from(transfer.types ?? [])
      return types.includes('Files') || types.includes('text/uri-list') || types.includes('text/html')
    }

    const onPaste = (event: ClipboardEvent) => {
      const items = Array.from(event.clipboardData?.items ?? [])
      const hasImage = items.some((item) => item.type.startsWith('image/') || (item.kind === 'file' && item.type.startsWith('image/')))
      const hasHtmlOrUrl = items.some((item) => item.type === 'text/html' || item.type === 'text/uri-list')
      if (isEditableTarget(event.target) && !hasImage) return
      void (async () => {
        const { files, warnings } = await extractImagesFromClipboardEvent(event)
        if (files.length === 0 && warnings.length === 0 && !hasImage && !hasHtmlOrUrl) return
        event.preventDefault()
        for (const warning of warnings) showToast('error', warning, 9000)
        if (files.length === 0) {
          if (warnings.length === 0 && (hasImage || hasHtmlOrUrl)) {
            showToast('error', 'No image could be read from the clipboard. Right-click and choose “Copy image”, then paste again.')
          }
          return
        }
        setPage({ name: 'add' })
        ingestFiles(files, 'paste')
      })()
    }

    const onDragEnter = (event: DragEvent) => {
      if (!hasDraggedImages(event.dataTransfer)) return
      event.preventDefault()
      dragDepthRef.current += 1
      setDragging(true)
    }
    const onDragOver = (event: DragEvent) => {
      if (!hasDraggedImages(event.dataTransfer)) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    }
    const onDragLeave = (event: DragEvent) => {
      if (!hasDraggedImages(event.dataTransfer) && dragDepthRef.current === 0) return
      event.preventDefault()
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
      if (dragDepthRef.current === 0) setDragging(false)
    }
    const onDrop = (event: DragEvent) => {
      event.preventDefault()
      dragDepthRef.current = 0
      setDragging(false)
      void (async () => {
        const { files, warnings } = await extractImagesFromDataTransfer(event.dataTransfer)
        for (const warning of warnings) showToast('error', warning, 9000)
        if (files.length === 0) {
          if (warnings.length === 0) showToast('error', 'No image was in that drop. Try dropping an image file, or use “Copy image” and paste.')
          return
        }
        setPage({ name: 'add' })
        ingestFiles(files, 'drop')
      })()
    }

    const onUpdateAvailable = () => setUpdateAvailable(true)

    window.addEventListener('paste', onPaste)
    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    window.addEventListener('scarfy:update-available', onUpdateAvailable as EventListener)
    return () => {
      window.removeEventListener('paste', onPaste)
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
      window.removeEventListener('scarfy:update-available', onUpdateAvailable as EventListener)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [items, savedOutfits, prefs, storedSettings, recent, storedUsage] = await Promise.all([
          getAllWardrobe(),
          getAllOutfits(),
          getPreferences(),
          getSettings(),
          getRecentOutfitSignatures(),
          getUsage(),
        ])
        if (cancelled) return
        setWardrobe(items)
        setOutfits(savedOutfits)
        if (prefs) setPreferences(prefs)
        const base = defaultSettings()
        const stored = storedSettings
        const provider: ProviderId = stored?.provider || 'gemini'
        const nextSettings: Settings = {
          ...base,
          ...(stored ?? {}),
          provider,
          model: stored?.model || DEFAULT_MODELS[provider] || DEFAULT_MODELS.gemini,
          baseUrl: stored?.baseUrl || '',
          apiKey: stored?.persistApiKey
            ? localStorage.getItem(PERSIST_KEY) ?? ''
            : stored?.rememberKeyInSession
              ? sessionStorage.getItem(SESSION_KEY) ?? ''
              : '',
        }
        setSettings(nextSettings)
        setRecentSignatures(recent)
        setUsage((storedUsage as UsageState | undefined) ?? { requests: 0 })
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Unable to load local data')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const noteUsage = async (kind: 'recognition' | 'outfit' | 'settings') => {
    const current = usageRef.current
    const next: UsageState = {
      requests: current.requests + 1,
      lastUsedAt: Date.now(),
      byKind: { ...(current.byKind ?? {}), [kind]: (current.byKind?.[kind] ?? 0) + 1 },
    }
    usageRef.current = next
    setUsage(next)
    void putUsage(next)
  }

  const saveSettings = (next: Settings) => {
    setSettings(next)
    if (!next.apiKey) {
      sessionStorage.removeItem(SESSION_KEY)
      localStorage.removeItem(PERSIST_KEY)
    } else if (next.persistApiKey) {
      localStorage.setItem(PERSIST_KEY, next.apiKey)
      sessionStorage.removeItem(SESSION_KEY)
    } else if (next.rememberKeyInSession) {
      sessionStorage.setItem(SESSION_KEY, next.apiKey)
      localStorage.removeItem(PERSIST_KEY)
    } else {
      sessionStorage.removeItem(SESSION_KEY)
      localStorage.removeItem(PERSIST_KEY)
    }
    void putSettings({
      provider: next.provider,
      model: next.model,
      baseUrl: next.baseUrl || '',
      rememberKeyInSession: next.rememberKeyInSession,
      persistApiKey: next.persistApiKey,
      updatedAt: next.updatedAt,
    })
  }

  const savePreferences = (next: Preferences) => {
    setPreferences(next)
    void putPreferences(next)
  }

  const addItems = async (items: WardrobeItem[]) => {
    for (const item of items) await putWardrobeItem(item)
    setWardrobe((current) => [...items, ...current].sort((a, b) => b.createdAt - a.createdAt))
  }

  const saveItem = (item: WardrobeItem) => {
    void putWardrobeItem(item)
    setWardrobe((current) => current.map((existing) => (existing.id === item.id ? item : existing)))
  }

  const removeItem = (id: string) => {
    void deleteWardrobeItem(id)
    setWardrobe((current) => current.filter((item) => item.id !== id))
    setPage({ name: 'wardrobe' })
  }

  const upsertOutfit = (outfit: Outfit) => {
    const signature = outfitSignature(outfit.items.map((item) => item.itemId))
    setOutfits((current) => {
      const duplicate = current.find((item) => item.id !== outfit.id && outfitSignature(item.items.map((entry) => entry.itemId)) === signature)
      if (duplicate) {
        const merged = { ...duplicate, favorite: duplicate.favorite || outfit.favorite }
        void putOutfit(merged)
        return current.map((item) => (item.id === duplicate.id ? merged : item))
      }
      const existing = current.find((item) => item.id === outfit.id)
      const merged = existing ? { ...outfit, favorite: outfit.favorite || existing.favorite } : outfit
      void putOutfit(merged)
      return [merged, ...current.filter((item) => item.id !== outfit.id)]
    })
  }

  const saveOutfit = (outfit: Outfit) => upsertOutfit({ ...outfit, favorite: outfit.favorite })

  const toggleFavoriteOutfit = (outfit: Outfit) => {
    const existing = outfits.find((item) => item.id === outfit.id)
    if (existing) {
      const next = { ...existing, favorite: !existing.favorite }
      void putOutfit(next)
      setOutfits((current) => current.map((item) => (item.id === outfit.id ? next : item)))
    } else {
      upsertOutfit({ ...outfit, favorite: true })
    }
  }

  const removeOutfit = (id: string) => {
    void deleteOutfit(id)
    setOutfits((current) => current.filter((outfit) => outfit.id !== id))
  }

  const handleGenerate = async (request: { occasion: string; weather?: string; temperatureC?: number; dressCode?: string; notes?: string }) => {
    if (!settings.apiKey) throw new Error('Add your API key in Settings first.')
    const prompt = JSON.stringify(request)
    let generated: GeneratedOutfit[]
    try {
      generated = await generateOutfits(connectionFromSettings(settings), wardrobe, preferences, request, recentSignatures)
    } finally {
      void noteUsage('outfit')
    }
    const seen = new Set<string>()
    const outfitsForDisplay = generated
      .map((item) => generatedToOutfit(item, prompt, request))
      .filter((outfit) => {
        const signature = outfitSignature(outfit.items.map((item) => item.itemId))
        if (seen.has(signature)) return false
        seen.add(signature)
        return true
      })
    const signatures = outfitsForDisplay.map((outfit) => outfitSignature(outfit.items.map((item) => item.itemId)))
    const nextRecent = [...recentSignatures, ...signatures].slice(-60)
    setRecentSignatures(nextRecent)
    void putRecentOutfitSignatures(nextRecent)
    return outfitsForDisplay
  }

  const clearEverything = async () => {
    await clearAllLocalData()
    sessionStorage.removeItem(SESSION_KEY)
    localStorage.removeItem(PERSIST_KEY)
    setWardrobe([])
    setOutfits([])
    setPreferences(defaultPreferences())
    setSettings(defaultSettings())
    setRecentSignatures([])
    setUsage({ requests: 0 })
    setPage({ name: 'wardrobe' })
  }

  const selectedItem = useMemo(() => {
    if (page.name !== 'item') return undefined
    return wardrobe.find((item) => item.id === page.itemId)
  }, [page, wardrobe])

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-paper">
        <div className="text-center">
          <div className="font-display text-4xl font-semibold">Scarfy</div>
          <div className="mt-2 text-sm text-muted">Opening your wardrobe…</div>
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-paper px-4">
        <div className="card max-w-md p-8 text-center">
          <h1 className="font-display text-3xl font-semibold">Local storage unavailable</h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">{loadError}. Scarfy needs IndexedDB to keep your wardrobe private on this device.</p>
          <button onClick={() => window.location.reload()} className="btn btn-primary mt-6">Try again</button>
        </div>
      </div>
    )
  }

  return (
    <>
    {updateAvailable && (
      <div className="update-banner">
        <div className="text-sm">A new version of Scarfy is ready.</div>
        <button type="button" className="btn btn-primary py-2" onClick={() => window.location.reload()}>Reload</button>
      </div>
    )}
    {dragging && (
      <div className="drop-overlay">
        <div className="drop-overlay-card">
          <div className="font-display text-3xl font-semibold">Drop images to add them</div>
          <p className="mt-2 text-sm text-ink-soft">Photos go to Add clothes and use the same recognition pipeline as uploads.</p>
        </div>
      </div>
    )}
    <ToastHost />
    <Layout
      page={page}
      onNavigate={setPage}
      wardrobeCount={wardrobe.length}
      savedCount={outfits.length}
      apiKeyReady={Boolean(settings.apiKey)}
    >
      {page.name === 'wardrobe' && <WardrobePage wardrobe={wardrobe} onOpenItem={(id) => setPage({ name: 'item', itemId: id })} onAdd={() => setPage({ name: 'add' })} />}
      {page.name === 'add' && (
        <AddPage
          connection={connectionFromSettings(settings)}
          onAddItems={addItems}
          onOpenSettings={() => setPage({ name: 'settings' })}
          onApiUsage={() => noteUsage('recognition')}
        />
      )}
      {page.name === 'item' && selectedItem && (
        <ItemDetailPage item={selectedItem} onBack={() => setPage({ name: 'wardrobe' })} onSave={saveItem} onDelete={removeItem} />
      )}
      {page.name === 'item' && !selectedItem && (
        <div className="card p-8 text-center">
          <p className="text-ink-soft">This item is no longer in your wardrobe.</p>
          <button onClick={() => setPage({ name: 'wardrobe' })} className="btn btn-primary mt-4">Back to wardrobe</button>
        </div>
      )}
      {page.name === 'outfit' && (
        <OutfitPage
          apiKeyReady={Boolean(settings.apiKey)}
          wardrobe={wardrobe}
          onOpenSettings={() => setPage({ name: 'settings' })}
          onOpenAdd={() => setPage({ name: 'add' })}
          onGenerate={handleGenerate}
          savedOutfits={outfits}
          onSaveOutfit={saveOutfit}
          onToggleFavorite={toggleFavoriteOutfit}
        />
      )}
      {page.name === 'saved' && (
        <SavedPage outfits={outfits} wardrobe={wardrobe} onToggleFavorite={toggleFavoriteOutfit} onDeleteOutfit={removeOutfit} onOpenOutfitAI={() => setPage({ name: 'outfit' })} />
      )}
      {page.name === 'settings' && (
        <SettingsPage
          settings={settings}
          preferences={preferences}
          usage={usage}
          wardrobeCount={wardrobe.length}
          outfitCount={outfits.length}
          onSaveSettings={saveSettings}
          onSavePreferences={savePreferences}
          onClearAllData={clearEverything}
          onApiUsage={() => noteUsage('settings')}
        />
      )}
    </Layout>
    </>
  )
}
