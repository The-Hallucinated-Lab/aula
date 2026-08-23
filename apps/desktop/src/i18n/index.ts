// `use` is i18next's plugin registration. Aliased because React 19 has a hook
// of that name, and an unaliased import trips the rules-of-hooks check here.
import i18next, { changeLanguage, use as registerPlugin } from 'i18next'
import { initReactI18next } from 'react-i18next'
import { en } from './locales/en'

/**
 * Internationalisation.
 *
 * English is the source locale and the fallback. Nothing else ships yet; the
 * point of this module is that adding a locale is a data change rather than a
 * code change — `resources` gains a key and the switcher gains an option.
 *
 * Two decisions worth stating.
 *
 * There is no language *detector*. A timetable office is a shared machine and
 * a browser's `Accept-Language` is a poor proxy for what the person at the desk
 * reads; the choice is explicit and stored, like the theme.
 *
 * The 500 constraint texts are deliberately *not* here. They live in
 * `@aula/core` as domain data, they are quoted verbatim in exports that go to a
 * regulator, and translating them is a job for someone who knows what
 * "fume-hood turnover" means in the target language — not a developer with a
 * dictionary. Translating them is a separate, later exercise against the same
 * mechanism.
 */

export const SUPPORTED_LOCALES = ['en'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]

export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
}

const STORAGE_KEY = 'aula.locale'

const isLocale = (value: unknown): value is Locale =>
  typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value)

function storedLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return isLocale(stored) ? stored : 'en'
  } catch {
    return 'en'
  }
}

export function initI18n() {
  if (i18next.isInitialized) return i18next
  void registerPlugin(initReactI18next).init({
    resources: { en: { translation: en } },
    lng: storedLocale(),
    fallbackLng: 'en',
    // A missing key should be visible in development and harmless in
    // production; i18next renders the key itself, which is exactly that.
    debug: false,
    interpolation: {
      // React escapes for us. Escaping again turns an apostrophe in a course
      // name into `&#39;` on screen.
      escapeValue: false,
    },
    returnNull: false,
  })
  return i18next
}

export function setLocale(locale: Locale) {
  void changeLanguage(locale)
  try {
    localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    // The choice holds for this session; only persistence is lost.
  }
}

export const currentLocale = (): Locale => (isLocale(i18next.language) ? i18next.language : 'en')

export { useTranslation, Trans } from 'react-i18next'
