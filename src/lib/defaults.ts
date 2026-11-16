import type { GarmentMetadata, Preferences, Settings } from '../types'
import { DEFAULT_MODELS } from './providers'

export function emptyGarmentMetadata(): GarmentMetadata {
  return {
    name: '',
    category: 'top',
    type: '',
    primaryColor: '',
    secondaryColor: undefined,
    pattern: 'solid',
    style: [],
    seasons: ['all-season'],
    formality: 'casual',
    description: '',
    tags: [],
  }
}

export function defaultPreferences(): Preferences {
  return {
    preferredStyles: [],
    preferredColors: [],
    avoidedColors: [],
    notes: '',
    updatedAt: Date.now(),
  }
}

export function defaultSettings(): Settings {
  return {
    provider: 'gemini',
    apiKey: '',
    model: DEFAULT_MODELS.gemini,
    baseUrl: '',
    rememberKeyInSession: true,
    persistApiKey: false,
    updatedAt: Date.now(),
  }
}
