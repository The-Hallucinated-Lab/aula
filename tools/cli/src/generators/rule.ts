import { GenerateError, type Plan } from '../lib/edit.ts'
import { camel, requireName } from '../lib/names.ts'

/**
 * A constraint rule.
 *
 * The least obvious thing in this codebase to add by hand. A rule has to land
 * in the right one of ten subject modules, be declared in `RuleKey` or the
 * registry will not accept it, use the shared kit rather than re-deriving what
 * it needs, and pick exactly one of `check`, `cost` or `audit` — a rule that
 * implements two is counted twice in every report the application produces,
 * which `npm run verify` checks and which is easy to get wrong.
 *
 * The generator does all of that. What it deliberately does not do is add a
 * catalogue row: a row is a numbered, human-authored sentence that goes into
 * an export a regulator reads, and inventing one would be exactly the kind of
 * plausible-looking fiction this repository's contract forbids.
 */

export const RULE_GROUPS = [
  'availability',
  'staff-workload',
  'staff-preferences',
  'cohort',
  'sequencing',
  'rooms',
  'geography',
  'accessibility',
  'administrative',
  'quality',
] as const

export type RuleGroup = (typeof RULE_GROUPS)[number]

export const RULE_KINDS = ['check', 'cost', 'audit'] as const
export type RuleKind = (typeof RULE_KINDS)[number]

const BODIES: Record<RuleKind, string> = {
  check: `    /**
     * Gate a candidate placement.
     *
     * Return \`ok\` to allow it, or a sentence saying why not. That sentence
     * reaches the user as the reason a session could not be placed, so write
     * it for a timetable officer: name the thing that clashed, not the rule.
     */
    check: (c, occ, ctx, p) => {
      const limit = num(p, 'limit', 0)
      void c
      void occ
      void ctx
      void limit
      return ok
    },`,
  cost: `    /**
     * Score a candidate placement.
     *
     * Return 0 for "ideal" through 1 for "as bad as this rule gets". The
     * solver multiplies it by the weight an administrator set, so the scale
     * has to mean the same thing here as in every other soft rule — a rule
     * that returns 40 does not express a strong preference, it overrides
     * every other preference in the catalogue.
     *
     * This runs once per candidate placement, which on a default institution
     * is hundreds of thousands of calls per solve. Allocate nothing.
     */
    cost: (c, occ, ctx, p) => {
      const target = num(p, 'target', 0)
      void c
      void occ
      void ctx
      void target
      return 0
    },`,
  audit: `    /**
     * Inspect the finished schedule.
     *
     * For properties that cannot be decided one placement at a time — a total,
     * a distribution, a comparison between cohorts. Return one violation per
     * finding; an empty array means nothing to report.
     */
    audit: (inst, sessions, ctx, p) => {
      void inst
      void sessions
      void ctx
      void p
      return []
    },`,
}

/** What each body needs: a symbol, and the module it comes from. */
const NEEDS: Record<RuleKind, { symbol: string; from: string }[]> = {
  check: [
    { symbol: 'num', from: '../context' },
    { symbol: 'ok', from: './kit' },
  ],
  cost: [{ symbol: 'num', from: '../context' }],
  audit: [],
}

/**
 * Is this symbol already imported in this module?
 *
 * Testing for the whole import *line* is not enough, and the difference is a
 * broken build rather than an untidy one: `rooms.ts` imports `num` inside
 * `import { bool, num, str } from '../context'`, so a line-level check finds
 * nothing, adds `import { num } from '../context'`, and the module no longer
 * compiles with a duplicate identifier.
 */
function alreadyImports(source: string, symbol: string): boolean {
  for (const line of source.split('\n')) {
    if (!line.startsWith('import ')) continue
    const specifiers = /^import\s+(?:type\s+)?\{([^}]*)\}/.exec(line)?.[1]
    if (specifiers === undefined) continue
    const names = specifiers
      .split(',')
      .map(s => s.replace(/\btype\b/, '').trim())
      .map(
        s =>
          s
            .split(/\s+as\s+/)
            .pop()
            ?.trim() ?? '',
      )
    if (names.includes(symbol)) return true
  }
  return false
}

export function generateRule(
  plan: Plan,
  rawName: string | undefined,
  options: { group?: string | undefined; kind?: string | undefined },
) {
  const name = requireName(rawName, 'rule')
  const key = camel(name)

  const group = (options.group ?? 'quality') as RuleGroup
  if (!(RULE_GROUPS as readonly string[]).includes(group)) {
    throw new GenerateError(`unknown group "${group}".\n  Pick one of: ${RULE_GROUPS.join(', ')}`)
  }

  const kind = (options.kind ?? 'check') as RuleKind
  if (!(RULE_KINDS as readonly string[]).includes(kind)) {
    throw new GenerateError(`unknown kind "${kind}". Pick one of: ${RULE_KINDS.join(', ')}`)
  }

  const modulePath = `packages/core/src/engine/rules/${group}.ts`
  const source = plan.read(modulePath)
  if (new RegExp(`^\\s{2}${key}:`, 'm').test(source)) {
    throw new GenerateError(`\`${key}\` is already implemented in ${modulePath}`)
  }

  /* `RuleKey` is derived from the `RULE_KEYS` const array, so a new key is an
     entry in that array rather than a member of a union. Getting this wrong
     produces a registry entry the type rejects with an error that points at
     the registry rather than at the missing key. */
  plan.insertBefore(
    'packages/core/src/data/constraints/types.ts',
    '/* aula:cli:rule-keys */',
    `'${key}',`,
  )

  const entry = `  /**
   * TODO: say what this rule enforces, in one sentence, in the terms a
   * timetable officer would use.
   */
  ${key}: {
${BODIES[kind]}
  },
`
  // Appended just above the closing brace of the group's registry object.
  const closing = source.lastIndexOf('\n}')
  if (closing === -1)
    throw new GenerateError(`could not find the end of the registry in ${modulePath}`)

  let next = `${source.slice(0, closing + 1)}${entry}}\n`

  // Only add an import the module does not already have, tested by symbol.
  for (const need of NEEDS[kind]) {
    if (alreadyImports(next, need.symbol)) continue
    const firstImport = next.indexOf('import ')
    next = `${next.slice(0, firstImport)}import { ${need.symbol} } from '${need.from}'\n${next.slice(firstImport)}`
  }

  plan.rewrite(modulePath, next)

  return {
    key,
    group,
    kind,
    modulePath,
    next,
    note:
      `Next: give \`${key}\` a real implementation, then point a catalogue row at it.\n` +
      '  A row is a numbered sentence a person writes — the CLI will not invent one,\n' +
      '  because it ends up in an export somebody signs off.\n' +
      '  Finish with `npm run verify`, which checks that every referenced rule is\n' +
      '  implemented and that no rule implements more than one of check/cost/audit.',
  }
}
