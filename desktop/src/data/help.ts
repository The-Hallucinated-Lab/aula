/**
 * Field help.
 *
 * Every entry here answers a question that came back from a real review of the
 * setup screens. They are kept in one place so the same wording is used
 * wherever a concept appears, and so they can be checked for accuracy in one
 * pass rather than hunted through the JSX.
 */

export const HELP = {
  /* --- programmes --- */
  coreWeekly:
    'How many separate times in the week each core course meets. Three means three classes on three different days.',
  coreCourses:
    'How many compulsory courses each year studies. Every cohort in that year takes all of them.',
  labCourses:
    'Practical courses for the year. Each one books a lab for a single longer block rather than several short classes.',
  labBlock:
    'How many consecutive slots one lab meeting occupies. Two means a solid two-hour block, not two separate hours.',
  electiveCourses:
    'Optional courses for the year. Members of the same elective group are kept clash-free so a student can pick any of them.',
  sectionsPerYear:
    'How many parallel sections each year is split into. Each section is scheduled independently.',
  studentsPerSection:
    'Headcount of one section. This is what room capacity is checked against.',
  cohort:
    'One section of one year of one programme, such as CSE 1A. It is scheduled as a single unit, so all its students attend together.',

  /* --- buildings and rooms --- */
  accessible:
    'The building can be reached and used with limited mobility — step-free entry and usable facilities. Cohorts and staff with access needs are only placed here.',
  hasElevator:
    'Without a lift, anyone with access needs can only be scheduled on the ground floor of this building.',
  walkMinutes:
    'Minutes to walk from this building to another on the same campus. Used to refuse back-to-back classes nobody could physically reach in time.',
  floors:
    'How many storeys the building has. Rooms are spread across them, and the floor matters for step-free access when there is no lift.',
  turnoverMinutes:
    'Minutes a room needs between two bookings — cleaning, resetting equipment, clearing fumes. The scheduler leaves that gap empty instead of booking straight through.',
  roomCapacity:
    'Seats available. A cohort larger than this is never placed in the room.',
  roomCount:
    'How many rooms of this type and size the building has. They are created individually and spread across its floors.',
  closedDays:
    'Days this room is unavailable for the whole day. The scheduler treats it as if the room does not exist that day.',

  /* --- staff --- */
  maxPerWeek:
    'The contractual ceiling on teaching hours a week for full-time staff.',
  maxPerDay:
    'The most teaching hours one person can be given on a single day.',
  adjunctMaxPerWeek:
    'Adjuncts are part-time staff hired course by course, so their weekly hours are capped lower than full-time staff.',
  taMaxPerWeek:
    'The most hours a week a teaching assistant may be scheduled. They are usually postgraduate students and their hours are capped by agreement.',
  researchDayShare:
    'The share of staff who keep one weekday completely free of teaching for research or administration. No class is ever placed on that day.',
  sabbaticalShare:
    'The share of staff on approved leave this term. They stay on the roster but are given no teaching at all.',
  accessibilityShare:
    'The share of staff who must be given step-free, accessible rooms.',
  qualifications:
    'How many different courses one person is able to teach. A wider range gives the scheduler more room to balance the load and find substitutes.',
  rankMix:
    'How the headcount splits across ranks. It decides which weekly cap applies to whom.',

  /* --- calendar --- */
  passingMinutes:
    'The gap between one class ending and the next starting, for people to move between rooms.',
  eveningStart:
    'Evening programmes cannot begin before this time, and sessions at or after it count as evening for the rules that care.',
  earlyMorningUntil:
    'Sessions starting before this count as early, which some staff preferences and retention rules try to avoid.',
  seed:
    'The same seed with the same settings reproduces exactly the same timetable. Change it to explore a different arrangement of the same week.',

  /* --- academic calendar --- */
  termDates:
    'The first and last teaching date of the term. Everything the calendar reports — how many times a class actually meets, which weekdays lose the most — is counted between these two dates.',
  eventKind:
    'A holiday closes the campus. An observance keeps it open but keeps mandatory classes off it. Exams, breaks and institution events are recorded for planning and can cancel teaching if you say so.',
  blocksTeaching:
    'Whether the entry cancels classes. Leave it off to record something for planning without changing the timetable.',
  weeklyEvent:
    'The entry repeats on the same weekday in every week of the term — an assembly, a standing meeting. Only a repeating entry can be blocked out on the timetable itself; a one-off date changes how many times a class meets, not where it sits in the week.',
  eventSlots:
    'Which periods the entry occupies. Leave it as the whole day unless the event only takes part of it.',
  teachingDates:
    'How many times this weekday actually occurs between the term dates once holidays are removed. Two weekdays on the same timetable can differ by several meetings across a term.',
  attrition:
    'A class placed on a weekday that loses dates to holidays meets fewer times. The scheduler prefers the weekdays that survive, but it will still use a thin one rather than leave a class unplaced.',

  /* --- staff records --- */
  staffCode:
    'The institution’s own identifier for this person. It appears on exported rosters; the scheduler does not read it.',
  employment:
    'Full-time, part-time, visiting, contract or guest. This is the contract, not the designation — it explains why the availability below is narrower than a rank alone would suggest.',
  eligiblePrograms:
    'Programmes this person may teach on. Leave every one unticked to allow all of them; tick some to stop the scheduler assigning them outside those levels.',
  primaryExpertise:
    'Courses this person is the preferred instructor for. The scheduler fills these first.',
  secondaryExpertise:
    'Courses they can cover at a push. Allowed, but the scheduler reaches for them only after every primary option is exhausted.',
  sessionKinds:
    'The kinds of session they are authorised to run — lectures, labs, workshops. Leave all unticked to authorise every kind.',
  maxAudience:
    'The largest group this person will take. Zero means no ceiling. A tutor engaged for small groups is refused a combined lecture hall even when the subject matches.',
  maxConsecutive:
    'The most back-to-back periods this person will teach before a break. Zero defers to the institution-wide cap in the constraint catalogue.',
  availableDays:
    'Days this person is physically on campus. Leave every day unticked to mean the whole teaching week — this is the field that matters for visiting and part-time staff.',
  blockedSlots:
    'Individual periods held for administration, research or clinical duties. Nothing is scheduled over them.',
  preferredShift:
    'Mornings, afternoons or evenings. A preference, not a rule: the scheduler pays a penalty to break it rather than leaving a class unplaced.',
  preferredRoomKind:
    'The kind of room this person teaches best in. A preference, never a gate — the course’s own room requirement always wins.',
  homeBuilding:
    'The block this person is based in. Classes elsewhere are allowed but carry a small cost, which keeps someone’s day from criss-crossing the campus.',

  /* --- rooms --- */
  roomFloor:
    'Which storey these rooms sit on. A block is rarely uniform — halls on the ground, tutorial rooms above, labs wherever the services run — and the floor decides step-free access when there is no lift.',
  specialisation:
    'What kind of facility this is. Choosing one sets the room type and the capabilities the facility cannot work without, so a course asking for a fume hood finds the chemistry lab and nothing else.',
} as const

export type HelpKey = keyof typeof HELP
