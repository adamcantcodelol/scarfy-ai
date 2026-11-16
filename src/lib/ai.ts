import type { BoundingBox, Category, DetectionBatch, Formality, Outfit, Preferences, WardrobeItem } from '../types'
import { blobToBase64, normalizeBoundingBox, prepareImageForAnalysis, uid } from './image'
import {
  type AiConnection,
  type ProviderId,
  openaiCompatibleBaseUrl,
  providerDisplayName,
} from './providers'

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta'

export interface ApiError extends Error {
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

export function parseJsonText(text: string): unknown {
  const withoutFence = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
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

function messageFromPayload(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback
  const record = payload as Record<string, unknown>
  const error = record.error
  if (typeof error === 'string' && error.trim()) return error.trim()
  if (error && typeof error === 'object') {
    const err = error as Record<string, unknown>
    if (typeof err.message === 'string' && err.message.trim()) return err.message.trim()
    if (typeof err.code === 'string' && err.code.trim()) return err.code.trim()
  }
  if (typeof record.message === 'string' && record.message.trim()) return record.message.trim()
  return fallback
}

function statusHint(status: number, provider: string, raw: string): string {
  if (status === 401 || status === 403) {
    return `This ${provider} API key was rejected (HTTP ${status}). Check that the key is valid, not expired, and has access to the selected model.`
  }
  if (status === 404) {
    return `Model not found on ${provider} (HTTP 404). Check the model name, or click Load models and pick one that is available.`
  }
  if (status === 429) {
    return `${provider} rate-limited this request (HTTP 429). Wait a bit and try again, or pick another model.`
  }
  if (status >= 500) {
    return `${provider} had a server error (HTTP ${status}). Try again in a moment.`
  }
  return raw || `${provider} request failed with HTTP ${status}`
}

function wrapNetworkError(error: unknown, provider: ProviderId): never {
  const isNetwork =
    error instanceof TypeError ||
    (error instanceof Error && /failed to fetch|networkerror|load failed|fetch failed/i.test(error.message))
  if (isNetwork) {
    if (provider === 'openai') {
      throw new Error(
        'Could not reach OpenAI from this browser. A typo or rejected API key can look like a network error, because OpenAI sometimes omits CORS headers on 401 responses. Check the key, then use Test in Settings (that call can still report an invalid key).',
      )
    }
    if (provider === 'custom') {
      throw new Error(
        'Could not reach this API from the browser. The base URL may be wrong, or the server may block CORS. Try the same request from another client, or use an endpoint that allows browser calls.',
      )
    }
    throw new Error(
      `Could not reach ${providerDisplayName(provider)} from this browser. Check your connection and API key.`,
    )
  }
  throw error
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => '')
  if (!text) return {}
  try {
    return JSON.parse(text) as unknown
  } catch {
    return { message: text.slice(0, 400) }
  }
}

function openaiHeaders(connection: AiConnection): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${connection.apiKey}`,
  }
  if (connection.provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://adamcantcodelol.github.io/scarfy-ai/'
    headers['X-Title'] = 'Scarfy AI'
  }
  return headers
}

function chatContentToText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part
        if (!part || typeof part !== 'object') return ''
        const record = part as Record<string, unknown>
        if (typeof record.text === 'string') return record.text
        if (typeof record.content === 'string') return record.content
        return ''
      })
      .join('')
  }
  if (content && typeof content === 'object' && 'text' in content) {
    const text = (content as { text?: unknown }).text
    return typeof text === 'string' ? text : ''
  }
  return ''
}

async function requestGemini(apiKey: string, model: string, body: Record<string, unknown>): Promise<GeminiResponse> {
  let response: Response
  try {
    response = await fetch(`${GEMINI_API_BASE}/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    })
  } catch (error) {
    wrapNetworkError(error, 'gemini')
  }
  const payload = (await parseResponseBody(response)) as GeminiResponse
  if (!response.ok) {
    const message = statusHint(response.status, 'Gemini', messageFromPayload(payload, ''))
    const error = new Error(message) as ApiError
    error.status = response.status
    throw error
  }
  return payload
}

