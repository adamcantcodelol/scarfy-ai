export type ToastKind = 'info' | 'success' | 'error'

export interface Toast {
  id: string
  kind: ToastKind
  message: string
}

type Listener = (toasts: Toast[]) => void

let toasts: Toast[] = []
const listeners = new Set<Listener>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()

function emit() {
  for (const listener of listeners) listener(toasts)
}

export function showToast(kind: ToastKind, message: string, durationMs = 7000): string {
  const id = crypto.randomUUID()
  toasts = [...toasts, { id, kind, message }]
  emit()
  if (durationMs > 0) {
    timers.set(
      id,
      setTimeout(() => {
        dismissToast(id)
      }, durationMs),
    )
  }
  return id
}

export function dismissToast(id: string) {
  const timer = timers.get(id)
  if (timer) {
    clearTimeout(timer)
    timers.delete(id)
  }
  const next = toasts.filter((toast) => toast.id !== id)
  if (next.length === toasts.length) return
  toasts = next
  emit()
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener)
  listener(toasts)
  return () => {
    listeners.delete(listener)
  }
}
