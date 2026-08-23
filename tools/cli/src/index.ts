#!/usr/bin/env node
/**
 * `aula` — project scaffolding.
 *
 * Generates code that already conforms to the architecture, and registers it
 * at the seams where registration is easy to forget: a rule key that has to
 * exist on `RuleKey`, a route that has to exist in three files, a store action
 * that has to exist on `AppState` before its slice can name it.
 *
 * Run straight from TypeScript. Node strips types natively, and the repository
 * already enforces `erasableSyntaxOnly` everywhere — which is exactly the
 * constraint that makes that work — so there is no build step and no compiled
 * copy to go stale.
 *
 *   npm run new -- page Reports
 *   npm run new -- rule roomTurnoverGap --group rooms --kind cost
 *   npm run new -- slice exports
 *   npm run new -- component EmptyState
 *   npm run new -- page Reports --dry-run
 */

import { parseArgs } from 'node:util'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { GenerateError, Plan } from './lib/edit.ts'
import { InvalidName } from './lib/names.ts'
import { RULE_GROUPS, RULE_KINDS, generateRule } from './generators/rule.ts'
import { generatePage } from './generators/page.ts'
import { generateSlice } from './generators/slice.ts'
import { generateComponent } from './generators/component.ts'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

const KINDS = ['rule', 'page', 'slice', 'component'] as const
type Kind = (typeof KINDS)[number]

const USAGE = `aula — scaffolding for this repository

  aula new <what> <name> [options]

WHAT

  rule <key>        a constraint rule, in the right subject module, with its
                    key declared on RuleKey
      --group <g>   ${RULE_GROUPS.join(', ')}
                    (default: quality)
      --kind  <k>   ${RULE_KINDS.join(' | ')}  (default: check)

  page <Name>       a screen, its route, its nav entry and its translation key

  slice <name>      a store slice and the AppState members it owns

  component <Name>  a shared component and its test

OPTIONS

  --dry-run         print what would change, write nothing
  -h, --help        this

WHAT IT WILL NOT DO

  Write a catalogue row. A row is a numbered sentence that ends up in an export
  somebody signs off; inventing one would be the kind of plausible fiction
  CLAUDE.md §1.1 exists to prevent.
`

function run(argv: string[]): number {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      group: { type: 'string' },
      kind: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  })

  if (values.help || positionals.length === 0) {
    console.log(USAGE)
    return positionals.length === 0 && !values.help ? 1 : 0
  }

  const [verb, what, name] = positionals
  if (verb !== 'new') {
    console.error(`unknown command "${verb}". The only verb is \`new\`.\n`)
    console.log(USAGE)
    return 1
  }

  if (what === undefined || !(KINDS as readonly string[]).includes(what)) {
    console.error(`unknown thing to generate: "${what ?? '(nothing)'}"`)
    console.error(`Pick one of: ${KINDS.join(', ')}\n`)
    return 1
  }

  const plan = new Plan(repoRoot)
  let note = ''

  switch (what as Kind) {
    case 'rule':
      note = generateRule(plan, name, { group: values.group, kind: values.kind }).note
      break
    case 'page':
      note = generatePage(plan, name).note
      break
    case 'slice':
      note = generateSlice(plan, name).note
      break
    case 'component':
      note = generateComponent(plan, name).note
      break
  }

  const changes = plan.describe()

  if (values['dry-run']) {
    console.log('Would change nothing on disk. Planned:\n')
    for (const c of changes) console.log(`  ${c.kind.padEnd(7)} ${c.path}`)
    return 0
  }

  plan.apply()
  console.log(`Generated ${what} "${name}":\n`)
  for (const c of changes) console.log(`  ${c.kind.padEnd(7)} ${c.path}`)
  if (note) console.log(`\n${note}`)
  console.log('\nThen: npm run format && npm run check')
  return 0
}

try {
  process.exitCode = run(process.argv.slice(2))
} catch (error) {
  if (error instanceof GenerateError || error instanceof InvalidName) {
    // An expected refusal. A stack trace here would bury the sentence that
    // says what to do instead.
    console.error(`\n${error.message}\n`)
    process.exitCode = 1
  } else {
    throw error
  }
}
