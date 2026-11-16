import type { ProviderId } from './lib/providers'

export type { ProviderId }

export type Category =
  | 'top'
  | 'bottom'
  | 'dress'
  | 'outerwear'
  | 'shoes'
  | 'accessory'
  | 'bag'
  | 'other'

export type Formality = 'casual' | 'smart-casual' | 'business-casual' | 'formal'

export interface BoundingBox {
  /** Normalized coordinates, 0-1, origin top-left. */
  ymin: number
  xmin: number
  ymax: number
  xmax: number
}

export interface GarmentMetadata {
  name: string
  category: Category
  type: string
  primaryColor: string
  secondaryColor?: string
  pattern: string
  style: string[]
  seasons: string[]
  formality: Formality
  description: string
  tags: string[]
}

export interface WardrobeItem extends GarmentMetadata {
  id: string
  imageBlob: Blob
  imageMimeType: string
  createdAt: number
  updatedAt: number
  lastWornAt?: number
  timesWorn?: number
  excluded: boolean
}

export interface DetectedGarment extends GarmentMetadata {
  id: string
  boundingBox: BoundingBox
  confidence?: number
  status: 'pending' | 'approved' | 'rejected'
  imageBlob?: Blob
}

export interface DetectionBatch {
  id: string
  sourceName: string
  sourceBlob: Blob
  sourceMimeType: string
  width: number
  height: number
  garments: DetectedGarment[]
  analyzedAt: number
}

export interface OutfitItem {
  itemId: string
  role: string
}

export interface Outfit {
  id: string
  title: string
  occasion: string
  weather?: string
  temperatureC?: number
  dressCode?: string
  explanation: string
  whyItWorks: string
  occasionFit: string
  items: OutfitItem[]
  alternativeItemIds: string[][]
  favorite: boolean
  createdAt: number
  prompt: string
}

export interface Preferences {
  preferredStyles: string[]
  preferredColors: string[]
  avoidedColors: string[]
  notes: string
  updatedAt: number
}

export interface Settings {
  provider: ProviderId
  apiKey: string
  model: string
  baseUrl?: string
  rememberKeyInSession: boolean
  persistApiKey: boolean
  updatedAt: number
}

export interface AppMeta {
  key: 'recentOutfitSignatures' | 'usage'
  value: unknown
  updatedAt: number
}

export type Page =
  | { name: 'wardrobe' }
  | { name: 'add' }
  | { name: 'review'; batchId: string }
  | { name: 'outfit' }
  | { name: 'saved' }
  | { name: 'settings' }
  | { name: 'item'; itemId: string }

export const CATEGORIES: Category[] = [
  'top',
  'bottom',
  'dress',
  'outerwear',
  'shoes',
  'accessory',
  'bag',
  'other',
]

export const FORMALITIES: Formality[] = [
  'casual',
  'smart-casual',
  'business-casual',
  'formal',
]

export const SEASONS = ['spring', 'summer', 'fall', 'winter', 'all-season'] as const
export const OCCASIONS = [
  'casual weekend',
  'school',
  'work',
  'job interview',
  'dinner',
  'formal event',
  'date night',
  'travel',
  'wedding guest',
  'custom',
] as const

export const DEFAULT_MODEL = 'gemini-3.8-flash'
export const MODEL_OPTIONS = [
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-pro-preview',
]
