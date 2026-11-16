const IMAGE_EXTENSIONS = /\.(jpe?g|jfif|pjp|pjpeg|png|webp|gif|avif|bmp|heic|heif)$/i
const HEIC_EXTENSIONS = /\.(heic|heif)$/i

export const IMAGE_ACCEPT =
  'image/*,.jpg,.jpeg,.jfif,.pjp,.pjpeg,.png,.webp,.gif,.avif,.bmp,.heic,.heif'

export type ImageFileCheck = 'supported' | 'heic' | 'unsupported'

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

export function classifyImageFile(file: File): ImageFileCheck {
  const name = file.name || ''
  const type = (file.type || '').toLowerCase()
  if (type.includes('heic') || type.includes('heif') || HEIC_EXTENSIONS.test(name)) return 'heic'
  if (type.startsWith('image/')) return 'supported'
  if (!type && IMAGE_EXTENSIONS.test(name)) return 'supported'
  if (IMAGE_EXTENSIONS.test(name)) return 'supported'
  return 'unsupported'
}

export function heicUnsupportedMessage(fileName: string): string {
  return `${fileName || 'This HEIC image'} isn’t supported in this browser. Export or save it as JPG or PNG, then add it again.`
}

export function unsupportedFormatMessage(fileName: string): string {
  return `${fileName || 'That file'} isn’t a supported image. Use JPG, JPEG, JFIF, PNG, WebP, GIF, or AVIF. HEIC needs to be saved as JPG or PNG first.`
}

function looksLikeImageUrl(value: string): boolean {
  try {
    const url = new URL(value, window.location.href)
    if (!/^https?:$/.test(url.protocol)) return false
    if (IMAGE_EXTENSIONS.test(url.pathname)) return true
    return /\.(jpe?g|jfif|png|webp|gif|avif|bmp)(\?|$)/i.test(url.href)
  } catch {
    return false
  }
}

function fileFromBlob(blob: Blob, name: string): File {
  const type = blob.type || 'application/octet-stream'
  const fileName = name || (type.includes('png') ? 'pasted.png' : type.includes('jpeg') ? 'pasted.jpg' : 'pasted-image')
  return new File([blob], fileName, { type, lastModified: Date.now() })
}

function corsFailureMessage(source: string): string {
  return `Couldn’t fetch the image${source ? ` from ${source}` : ''} because the site blocks browser access (CORS). On Google Images, right-click the image and choose “Copy image”, then paste again — don’t copy the link.`
}

async function fetchImageUrl(url: string): Promise<File> {
  let response: Response
  try {
    response = await fetch(url, { mode: 'cors' })
  } catch {
    throw new Error(corsFailureMessage(url))
  }
  if (!response.ok) throw new Error(corsFailureMessage(url))
  const blob = await response.blob()
  if (!blob.type.startsWith('image/') && !IMAGE_EXTENSIONS.test(url)) {
    throw new Error(corsFailureMessage(url))
  }
  const parts = url.split('?')[0].split('/')
  const name = parts[parts.length - 1] || 'linked-image'
  return fileFromBlob(blob, name)
}

function urlsFromHtml(html: string): string[] {
  const urls: string[] = []
  const imgSrc = [...html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)]
  for (const match of imgSrc) {
    if (match[1]) urls.push(match[1])
  }
  const contentUrl = [...html.matchAll(/content=["'](https?:\/\/[^"']+)["']/gi)]
  for (const match of contentUrl) {
    if (match[1] && looksLikeImageUrl(match[1])) urls.push(match[1])
  }
  return [...new Set(urls)]
}

async function readItemAsFile(item: DataTransferItem): Promise<File | undefined> {
  if (item.kind === 'file') {
    const file = item.getAsFile()
    return file ?? undefined
  }
  return undefined
}

export interface ExtractedImages {
  files: File[]
  warnings: string[]
}

async function collectFromUrlOrHtml(text: string, html: string): Promise<ExtractedImages> {
  const warnings: string[] = []
  const urls = [
    ...urlsFromHtml(html),
    ...text
      .split(/\s+/)
      .map((part) => part.trim())
      .filter((part) => looksLikeImageUrl(part)),
  ]
  const unique = [...new Set(urls)]
  const files: File[] = []
  for (const url of unique) {
    try {
      files.push(await fetchImageUrl(url))
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : corsFailureMessage(url))
    }
  }
  return { files, warnings }
}

export async function extractImagesFromDataTransfer(data: DataTransfer | null): Promise<ExtractedImages> {
  const files: File[] = []
  const warnings: string[] = []
  if (!data) return { files, warnings }

  if (data.files && data.files.length > 0) {
    files.push(...Array.from(data.files))
  }

  const items = Array.from(data.items ?? [])
  for (const item of items) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = await readItemAsFile(item)
      if (file && !files.some((existing) => existing.name === file.name && existing.size === file.size && existing.lastModified === file.lastModified)) {
        files.push(file)
      }
    }
  }

  if (files.length > 0) return { files, warnings }

  const html = data.getData('text/html') || ''
  const text = data.getData('text/uri-list') || data.getData('text/plain') || ''
  if (!html && !text) return { files, warnings }
  return collectFromUrlOrHtml(text, html)
}

export async function extractImagesFromClipboardEvent(event: ClipboardEvent): Promise<ExtractedImages> {
  return extractImagesFromDataTransfer(event.clipboardData)
}

export async function extractImagesFromClipboardRead(): Promise<ExtractedImages> {
  if (!navigator.clipboard || typeof navigator.clipboard.read !== 'function') {
    throw new Error('This browser can’t read the clipboard here. Use Ctrl+V after copying an image, or upload a file.')
  }
  let items: ClipboardItems
  try {
    items = await navigator.clipboard.read()
  } catch {
    throw new Error('Clipboard access was blocked. Use Ctrl+V to paste a copied image, or upload a file instead.')
  }
  const files: File[] = []
  const warnings: string[] = []
  for (const item of items) {
    const imageType = item.types.find((type) => type.startsWith('image/'))
    if (imageType) {
      const blob = await item.getType(imageType)
      files.push(fileFromBlob(blob, `pasted.${imageType.split('/')[1] || 'png'}`))
      continue
    }
    if (item.types.includes('text/html') || item.types.includes('text/plain')) {
      const html = item.types.includes('text/html') ? await (await item.getType('text/html')).text() : ''
      const text = item.types.includes('text/plain') ? await (await item.getType('text/plain')).text() : ''
      const extracted = await collectFromUrlOrHtml(text, html)
      files.push(...extracted.files)
      warnings.push(...extracted.warnings)
    }
  }
  if (files.length === 0 && warnings.length === 0) {
    throw new Error('No image was on the clipboard. On Google Images, right-click and choose “Copy image”, then try again.')
  }
  return { files, warnings }
}
