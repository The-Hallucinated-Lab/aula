/**
 * Theme selection.
 *
 * Four choices, three of which are palettes and one of which is "whatever the
 * operating system says". `system` is the default and is stored as the absence
 * of a `data-theme` attribute, which is exactly what the CSS media query in
 * `styles/themes.css` keys off — so the two halves cannot drift apart.
 *
 * Built on `useSyncExternalStore` rather than the application store. A theme is
 * a property of this machine and this person, not of the project: it must not
 * travel in a saved file, and it must be applied before React mounts, which a
 * store initialised during render cannot do.
 */

export const THEMES = ['system', 'light', 'dark', 'contrast'] as const
export type Theme = (typeof THEMES)[number]

export const THEME_LABELS: Record<Theme, string> = {
  system: 'Match Windows',
  light: 'Light',
  dark: 'Dark',
  contrast: 'High contrast',
}

const STORAGE_KEY = 'aula.theme'

const isTheme = (value: unknown): value is Theme =>
  typeof value === 'string' && (THEMES as readonly string[]).includes(value)

function read(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return isTheme(stored) ? stored : 'system'
  } catch {
    // Private mode, or storage disabled by policy. Neither is a reason to fail
    // to render; the user simply gets the system theme this session.
    return 'system'
  }
}

/**
 * Put the choice on the document element.
 *
 * `system` removes the attribute rather than setting it to "system", because
 * the dark media query is written as `:root:not([data-theme])`. Anything
 * present there — including a value the CSS does not recognise — would pin the
 * light palette on a machine set to dark.
 */
function apply(theme: Theme) {
  const root = document.documentElement
  if (theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
}

let current: Theme = 'system'
const listeners = new Set<() => void>()

/**
 * Apply the stored theme.
 *
 * Called from `main.tsx` before `createRoot`, so the palette is on the document
 * before the first paint. Doing it in an effect would show one frame of the
 * wrong theme to anyone whose choice differs from their operating system's.
 */
export function initTheme() {
  current = read()
  apply(current)
}

export function setTheme(theme: Theme) {
  current = theme
  apply(theme)
  try {
    if (theme === 'system') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // The choice still holds for this session; only persistence is lost.
  }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)

  /* Re-render when the operating system flips while `system` is selected. The
     CSS handles the repaint on its own; React needs to know so the control
     shows which palette is actually in force. */
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const onSystemChange = () => {
    if (current === 'system') listener()
  }
  media.addEventListener('change', onSystemChange)

  return () => {
    listeners.delete(listener)
    media.removeEventListener('change', onSystemChange)
  }
}

const getSnapshot = () => current

/** The palette actually in force, with `system` resolved. */
export function resolvedTheme(theme: Theme): Exclude<Theme, 'system'> {
  if (theme !== 'system') return theme
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

export const themeStore = { subscribe, getSnapshot }
