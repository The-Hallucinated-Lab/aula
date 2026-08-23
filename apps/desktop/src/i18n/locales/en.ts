import { HELP } from '../../content/help'

/**
 * English — the source locale.
 *
 * A TypeScript module rather than JSON, for two reasons. Keys become a literal
 * type, so `t('nav.timetable')` is checked at compile time and a typo is a
 * build error instead of a string that renders as its own key. And the field
 * help already exists as a checked object in `content/help.ts`; registering it
 * as a namespace means there is one copy of that wording, not two that drift.
 *
 * Plural forms use i18next's `_one` / `_other` suffixes rather than the
 * hand-written `{n === 1 ? '' : 's'}` this interface used throughout. English
 * has two forms; several of the languages an Indian university would want have
 * more, and the ternary cannot express them.
 */
export const en = {
  app: {
    name: 'Aula',
    tagline: 'Timetable Studio',
    skipToContent: 'Skip to content',
  },

  nav: {
    label: 'Main',
    overview: 'Overview',
    timetable: 'Timetable',
    termSetup: 'Term setup',
    institution: 'Institution',
    data: 'Data',
    calendar: 'Calendar',
    scenarios: 'Scenarios',
    constraints: 'Constraints',
    assistant: 'Assistant',
    /* aula:cli:nav-keys */
  },

  theme: {
    legend: 'Colour theme',
    system: 'Match Windows',
    light: 'Light',
    dark: 'Dark',
    contrast: 'High contrast',
    systemHint: 'Match Windows — currently {{palette}}',
  },

  engine: {
    ready: 'Engine ready',
    solving: 'Solving',
    stale: 'Timetable out of date',
    idleTitle: 'Solver idle',
    staleTitle: 'The institution changed after the last solve — generate again',
    generate: 'Generate',
  },

  file: {
    menu: 'File',
    open: 'Open project…',
    save: 'Save project…',
    exportTimetable: 'Export timetable (CSV)',
    exportConstraints: 'Export constraint register (CSV)',
    saved: 'Project saved',
    loaded: 'Project loaded',
    saveFailed: 'Save failed',
    openFailed: 'Could not open that file',
    notAProject: 'That file is not a valid Aula project',
    generateFirst: 'Generate a timetable first',
  },

  errors: {
    pageTitle: 'This page could not render',
    reload: 'Reload',
    discard: 'Discard the saved project',
  },

  counts: {
    session_one: '{{count}} session',
    session_other: '{{count}} sessions',
    room_one: '{{count}} room',
    room_other: '{{count}} rooms',
    student_one: '{{count}} student',
    student_other: '{{count}} students',
    problem_one: '{{count}} thing to know',
    problem_other: '{{count}} things to know',
  },

  /**
   * Field help, registered from its existing home.
   *
   * A translator supplies the same keys in their locale; nothing here has to be
   * copied or kept in step by hand.
   */
  help: HELP,
} as const

export type Resources = typeof en
