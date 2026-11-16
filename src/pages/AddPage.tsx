import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Check, ChevronLeft, ClipboardPaste, ImagePlus, Loader2, Plus, Save, Sparkles, Trash2, Upload, X } from 'lucide-react'
import type { DetectionBatch, DetectedGarment, GarmentMetadata, WardrobeItem } from '../types'
import { CATEGORIES, FORMALITIES } from '../types'
import { analyzeGarmentBatch } from '../lib/ai'
import type { AiConnection } from '../lib/providers'
import { cropGarment, loadImage, prepareImageForStorage, uid } from '../lib/image'
import { emptyGarmentMetadata } from '../lib/defaults'
import { deleteBatch, getAllBatches, putBatch } from '../lib/db'
import { GarmentFields } from '../components/GarmentFields'
import { useObjectUrl } from '../lib/hooks'
import { showToast } from '../lib/toasts'
import { subscribeIngest, type IngestSource } from '../lib/ingest'
import {
  IMAGE_ACCEPT,
  classifyImageFile,
  extractImagesFromClipboardRead,
  heicUnsupportedMessage,
  unsupportedFormatMessage,
} from '../lib/clipboard-images'

interface AddPageProps {
  connection: AiConnection
  onAddItems: (items: WardrobeItem[]) => Promise<void> | void
  onOpenSettings: () => void
  onApiUsage: () => void
}

const boxColors = ['#9a5b3c', '#66755b', '#3f5876', '#8a6d3b', '#7a4f68', '#4f6f73']

function DetectionOverlay({ batch }: { batch: DetectionBatch }) {
  const url = useObjectUrl(batch.sourceBlob)
  return (
    <div className="image-frame aspect-[4/5] rounded-2xl border border-line">
      {url && <img src={url} alt="Uploaded garments" />}
      {batch.garments
        .filter((garment) => garment.status !== 'rejected')
        .map((garment, index) => {
          const box = garment.boundingBox
          const color = boxColors[index % boxColors.length]
          return (
            <div
              key={garment.id}
              className="absolute rounded-md border-2"
              style={{
                left: `${box.xmin * 100}%`,
                top: `${box.ymin * 100}%`,
                width: `${Math.max(1, (box.xmax - box.xmin) * 100)}%`,
                height: `${Math.max(1, (box.ymax - box.ymin) * 100)}%`,
                borderColor: color,
                backgroundColor: `${color}14`,
              }}
            >
              <div className="absolute -top-6 left-0 max-w-full truncate rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-white" style={{ backgroundColor: color }}>
                {garment.name}
              </div>
            </div>
          )
        })}
    </div>
  )
}

function GarmentReviewCard({
  garment,
  index,
  onPatch,
  onToggle,
  onRemove,
}: {
  garment: DetectedGarment
  index: number
  onPatch: (patch: Partial<GarmentMetadata>) => void
  onToggle: (status: DetectedGarment['status']) => void
  onRemove: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const url = useObjectUrl(garment.imageBlob)
  const active = garment.status !== 'rejected'
  const approved = garment.status === 'approved'

  return (
    <div className={`card overflow-hidden transition-opacity ${active ? '' : 'opacity-50'}`}>
      <div className="grid gap-4 p-4 sm:grid-cols-[120px_1fr]">
        <div className="image-frame aspect-square rounded-xl border border-line">
          {url ? <img src={url} alt={garment.name} /> : <div className="flex h-full items-center justify-center text-xs text-muted">No crop</div>}
        </div>
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Detection {index + 1}</div>
              <input
                className="mt-1 w-full bg-transparent font-display text-xl font-semibold outline-none"
                value={garment.name}
                onChange={(event) => onPatch({ name: event.target.value })}
              />
            </div>
            <button onClick={onRemove} className="rounded-full p-2 text-muted hover:bg-paper-deep hover:text-danger" aria-label="Remove detection">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-ink-soft">
            <span className="chip capitalize">{garment.category}</span>
            <span className="chip capitalize">{garment.formality}</span>
            <span className="chip">{garment.primaryColor}</span>
            {garment.confidence !== undefined && <span className="chip">{Math.round(garment.confidence * 100)}% conf.</span>}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => onToggle(approved ? 'pending' : 'approved')} className={`btn ${approved ? 'btn-accent' : 'btn-outline'}`}>
              <Check className="h-4 w-4" /> {approved ? 'Approved' : 'Approve'}
            </button>
            <button onClick={() => onToggle(garment.status === 'rejected' ? 'pending' : 'rejected')} className={`btn ${garment.status === 'rejected' ? 'btn-outline opacity-60' : 'btn-ghost'}`}>
              <X className="h-4 w-4" /> {garment.status === 'rejected' ? 'Rejected' : 'Reject'}
            </button>
            <button onClick={() => setExpanded((value) => !value)} className="btn btn-ghost">
              {expanded ? 'Hide details' : 'Edit details'}
            </button>
          </div>
        </div>
      </div>
      {expanded && (
        <div className="border-t border-line bg-paper/60 p-4">
          <GarmentFields value={garment} onChange={onPatch} />
        </div>
      )}
    </div>
  )
}

