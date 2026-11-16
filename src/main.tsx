import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then((registration) => {
        const announce = () => window.dispatchEvent(new Event('scarfy:update-available'))
        if (registration.waiting) announce()
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) announce()
          })
        })
        setInterval(() => void registration.update(), 60_000)
      })
      .catch(() => {
        // Service worker registration is optional; the app still works without it.
      })
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void navigator.serviceWorker.getRegistration().then((registration) => registration?.update())
    })
  })
}
