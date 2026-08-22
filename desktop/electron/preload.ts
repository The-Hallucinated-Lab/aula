/**
 * Preload — the only bridge between the renderer and Node.
 *
 * Exposes a narrow, explicitly enumerated API. The renderer cannot reach
 * `ipcRenderer`, `require`, or the filesystem through anything but these
 * functions.
 */

import { contextBridge, ipcRenderer } from 'electron'

interface SaveRequest {
  suggestedName: string
  data: string
  filters: { name: string; extensions: string[] }[]
}

type Filters = { name: string; extensions: string[] }[]

contextBridge.exposeInMainWorld('aula', {
  version: process.versions.electron,
  platform: process.platform,

  save: (req: SaveRequest) => ipcRenderer.invoke('file:save', req),
  open: (filters: Filters) => ipcRenderer.invoke('file:open', filters),

  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
    onMaximizeChange: (cb: (maximized: boolean) => void) => {
      const handler = (_e: unknown, value: boolean) => cb(value)
      ipcRenderer.on('window:maximized', handler)
      return () => ipcRenderer.removeListener('window:maximized', handler)
    },
  },


  assistant: {
    probe: () => ipcRenderer.invoke('assistant:probe'),
    chat: (
      payload: { requestId: number; model: string; messages: { role: string; content: string }[] },
      onChunk: (text: string) => void,
    ) => new Promise<void>((resolve, reject) => {
      const { requestId } = payload
      const onChunkEvent = (_e: unknown, data: { requestId: number; text: string }) => {
        if (data.requestId === requestId) onChunk(data.text)
      }
      const cleanup = () => {
        ipcRenderer.removeListener('assistant:chunk', onChunkEvent)
        ipcRenderer.removeListener('assistant:done', onDone)
        ipcRenderer.removeListener('assistant:error', onError)
      }
      const onDone = (_e: unknown, data: { requestId: number }) => {
        if (data.requestId !== requestId) return
        cleanup(); resolve()
      }
      const onError = (_e: unknown, data: { requestId: number; message: string }) => {
        if (data.requestId !== requestId) return
        cleanup(); reject(new Error(data.message))
      }
      ipcRenderer.on('assistant:chunk', onChunkEvent)
      ipcRenderer.on('assistant:done', onDone)
      ipcRenderer.on('assistant:error', onError)
      ipcRenderer.send('assistant:chat', payload)
    }),
    cancel: (requestId: number) => ipcRenderer.send('assistant:cancel', requestId),
  },

  onMenuAction: (cb: (action: string) => void) => {
    const handler = (_e: unknown, action: string) => cb(action)
    ipcRenderer.on('menu:action', handler)
    return () => ipcRenderer.removeListener('menu:action', handler)
  },
})
