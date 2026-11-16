import { useEffect, useMemo, useState } from 'react'
import { Check, KeyRound, Loader2, RefreshCw, ShieldAlert, Trash2, Wifi } from 'lucide-react'
import type { Preferences, Settings } from '../types'
import { MODEL_OPTIONS } from '../types'
import { listModels, testConnection } from '../lib/gemini'

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
  const [apiKey, setApiKey] = useState(settings.apiKey)
  const [model, setModel] = useState(settings.model)
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
    const filtered = availableModels.filter((name) => /gemini/i.test(name) && !/(image|tts|live|audio|embedding|robotics|omni|translate|transcribe|decision)/i.test(name))
    const choices = filtered.length > 0 ? filtered : [...MODEL_OPTIONS]
    if (model && !choices.includes(model)) choices.unshift(model)
    return choices
  }, [availableModels, model])

  const effectiveKey = apiKey.trim()

  const save = async () => {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      onSaveSettings({ ...settings, apiKey: apiKey.trim(), model: model.trim() || settings.model, rememberKeyInSession: remember, persistApiKey: persist, updatedAt: Date.now() })
      setMessage('Settings saved.')
    } finally {
      setSaving(false)
    }
  }

  const test = async () => {
    setTesting(true)
    setError('')
    setMessage('')
    try {
      if (!effectiveKey) throw new Error('Enter a Gemini API key first.')
      const result = await testConnection(effectiveKey, model.trim() || settings.model)
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
      if (!effectiveKey) throw new Error('Enter a Gemini API key first.')
      const models = await listModels(effectiveKey)
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
            <h2 className="font-display text-2xl font-semibold">Gemini API key</h2>
          </div>
          <label className="grid gap-1.5 text-sm font-medium text-ink-soft">
            API key
            <input
              className="input"
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={settings.apiKey ? 'Key saved' : 'Paste your Gemini API key'}
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

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium text-ink-soft">
              Model
              <select className="input" value={model} onChange={(event) => setModel(event.target.value)}>
                {modelChoices.map((choice) => <option key={choice} value={choice}>{choice}</option>)}
              </select>
            </label>
            <div className="flex items-end gap-2">
              <button onClick={test} disabled={testing} className="btn btn-outline flex-1">
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />} Test
              </button>
              <button onClick={loadModels} disabled={loadingModels} className="btn btn-outline flex-1">
                {loadingModels ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Load models
              </button>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button onClick={save} disabled={saving} className="btn btn-primary">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save settings
            </button>
            <button onClick={() => { setApiKey(''); onSaveSettings({ ...settings, apiKey: '', updatedAt: Date.now() }); setMessage('API key removed from this session.') }} className="btn btn-ghost text-danger">
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
              <div className="font-semibold text-ink">What Gemini sees</div>
              Only the photo you upload for recognition and the text metadata needed for outfit planning are sent to Google. Cropping and filtering happen locally.
            </div>
            <div className="rounded-2xl border border-line bg-paper p-4">
              <div className="font-semibold text-ink">Free tier caveat</div>
              Gemini free-tier quotas and model availability can change. Scarfy does not promise unlimited AI usage.
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
