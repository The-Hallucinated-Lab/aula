import { useSyncExternalStore } from 'react'
import { THEMES, resolvedTheme, setTheme, themeStore, type Theme } from '../theme'
import { useTranslation } from '../i18n'

const ICONS: Record<Theme, string> = {
  system: '◐',
  light: '☀',
  dark: '☾',
  contrast: '◑',
}

/**
 * Theme control.
 *
 * A radio group rather than a two-state toggle, because there are four choices
 * and one of them — "match Windows" — is not a palette. A toggle would have to
 * either hide it or pretend it is a third colour scheme.
 *
 * Rendered as radios and styled as buttons, which gives arrow-key navigation
 * and the correct announcement ("Dark, radio button, 3 of 4, selected") from a
 * screen reader with no ARIA of our own.
 */
export function ThemeToggle() {
  const { t } = useTranslation()
  // The third argument is the server snapshot; there is no server, but React
  // requires it and the type has to be `Theme`, not the widened string literal.
  const theme = useSyncExternalStore<Theme>(
    themeStore.subscribe,
    themeStore.getSnapshot,
    () => 'system',
  )
  const inForce = resolvedTheme(theme)

  return (
    <fieldset className="theme-toggle">
      <legend className="sr-only">{t('theme.legend')}</legend>
      {THEMES.map(option => (
        <label
          key={option}
          className={`theme-option ${theme === option ? 'is-selected' : ''}`}
          title={
            option === 'system'
              ? t('theme.systemHint', { palette: t(`theme.${inForce}`) })
              : t(`theme.${option}`)
          }
        >
          <input
            type="radio"
            name="aula-theme"
            value={option}
            checked={theme === option}
            onChange={() => setTheme(option)}
          />
          <span aria-hidden="true">{ICONS[option]}</span>
          <span className="sr-only">{t(`theme.${option}`)}</span>
        </label>
      ))}
    </fieldset>
  )
}
