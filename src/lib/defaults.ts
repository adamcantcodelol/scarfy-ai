import type { GarmentMetadata, Preferences, Settings } from '../types'
import { DEFAULT_MODEL } from '../types'

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
    apiKey: '',
    model: DEFAULT_MODEL,
    rememberKeyInSession: true,
    persistApiKey: false,
    updatedAt: Date.now(),
  }
}
