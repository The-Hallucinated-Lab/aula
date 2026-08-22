import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

type Tone = 'ok' | 'danger' | 'neutral'
interface ToastMsg { id: number; text: string; tone: Tone }

const ToastCtx = createContext<(text: string, tone?: Tone) => void>(() => {})

export const useToast = () => useContext(ToastCtx)

let toastId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMsg[]>([])

  const push = useCallback((text: string, tone: Tone = 'neutral') => {
    const id = toastId++
    setToasts(t => [...t, { id, text, tone }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3600)
  }, [])

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-host">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.tone === 'neutral' ? '' : t.tone}`}>
            {t.tone === 'danger' ? '⊘' : t.tone === 'ok' ? '✓' : 'ℹ'} {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
