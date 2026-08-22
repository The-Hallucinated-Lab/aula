/**
 * Platform bridge.
 *
 * In the packaged Windows app these calls go through Electron's contextBridge
 * to the main process. In a plain browser (`npm run dev` without Electron)
 * they degrade to Blob downloads and a file picker, so the whole UI stays
 * usable either way.
 */

export interface SaveRequest {
  suggestedName: string
  data: string
  /** e.g. [{ name: 'CSV', extensions: ['csv'] }] */
  filters: { name: string; extensions: string[] }[]
}

export interface SaveResult { ok: boolean; path?: string; canceled?: boolean; error?: string }
export interface OpenResult { ok: boolean; data?: string; path?: string; canceled?: boolean; error?: string }


export interface AssistantProbe {
  ok: boolean
  models: string[]
  error?: string
}

export interface AssistantChatPayload {
  requestId: number
  model: string
  messages: { role: string; content: string }[]
}

export interface AulaBridge {
  version: string
  platform: string
  save(req: SaveRequest): Promise<SaveResult>
  open(filters: { name: string; extensions: string[] }[]): Promise<OpenResult>
  window: {
    minimize(): void
    toggleMaximize(): void
    close(): void
    isMaximized(): Promise<boolean>
    onMaximizeChange(cb: (maximized: boolean) => void): () => void
  }
  onMenuAction(cb: (action: string) => void): () => void
  assistant: {
    probe(): Promise<AssistantProbe>
    chat(payload: AssistantChatPayload, onChunk: (text: string) => void): Promise<void>
    cancel(requestId: number): void
  }
}

declare global {
  interface Window { aula?: AulaBridge }
}

export const bridge = (): AulaBridge | undefined =>
  typeof window !== 'undefined' ? window.aula : undefined

export const isDesktop = () => Boolean(bridge())

/** Save text to disk — native dialog under Electron, download in a browser. */
export async function saveText(req: SaveRequest): Promise<SaveResult> {
  const api = bridge()
  if (api) return api.save(req)

  try {
    const blob = new Blob([req.data], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = req.suggestedName
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
    return { ok: true, path: req.suggestedName }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/** Read a text file — native dialog under Electron, file input in a browser. */
export async function openText(
  filters: { name: string; extensions: string[] }[],
): Promise<OpenResult> {
  const api = bridge()
  if (api) return api.open(filters)

  return new Promise<OpenResult>(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = filters.flatMap(f => f.extensions.map(e => `.${e}`)).join(',')
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) { resolve({ ok: false, canceled: true }); return }
      const reader = new FileReader()
      reader.onload = () => resolve({ ok: true, data: String(reader.result), path: file.name })
      reader.onerror = () => resolve({ ok: false, error: 'Could not read that file' })
      reader.readAsText(file)
    }
    input.oncancel = () => resolve({ ok: false, canceled: true })
    input.click()
  })
}
