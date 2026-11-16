import type { BoundingBox, Category, DetectionBatch, Formality, Outfit, Preferences, WardrobeItem } from '../types'
import { blobToBase64, normalizeBoundingBox, prepareImageForAnalysis, uid } from './image'

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta'

export interface GeminiError extends Error {
  status?: number
}

export interface GeneratedOutfit {
  title: string
  explanation: string
  whyItWorks: string
  occasionFit: string
  itemIds: string[]
  alternatives: { title: string; itemIds: string[] }[]
}

interface GeminiPart {
  text?: string
  inlineData?: { mimeType: string; data: string }
}

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] }
    finishReason?: string
  }[]
  promptFeedback?: { blockReason?: string; blockReasonMessage?: string }
  error?: { message?: string; status?: string }
}

const CATEGORY_VALUES: Category[] = ['top', 'bottom', 'dress', 'outerwear', 'shoes', 'accessory', 'bag', 'other']
const FORMALITY_VALUES: Formality[] = ['casual', 'smart-casual', 'business-casual', 'formal']

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => asString(item)).filter(Boolean)
}

function asCategory(value: unknown): Category {
  const normalized = asString(value).toLowerCase().replace(/[\s_]+/g, '-')
  return (CATEGORY_VALUES as string[]).includes(normalized) ? (normalized as Category) : 'other'
}

