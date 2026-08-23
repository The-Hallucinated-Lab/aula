import { HashRouter, Route, Routes, useLocation } from 'react-router-dom'
import { useTranslation } from './i18n'
import { TitleBar } from './components/TitleBar'
import { TopBar } from './components/TopBar'
import { ToastProvider } from './components/Toast'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Overview } from './pages/Overview'
import { Timetable } from './pages/Timetable'
import { InstitutionSetup, Setup } from './pages/setup'
import { DataStudio } from './pages/DataStudio'
import { Calendar } from './pages/Calendar'
import { Scenarios } from './pages/Scenarios'
import { Constraints } from './pages/Constraints'
import { Assistant } from './pages/Assistant'
/* The comment below is an anchor for `npm run new`. A generator inserts above
   it rather than pattern-matching this file, so moving or deleting it is a
   loud failure instead of a silently unregistered screen. */
/* aula:cli:page-imports */

/**
 * Routes live inside their own error boundary, keyed on the path: a page that
 * throws is contained and named, the navigation stays usable, and moving to
 * another screen clears the failure.
 */
function Pages() {
  const location = useLocation()
  return (
    /* One `main` for the whole application rather than one per page.
       Pages used to declare their own, two of them on some states, and the
       page banner sat outside every one — so a screen-reader user landed on
       content that belonged to no landmark at all. */
    <main id="main-content" className="app-main" tabIndex={-1}>
      <ErrorBoundary resetKey={location.pathname}>
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/timetable" element={<Timetable />} />
          <Route path="/setup" element={<Setup />} />
          <Route path="/institution" element={<InstitutionSetup />} />
          <Route path="/data" element={<DataStudio />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/scenarios" element={<Scenarios />} />
          <Route path="/constraints" element={<Constraints />} />
          <Route path="/assistant" element={<Assistant />} />
          {/* aula:cli:routes */}
          <Route path="*" element={<Overview />} />
        </Routes>
      </ErrorBoundary>
    </main>
  )
}

export default function App() {
  const { t } = useTranslation()
  return (
    <ToastProvider>
      <HashRouter>
        <div className="app">
          <TitleBar />
          {/* First thing in the tab order: nine navigation links stand between
              the top of the page and the content on every route. */}
          <a className="skip-link" href="#main-content">
            {t('app.skipToContent')}
          </a>
          <ErrorBoundary>
            <TopBar />
          </ErrorBoundary>
          <Pages />
        </div>
      </HashRouter>
    </ToastProvider>
  )
}
