import { useState } from 'react'
import { Hero } from '../components/ui'
import { StaleNotice } from '../components/StaleNotice'
import { StaffTab } from './data-studio/StaffTab'
import { RoomsTab } from './data-studio/RoomsTab'
import { CoursesTab } from './data-studio/CoursesTab'
import { CohortsTab } from './data-studio/CohortsTab'

/**
 * Data studio — the shell.
 *
 * Four tabs over the four entity types, each in its own module under
 * `data-studio/`. This file owns the tab strip and the banner that says whether
 * a type is still generated or has been taken over by explicit records.
 */

type Tab = 'staff' | 'rooms' | 'courses' | 'cohorts'

/* The entity is a cohort throughout the code; institutions call it a section.
   Renaming the type would touch the engine for no gain, so the local word is
   applied at the surface. */
const TAB_LABELS: Record<Tab, string> = {
  staff: 'Staff',
  rooms: 'Rooms',
  courses: 'Courses',
  cohorts: 'Sections',
}

export function DataStudio() {
  const [tab, setTab] = useState<Tab>('staff')

  return (
    <div className="fade-in">
      <Hero
        eyebrow="Institution data"
        title={
          <>
            Every entity the engine <strong>schedules around</strong>
          </>
        }
        desc="Everything here is editable. The wizard's numbers create a starting institution; the moment you change a person, a room or a course, your records take over and the generator stops inventing that kind of thing."
        side={
          <div className="tabs">
            {(['staff', 'rooms', 'courses', 'cohorts'] as Tab[]).map(t => (
              <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
                {TAB_LABELS[t]}
              </button>
            ))}
          </div>
        }
      />

      <div className="page">
        <StaleNotice />
        {tab === 'staff' && <StaffTab />}
        {tab === 'rooms' && <RoomsTab />}
        {tab === 'courses' && <CoursesTab />}
        {tab === 'cohorts' && <CohortsTab />}
      </div>
    </div>
  )
}