function asFormality(value: unknown): Formality {
  const normalized = asString(value).toLowerCase().replace(/[\s_]+/g, '-')
  return (FORMALITY_VALUES as string[]).includes(normalized) ? (normalized as Formality) : 'casual'
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function boxFromGemini(value: unknown): BoundingBox | undefined {
  if (!Array.isArray(value) || value.length < 4) return undefined
  const nums = value.slice(0, 4).map((item) => Number(item))
  if (nums.some((item) => !Number.isFinite(item))) return undefined
  const scale = Math.max(...nums) > 1.5 ? 1000 : 1
  const [ymin, xmin, ymax, xmax] = nums.map((item) => clamp01(item / scale))
  return normalizeBoundingBox({ ymin, xmin, ymax, xmax })
}

function parseJsonText(text: string): unknown {
  const withoutFence = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  const start = withoutFence.search(/[{[]/)
  if (start < 0) return JSON.parse(withoutFence)
  const open = withoutFence[start]
  const close = open === '{' ? '}' : ']'
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < withoutFence.length; index += 1) {
    const char = withoutFence[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      continue
    }
    if (char === open) depth += 1
    else if (char === close) {
      depth -= 1
      if (depth === 0) return JSON.parse(withoutFence.slice(start, index + 1))
    }
  }
  return JSON.parse(withoutFence)
}

async function requestGemini(apiKey: string, model: string, body: Record<string, unknown>): Promise<GeminiResponse> {
  const response = await fetch(`${API_BASE}/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  })
  const payload = (await response.json().catch(() => ({}))) as GeminiResponse
  if (!response.ok) {
    const message = payload.error?.message || `Gemini request failed with HTTP ${response.status}`
    const error = new Error(message) as GeminiError
    error.status = response.status
    throw error
  }
  return payload
}

async function generateJson<T>(apiKey: string, model: string, prompt: string, schema: Record<string, unknown>, imageBlob?: Blob): Promise<T> {
  const parts: GeminiPart[] = []
  if (imageBlob) {
    const prepared = await prepareImageForAnalysis(imageBlob)
    parts.push({ inlineData: { mimeType: prepared.type || 'image/jpeg', data: await blobToBase64(prepared) } })
  }
  parts.push({ text: prompt })

  const payload = await requestGemini(apiKey, model, {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseJsonSchema: schema,
      temperature: 0.25,
      candidateCount: 1,
      maxOutputTokens: 16384,
    },
  })

  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? ''
  if (!text.trim()) {
    const reason = payload.candidates?.[0]?.finishReason ?? payload.promptFeedback?.blockReason ?? 'empty response'
    throw new Error(`Gemini returned no JSON (${reason}).`)
  }
  try {
    return parseJsonText(text) as T
  } catch {
    throw new Error('Gemini returned invalid JSON. Try again or choose a different model.')
  }
}

export async function testConnection(apiKey: string, model: string): Promise<{ ok: true; model: string }> {
  const response = await fetch(`${API_BASE}/models/${encodeURIComponent(model)}`, {
    headers: { 'x-goog-api-key': apiKey },
    signal: AbortSignal.timeout(30_000),
  })
  const payload = (await response.json().catch(() => ({}))) as { name?: string; error?: { message?: string } }
  if (!response.ok) {
    throw new Error(payload.error?.message || `Unable to reach Gemini (${response.status})`)
  }
  return { ok: true, model: payload.name?.replace(/^models\//, '') || model }
}

export async function listModels(apiKey: string): Promise<string[]> {
  const response = await fetch(`${API_BASE}/models?pageSize=200`, {
    headers: { 'x-goog-api-key': apiKey },
    signal: AbortSignal.timeout(30_000),
  })
  const payload = (await response.json().catch(() => ({}))) as {
    models?: { name?: string; supportedGenerationMethods?: string[] }[]
    error?: { message?: string }
  }
  if (!response.ok) throw new Error(payload.error?.message || `Unable to list models (${response.status})`)
  return (payload.models ?? [])
    .filter((model) => model.supportedGenerationMethods?.includes('generateContent'))
    .map((model) => model.name?.replace(/^models\//, '') ?? '')
    .filter(Boolean)
    .sort()
}

const garmentSchema = {
  type: 'object',
  properties: {
    garments: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          category: { type: 'string' },
          type: { type: 'string' },
          primary_color: { type: 'string' },
          secondary_color: { type: 'string' },
          pattern: { type: 'string' },
          style: { type: 'array', items: { type: 'string' } },
          seasons: { type: 'array', items: { type: 'string' } },
          formality: { type: 'string' },
          description: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          confidence: { type: 'number' },
          box_2d: { type: 'array', items: { type: 'integer' } },
        },
        required: ['name', 'category', 'box_2d'],
      },
    },
  },
  required: ['garments'],
}

export async function analyzeGarmentBatch(apiKey: string, model: string, sourceBlob: Blob): Promise<DetectionBatch> {
  const prompt = `You are a fashion cataloging assistant. Analyze the uploaded photograph and identify every distinct garment or fashion item visible.

Rules:
- A single image may contain multiple garments laid out together. Return one entry per distinct wearable item.
- Do not merge separate garments. Do not invent items that are not visible.
- For each garment provide practical catalog metadata: name, category, type, colors, pattern, style, seasons, formality, description, tags.
- category must be one of: ${CATEGORY_VALUES.join(', ')}.
- formality must be one of: ${FORMALITY_VALUES.join(', ')}.
- box_2d must be [ymin, xmin, ymax, xmax] normalized to integers from 0 to 1000, origin at the top-left. Tighten the box around the visible garment, including most of the garment but excluding unrelated background where possible.
- confidence is your estimated detection confidence from 0 to 1.
- If an attribute is uncertain, make a reasonable fashion-based inference and keep the description concise.
- Return JSON only.`

  const parsed = await generateJson<{ garments?: unknown[] }>(apiKey, model, prompt, garmentSchema, sourceBlob)
  const garments = (parsed.garments ?? [])
    .map((item): DetectionBatch['garments'][number] | undefined => {
      if (!item || typeof item !== 'object') return undefined
      const record = item as Record<string, unknown>
      const box = boxFromGemini(record.box_2d)
      if (!box) return undefined
      const confidence = Number(record.confidence)
      return {
        id: uid(),
        name: asString(record.name, 'Unnamed garment'),
        category: asCategory(record.category),
        type: asString(record.type, 'clothing'),
        primaryColor: asString(record.primary_color, 'unknown'),
        secondaryColor: asString(record.secondary_color) || undefined,
        pattern: asString(record.pattern, 'solid'),
        style: asStringArray(record.style),
        seasons: asStringArray(record.seasons),
        formality: asFormality(record.formality),
        description: asString(record.description),
        tags: asStringArray(record.tags),
        boundingBox: box,
        confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : undefined,
        status: 'pending',
      }
    })
    .filter((item): item is DetectionBatch['garments'][number] => Boolean(item))

  return {
    id: uid(),
    sourceName: 'upload',
    sourceBlob,
    sourceMimeType: sourceBlob.type || 'image/jpeg',
    width: 0,
    height: 0,
    garments,
    analyzedAt: Date.now(),
  }
}

const outfitSchema = {
  type: 'object',
  properties: {
    outfits: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          explanation: { type: 'string' },
          why_it_works: { type: 'string' },
          occasion_fit: { type: 'string' },
          item_ids: { type: 'array', items: { type: 'string' } },
          alternatives: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                item_ids: { type: 'array', items: { type: 'string' } },
              },
              required: ['title', 'item_ids'],
            },
          },
        },
        required: ['title', 'item_ids'],
      },
    },
  },
  required: ['outfits'],
}

function wardrobeSummary(item: WardrobeItem) {
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    type: item.type,
    primaryColor: item.primaryColor,
    secondaryColor: item.secondaryColor,
    pattern: item.pattern,
    style: item.style,
    seasons: item.seasons,
    formality: item.formality,
    description: item.description,
    tags: item.tags,
    timesWorn: item.timesWorn ?? 0,
    lastWornAt: item.lastWornAt ? new Date(item.lastWornAt).toISOString() : undefined,
  }
}

export async function generateOutfits(
  apiKey: string,
  model: string,
  wardrobe: WardrobeItem[],
  preferences: Preferences | undefined,
  request: { occasion: string; weather?: string; temperatureC?: number; dressCode?: string; notes?: string },
  recentSignatures: string[],
): Promise<GeneratedOutfit[]> {
  const usable = wardrobe.filter((item) => !item.excluded)
  if (usable.length === 0) throw new Error('Add at least one wardrobe item before generating outfits.')

  const prompt = `You are Scarfy AI, a precise personal stylist. Create outfit recommendations using ONLY the wardrobe items provided. Never invent clothing, shoes, accessories, or items that are not in the JSON list.

User request:
- Occasion: ${request.occasion}
- Weather: ${request.weather || 'not specified'}
- Temperature: ${request.temperatureC !== undefined ? `${request.temperatureC}°C` : 'not specified'}
- Dress code: ${request.dressCode || 'infer from occasion'}
- Additional notes: ${request.notes || 'none'}

Preferences:
- Preferred styles: ${(preferences?.preferredStyles ?? []).join(', ') || 'none'}
- Preferred colors: ${(preferences?.preferredColors ?? []).join(', ') || 'none'}
- Avoided colors: ${(preferences?.avoidedColors ?? []).join(', ') || 'none'}
- Notes: ${preferences?.notes || 'none'}

Recent outfit signatures to avoid repeating exactly: ${recentSignatures.slice(-20).join(' ; ') || 'none'}

Wardrobe items JSON:
${JSON.stringify(usable.map(wardrobeSummary))}

Return up to 3 distinct outfits. Each outfit must contain 3-6 item_ids when possible, chosen only from the wardrobe JSON ids. For each outfit provide:
- title: short editorial outfit name
- explanation: why the pieces work together
- why_it_works: practical reasoning about silhouette, color, formality, and occasion
- occasion_fit: how it suits the requested occasion/weather/dress code
- alternatives: 1-2 alternate combinations using different wardrobe item_ids where possible

Return JSON only.`

  const parsed = await generateJson<{ outfits?: unknown[] }>(apiKey, model, prompt, outfitSchema)
  const validIds = new Set(usable.map((item) => item.id))
  const cleanIds = (value: unknown): string[] => {
    const ids = Array.isArray(value) ? value.map((item) => asString(item)).filter(Boolean) : []
    return [...new Set(ids.filter((id) => validIds.has(id)))]
  }

  return (parsed.outfits ?? [])
    .map((item): GeneratedOutfit | undefined => {
      if (!item || typeof item !== 'object') return undefined
      const record = item as Record<string, unknown>
      const itemIds = cleanIds(record.item_ids)
      if (itemIds.length === 0) return undefined
      const alternatives = Array.isArray(record.alternatives)
        ? record.alternatives
            .map((alt) => {
              if (!alt || typeof alt !== 'object') return undefined
              const altRecord = alt as Record<string, unknown>
              const altIds = cleanIds(altRecord.item_ids)
              if (altIds.length === 0) return undefined
              return { title: asString(altRecord.title, 'Alternative'), itemIds: altIds }
            })
            .filter((alt): alt is { title: string; itemIds: string[] } => Boolean(alt))
        : []
      return {
        title: asString(record.title, 'Suggested outfit'),
        explanation: asString(record.explanation),
        whyItWorks: asString(record.why_it_works),
        occasionFit: asString(record.occasion_fit),
        itemIds,
        alternatives,
      }
    })
    .filter((item): item is GeneratedOutfit => Boolean(item))
}

export function generatedToOutfit(
  generated: GeneratedOutfit,
  prompt: string,
  request: { occasion: string; weather?: string; temperatureC?: number; dressCode?: string },
): Outfit {
  return {
    id: uid(),
    title: generated.title,
    occasion: request.occasion,
    weather: request.weather,
    temperatureC: request.temperatureC,
    dressCode: request.dressCode,
    explanation: generated.explanation,
    whyItWorks: generated.whyItWorks,
    occasionFit: generated.occasionFit,
    items: generated.itemIds.map((itemId) => ({ itemId, role: 'piece' })),
    alternativeItemIds: generated.alternatives.map((alt) => alt.itemIds),
    favorite: false,
    createdAt: Date.now(),
    prompt,
  }
}
