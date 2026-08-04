import * as React from 'react'
import { cn } from '@/lib/utils'
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react'

type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: string
  type: ToastType
  title: string
  message?: string
}

interface ToastStore {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
}

const toastStore: ToastStore = {
  toasts: [],
  addToast: () => {},
  removeToast: () => {},
}

const listeners: Array<(toasts: Toast[]) => void> = []

function notify(listeners: Array<(toasts: Toast[]) => void>, toasts: Toast[]) {
  listeners.forEach((l) => l(toasts))
}

toastStore.addToast = (toast) => {
  const id = Math.random().toString(36).slice(2)
  toastStore.toasts = [...toastStore.toasts, { ...toast, id }]
  notify(listeners, toastStore.toasts)
  setTimeout(() => toastStore.removeToast(id), 5000)
}

toastStore.removeToast = (id) => {
  toastStore.toasts = toastStore.toasts.filter((t) => t.id !== id)
  notify(listeners, toastStore.toasts)
}

export const toast = {
  success: (title: string, message?: string) =>
    toastStore.addToast({ type: 'success', title, message }),
  error: (title: string, message?: string) =>
    toastStore.addToast({ type: 'error', title, message }),
  warning: (title: string, message?: string) =>
    toastStore.addToast({ type: 'warning', title, message }),
  info: (title: string, message?: string) =>
    toastStore.addToast({ type: 'info', title, message }),
}

function useToasts() {
  const [toasts, setToasts] = React.useState<Toast[]>(toastStore.toasts)
  React.useEffect(() => {
    listeners.push(setToasts)
    return () => {
      const index = listeners.indexOf(setToasts)
      if (index > -1) listeners.splice(index, 1)
    }
  }, [])
  return { toasts, removeToast: toastStore.removeToast }
}

const icons: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle className="h-5 w-5 text-green-500" />,
  error: <AlertCircle className="h-5 w-5 text-red-500" />,
  warning: <AlertTriangle className="h-5 w-5 text-orange-500" />,
  info: <Info className="h-5 w-5 text-blue-500" />,
}

const colors: Record<ToastType, string> = {
  success: 'border-green-200 bg-green-50',
  error: 'border-red-200 bg-red-50',
  warning: 'border-orange-200 bg-orange-50',
  info: 'border-blue-200 bg-blue-50',
}

export function ToastContainer() {
  const { toasts, removeToast } = useToasts()

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'flex items-start gap-3 rounded-lg border p-4 shadow-lg transition-all',
            colors[t.type]
          )}
        >
          {icons[t.type]}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">{t.title}</p>
            {t.message && <p className="text-sm text-gray-600 mt-0.5">{t.message}</p>}
          </div>
          <button
            onClick={() => removeToast(t.id)}
            className="text-gray-400 hover:text-gray-600 shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
