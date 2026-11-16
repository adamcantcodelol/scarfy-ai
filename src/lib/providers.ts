export type ProviderId = 'gemini' | 'groq' | 'openrouter' | 'openai' | 'custom'

export interface AiConnection {
  provider: ProviderId
  apiKey: string
  model: string
  baseUrl?: string
}

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  gemini: 'Gemini',
  groq: 'Groq',
  openrouter: 'OpenRouter',
  openai: 'OpenAI',
  custom: 'Custom (OpenAI-compatible)',
}

export const PROVIDER_ORDER: ProviderId[] = ['gemini', 'groq', 'openrouter', 'openai', 'custom']

export const DEFAULT_MODELS: Record<ProviderId, string> = {
  gemini: 'gemini-3.8-flash',
  // Official Groq vision model as of Nov 2026. llama-4-scout was shut down 2026-07-17.
  groq: 'qwen/qwen3.8-27b',
  // Free OpenRouter vision model: https://openrouter.ai/nvidia/nemotron-3.5-super-vl:free
  openrouter: 'nvidia/nemotron-3.5-super-vl:free',
  openai: 'gpt-4o-mini',
  custom: '',
}

export const MODEL_OPTIONS_BY_PROVIDER: Record<ProviderId, string[]> = {
  gemini: ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-pro-preview'],
  groq: ['qwen/qwen3.8-27b'],
  openrouter: ['nvidia/nemotron-3.5-super-vl:free', 'google/gemma-4-31b-it:free'],
  openai: ['gpt-4o-mini', 'gpt-4o'],
  custom: [],
}

export const PROVIDER_BASE_URLS: Record<Exclude<ProviderId, 'gemini' | 'custom'>, string> = {
  groq: 'https://api.groq.com/openai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  openai: 'https://api.openai.com/v1',
}

export const PROVIDER_KEY_LINKS: Record<ProviderId, { href: string; label: string } | null> = {
  gemini: { href: 'https://aistudio.google.com/apikey', label: 'Google AI Studio' },
  groq: { href: 'https://console.groq.com/keys', label: 'Groq Console' },
  openrouter: { href: 'https://openrouter.ai/keys', label: 'OpenRouter' },
  openai: { href: 'https://platform.openai.com/api-keys', label: 'OpenAI platform' },
  custom: null,
}

export const PROVIDER_KEY_PLACEHOLDERS: Record<ProviderId, string> = {
  gemini: 'AIza… Gemini API key',
  groq: 'gsk_… Groq API key',
  openrouter: 'sk-or-… OpenRouter API key',
  openai: 'sk-… OpenAI API key',
  custom: 'API key for this endpoint',
}

export function detectProviderFromKey(apiKey: string): ProviderId | undefined {
  const key = apiKey.trim()
  if (!key) return undefined
  if (key.startsWith('gsk_')) return 'groq'
  if (key.startsWith('sk-or-')) return 'openrouter'
  if (key.startsWith('AIza')) return 'gemini'
  if (key.startsWith('sk-')) return 'openai'
  return undefined
}

export function defaultModelFor(provider: ProviderId): string {
  return DEFAULT_MODELS[provider]
}

export function isKnownModelFor(provider: ProviderId, model: string): boolean {
  const trimmed = model.trim()
  if (!trimmed) return false
  if (trimmed === DEFAULT_MODELS[provider]) return true
  return MODEL_OPTIONS_BY_PROVIDER[provider].includes(trimmed)
}

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '')
}

export function openaiCompatibleBaseUrl(connection: AiConnection): string {
  if (connection.provider === 'custom') {
    const url = normalizeBaseUrl(connection.baseUrl ?? '')
    if (!url) throw new Error('Enter an OpenAI-compatible base URL, for example https://api.example.com/v1.')
    return url
  }
  if (connection.provider === 'gemini') {
    throw new Error('Gemini uses its own API, not an OpenAI-compatible base URL.')
  }
  return PROVIDER_BASE_URLS[connection.provider]
}

export function providerDisplayName(provider: ProviderId): string {
  return PROVIDER_LABELS[provider]
}

export function corsNoteFor(provider: ProviderId): string {
  switch (provider) {
    case 'gemini':
      return 'Gemini allows browser requests. A Google AI Studio key is required, and some accounts are blocked by identity verification.'
    case 'groq':
      return 'Groq allows browser requests. Get a free key from the Groq Console. Use a vision-capable model such as qwen/qwen3.8-27b for photo recognition.'
    case 'openrouter':
      return 'OpenRouter allows browser requests. Free :free models are rate-limited and can change availability. The default is a free vision model.'
    case 'openai':
      return 'OpenAI allows browser requests when the key is valid. A typo or rejected key on chat completions can show up as a network error instead of “invalid key,” because error responses sometimes omit CORS headers. Use Test in Settings (which checks /v1/models) to confirm the key. OpenAI keys are generally paid.'
    case 'custom':
      return 'Custom endpoints only work in the browser if the server sends CORS headers that allow this site. If Test fails with a network error, the endpoint may be blocking browser calls.'
  }
}

export function connectionFromSettings(settings: {
  provider?: ProviderId
  apiKey: string
  model: string
  baseUrl?: string
}): AiConnection {
  return {
    provider: settings.provider ?? 'gemini',
    apiKey: settings.apiKey.trim(),
    model: settings.model.trim(),
    baseUrl: settings.baseUrl?.trim() || undefined,
  }
}
