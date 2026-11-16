import type { BoundingBox } from '../types'

export function uid(): string {
  return crypto.randomUUID()
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result ?? '')
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read image'))
    reader.readAsDataURL(blob)
  })
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read image'))
    reader.readAsDataURL(blob)
  })
}

export function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Unable to decode image'))
    }
    image.src = url
  })
}

export async function prepareImageForAnalysis(blob: Blob, maxSize = 1600): Promise<Blob> {
  const image = await loadImage(blob)
  const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight))
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available')
  ctx.drawImage(image, 0, 0, width, height)
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error('Unable to compress image'))),
      'image/jpeg',
      0.86,
    )
  })
}

export async function prepareImageForStorage(blob: Blob, maxSize = 2048): Promise<Blob> {
  if (blob.size < 350_000 && blob.type.startsWith('image/')) {
    const image = await loadImage(blob)
    if (Math.max(image.naturalWidth, image.naturalHeight) <= maxSize) return blob
  }
  const image = await loadImage(blob)
  const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight))
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available')
  ctx.drawImage(image, 0, 0, width, height)
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error('Unable to prepare image'))),
      'image/jpeg',
      0.9,
    )
  })
}

export function normalizeBoundingBox(box: BoundingBox): BoundingBox {
  const clamp = (value: number) => Math.min(1, Math.max(0, value))
  let ymin = clamp(box.ymin)
  let xmin = clamp(box.xmin)
  let ymax = clamp(box.ymax)
  let xmax = clamp(box.xmax)
  if (ymin > ymax) [ymin, ymax] = [ymax, ymin]
  if (xmin > xmax) [xmin, xmax] = [xmax, xmin]
  const minSize = 0.01
  if (ymax - ymin < minSize) {
    const center = (ymin + ymax) / 2
    ymin = Math.max(0, center - minSize / 2)
    ymax = Math.min(1, center + minSize / 2)
  }
  if (xmax - xmin < minSize) {
    const center = (xmin + xmax) / 2
    xmin = Math.max(0, center - minSize / 2)
    xmax = Math.min(1, center + minSize / 2)
  }
  return { ymin, xmin, ymax, xmax }
}

export function boxToPixels(box: BoundingBox, width: number, height: number, paddingRatio = 0.04): { x: number; y: number; w: number; h: number } {
  const normalized = normalizeBoundingBox(box)
  const padX = (normalized.xmax - normalized.xmin) * paddingRatio
  const padY = (normalized.ymax - normalized.ymin) * paddingRatio
  const xmin = Math.max(0, normalized.xmin - padX)
  const xmax = Math.min(1, normalized.xmax + padX)
  const ymin = Math.max(0, normalized.ymin - padY)
  const ymax = Math.min(1, normalized.ymax + padY)
  return {
    x: Math.floor(xmin * width),
    y: Math.floor(ymin * height),
    w: Math.max(1, Math.ceil((xmax - xmin) * width)),
    h: Math.max(1, Math.ceil((ymax - ymin) * height)),
  }
}

export async function cropGarment(sourceBlob: Blob, box: BoundingBox): Promise<Blob> {
  const image = await loadImage(sourceBlob)
  const { x, y, w, h } = boxToPixels(box, image.naturalWidth, image.naturalHeight)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available')
  ctx.drawImage(image, x, y, w, h, 0, 0, w, h)
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error('Unable to crop image'))),
      'image/jpeg',
      0.92,
    )
  })
}

export function outfitSignature(itemIds: string[]): string {
  return [...itemIds].sort().join('|')
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
