import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import './styles/app.css'
import App from './App.tsx'
import { auditCatalogue, CATALOGUE } from './data/constraints/catalogue'
import { unimplementedRules } from './engine/rules'

// Fail loudly in development if the catalogue is malformed or references a
// rule the engine does not implement. Silent drift here would mean the UI
// claims a constraint is enforced when nothing checks it.
if (import.meta.env.DEV) {
  const problems = auditCatalogue()
  if (problems.length > 0) console.error('[Aula] catalogue audit failed:', problems)
  const missing = unimplementedRules(CATALOGUE.map(c => c.rule))
  if (missing.length > 0) console.error('[Aula] rule keys with no implementation:', missing)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