async function requestChatCompletion(
  connection: AiConnection,
  messages: unknown[],
  options: { jsonMode?: boolean } = {},
): Promise<string> {
  if (!connection.apiKey) throw new Error('Add an API key in Settings first.')
  if (!connection.model) throw new Error('Enter a model name in Settings first.')
  const base = openaiCompatibleBaseUrl(connection)
  const body: Record<string, unknown> = {
    model: connection.model,
    messages,
    temperature: 0.25,
    max_tokens: 8192,
  }
  if (options.jsonMode !== false) body.response_format = { type: 'json_object' }

  const send = async (payload: Record<string, unknown>) => {
    try {
      return await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: openaiHeaders(connection),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(120_000),
      })
    } catch (error) {
      wrapNetworkError(error, connection.provider)
    }
  }

  let response = await send(body)
  let payload = await parseResponseBody(response)
  if (!response.ok) {
    const raw = messageFromPayload(payload, '')
    if (body.response_format && /response_format|json_object|json mode|json_schema/i.test(raw)) {
      const retryBody = { ...body }
      delete retryBody.response_format
      response = await send(retryBody)
      payload = await parseResponseBody(response)
    }
  }
  if (!response.ok) {
    const message = statusHint(
      response.status,
      providerDisplayName(connection.provider),
      messageFromPayload(payload, ''),
    )
    const error = new Error(message) as ApiError
    error.status = response.status
    throw error
  }

  const record = payload as {
    choices?: { message?: { content?: unknown; refusal?: string }; finish_reason?: string }[]
    error?: { message?: string }
  }
  const message = record.choices?.[0]?.message
  if (message?.refusal) throw new Error(`${providerDisplayName(connection.provider)} refused the request: ${message.refusal}`)
  const text = chatContentToText(message?.content)
  if (!text.trim()) {
    const reason = record.choices?.[0]?.finish_reason ?? 'empty response'
    throw new Error(`${providerDisplayName(connection.provider)} returned no JSON (${reason}). Try a different model.`)
  }
  return text
}

