# Scarfy AI

Scarfy AI is a private, local-first AI wardrobe assistant. Upload photos of clothing, let an AI provider detect the garments in a batch photo, review the crops, and generate outfit ideas using only items you actually own.

## What it does

- Digital wardrobe with visual grid, search, filters, item details, editing, deleting, and exclusions.
- Batch clothing recognition: one photo can contain multiple garments. The selected provider returns structured metadata plus bounding boxes; Scarfy crops garments locally in the browser.
- Review workflow: approve, edit, reject, or remove each detection before saving wardrobe items.
- Outfit AI: describe an occasion, weather, temperature, dress code, and notes. Recommendations reference only real wardrobe item IDs.
- Personalization: saved outfits, favorites, styling preferences, avoided colors/styles, per-item exclusions, and recent-outfit signatures to reduce repeats.
- Settings: user-supplied API key for Gemini, Groq, OpenRouter, OpenAI, or a custom OpenAI-compatible endpoint; model selection; connection test; model list loading; usage feedback; and local data controls.
- PWA: installable manifest, icons, and a small service worker for the app shell.

## Privacy and cost model

- Wardrobe photos and metadata are stored in IndexedDB on the user's device.
- Cropping, filtering, and ordinary image processing happen locally.
- Only the selected upload photo is sent to your chosen provider for recognition. Outfit generation sends wardrobe metadata text, not wardrobe images.
- Recognition results are not automatically reanalyzed.
- API keys are never hardcoded. By default a key is kept only for the browser session; storing it across sessions is an explicit, clearly warned opt-in in Settings.
- Free-tier quotas and model availability can change. Scarfy does not promise unlimited AI usage, and it does not ship a shared key.

## Requirements

- Node.js 20+ (developed with Node 26).
- npm.
- An API key from Groq, OpenRouter, Google AI Studio (Gemini), OpenAI, or another OpenAI-compatible provider for AI features. Groq and OpenRouter are usually the easiest free options.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite, usually `http://localhost:5173`.

## Add an API key

1. Create a key from [Groq Console](https://console.groq.com/keys), [OpenRouter](https://openrouter.ai/keys), [Google AI Studio](https://aistudio.google.com/apikey), or [OpenAI](https://platform.openai.com/api-keys). You can also paste a key for a custom OpenAI-compatible base URL.
2. In Scarfy, open **Settings**.
3. Choose the provider, or paste the key and let Scarfy detect it (`gsk_` is Groq, `sk-or-` is OpenRouter, `AIza` is Gemini, `sk-` is OpenAI).
4. Confirm the model (vision-capable defaults are prefilled), click **Test**, then **Save settings**.

Default models:

- Groq: `qwen/qwen3.8-27b` (current Groq vision model; Llama 4 Scout was shut down)
- OpenRouter: `nvidia/nemotron-3.5-super-vl:free`
- OpenAI: `gpt-4o-mini`
- Gemini: `gemini-3.8-flash`

For stronger privacy, keep both storage checkboxes unchecked and paste the key when needed. "Remember for this browser session only" stores the key in `sessionStorage`; "Store key in this browser across sessions" stores it in `localStorage` until removed or site data is cleared. The key is never written to IndexedDB or source files.

Recommended models are listed in Settings. You can also click **Load models** to fetch models available to your key.

## Build and preview

```bash
npm run build
npm run preview
```

## Deploy for free

Scarfy is a static PWA. Build it and deploy the `dist/` folder to any static host.

## Live demo

The public GitHub Pages build is at [https://adamcantcodelol.github.io/scarfy-ai/](https://adamcantcodelol.github.io/scarfy-ai/). Add your own API key in Settings to use the AI features.

### GitHub Pages

This repo deploys the `dist/` folder to GitHub Pages at `/scarfy-ai/`. Vite `base` is set to `/scarfy-ai/` so assets, the manifest, and the service worker resolve correctly on the project site.

### Cloudflare Pages

1. Push the repo to GitHub/GitLab.
2. In Cloudflare Pages, create a project and connect the repo.
3. Build command: `npm run build`
4. Build output directory: `dist`
5. Deploy.

### Netlify

1. Push the repo to GitHub/GitLab.
2. In Netlify, add a new site from Git.
3. Build command: `npm run build`
4. Publish directory: `dist`
5. Deploy.

### Vercel

1. Push the repo to GitHub/GitLab/Bitbucket.
2. Import the project in Vercel.
3. Framework preset: Vite.
4. Build command: `npm run build`
5. Output directory: `dist`
6. Deploy.

No environment variables are required because users supply their own API key in the app.

## Scripts

```bash
npm run dev        # start Vite dev server
npm run build      # typecheck and build production assets
npm run preview    # preview the production build locally
npm run typecheck  # TypeScript check only
npm run icons      # regenerate PWA icons
npm run test:smoke # Puppeteer smoke test against a running server
node scripts/smoke-test.mjs  # same smoke test, useful with SMOKE_URL
node scripts/make-icons.mjs  # same icon generator
```

Set `SMOKE_URL` to test a different server, for example:

```bash
SMOKE_URL=http://127.0.0.1:4173/ node scripts/smoke-test.mjs
```

## Project structure

```text
src/
  App.tsx                 # app state, IndexedDB hydration, routing
  types.ts                # wardrobe/outfit/settings types
  lib/
    db.ts                 # IndexedDB wrapper
    providers.ts          # Provider defaults, key detection, CORS notes
    ai.ts                 # Provider API calls and JSON parsing
    gemini.ts             # Compatibility re-exports from ai.ts
    image.ts              # image prep, cropping, bounding boxes
    defaults.ts           # default metadata/preferences/settings
    hooks.ts              # object URL hook
  components/             # layout, garment fields, item cards
  pages/                  # wardrobe, add/review, outfit AI, saved, settings
public/
  manifest.webmanifest    # PWA manifest
  sw.js                   # service worker
  icons/                  # PWA icons
scripts/
  make-icons.mjs          # icon generator
  smoke-test.mjs          # browser smoke test
```

## Notes and limitations

- AI recognition quality depends on the model you choose. Bounding boxes can be imperfect, so the review step lets users correct detections before saving.
- Very large photos are compressed before being sent to stay within practical request sizes.
- If a model name is unavailable, use **Load models** in Settings or type another supported model.
- OpenAI error responses on chat completions sometimes omit CORS headers, so a bad key can look like a network error. Use **Test** in Settings to confirm the key.
- Custom OpenAI-compatible endpoints only work in the browser if they send CORS headers that allow this site.
- Service worker caching is for the app shell; user photos and wardrobe data remain in IndexedDB and are not uploaded to a backend.
