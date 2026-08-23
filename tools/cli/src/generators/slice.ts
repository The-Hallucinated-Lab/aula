import { type Plan } from '../lib/edit.ts'
import { camel, kebab, requireName, sentence } from '../lib/names.ts'

/**
 * A store slice.
 *
 * Slices are typed `Slice<K extends keyof AppState>`, which means a slice
 * cannot be written before the actions it owns exist on `AppState` — the type
 * refers to keys of a type it is not part of. That ordering is the thing
 * people get wrong by hand: they write the slice, get an error that names
 * `keyof AppState`, and add the action to the interface in the wrong place.
 *
 * The generator writes both halves and registers the slice, leaving a compile
 * error only where there should be one: the action's body.
 */
export function generateSlice(plan: Plan, rawName: string | undefined) {
  const name = requireName(rawName, 'slice')
  const ident = camel(name)
  const file = kebab(name)
  const label = sentence(name).toLowerCase()
  const action = `${ident}Placeholder`

  plan.create(
    `apps/desktop/src/store/slices/${file}.ts`,
    `import type { AppState, Slice } from '../types'

/**
 * ${sentence(name)}.
 *
 * TODO: say what this slice is responsible for, and what it is not.
 */

/** The members of \`AppState\` this slice is responsible for. */
type Owned = '${action}'

export const ${ident}Actions: Slice<Owned> = (set, get) => ({
  /**
   * TODO: replace this with the first real action.
   *
   * \`set\` takes a partial state or a function of the whole one; \`get\`
   * returns the whole store, so a slice can read anything it needs. The split
   * is organisational — it changes where an action is written, never what it
   * can reach.
   */
  ${action}() {
    void set
    void get
  },
})

// Keeps the import used while the slice is still a stub.
export type { AppState }
`,
  )

  plan.insertBefore(
    'apps/desktop/src/store/types.ts',
    '/* aula:cli:state-actions */',
    `/** TODO: describe ${label}. */\n  ${action}: () => void`,
  )
  plan.insertBefore(
    'apps/desktop/src/store/index.ts',
    '/* aula:cli:slice-imports */',
    `import { ${ident}Actions } from './slices/${file}'`,
  )
  plan.insertBefore(
    'apps/desktop/src/store/index.ts',
    '/* aula:cli:slices */',
    `...${ident}Actions(set, get), // ${label}`,
  )

  return {
    note:
      `Rename \`${action}\` to the first real action in both\n` +
      `  store/types.ts and store/slices/${file}.ts — the \`Owned\` union is what\n` +
      '  makes a forgotten action a compile error rather than a runtime hole.',
  }
}
