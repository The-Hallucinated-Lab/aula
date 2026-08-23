import { HashRouter, Route, Routes, useLocation } from 'react-router-dom'
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

/**
 * Routes live inside their own error boundary, keyed on the path: a page that
 * throws is contained and named, the navigation stays usable, and moving to
 * another screen clears the failure.
 */
function Pages() {
  const location = useLocation()
  return (
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
        <Route path="*" element={<Overview />} />
      </Routes>
    </ErrorBoundary>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <HashRouter>
        <div className="app">
          <TitleBar />
          <ErrorBoundary>
            <TopBar />
          </ErrorBoundary>
          <Pages />
        </div>
      </HashRouter>
    </ToastProvider>
  )
}
