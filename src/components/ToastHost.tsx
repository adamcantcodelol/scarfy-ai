import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { dismissToast, subscribeToasts, type Toast } from '../lib/toasts'

export function ToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([])
  useEffect(() => subscribeToasts(setToasts), [])
  if (toasts.length === 0) return null
  return (
    <div className="toast-host" aria-live="polite" aria-relevant="additions">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
          <div>{toast.message}</div>
          <button type="button" className="toast-dismiss" onClick={() => dismissToast(toast.id)} aria-label="Dismiss">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