export function AddPage({ connection, onAddItems, onOpenSettings, onApiUsage }: AddPageProps) {
  const [step, setStep] = useState<'upload' | 'review' | 'manual'>('upload')
  const [batches, setBatches] = useState<DetectionBatch[]>([])
  const [analyzing, setAnalyzing] = useState(false)
  const [progress, setProgress] = useState<{ current: number; total: number; name: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [manualFile, setManualFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const handleFilesRef = useRef<(files: File[], source?: IngestSource) => Promise<void>>(async () => {})
  const [manualDraft, setManualDraft] = useState<GarmentMetadata>(emptyGarmentMetadata())
  const [hydrated, setHydrated] = useState(false)

  const currentBatch = batches[0]
  const approvedCount = useMemo(() => currentBatch?.garments.filter((garment) => garment.status === 'approved').length ?? 0, [currentBatch])

  useEffect(() => {
    let cancelled = false
    getAllBatches()
      .then((stored) => {
        if (cancelled) return
        if (stored.length > 0) {
          setBatches(stored)
          setStep('review')
        }
        setHydrated(true)
      })
      .catch(() => {
        if (!cancelled) setHydrated(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!hydrated) return
    let cancelled = false
    async function syncBatches() {
      const stored = await getAllBatches()
      if (cancelled) return
      const ids = new Set(batches.map((batch) => batch.id))
      await Promise.all([
        ...batches.map((batch) => putBatch(batch)),
        ...stored.filter((batch) => !ids.has(batch.id)).map((batch) => deleteBatch(batch.id)),
      ])
    }
    void syncBatches().catch(() => {})
    return () => {
      cancelled = true
    }
  }, [batches, hydrated])

  const resetUpload = () => {
    setBatches([])
    setError('')
    setStep('upload')
  }

  const handleFiles = async (fileList: File[] | FileList | null, source: IngestSource = 'upload') => {
    const incoming = fileList ? Array.from(fileList) : []
    if (incoming.length === 0) return

    setError('')
    setNotice('')

    const selected: File[] = []
    const skipped: string[] = []
    for (const file of incoming) {
      const kind = classifyImageFile(file)
      if (kind === 'unsupported') {
        skipped.push(unsupportedFormatMessage(file.name))
        continue
      }
      if (kind === 'heic') {
        try {
          await loadImage(file)
          selected.push(file)
        } catch {
          skipped.push(heicUnsupportedMessage(file.name))
        }
        continue
      }
      try {
        await loadImage(file)
        selected.push(file)
      } catch {
        skipped.push(`${file.name || 'Image'}: this file couldn’t be decoded. Try a JPG or PNG.`)
      }
    }

    if (selected.length === 0) {
      const message = skipped.join(' · ') || 'Please choose image files only.'
      setError(message)
      showToast('error', message)
      return
    }
    if (!connection.apiKey) {
      const message = 'Add your API key in Settings before AI recognition.'
      setError(message)
      showToast('error', message)
      return
    }

    const verb = source === 'paste' ? 'Pasting' : source === 'drop' ? 'Dropping' : 'Uploading'
    setAnalyzing(true)
    setProgress({ current: 0, total: selected.length, name: selected[0]?.name || 'image' })
    showToast('info', `${verb} ${selected.length} image${selected.length === 1 ? '' : 's'}…`, 2500)
    const created: DetectionBatch[] = []
    const failures: string[] = [...skipped]

    for (const [index, file] of selected.entries()) {
      setProgress({ current: index + 1, total: selected.length, name: file.name || `image ${index + 1}` })
      try {
        const [batch, image] = await Promise.all([analyzeGarmentBatch(connection, file), loadImage(file)])
        onApiUsage()
        batch.sourceName = file.name || `pasted-image-${index + 1}`
        batch.sourceMimeType = file.type || batch.sourceMimeType
        batch.width = image.naturalWidth
        batch.height = image.naturalHeight
        for (const garment of batch.garments) {
          try {
            garment.imageBlob = await cropGarment(batch.sourceBlob, garment.boundingBox)
          } catch {
            garment.imageBlob = undefined
          }
        }
        created.push(batch)
      } catch (err) {
        failures.push(`${file.name || 'Image'}: ${err instanceof Error ? err.message : 'analysis failed'}`)
      }
    }

    setAnalyzing(false)
    setProgress(null)
    if (created.length > 0) {
      setBatches(created)
      setStep('review')
      const success = `Ready to review ${created.length} photo${created.length === 1 ? '' : 's'}.`
      setNotice(success)
      showToast('success', success)
      if (failures.length > 0) {
        const message = failures.join(' · ')
        setError(message)
        showToast('error', message, 10000)
      }
    } else {
      const message = failures.join(' · ') || 'No garments could be analyzed.'
      setError(message)
      showToast('error', message, 10000)
    }
  }

  handleFilesRef.current = handleFiles

  useEffect(() => subscribeIngest((files, source) => {
    void handleFilesRef.current(files, source)
  }), [])

  const openFilePicker = () => {
    const input = fileInputRef.current
    if (!input || analyzing) return
    input.value = ''
    input.click()
  }

  const onFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    // Copy files BEFORE resetting the input. In Chrome/Edge, FileList is live and
    // setting input.value = '' empties a held FileList reference, which made
    // uploads look like they did nothing after the file picker closed.
    const selected = event.target.files ? Array.from(event.target.files) : []
    event.target.value = ''
    void handleFiles(selected, 'upload')
  }

  const pasteFromClipboardButton = async () => {
    try {
      const { files, warnings } = await extractImagesFromClipboardRead()
      for (const warning of warnings) showToast('error', warning, 9000)
      if (files.length === 0) {
        if (warnings.length === 0) showToast('error', 'No image was on the clipboard. Right-click an image and choose “Copy image”, then try again.')
        return
      }
      void handleFiles(files, 'paste')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to read the clipboard.'
      setError(message)
      showToast('error', message)
    }
  }

  const patchGarment = (garmentId: string, patch: Partial<DetectedGarment>) => {
    setBatches((prev) =>
      prev.map((batch) =>
        batch.id === currentBatch?.id
          ? { ...batch, garments: batch.garments.map((garment) => (garment.id === garmentId ? { ...garment, ...patch } : garment)) }
          : batch,
      ),
    )
  }

  const setGarmentStatus = (garmentId: string, status: DetectedGarment['status']) => {
    patchGarment(garmentId, { status })
  }

  const removeGarment = (garmentId: string) => {
    setBatches((prev) =>
      prev.map((batch) =>
        batch.id === currentBatch?.id ? { ...batch, garments: batch.garments.filter((garment) => garment.id !== garmentId) } : batch,
      ),
    )
  }

  const approveAll = () => {
    setBatches((prev) =>
      prev.map((batch) =>
        batch.id === currentBatch?.id
          ? { ...batch, garments: batch.garments.map((garment) => (garment.status === 'rejected' ? garment : { ...garment, status: 'approved' })) }
          : batch,
      ),
    )
  }

  const saveApproved = async () => {
    if (!currentBatch) return
    const approved = currentBatch.garments.filter((garment) => garment.status === 'approved')
    if (approved.length === 0) {
      setError('Approve at least one detected garment before saving.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const items: WardrobeItem[] = []
      for (const garment of approved) {
        const imageBlob = garment.imageBlob ?? (await cropGarment(currentBatch.sourceBlob, garment.boundingBox))
        items.push({
          id: uid(),
          name: garment.name || 'Unnamed garment',
          category: garment.category,
          type: garment.type,
          primaryColor: garment.primaryColor || 'unknown',
          secondaryColor: garment.secondaryColor,
          pattern: garment.pattern,
          style: garment.style,
          seasons: garment.seasons,
          formality: garment.formality,
          description: garment.description,
          tags: garment.tags,
          imageBlob,
          imageMimeType: imageBlob.type || 'image/jpeg',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          excluded: false,
        })
      }
      await onAddItems(items)
      setNotice(`Saved ${items.length} item${items.length === 1 ? '' : 's'} to your wardrobe.`)
      setBatches((prev) => prev.slice(1))
      if (batches.length <= 1) {
        setStep('upload')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save garments')
    } finally {
      setSaving(false)
    }
  }

  const submitManual = async () => {
    if (!manualFile) {
      setError('Choose a photo for this clothing item.')
      return
    }
    if (!manualDraft.name.trim()) {
      setError('Name the clothing item before saving.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const imageBlob = await prepareImageForStorage(manualFile)
      const item: WardrobeItem = {
        id: uid(),
        ...manualDraft,
        name: manualDraft.name.trim(),
        imageBlob,
        imageMimeType: imageBlob.type || manualFile.type || 'image/jpeg',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        excluded: false,
      }
      await onAddItems([item])
      setManualFile(null)
      setManualDraft(emptyGarmentMetadata())
      setNotice('Item added to your wardrobe.')
      setStep('upload')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add item')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <input
        ref={fileInputRef}
        id="upload-file-input"
        data-testid="upload-input"
        type="file"
        accept={IMAGE_ACCEPT}
        multiple
        className="sr-only"
        onChange={onFileInputChange}
      />
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">Build your closet</div>
        <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight sm:text-5xl">Add clothes</h1>
      </div>

      {notice && <div className="card border-sage/30 bg-sage/10 p-4 text-sm text-ink">{notice}</div>}
      {error && (
        <div className="card border-danger/30 bg-danger/10 p-4 text-sm text-danger">
          <div>{error}</div>
          {error.includes('API key') && (
            <button type="button" className="btn btn-outline mt-3" onClick={onOpenSettings}>
              Open Settings
            </button>
          )}
        </div>
      )}
      {analyzing && (
        <div className="card border-accent/30 bg-accent/10 p-4 text-sm text-ink" role="status">
          <div className="flex items-center gap-2 font-semibold">
            <Loader2 className="h-4 w-4 animate-spin" /> Analyzing{progress ? ` ${progress.current} of ${progress.total}` : ' photo…'}
          </div>
          {progress && <div className="mt-1 text-ink-soft">{progress.name}</div>}
        </div>
      )}

      {step === 'upload' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card group flex min-h-80 flex-col items-center justify-center border-dashed p-8 text-center transition-colors hover:border-accent">
            <button type="button" onClick={openFilePicker} disabled={analyzing} className="flex w-full flex-col items-center">
              <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-paper-deep text-ink-soft transition-colors group-hover:bg-accent/10 group-hover:text-accent-strong">
                {analyzing ? <Loader2 className="h-7 w-7 animate-spin" /> : <Upload className="h-7 w-7" />}
              </div>
              <div className="font-display text-2xl font-semibold">{analyzing && progress ? `Analyzing ${progress.current} of ${progress.total}…` : analyzing ? 'Analyzing photo…' : 'Upload clothing photos'}</div>
            </button>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-ink-soft">
              Lay garments flat in one photo, or paste / drop images from Google or another tab. The AI finds each piece, then you crop-review and approve them locally.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <button type="button" onClick={openFilePicker} disabled={analyzing} className="btn btn-primary">
                <Upload className="h-4 w-4" /> Choose files
              </button>
              <button type="button" onClick={() => void pasteFromClipboardButton()} disabled={analyzing} className="btn btn-outline">
                <ClipboardPaste className="h-4 w-4" /> Paste image
              </button>
            </div>
            <p className="mt-3 max-w-sm text-xs leading-relaxed text-muted">
              Ctrl+V pastes a copied image. Drag and drop works too. If a pasted Google link fails, right-click the image and choose “Copy image” instead of copying the URL.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2 text-xs text-muted">
              <span className="chip">JPG / JPEG / JFIF / PNG / WebP / GIF / AVIF</span>
              <span className="chip">Batch detection</span>
              <span className="chip">Local cropping</span>
            </div>
          </div>

          <div className="card flex flex-col justify-between p-6">
            <div>
              <div className="flex items-center gap-2 font-display text-2xl font-semibold">
                <ImagePlus className="h-5 w-5 text-accent" /> Prefer control?
              </div>
              <p className="mt-3 text-sm leading-relaxed text-ink-soft">
                Add one item manually with your own photo and metadata. This does not use the AI provider.
              </p>
              <div className="mt-5 rounded-2xl border border-line bg-paper p-4 text-sm text-ink-soft">
                AI recognition sends the selected photo to the provider you chose in Settings. Wardrobe images and metadata remain in IndexedDB on this device.
              </div>
            </div>
            <button onClick={() => setStep('manual')} className="btn btn-outline mt-6 w-full">
              <Plus className="h-4 w-4" /> Add item manually
            </button>
          </div>
        </div>
      )}

      {step === 'review' && currentBatch && (
        <div className="space-y-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <button onClick={resetUpload} className="btn btn-ghost -ml-3 px-3">
                <ChevronLeft className="h-4 w-4" /> Cancel review
              </button>
              <h2 className="mt-2 font-display text-3xl font-semibold">Review detections</h2>
              <p className="mt-1 text-sm text-ink-soft">Approve, edit, or remove each garment before saving. Cropping already happened locally.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={approveAll} className="btn btn-outline">Approve all</button>
              <button onClick={saveApproved} disabled={saving || approvedCount === 0} className="btn btn-primary">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save {approvedCount} approved
              </button>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-3">
              <DetectionOverlay batch={currentBatch} />
              <div className="card p-4 text-sm text-ink-soft">
                <div className="font-semibold text-ink">{currentBatch.sourceName}</div>
                <div className="mt-1">{currentBatch.garments.length} detected · {approvedCount} approved</div>
              </div>
            </div>
            <div className="space-y-3">
              {currentBatch.garments.length === 0 && (
                <div className="card p-6 text-sm text-ink-soft">No garments were detected in this photo. Go back and try a clearer flat-lay image.</div>
              )}
              {currentBatch.garments.map((garment, index) => (
                <GarmentReviewCard
                  key={garment.id}
                  garment={garment}
                  index={index}
                  onPatch={(patch) => patchGarment(garment.id, patch)}
                  onToggle={(status) => setGarmentStatus(garment.id, status)}
                  onRemove={() => removeGarment(garment.id)}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {step === 'manual' && (
        <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="card p-5">
            <button onClick={() => setStep('upload')} className="btn btn-ghost -ml-3 px-3">
              <ChevronLeft className="h-4 w-4" /> Back
            </button>
            <h2 className="mt-3 font-display text-3xl font-semibold">Manual item</h2>
            <label className="image-frame mt-5 aspect-[4/5] cursor-pointer rounded-2xl border border-dashed border-line">
              <input
                type="file"
                accept={IMAGE_ACCEPT}
                data-testid="manual-input"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null
                  event.target.value = ''
                  setManualFile(file)
                }}
              />
              <div className="flex h-full flex-col items-center justify-center p-6 text-center">
                <ImagePlus className="mb-3 h-8 w-8 text-muted" />
                <div className="text-sm font-semibold">{manualFile ? manualFile.name : 'Choose clothing photo'}</div>
                <div className="mt-1 text-xs text-muted">Stored locally in IndexedDB</div>
              </div>
            </label>
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted">
              <span className="chip">{CATEGORIES.length} categories</span>
              <span className="chip">{FORMALITIES.length} formalities</span>
            </div>
          </div>
          <div className="card p-5 sm:p-6">
            <GarmentFields value={manualDraft} onChange={(patch) => setManualDraft((current) => ({ ...current, ...patch }))} />
            <div className="mt-6 flex justify-end">
              <button onClick={submitManual} disabled={saving} className="btn btn-primary">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Add to wardrobe
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
