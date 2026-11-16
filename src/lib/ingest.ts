export type IngestSource = 'upload' | 'paste' | 'drop'

type Listener = (files: File[], source: IngestSource) => void

let listener: Listener | null = null
let queued: { files: File[]; source: IngestSource } | null = null

export function subscribeIngest(next: Listener): () => void {
  listener = next
  if (queued && queued.files.length > 0) {
    const pending = queued
    queued = null
    next(pending.files, pending.source)
  }
  return () => {
    if (listener === next) listener = null
  }
}

export function ingestFiles(files: File[], source: IngestSource) {
  const unique = files.filter(Boolean)
  if (unique.length === 0) return
  if (listener) listener(unique, source)
  else queued = { files: unique, source }
}
