import { type Plan } from '../lib/edit.ts'
import { camel, kebab, pascal, requireName, sentence } from '../lib/names.ts'

/**
 * A page.
 *
 * A page is four things, not one: a component, a route, a navigation entry and
 * a translation key. Adding the component by hand and forgetting the other
 * three produces a screen nobody can reach, which is exactly the failure a
 * generator should make impossible.
 */
export function generatePage(plan: Plan, rawName: string | undefined) {
  const name = requireName(rawName, 'page')
  const Component = pascal(name)
  const route = kebab(name)
  const key = camel(name)
  const label = sentence(name)

  plan.create(
    `apps/desktop/src/pages/${Component}.tsx`,
    `import { useTranslation } from '../i18n'
import { Hero, Section } from '../components/ui'

/**
 * ${label}.
 *
 * TODO: say what question this screen answers for a timetable officer.
 */
export function ${Component}() {
  const { t } = useTranslation()

  return (
    <div className="fade-in">
      <Hero eyebrow={t('nav.${key}')} title={<>${label}</>} />

      {/* \`.page\` is the body, not a landmark — App.tsx owns the single
          \`main\` for the whole application. */}
      <div className="page">
        <Section title="${label}">
          <p className="small muted">Nothing here yet.</p>
        </Section>
      </div>
    </div>
  )
}
`,
  )

  plan.insertBefore(
    'apps/desktop/src/App.tsx',
    '/* aula:cli:page-imports */',
    `import { ${Component} } from './pages/${Component}'`,
  )
  plan.insertBefore(
    'apps/desktop/src/App.tsx',
    '{/* aula:cli:routes */}',
    `<Route path="/${route}" element={<${Component} />} />`,
  )
  plan.insertBefore(
    'apps/desktop/src/components/TopBar.tsx',
    '/* aula:cli:nav */',
    `{ to: '/${route}', key: 'nav.${key}' },`,
  )
  plan.insertBefore(
    'apps/desktop/src/i18n/locales/en.ts',
    '/* aula:cli:nav-keys */',
    `${key}: '${label}',`,
  )

  return {
    note:
      `The route is /#/${route} and the nav label comes from \`nav.${key}\`.\n` +
      '  Translate that key in every locale before shipping — a missing one renders\n' +
      '  as the key itself.',
  }
}