async function generateJson<T>(
  connection: AiConnection,
  prompt: string,
  schema: Record<string, unknown>,
  imageBlob?: Blob,
): Promise<T> {
  if (connection.provider === 'gemini') {
    const parts: GeminiPart[] = []
    if (imageBlob) {
      const prepared = await prepareImageForAnalysis(imageBlob)
      parts.push({ inlineData: { mimeType: prepared.type || 'image/jpeg', data: await blobToBase64(prepared) } })
    }
    parts.push({ text: prompt })
    const payload = await requestGemini(connection.apiKey, connection.model, {
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

  const jsonPrompt = `${prompt}

Return a single JSON object only, with no markdown fences or commentary. It must match this shape:
${JSON.stringify(schema)}`

  let userContent: unknown
  if (imageBlob) {
    const prepared = await prepareImageForAnalysis(imageBlob)
    const data = await blobToBase64(prepared)
    const mime = prepared.type || 'image/jpeg'
    userContent = [
      { type: 'text', text: jsonPrompt },
      { type: 'image_url', image_url: { url: `data:${mime};base64,${data}` } },
    ]
  } else {
    userContent = jsonPrompt
  }

  const text = await requestChatCompletion(connection, [
    { role: 'system', content: 'You are a careful assistant that returns only valid JSON objects.' },
    { role: 'user', content: userContent },
  ])
  try {
    return parseJsonText(text) as T
  } catch {
    throw new Error(
      `${providerDisplayName(connection.provider)} returned invalid JSON. Try again or choose a different model.`,
    )
  }
}

export async function testConnection(connection: AiConnection): Promise<{ ok: true; model: string; warning?: string }> {
  if (!connection.apiKey) throw new Error('Enter an API key first.')
  if (connection.provider === 'custom' && !connection.baseUrl?.trim()) {
    throw new Error('Enter an OpenAI-compatible base URL, for example https://api.example.com/v1.')
  }
  if (connection.provider === 'gemini') {
    if (!connection.model) throw new Error('Enter a Gemini model name first.')
    let response: Response
    try {
      response = await fetch(`${GEMINI_API_BASE}/models/${encodeURIComponent(connection.model)}`, {
        headers: { 'x-goog-api-key': connection.apiKey },
        signal: AbortSignal.timeout(30_000),
      })
    } catch (error) {
      wrapNetworkError(error, 'gemini')
    }
    const payload = await parseResponseBody(response)
    if (!response.ok) {
      throw new Error(statusHint(response.status, 'Gemini', messageFromPayload(payload, '')))
    }
    const name = (payload as { name?: string }).name?.replace(/^models\//, '') || connection.model
    return { ok: true, model: name }
  }

  const models = await listModels(connection).catch(async (error) => {
    // Some custom endpoints do not implement /models. Fall back to a tiny chat call.
    if (connection.provider === 'custom') {
      if (!connection.model) throw new Error('Enter a model name first.')
      await requestChatCompletion(
        connection,
        [{ role: 'user', content: 'Reply with the JSON object {"ok":true} and nothing else.' }],
        { jsonMode: true },
      )
      return [] as string[]
    }
    throw error
  })

  if (models.length > 0 && connection.model && !models.includes(connection.model)) {
    throw new Error(
      `Connected to ${providerDisplayName(connection.provider)}, but "${connection.model}" was not in the model list. Check the model name, or click Load models and pick one that is available.`,
    )
  }
  if (!connection.model) throw new Error('Enter a model name first.')
  return { ok: true, model: connection.model }
}

export async function listModels(connection: AiConnection): Promise<string[]> {
  if (!connection.apiKey) throw new Error('Enter an API key first.')
  if (connection.provider === 'gemini') {
    let response: Response
    try {
      response = await fetch(`${GEMINI_API_BASE}/models?pageSize=200`, {
        headers: { 'x-goog-api-key': connection.apiKey },
        signal: AbortSignal.timeout(30_000),
      })
    } catch (error) {
      wrapNetworkError(error, 'gemini')
    }
    const payload = (await parseResponseBody(response)) as {
      models?: { name?: string; supportedGenerationMethods?: string[] }[]
    }
    if (!response.ok) {
      throw new Error(statusHint(response.status, 'Gemini', messageFromPayload(payload, '')))
    }
    return (payload.models ?? [])
      .filter((model) => model.supportedGenerationMethods?.includes('generateContent'))
      .map((model) => model.name?.replace(/^models\//, '') ?? '')
      .filter(Boolean)
      .sort()
  }

  const base = openaiCompatibleBaseUrl(connection)
  let response: Response
  try {
    response = await fetch(`${base}/models`, {
      headers: openaiHeaders(connection),
      signal: AbortSignal.timeout(30_000),
    })
  } catch (error) {
    wrapNetworkError(error, connection.provider)
  }
  const payload = (await parseResponseBody(response)) as { data?: { id?: string }[] }
  if (!response.ok) {
    throw new Error(
      statusHint(response.status, providerDisplayName(connection.provider), messageFromPayload(payload, '')),
    )
  }
  return (payload.data ?? [])
    .map((model) => model.id ?? '')
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

export async function analyzeGarmentBatch(connection: AiConnection, sourceBlob: Blob): Promise<DetectionBatch> {
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

  const parsed = await generateJson<{ garments?: unknown[] }>(connection, prompt, garmentSchema, sourceBlob)
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
  connection: AiConnection,
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

  const parsed = await generateJson<{ outfits?: unknown[] }>(connection, prompt, outfitSchema)
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
