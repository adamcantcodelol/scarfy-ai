import { useEffect, useMemo, useState } from 'react'
import { Check, KeyRound, Loader2, RefreshCw, ShieldAlert, Trash2, Wifi } from 'lucide-react'
import type { Preferences, Settings } from '../types'
import { listModels, testConnection } from '../lib/ai'
import {
  type ProviderId,
  PROVIDER_KEY_LINKS,
  PROVIDER_KEY_PLACEHOLDERS,
  PROVIDER_LABELS,
  PROVIDER_ORDER,
  corsNoteFor,
  defaultModelFor,
  detectProviderFromKey,
  isKnownModelFor,
  MODEL_OPTIONS_BY_PROVIDER,
} from '../lib/providers'

interface SettingsPageProps {
  settings: Settings
  preferences: Preferences
  usage: { requests: number; lastUsedAt?: number }
  wardrobeCount: number
  outfitCount: number
  onSaveSettings: (settings: Settings) => void
  onSavePreferences: (preferences: Preferences) => void
  onClearAllData: () => void
  onApiUsage: () => void
}

function splitList(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}

export function SettingsPage({ settings, preferences, usage, wardrobeCount, outfitCount, onSaveSettings, onSavePreferences, onClearAllData, onApiUsage }: SettingsPageProps) {
  const [provider, setProvider] = useState<ProviderId>(settings.provider || 'gemini')
  const [apiKey, setApiKey] = useState(settings.apiKey)
  const [model, setModel] = useState(settings.model)
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl ?? '')
  const [remember, setRemember] = useState(settings.rememberKeyInSession)
  const [persist, setPersist] = useState(settings.persistApiKey)
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [testing, setTesting] = useState(false)
  const [loadingModels, setLoadingModels] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)

  const [prefDraft, setPrefDraft] = useState(preferences)
  useEffect(() => setPrefDraft(preferences), [preferences])

  const modelChoices = useMemo(() => {
    const suggested = MODEL_OPTIONS_BY_PROVIDER[provider]
    const choices = [...suggested]
    for (const name of availableModels) {
      if (!choices.includes(name)) choices.push(name)
    }
    if (model && !choices.includes(model)) choices.unshift(model)
    return choices
  }, [availableModels, model, provider])

  const effectiveKey = apiKey.trim()
  const connection = {
    provider,
    apiKey: effectiveKey,
    model: model.trim(),
    baseUrl: baseUrl.trim() || undefined,
  }

  const applyProvider = (next: ProviderId, currentModel = model) => {
    setProvider(next)
    setAvailableModels([])
    if (!currentModel.trim() || isKnownModelFor(provider, currentModel) || currentModel === defaultModelFor(provider)) {
      setModel(defaultModelFor(next))
    }
  }

  const handleKeyChange = (value: string) => {
    setApiKey(value)
    const detected = detectProviderFromKey(value)
    if (detected && detected !== provider) applyProvider(detected, model)
  }

  const handleProviderChange = (next: ProviderId) => {
    applyProvider(next)
  }

  const save = async () => {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      onSaveSettings({
        ...settings,
        provider,
        apiKey: apiKey.trim(),
        model: model.trim() || defaultModelFor(provider),
        baseUrl: provider === 'custom' ? baseUrl.trim() : '',
        rememberKeyInSession: remember,
        persistApiKey: persist,
        updatedAt: Date.now(),
      })
      setMessage('Settings saved. Keys stay in this browser only.')
    } finally {
      setSaving(false)
    }
  }

  const test = async () => {
    setTesting(true)
    setError('')
    setMessage('')
    try {
      if (!effectiveKey) throw new Error('Enter an API key first.')
      const result = await testConnection(connection)
      setMessage(`Connected to ${result.model}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed')
    } finally {
      onApiUsage()
      setTesting(false)
    }
  }

  const loadModels = async () => {
    setLoadingModels(true)
    setError('')
    setMessage('')
    try {
      if (!effectiveKey) throw new Error('Enter an API key first.')
      const models = await listModels(connection)
      setAvailableModels(models)
      setMessage(`Loaded ${models.length} available models.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load models')
    } finally {
      onApiUsage()
      setLoadingModels(false)
    }
  }

  const savePreferences = () => {
    onSavePreferences({ ...prefDraft, updatedAt: Date.now() })
    setMessage('Preferences saved.')
  }

  const keyLink = PROVIDER_KEY_LINKS[provider]

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">Configuration</div>
        <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight sm:text-5xl">Settings</h1>
      </div>

      {message && <div className="card border-sage/30 bg-sage/10 p-4 text-sm text-ink">{message}</div>}
      {error && <div className="card border-danger/30 bg-danger/10 p-4 text-sm text-danger">{error}</div>}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-5 sm:p-6">
          <div className="mb-5 flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-accent" />
            <h2 className="font-display text-2xl font-semibold">API provider</h2>
          </div>
          <p className="mb-4 text-sm text-ink-soft">
            Use any supported key. Pasting a key usually selects the provider automatically
            (<code className="text-xs">gsk_</code> is Groq, <code className="text-xs">sk-or-</code> is OpenRouter,{' '}
            <code className="text-xs">AIza</code> is Gemini, <code className="text-xs">sk-</code> is OpenAI).
            If Gemini is blocked by verification, Groq and OpenRouter both have free keys.
          </p>
          <label className="grid gap-1.5 text-sm font-medium text-ink-soft">
            Provider
            <select className="input" value={provider} onChange={(event) => handleProviderChange(event.target.value as ProviderId)}>
              {PROVIDER_ORDER.map((id) => (
                <option key={id} value={id}>{PROVIDER_LABELS[id]}</option>
              ))}
            </select>
          </label>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">{corsNoteFor(provider)}</p>
          {keyLink && (
            <p className="mt-2 text-sm text-ink-soft">
              Get a key from{' '}
              <a className="font-semibold text-accent-strong underline underline-offset-2" href={keyLink.href} target="_blank" rel="noreferrer">
                {keyLink.label}
              </a>
              .
            </p>
          )}

          {provider === 'custom' && (
            <label className="mt-4 grid gap-1.5 text-sm font-medium text-ink-soft">
              Base URL
              <input
                className="input"
                type="url"
                autoComplete="off"
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder="https://api.example.com/v1"
              />
              <span className="font-normal text-xs text-muted">OpenAI-compatible chat completions endpoint prefix, including /v1 if the server uses it.</span>
            </label>
          )}

          <label className="mt-4 grid gap-1.5 text-sm font-medium text-ink-soft">
            API key
            <input
              className="input"
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(event) => handleKeyChange(event.target.value)}
              placeholder={settings.apiKey ? 'Key saved' : PROVIDER_KEY_PLACEHOLDERS[provider]}
            />
          </label>
          <label className="mt-4 flex items-start gap-3 rounded-2xl border border-line bg-paper p-4 text-sm text-ink-soft">
            <input
              type="checkbox"
              className="mt-1"
              checked={remember}
              onChange={(event) => {
                setRemember(event.target.checked)
                if (event.target.checked) setPersist(false)
              }}
            />
            <span>
              <span className="font-semibold text-ink">Remember for this browser session only.</span>
              <br />
              The key is kept in session storage, not in IndexedDB or source code. Close the tab and it is gone. For stronger privacy, uncheck this and paste the key each time.
            </span>
          </label>
          <label className="mt-3 flex items-start gap-3 rounded-2xl border border-accent/30 bg-accent/10 p-4 text-sm text-ink-soft">
            <input
              type="checkbox"
              className="mt-1"
              checked={persist}
              onChange={(event) => {
                setPersist(event.target.checked)
                if (event.target.checked) setRemember(false)
              }}
            />
            <span>
              <span className="font-semibold text-ink">Store key in this browser across sessions.</span>
              <br />
              This is less private: the key is saved in localStorage and will remain until you remove it or clear site data. Leave unchecked for session-only storage.
            </span>
          </label>

          <label className="mt-5 grid gap-1.5 text-sm font-medium text-ink-soft">
            Model
            <input
              className="input"
              list="scarfy-model-choices"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder={defaultModelFor(provider) || 'model-name'}
            />
            <datalist id="scarfy-model-choices">
              {modelChoices.map((choice) => (
                <option key={choice} value={choice} />
              ))}
            </datalist>
            <span className="font-normal text-xs text-muted">Suggested vision-capable defaults are listed; you can type any model name the provider accepts.</span>
          </label>
          <div className="mt-3 flex items-end gap-2">
            <button onClick={test} disabled={testing} className="btn btn-outline flex-1">
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />} Test
            </button>
            <button onClick={loadModels} disabled={loadingModels} className="btn btn-outline flex-1">
              {loadingModels ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Load models
            </button>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button onClick={save} disabled={saving} className="btn btn-primary">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save settings
            </button>
            <button onClick={() => { setApiKey(''); onSaveSettings({ ...settings, provider, apiKey: '', model, baseUrl: provider === 'custom' ? baseUrl.trim() : settings.baseUrl, updatedAt: Date.now() }); setMessage('API key removed from this session.') }} className="btn btn-ghost text-danger">
              Remove key
            </button>
          </div>
        </section>

        <section className="card p-5 sm:p-6">
          <h2 className="font-display text-2xl font-semibold">Privacy & usage</h2>
          <div className="mt-4 grid gap-3 text-sm text-ink-soft">
            <div className="rounded-2xl border border-line bg-paper p-4">
              <div className="font-semibold text-ink">Local-first wardrobe</div>
              Clothing photos and metadata are stored in IndexedDB on this device: {wardrobeCount} items, {outfitCount} saved outfits.
            </div>
            <div className="rounded-2xl border border-line bg-paper p-4">
              <div className="font-semibold text-ink">What the provider sees</div>
              Only the photo you upload for recognition and the text metadata needed for outfit planning are sent to the provider you chose. Cropping and filtering happen locally. Keys never leave this browser except in those API requests.
            </div>
            <div className="rounded-2xl border border-line bg-paper p-4">
              <div className="font-semibold text-ink">Free tier caveat</div>
              Free-tier quotas and model availability can change. Scarfy does not promise unlimited AI usage, and it does not provide a shared key.
            </div>
            <div className="rounded-2xl border border-line bg-paper p-4">
              <div className="font-semibold text-ink">API usage this session</div>
              {usage.requests} request{usage.requests === 1 ? '' : 's'}
              {usage.lastUsedAt ? ` · last used ${new Date(usage.lastUsedAt).toLocaleTimeString()}` : ''}
            </div>
          </div>
        </section>
      </div>

      <section className="card p-5 sm:p-6">
        <h2 className="font-display text-2xl font-semibold">Styling preferences</h2>
        <p className="mt-1 text-sm text-ink-soft">Guide Outfit AI toward your taste. These preferences stay local.</p>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <label className="grid gap-1.5 text-sm font-medium text-ink-soft">
            Preferred styles
            <input className="input" value={prefDraft.preferredStyles.join(', ')} onChange={(event) => setPrefDraft((current) => ({ ...current, preferredStyles: splitList(event.target.value) }))} placeholder="minimal, vintage, streetwear" />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-ink-soft">
            Preferred colors
            <input className="input" value={prefDraft.preferredColors.join(', ')} onChange={(event) => setPrefDraft((current) => ({ ...current, preferredColors: splitList(event.target.value) }))} placeholder="navy, cream, olive" />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-ink-soft">
            Avoided colors
            <input className="input" value={prefDraft.avoidedColors.join(', ')} onChange={(event) => setPrefDraft((current) => ({ ...current, avoidedColors: splitList(event.target.value) }))} placeholder="orange, neon" />
          </label>
        </div>
        <label className="mt-4 grid gap-1.5 text-sm font-medium text-ink-soft">
          Notes
          <textarea className="input min-h-24 resize-y" value={prefDraft.notes} onChange={(event) => setPrefDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="Comfort over trend, hate heels, love monochrome…" />
        </label>
        <button onClick={savePreferences} className="btn btn-outline mt-4">Save preferences</button>
      </section>

      <section className="card border-danger/30 p-5 sm:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 text-danger" />
            <div>
              <h2 className="font-display text-xl font-semibold">Danger zone</h2>
              <p className="mt-1 max-w-xl text-sm text-ink-soft">Delete every wardrobe photo, saved outfit, preference, and local setting stored by Scarfy AI.</p>
            </div>
          </div>
          {confirmClear ? (
            <div className="flex flex-wrap gap-2">
              <button onClick={() => { onClearAllData(); setConfirmClear(false); setMessage('All local data cleared.') }} className="btn btn-accent bg-danger hover:bg-danger/90">
                <Trash2 className="h-4 w-4" /> Confirm delete all
              </button>
              <button onClick={() => setConfirmClear(false)} className="btn btn-outline">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setConfirmClear(true)} className="btn btn-outline text-danger">Clear all local data</button>
          )}
        </div>
      </section>
    </div>
  )
}
