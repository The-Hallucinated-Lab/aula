import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/fonts.css'
import './styles/themes.css'
import './styles/global.css'
import './styles/app.css'
import App from './App.tsx'
import { initTheme } from './theme'
import { initI18n } from './i18n'
import { auditCatalogue, CATALOGUE } from '@aula/core/data/constraints/catalogue'
import { unimplementedRules } from '@aula/core/engine/rules'

// Fail loudly in development if the catalogue is malformed or references a
// rule the engine does not implement. Silent drift here would mean the UI
// claims a constraint is enforced when nothing checks it.
if (import.meta.env.DEV) {
  const problems = auditCatalogue()
  if (problems.length > 0) console.error('[Aula] catalogue audit failed:', problems)
  const missing = unimplementedRules(CATALOGUE.map(c => c.rule))
  if (missing.length > 0) console.error('[Aula] rule keys with no implementation:', missing)
}

/* Before the first paint, not in an effect: an effect would show one frame of
   the wrong palette to anyone whose choice differs from their operating
   system's. */
initTheme()
initI18n()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
