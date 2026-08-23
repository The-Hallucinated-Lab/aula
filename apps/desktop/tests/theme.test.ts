import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { THEMES, THEME_LABELS, initTheme, resolvedTheme, setTheme, themeStore } from '../src/theme'

/**
 * Theme selection.
 *
 * The load-bearing detail is that `system` is stored as the *absence* of the
 * `data-theme` attribute, because the dark media query in `styles/themes.css`
 * is written as `:root:not([data-theme])`. Anything present there — including a
 * literal "system" — would pin the light palette on a machine set to dark.
 */

const attr = () => document.documentElement.getAttribute('data-theme')

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

afterEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

describe('setTheme', () => {
  it.each(['light', 'dark', 'contrast'] as const)('puts %s on the document element', theme => {
    setTheme(theme)
    expect(attr()).toBe(theme)
    expect(localStorage.getItem('aula.theme')).toBe(theme)
  })

  it('removes the attribute for system rather than writing "system"', () => {
    setTheme('dark')
    expect(attr()).toBe('dark')

    setTheme('system')
    expect(attr()).toBeNull()
    expect(localStorage.getItem('aula.theme')).toBeNull()
  })

  it('notifies subscribers', () => {
    let calls = 0
    const unsubscribe = themeStore.subscribe(() => calls++)
    setTheme('dark')
    setTheme('light')
    unsubscribe()
    setTheme('contrast')
    expect(calls).toBe(2)
  })
})

describe('initTheme', () => {
  it('restores a stored choice', () => {
    localStorage.setItem('aula.theme', 'contrast')
    initTheme()
    expect(attr()).toBe('contrast')
    expect(themeStore.getSnapshot()).toBe('contrast')
  })

  it('falls back to system when nothing is stored', () => {
    initTheme()
    expect(attr()).toBeNull()
    expect(themeStore.getSnapshot()).toBe('system')
  })

  it('ignores a stored value that is not a theme', () => {
    // A hand-edited or stale key must not put an unknown attribute on the root,
    // which would silently disable the dark media query.
    for (const junk of ['neon', '', 'null', '{}', 'SYSTEM']) {
      localStorage.setItem('aula.theme', junk)
      initTheme()
      expect(attr()).toBeNull()
      expect(themeStore.getSnapshot()).toBe('system')
    }
  })
})

describe('resolvedTheme', () => {
  it('passes an explicit choice through', () => {
    expect(resolvedTheme('dark')).toBe('dark')
    expect(resolvedTheme('light')).toBe('light')
    expect(resolvedTheme('contrast')).toBe('contrast')
  })

  it('resolves system to a real palette', () => {
    expect(['light', 'dark']).toContain(resolvedTheme('system'))
  })
})

describe('the theme list', () => {
  it('labels every theme, so no control can render a blank option', () => {
    for (const theme of THEMES) {
      expect(THEME_LABELS[theme]).toBeTruthy()
    }
  })

  it('offers system first, because it is the default', () => {
    expect(THEMES[0]).toBe('system')
  })
})
