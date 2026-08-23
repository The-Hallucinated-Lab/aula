import type { Resources } from './locales/en'

/**
 * Make `t()` key-checked.
 *
 * Without this augmentation `t('nav.timtable')` compiles and renders the key
 * itself — a typo that survives review and ships as literal text on screen.
 * With it, the English bundle is the contract: every key a component asks for
 * must exist, and a locale that lacks one falls back rather than being a
 * silent hole.
 */
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation'
    resources: { translation: Resources }
    // The bundle is `as const`, so values are literal types; without this,
    // `t()` is typed as returning those literals rather than `string`.
    returnNull: false
  }
}
