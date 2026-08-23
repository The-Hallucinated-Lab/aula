import { type Plan } from '../lib/edit.ts'
import { pascal, requireName, sentence } from '../lib/names.ts'

/**
 * A shared component, with its test.
 *
 * The only non-obvious part is the props type. Under
 * `exactOptionalPropertyTypes`, an optional prop declared `hint?: string`
 * rejects `<Thing hint={maybeUndefined} />` — which is idiomatic React and
 * carries no meaning. UI props are therefore written `?: T | undefined`, and
 * the whole codebase does it that way. Domain records deliberately do not:
 * there, the presence of a key survives a save and load round trip.
 */
export function generateComponent(plan: Plan, rawName: string | undefined) {
  const name = requireName(rawName, 'component')
  const Component = pascal(name)
  const label = sentence(name)

  plan.create(
    `apps/desktop/src/components/${Component}.tsx`,
    `import type { ReactNode } from 'react'

/**
 * ${label}.
 *
 * TODO: say what this is for, and when to reach for something else instead.
 */
export function ${Component}(props: {
  children?: ReactNode | undefined
  /** Optional props take \`| undefined\` — see the note in the CLI generator. */
  tone?: 'ok' | 'warn' | 'danger' | undefined
}) {
  return <div className={\`${'${'}props.tone ?? ''}\`}>{props.children}</div>
}
`,
  )

  plan.create(
    `apps/desktop/tests/${Component}.test.tsx`,
    `import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ${Component} } from '../src/components/${Component}'

describe('${Component}', () => {
  it('renders its children', () => {
    render(<${Component}>hello</${Component}>)
    expect(screen.getByText('hello')).toBeTruthy()
  })

  it.todo('TODO: assert the behaviour that made this component worth having')
})
`,
  )

  return {
    note:
      '`@testing-library/react` is not installed yet — the generated test needs it:\n' +
      '  npm i -D --workspace @aula/desktop @testing-library/react',
  }
}
