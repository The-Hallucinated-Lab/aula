/**
 * Aula — Electron main process.
 *
 * Responsibilities: create the window with the client area extended into the
 * title bar, persist window geometry, own the native menu, and broker the two
 * privileged operations the renderer needs (read a file, write a file).
 *
 * The renderer runs with contextIsolation on and nodeIntegration off. It never
 * touches the filesystem directly.
 */

import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadDotEnv } from './config/dotenv'
import { env, isDev } from './config/env'

const __dirname = dirname(fileURLToPath(import.meta.url))

loadDotEnv()

const DEV_SERVER = env.VITE_DEV_SERVER_URL

interface WindowState {
  width: number
  height: number
  x?: number
  y?: number
  maximized: boolean
}

const DEFAULT_STATE: WindowState = { width: 1440, height: 920, maximized: false }
const MIN_WIDTH = 1024
const MIN_HEIGHT = 680

let mainWindow: BrowserWindow | null = null

/* ------------------------------------------------------------------ *
 * Window geometry persistence
 * ------------------------------------------------------------------ */

const statePath = () => join(app.getPath('userData'), 'window-state.json')

function loadState(): WindowState {
  try {
    const raw = readFileSync(statePath(), 'utf-8')
    const parsed = JSON.parse(raw) as Partial<WindowState>
    return {
      width: Math.max(MIN_WIDTH, Number(parsed.width) || DEFAULT_STATE.width),
      height: Math.max(MIN_HEIGHT, Number(parsed.height) || DEFAULT_STATE.height),
      // Position is spread in only when it was saved. An explicit `undefined`
      // would be a different thing to Electron's own options type, and to the
      // `'x' in state` test that decides whether to let the OS place the window.
      ...(typeof parsed.x === 'number' ? { x: parsed.x } : {}),
      ...(typeof parsed.y === 'number' ? { y: parsed.y } : {}),
      maximized: Boolean(parsed.maximized),
    }
  } catch {
    return { ...DEFAULT_STATE }
  }
}

function saveState(win: BrowserWindow) {
  try {
    // `getNormalBounds` is the documented way to ask for the un-maximised
    // geometry; the previous reach into Electron's private `_restoreBounds`
    // would have started returning `undefined` on any release that renamed it,
    // silently resetting the user's window size on next launch.
    const bounds = win.getNormalBounds()
    const state: WindowState = {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      maximized: win.isMaximized(),
    }
    writeFileSync(statePath(), JSON.stringify(state), 'utf-8')
  } catch {
    // a failed geometry write must never block shutdown
  }
}

/* ------------------------------------------------------------------ *
 * Window
 * ------------------------------------------------------------------ */

function createWindow() {
  const state = loadState()

  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    ...(state.x === undefined ? {} : { x: state.x }),
    ...(state.y === undefined ? {} : { y: state.y }),
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    show: false,
    backgroundColor: '#f2f1ec',
    title: 'Aula — Timetable Studio',
    autoHideMenuBar: true,
    // Extend the app canvas into the non-client area; the renderer draws the
    // title bar and Windows still owns the caption buttons region.
    titleBarStyle: 'hidden',
    titleBarOverlay: false,
    frame: false,
    icon: join(__dirname, '../build/icon.png'),
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  })

  if (state.maximized) mainWindow.maximize()

  // Paint only once React has something to show — avoids a white flash.
  mainWindow.once('ready-to-show', () => mainWindow?.show())

  // A preload failure would silently strip the title bar and every file
  // operation, so surface it loudly rather than shipping a broken shell.
  mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error('[Aula] preload failed to load:', preloadPath, error)
  })

  const emitMaximize = () =>
    mainWindow?.webContents.send('window:maximized', mainWindow.isMaximized())
  mainWindow.on('maximize', emitMaximize)
  mainWindow.on('unmaximize', emitMaximize)
  mainWindow.on('close', () => {
    if (mainWindow) saveState(mainWindow)
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // External links open in the user's browser, never inside the app shell.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = DEV_SERVER && url.startsWith(DEV_SERVER)
    if (!allowed) {
      event.preventDefault()
      if (/^https?:/.test(url)) void shell.openExternal(url)
    }
  })

  if (DEV_SERVER) {
    void mainWindow.loadURL(DEV_SERVER)
  } else {
    void mainWindow.loadFile(join(__dirname, '../dist/index.html'))
  }
}

/* ------------------------------------------------------------------ *
 * Native menu — accelerators the renderer reacts to
 * ------------------------------------------------------------------ */

function send(action: string) {
  mainWindow?.webContents.send('menu:action', action)
}

function buildMenu() {
  const menu = Menu.buildFromTemplate([
    {
      label: '&File',
      submenu: [
        { label: 'New institution…', accelerator: 'CmdOrCtrl+N', click: () => send('new') },
        { label: 'Open project…', accelerator: 'CmdOrCtrl+O', click: () => send('open') },
        { label: 'Save project…', accelerator: 'CmdOrCtrl+S', click: () => send('save') },
        { type: 'separator' },
        {
          label: 'Export timetable (CSV)',
          accelerator: 'CmdOrCtrl+E',
          click: () => send('export-timetable'),
        },
        { label: 'Export constraint register (CSV)', click: () => send('export-constraints') },
        { type: 'separator' },
        { role: 'quit', label: 'Exit' },
      ],
    },
    {
      label: '&Schedule',
      submenu: [
        { label: 'Generate timetable', accelerator: 'CmdOrCtrl+G', click: () => send('generate') },
        {
          label: 'Constraint catalogue',
          accelerator: 'CmdOrCtrl+K',
          click: () => send('constraints'),
        },
        { label: 'Institution setup', accelerator: 'CmdOrCtrl+,', click: () => send('setup') },
        { label: 'Academic calendar', accelerator: 'CmdOrCtrl+L', click: () => send('calendar') },
      ],
    },
    {
      label: '&View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools', visible: isDev },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: '&Help',
      submenu: [
        {
          label: 'About Aula',
          click: () => {
            void dialog.showMessageBox(mainWindow!, {
              type: 'info',
              title: 'About Aula',
              message: 'Aula — Timetable Studio',
              detail:
                `Version ${app.getVersion()}\nElectron ${process.versions.electron} · Chromium ${process.versions.chrome}\n\n` +
                'A constraint-driven timetable planner. The scheduling engine runs locally; no data leaves this machine.',
              buttons: ['Close'],
            })
          },
        },
      ],
    },
  ])
  Menu.setApplicationMenu(menu)
}

