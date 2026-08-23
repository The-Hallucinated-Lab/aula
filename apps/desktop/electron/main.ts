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
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadDotEnv } from './config/dotenv'
import { env, isDev } from './config/env'
import { ChatRequest, OpenRequest, RequestId, SaveRequest, parsePayload } from './ipc/contracts'
import { LIMITS, RateLimiter } from './ipc/rate-limit'
import { reportUnhandledFailures, superviseChildProcesses, superviseWindow } from './resilience'
import { CONSENT_COPY, initTelemetry, telemetry } from './telemetry'

const __dirname = dirname(fileURLToPath(import.meta.url))

loadDotEnv()

const DEV_SERVER = env.VITE_DEV_SERVER_URL

/** Nothing Aula saves comes close; a larger file is not one of ours. */
const MAX_PROJECT_BYTES = 64 * 1024 * 1024

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
 * Crash-report consent
 *
 * Stored beside the window geometry rather than in the project file: it is a
 * property of this machine and this person, and it must not travel to another
 * desk inside a saved timetable.
 *
 * Three states, and the difference matters. `undefined` means never asked, so
 * ask. `false` means asked and refused, so never ask again. `true` means
 * asked and allowed. Storing a refusal as "no record" would re-ask on every
 * launch, which is how a consent prompt becomes a thing people click through.
 * ------------------------------------------------------------------ */

const consentPath = () => join(app.getPath('userData'), 'telemetry-consent.json')

function readConsent(): boolean | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(consentPath(), 'utf-8'))
    if (typeof parsed === 'object' && parsed !== null && 'allowed' in parsed) {
      const allowed = (parsed as { allowed: unknown }).allowed
      if (typeof allowed === 'boolean') return allowed
    }
  } catch {
    // Never asked, or the file is unreadable. Both mean "ask".
  }
  return undefined
}

function writeConsent(allowed: boolean) {
  try {
    writeFileSync(consentPath(), JSON.stringify({ allowed, at: new Date().toISOString() }), 'utf-8')
  } catch (error) {
    console.warn('[Aula] could not record the telemetry choice:', error)
  }
}

/**
 * Ask, once, and only if there is somewhere to send reports.
 *
 * A DSN is an administrator's permission to ask. It is not the answer, and
 * treating it as one would make the About box's promise conditional on a
 * setting the user never saw.
 */
async function ensureConsent(window: BrowserWindow): Promise<boolean> {
  if (env.AULA_TELEMETRY_DSN === '') return false

  const existing = readConsent()
  if (existing !== undefined) return existing

  const { response } = await dialog.showMessageBox(window, {
    type: 'question',
    title: CONSENT_COPY.title,
    message: CONSENT_COPY.message,
    detail: CONSENT_COPY.detail,
    buttons: [CONSENT_COPY.allow, CONSENT_COPY.deny],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  })

  const allowed = response === 0
  writeConsent(allowed)
  return allowed
}

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
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      /* The preload only calls `contextBridge` and `ipcRenderer`, both of which
         a sandboxed preload still has. Nothing here needs `fs` or `path`, so
         the renderer process runs inside the OS sandbox — the single largest
         reduction in what a renderer compromise is worth. */
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      spellcheck: false,
    },
  })

  /* Aula needs no device permission of any kind: no camera, no microphone, no
     location, no notifications, no clipboard read. Denying the whole class is
     both accurate and immune to a new permission being added to Chromium later
     and silently defaulting to a prompt. */
  const session = mainWindow.webContents.session
  /* A *request* is the page asking for something and would raise a prompt, so
     one arriving means something in the renderer is doing what it should not —
     worth a line in the log. A *check* is Chromium querying current state
     unprompted; it fires several times on every launch and logging it would be
     noise that trains the reader to ignore the log. */
  session.setPermissionRequestHandler((_contents, permission, callback) => {
    console.warn(`[Aula] denied permission request: ${permission}`)
    callback(false)
  })
  session.setPermissionCheckHandler(() => false)
  /* Defence in depth for the development server, whose responses do carry
     headers. The production policy travels in the document because `file://`
     has none; this makes the dev surface match. */
  session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'X-Content-Type-Options': ['nosniff'],
        'X-Frame-Options': ['DENY'],
        'Referrer-Policy': ['no-referrer'],
      },
    })
  })

  /* Watch this renderer. A replacement window created by recovery is
     supervised too, and shares the attempt budget so it does not get a fresh
     one — three crashes is three crashes however many windows they span. */
  superviseWindow(mainWindow, {
    recreateWindow: createWindow,
    report: event => telemetry().capture(event),
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
            if (!mainWindow) return
            void dialog.showMessageBox(mainWindow, {
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
 * IPC — the only privileged operations
 *
 * Every handler below does the same three things before it does any work:
 * confirm the call came from this window, check the channel's rate limit, and
 * parse the payload against its schema. A TypeScript interface on the handler
 * parameter describes a value that arrived over a serialisation boundary and
 * enforces nothing at runtime.
 * ------------------------------------------------------------------ */

const limiter = new RateLimiter()

/**
 * Reject anything that did not come from the application's own window.
 *
 * Without this, any frame the renderer ends up hosting can invoke a privileged
 * channel. Aula never opens one, which is exactly why the check is cheap to
 * keep correct.
 */
function fromMainWindow(event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent): boolean {
  return mainWindow !== null && event.sender === mainWindow.webContents
}

function guard(
  event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent,
  channel: string,
): string | null {
  if (!fromMainWindow(event)) return 'Request did not come from the Aula window'
  const limit = LIMITS[channel]
  return limit ? limiter.check(channel, limit) : null
}

ipcMain.handle('file:save', async (event, payload: unknown) => {
  const blocked = guard(event, 'file:save')
  if (blocked) return { ok: false, error: blocked }
  if (!mainWindow) return { ok: false, error: 'No window' }

  const parsed = parsePayload(SaveRequest, payload, 'save request')
  if (!parsed.ok) return parsed

  const { suggestedName, data, filters } = parsed.value
  try {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Save',
      defaultPath: join(app.getPath('documents'), suggestedName),
      filters,
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    })
    if (result.canceled || !result.filePath) return { ok: false, canceled: true }

    await mkdir(dirname(result.filePath), { recursive: true })
    await writeFile(result.filePath, data, 'utf-8')
    return { ok: true, path: result.filePath }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
})

ipcMain.handle('file:open', async (event, payload: unknown) => {
  const blocked = guard(event, 'file:open')
  if (blocked) return { ok: false, error: blocked }
  if (!mainWindow) return { ok: false, error: 'No window' }

  const parsed = parsePayload(OpenRequest, payload, 'open request')
  if (!parsed.ok) return parsed

  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Open',
      filters: parsed.value,
      properties: ['openFile'],
    })
    const path = result.filePaths[0]
    if (result.canceled || path === undefined) return { ok: false, canceled: true }
    if (!existsSync(path)) return { ok: false, error: 'That file no longer exists' }

    /* Cap what a single read can pull into memory. The renderer is about to be
       handed this whole string, and an accidental pick of a multi-gigabyte file
       should be a message, not an out-of-memory crash. */
    const info = await stat(path)
    if (info.size > MAX_PROJECT_BYTES) {
      const mb = Math.round(MAX_PROJECT_BYTES / (1024 * 1024))
      return { ok: false, error: `That file is larger than ${mb} MB — it is not an Aula project.` }
    }

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

ipcMain.handle('assistant:probe', async event => {
  const blocked = guard(event, 'assistant:probe')
  if (blocked) return { ok: false, models: [], error: blocked }
  if (env.AULA_ASSISTANT_DISABLED) {
    return { ok: false, models: [], error: 'The assistant is disabled by configuration.' }
  }
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

const chatAborts = new Map<number, AbortController>()

/**
 * One conversation at a time.
 *
 * The interface only ever has one in flight, so an unbounded map is not
 * capacity, it is a place for abandoned AbortControllers to accumulate if the
 * renderer stops sending `assistant:cancel`.
 */
const MAX_CONCURRENT_CHATS = 4

/**
 * Ceiling on a single streamed answer.
 *
 * The reply is accumulated in the renderer as it arrives. A local model that
 * fails to emit a stop token would otherwise stream until the window runs out
 * of memory; 512 kB is far past any answer this assistant should give.
 */
const MAX_ANSWER_BYTES = 512 * 1024

ipcMain.on('assistant:cancel', (event, payload: unknown) => {
  if (!fromMainWindow(event)) return
  const parsed = RequestId.safeParse(payload)
  if (!parsed.success) return
  chatAborts.get(parsed.data)?.abort()
  chatAborts.delete(parsed.data)
})

ipcMain.on('assistant:chat', async (event, payload: unknown) => {
  // Named `reply`, not `send`: the module-level `send` broadcasts menu actions
  // to the window, and shadowing it here made two very different channels look
  // like the same call.
  const reply = (channel: string, data: unknown) => {
    if (!event.sender.isDestroyed()) event.sender.send(channel, data)
  }

  const blocked = guard(event, 'assistant:chat')
  if (blocked) {
    reply('assistant:error', { requestId: -1, message: blocked })
    return
  }
  if (env.AULA_ASSISTANT_DISABLED) {
    reply('assistant:error', {
      requestId: -1,
      message: 'The assistant is disabled by configuration.',
    })
    return
  }

  const parsed = parsePayload(ChatRequest, payload, 'assistant request')
  if (!parsed.ok) {
    reply('assistant:error', { requestId: -1, message: parsed.error })
    return
  }

  const { requestId, model, messages } = parsed.value
  if (chatAborts.size >= MAX_CONCURRENT_CHATS) {
    reply('assistant:error', {
      requestId,
      message: 'Too many assistant requests are already running.',
    })
    return
  }

  const controller = new AbortController()
  chatAborts.set(requestId, controller)

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
    let streamed = 0

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
          if (!piece) continue
          streamed += piece.length
          if (streamed > MAX_ANSWER_BYTES) {
            controller.abort()
            reply('assistant:error', {
              requestId,
              message: 'The model kept generating past a reasonable answer length and was stopped.',
            })
            return
          }
          reply('assistant:chunk', { requestId, text: piece })
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

  const hooks = {
    recreateWindow: createWindow,
    report: (e: Parameters<ReturnType<typeof telemetry>['capture']>[0]) => telemetry().capture(e),
  }
  superviseChildProcesses(hooks)
  reportUnhandledFailures(hooks)

  const start = async () => {
    await app.whenReady()
    buildMenu()
    createWindow()

    /* Consent is asked after the window exists, so the prompt has a parent and
       appears over Aula rather than as a loose dialog on the desktop. It is
       also asked after first paint, so the application is visibly working
       before it asks the user for anything. */
    if (mainWindow) {
      const window = mainWindow
      window.once('ready-to-show', () => {
        void (async () => {
          const allowed = await ensureConsent(window)
          await initTelemetry(() => allowed)
        })()
      })
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  }
  void start()

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  /* Flush before exit. A crash report that never left the machine is the same
     as no crash report, and this is the last moment it can be sent. */
  app.on('before-quit', event => {
    if (!telemetry().active) return
    event.preventDefault()
    void telemetry()
      .close()
      .finally(() => app.exit(0))
  })
}