/* ------------------------------------------------------------------ *
 * IPC — the only two privileged operations
 * ------------------------------------------------------------------ */

interface SavePayload {
  suggestedName: string
  data: string
  filters: { name: string; extensions: string[] }[]
}

ipcMain.handle('file:save', async (_event, payload: SavePayload) => {
  if (!mainWindow) return { ok: false, error: 'No window' }
  try {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Save',
      defaultPath: join(app.getPath('documents'), payload.suggestedName),
      filters: payload.filters,
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    })
    if (result.canceled || !result.filePath) return { ok: false, canceled: true }

    await mkdir(dirname(result.filePath), { recursive: true })
    await writeFile(result.filePath, payload.data, 'utf-8')
    return { ok: true, path: result.filePath }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
})

ipcMain.handle('file:open', async (_event, filters: { name: string; extensions: string[] }[]) => {
  if (!mainWindow) return { ok: false, error: 'No window' }
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Open',
      filters,
      properties: ['openFile'],
    })
    const path = result.filePaths[0]
    if (result.canceled || path === undefined) return { ok: false, canceled: true }
    if (!existsSync(path)) return { ok: false, error: 'That file no longer exists' }
    const data = await readFile(path, 'utf-8')
    return { ok: true, data, path }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
})

/* ------------------------------------------------------------------ *
 * Local assistant relay
 *
 * The renderer cannot call Ollama directly in the packaged app: its origin is
 * file://, which Ollama rejects on CORS. The main process has no such limit,
 * so it relays the request and streams tokens back over IPC.
 *
 * Nothing leaves the machine — this only ever talks to localhost.
 * ------------------------------------------------------------------ */

const OLLAMA = env.AULA_ASSISTANT_BASE_URL

ipcMain.handle('assistant:probe', async () => {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), env.AULA_ASSISTANT_TIMEOUT_MS)
    const res = await fetch(`${OLLAMA}/api/tags`, { signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) return { ok: false, models: [], error: `Ollama returned ${res.status}` }
    const data = (await res.json()) as { models?: { name: string }[] }
    return { ok: true, models: (data.models ?? []).map(m => m.name) }
  } catch (error) {
    return {
      ok: false,
      models: [],
      error: error instanceof Error ? error.message : 'Could not reach Ollama',
    }
  }
})

interface ChatPayload {
  requestId: number
  model: string
  messages: { role: string; content: string }[]
}

const chatAborts = new Map<number, AbortController>()

ipcMain.on('assistant:cancel', (_event, requestId: number) => {
  chatAborts.get(requestId)?.abort()
  chatAborts.delete(requestId)
})

ipcMain.on('assistant:chat', async (event, payload: ChatPayload) => {
  const { requestId, model, messages } = payload
  const controller = new AbortController()
  chatAborts.set(requestId, controller)

  // Named `reply`, not `send`: the module-level `send` broadcasts menu actions
  // to the window, and shadowing it here made two very different channels look
  // like the same call.
  const reply = (channel: string, data: unknown) => {
    if (!event.sender.isDestroyed()) event.sender.send(channel, data)
  }

  try {
    const res = await fetch(`${OLLAMA}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        think: false,
        options: {
          temperature: env.AULA_ASSISTANT_TEMPERATURE,
          num_ctx: env.AULA_ASSISTANT_NUM_CTX,
        },
      }),
      signal: controller.signal,
    })

    if (!res.ok || !res.body) {
      reply('assistant:error', { requestId, message: `Assistant request failed (${res.status})` })
      return
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          const chunk = JSON.parse(trimmed) as { message?: { content?: string } }
          const piece = chunk.message?.content
          if (piece) reply('assistant:chunk', { requestId, text: piece })
        } catch {
          // partial line; it completes on the next read
        }
      }
    }
    reply('assistant:done', { requestId })
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError'
    reply(aborted ? 'assistant:done' : 'assistant:error', {
      requestId,
      message: error instanceof Error ? error.message : String(error),
    })
  } finally {
    chatAborts.delete(requestId)
  }
})

ipcMain.on('window:minimize', () => mainWindow?.minimize())
ipcMain.on('window:toggle-maximize', () => {
  if (!mainWindow) return
  if (mainWindow.isMaximized()) mainWindow.unmaximize()
  else mainWindow.maximize()
})
ipcMain.on('window:close', () => mainWindow?.close())
ipcMain.handle('window:is-maximized', () => mainWindow?.isMaximized() ?? false)

/* ------------------------------------------------------------------ *
 * Lifecycle
 * ------------------------------------------------------------------ */

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  const start = async () => {
    await app.whenReady()
    buildMenu()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  }
  void start()

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
