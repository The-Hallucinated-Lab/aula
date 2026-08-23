/**
 * Constraints 361–500 — granular sub-constraints & nuances, part two.
 * Text is reproduced verbatim from the source catalogue.
 */

import { P, type Row } from './types'

export const GRANULAR_B: Row[] = [
  [
    361,
    `Ensure music students carrying cellos or tubas have zero-stair transit routes to their practice rooms.`,
    {
      soft: true,
      rule: 'roomFeatureRequired',
      args: { feature: 'groundFloor' },
      topic: 'accessibility',
    },
  ],
  [
    362,
    `Allow priority scheduling for disabled students before the general algorithm runs.`,
    { topic: 'accessibility' },
  ],
  [
    363,
    `Ensure scholarship athletes' practice blocks are protected via API integration with the athletics database.`,
    { rule: 'protectedCohortSlots', topic: 'student-policy' },
  ],
  [
    364,
    `Do not schedule standard classes during the Homecoming football game Friday afternoon.`,
    {
      rule: 'dayFreeReserve',
      topic: 'events',
      params: [
        P.count('day', 'Day index (0 = Monday)', 4, 6),
        P.count('fromSlot', 'From slot index', 5, 15),
      ],
    },
  ],
  [365, `Ensure pep rally times are blocked out for marching band members.`, { topic: 'events' }],
  [
    366,
    `Assign courses that generate heavy trash (e.g., event planning, catering) to rooms with immediate dumpster access.`,
    { topic: 'facilities' },
  ],
  [
    367,
    `Ensure theater costume-design classes have rooms with laundry hookups.`,
    { topic: 'specialised' },
  ],
  [
    368,
    `Schedule stage-combat classes in rooms with high ceilings and no hanging light fixtures.`,
    { topic: 'specialised' },
  ],
  [
    369,
    `Ensure directing classes have access to small, black-box theater spaces.`,
    { topic: 'specialised' },
  ],
  [
    370,
    `Do not assign regular academic classes to the black-box theater.`,
    { rule: 'restrictedSpaces', topic: 'facilities' },
  ],
  [
    371,
    `Ensure psychology EEG/brain-mapping courses are in rooms shielded from electromagnetic interference.`,
    { rule: 'roomFeatureRequired', args: { feature: 'emiShielded' }, topic: 'specialised' },
  ],
  [
    372,
    `Assign courses using electron microscopes to basement levels to avoid vibration.`,
    { rule: 'roomFeatureRequired', args: { feature: 'groundFloor' }, topic: 'specialised' },
  ],
  [
    373,
    `Ensure nanotechnology clean-rooms are scheduled with 30-minute gowning/de-gowning buffers.`,
    {
      rule: 'roomTurnover',
      args: { feature: 'cleanRoom' },
      topic: 'specialised',
      params: [P.minutes('turnover', 'Gowning buffer', 30)],
    },
  ],
  [
    374,
    `Do not allow back-to-back booking of the wind tunnel facility to prevent motor burnout.`,
    {
      rule: 'roomTurnover',
      args: { kind: 'Workshop' },
      topic: 'specialised',
      params: [P.minutes('turnover', 'Cool-down', 60)],
    },
  ],
  [
    375,
    `Ensure civil engineering concrete-crushing labs are scheduled when adjacent classrooms are empty.`,
    { rule: 'noisyAdjacency', topic: 'adjacency' },
  ],
  [
    376,
    `Assign hydrology labs to rooms with floor drains.`,
    { rule: 'roomFeatureRequired', args: { feature: 'floorDrains' }, topic: 'specialised' },
  ],
  [
    377,
    `Ensure environmental science soil-testing labs have dedicated outdoor boot-washing stations.`,
    { topic: 'specialised' },
  ],
  [
    378,
    `Schedule ecology field trips explicitly to avoid hunting seasons in local nature reserves.`,
    { topic: 'specialised' },
  ],
  [
    379,
    `Ensure specific math-heavy courses are assigned rooms with wrap-around whiteboards, not just a single front board.`,
    { rule: 'roomFeatureRequired', args: { feature: 'wrapWhiteboard' }, topic: 'specialised' },
  ],
  [
    380,
    `Assign theoretical physics courses to rooms with traditional chalkboards if requested by faculty.`,
    {
      soft: true,
      rule: 'roomFeatureRequired',
      args: { feature: 'chalkboard' },
      topic: 'specialised',
    },
  ],
  [
    381,
    `Ensure rooms with chalkboards have "chalk-dust cleaning" time blocked out weekly.`,
    { rule: 'roomBlocked', args: { feature: 'chalkboard' }, topic: 'facilities' },
  ],
  [
    382,
    `Prevent the assignment of chalk-heavy rooms to faculty with severe dust allergies.`,
    { rule: 'roomForbiddenFeature', args: { feature: 'chalkboard' }, topic: 'accessibility' },
  ],
  [
    383,
    `Ensure rooms with intense fluorescent lighting are not assigned to students with documented photosensitivity/epilepsy.`,
    { rule: 'photosensitiveLighting', topic: 'accessibility' },
  ],
  [
    384,
    `Schedule classes for blind students in buildings equipped with braille signage and auditory signals.`,
    { rule: 'brailleBuilding', topic: 'accessibility' },
  ],
  [
    385,
    `Ensure wheelchair-bound instructors are assigned podiums that are electronically height-adjustable.`,
    { rule: 'adjustablePodium', topic: 'accessibility' },
  ],
  [
    386,
    `Do not assign left-handed instructors to tiered halls where the only document camera is fixed on the right side of the podium.`,
    { topic: 'accessibility' },
  ],
  [
    387,
    `Ensure classes with high left-handed student enrollment have adequate left-handed desk availability.`,
    { topic: 'accessibility' },
  ],
  [
    388,
    `Assign courses requiring frequent audience participation to rooms with throwable/catchable microphone systems.`,
    { topic: 'specialised' },
  ],
  [
    389,
    `Ensure lecture halls used for cinema studies have surround-sound panels activated.`,
    { rule: 'roomFeatureRequired', args: { feature: 'acoustic' }, topic: 'specialised' },
  ],
  [
    390,
    `Do not schedule silent reading exams next to choir practice rooms.`,
    { rule: 'quietExamAdjacency', topic: 'adjacency' },
  ],
  [
    391,
    `Ensure the campus carillon (bell tower) is disabled during final exam weeks.`,
    { topic: 'facilities' },
  ],
  [
    392,
    `Prevent scheduling landscaping/lawnmowing around buildings during scheduled exam times.`,
    { topic: 'facilities' },
  ],
  [
    393,
    `Ensure campus tours for prospective students do not route through restricted-access lab schedules.`,
    { topic: 'facilities' },
  ],
  [
    394,
    `Assign open-house demonstration classes to highly visible, glass-walled classrooms.`,
    { topic: 'events' },
  ],
  [
    395,
    `Ensure alumni weekend events do not displace Saturday makeup classes.`,
    { topic: 'events' },
  ],
  [
    396,
    `Prevent the booking of the main library plaza for loud events during midterm week.`,
    { topic: 'events' },
  ],
  [
    397,
    `Guarantee that all core graduation requirements are offered at least once per academic year.`,
    { rule: 'annualOffering', topic: 'governance' },
  ],
  [
    398,
    `Ensure courses offered "alternating years" are accurately tracked to prevent cohort graduation delays.`,
    { rule: 'annualOffering', topic: 'governance' },
  ],
  [
    399,
    `Do not schedule a single instructor to teach more than two completely new preparations (new syllabi) in one term.`,
    {
      rule: 'newPreparationCap',
      topic: 'staffing',
      params: [P.count('maxNew', 'New preparations per term', 2, 8)],
    },
  ],
  [
    400,
    `Ensure non-tenured faculty are not overloaded with high-grading-burden courses (e.g., intensive writing).`,
    { soft: true, rule: 'newFacultyLoad', topic: 'staffing' },
  ],
  [
    401,
    `Assign multiple TAs to courses where the student-to-instructor ratio exceeds 50:1.`,
    {
      soft: true,
      rule: 'taRatio',
      topic: 'staffing',
      params: [P.count('ratio', 'Students per instructor', 50, 500)],
    },
  ],
  [
    402,
    `Ensure TA office hours do not overlap with the main instructor's office hours to maximize student access.`,
    { topic: 'staffing' },
  ],
  [
    403,
    `Prevent scheduling conflicts between a TA's grading session and their own midterm exams.`,
    { topic: 'staffing' },
  ],
  [
    404,
    `Ensure student-run academic clubs can book rooms only after all academic courses are finalized.`,
    { rule: 'restrictedSpaces', topic: 'governance' },
  ],
  [
    405,
    `Restrict fraternities and sororities from booking academic rooms for social events.`,
    { rule: 'restrictedSpaces', topic: 'governance' },
  ],
  [
    406,
    `Ensure blood drives are scheduled in high-traffic, non-academic spaces like the student union.`,
    { rule: 'restrictedSpaces', topic: 'events' },
  ],
  [
    407,
    `Assign flu-shot clinic spaces dynamically based on unused large-capacity rooms in October.`,
    { topic: 'events' },
  ],
  [
    408,
    `Ensure voter-registration booths do not block fire exits of major lecture halls.`,
    { topic: 'safety' },
  ],
  [
    409,
    `Schedule on-campus polling stations in gyms, completely isolating them from the academic timetable.`,
    { rule: 'restrictedSpaces', topic: 'events' },
  ],
  [
    410,
    `Ensure media/press vans for high-profile events do not block ADA ramps to scheduled classrooms.`,
    { topic: 'accessibility' },
  ],
  [
    411,
    `Prevent the scheduling of hazardous material deliveries during the passing period between massive classes.`,
    { topic: 'safety' },
  ],
  [
    412,
    `Ensure food delivery robots/vehicles are routed away from massive student egress chokepoints.`,
    { topic: 'transitions' },
  ],
  [
    413,
    `Assign dedicated times for IT to update software on lab computers, separate from class time.`,
    { rule: 'roomBlocked', args: { feature: 'computers' }, topic: 'it' },
  ],
  [
    414,
    `Ensure mandatory library-orientation blocks for freshmen do not conflict with their core English classes.`,
    { topic: 'student-policy' },
  ],
  [
    415,
    `Prevent scheduling conflicts between required diversity/inclusion seminars and major electives.`,
    { topic: 'student-policy' },
  ],
  [
    416,
    `Ensure financial aid counseling walk-in hours overlap with standard student free-time blocks.`,
    { topic: 'student-policy' },
  ],
  [
    417,
    `Assign academic advisors' mass-briefing sessions to evening hours to catch the most students.`,
    { topic: 'student-policy' },
  ],
  [
    418,
    `Ensure pre-med advising seminars do not conflict with organic chemistry labs.`,
    { topic: 'student-policy' },
  ],
  [
    419,
    `Do not schedule pre-law advising seminars during constitutional law core classes.`,
    { topic: 'student-policy' },
  ],
  [
    420,
    `Assign specific blocks for campus-wide "mental health/wellness" hours where no classes may be held.`,
    {
      rule: 'wellnessHour',
      topic: 'student-policy',
      params: [
        P.count('day', 'Day index (0 = Monday)', 2, 6),
        P.count('slot', 'Slot index', 6, 15),
      ],
    },
  ],
  [
    421,
    `Ensure intramural championship games do not conflict with evening exams.`,
    { topic: 'events' },
  ],
  [
    422,
    `Prevent the central algorithm from overriding manual locks placed on specialized rooms by department heads.`,
    { rule: 'manualLock', topic: 'governance' },
  ],
  [
    423,
    `Ensure the algorithm weighs "faculty seniority" against "pedagogical need" (e.g., a junior faculty needing a specific lab trumps a senior faculty wanting that room just for its view).`,
    { soft: true, rule: 'seniorityPriority', topic: 'governance' },
  ],
  [
    424,
    `Allow department chairs to run localized algorithm simulations before submitting their constraints to the central system.`,
    { topic: 'platform' },
  ],
  [
    425,
    `Ensure cross-listed courses (e.g., Sociology 300 / Women's Studies 300) share the exact same room, time, and instructor in the database to prevent ghost-booking.`,
    { rule: 'crossListedShared', topic: 'governance' },
  ],
  [
    426,
    `Prevent students from enrolling in cross-listed courses under both designations simultaneously.`,
    { topic: 'governance' },
  ],
  [
    427,
    `Ensure combined undergraduate/graduate courses accurately track both capacity pools.`,
    { topic: 'governance' },
  ],
  [
    428,
    `Assign courses with heavy continuous writing (e.g., essay exams) to rooms with large desks, not tiny foldable tablet-arms.`,
    { rule: 'roomFeatureRequired', args: { feature: 'largeDesks' }, topic: 'exams' },
  ],
  [
    429,
    `Ensure math-heavy exams are scheduled in rooms with enough desk space for calculators and scratch paper.`,
    { rule: 'roomFeatureRequired', args: { feature: 'largeDesks' }, topic: 'exams' },
  ],
  [
    430,
    `Prevent assigning open-book exams to cramped tiered lecture halls.`,
    { rule: 'roomForbiddenFeature', args: { feature: 'fixedSeating' }, topic: 'exams' },
  ],
  [
    431,
    `Ensure architecture juries (critiques) are scheduled in wide hallways or exhibition spaces, not enclosed rooms.`,
    { topic: 'specialised' },
  ],
  [
    432,
    `Assign art gallery installation times strictly outside of public viewing hours.`,
    { topic: 'facilities' },
  ],
  [
    433,
    `Ensure museum studies courses have scheduled access to campus archives.`,
    { rule: 'restrictedSpaces', topic: 'facilities' },
  ],
  [
    434,
    `Prevent scheduling conflicts between required archival research blocks and standard library closing times.`,
    { topic: 'facilities' },
  ],
  [
    435,
    `Ensure campus shuttle drivers shift-changes do not occur at 10 minutes to the hour (peak student transit time).`,
    { topic: 'transitions' },
  ],
  [
    436,
    `Schedule maintenance for campus elevators only during low-traffic periods or at night.`,
    { topic: 'facilities' },
  ],
  [
    437,
    `Ensure snow days trigger an automated shift in the timetable, pushing all classes out by one day or moving them online.`,
    { topic: 'emergency' },
  ],
  [
    438,
    `Prevent the algorithm from assigning "ghost faculty" (TBD) to more than 5% of a department's total courses.`,
    {
      soft: true,
      topic: 'governance',
      params: [P.percent('maxShare', 'Unstaffed course share', 5)],
    },
  ],
  [
    439,
    `Ensure international satellite campuses align their synchronous classes with the main campus's daylight saving time shifts.`,
    { topic: 'compliance' },
  ],
  [
    440,
    `Do not schedule Arizona-based cohorts (no DST) synchronously with New York cohorts without a dynamic 1-hour shift mid-semester.`,
    { topic: 'compliance' },
  ],
  [
    441,
    `Ensure courses teaching sensitive governmental data (e.g., cybersecurity) are in SCIF-compliant rooms.`,
    { rule: 'roomFeatureRequired', args: { feature: 'emiShielded' }, topic: 'compliance' },
  ],
  [
    442,
    `Assign ROTC marksmanship classes strictly to the indoor campus range.`,
    { rule: 'restrictedSpaces', topic: 'specialised' },
  ],
  [
    443,
    `Ensure police academy physical tests do not conflict with academic track-and-field use.`,
    { rule: 'roomNoOverlap', topic: 'facilities' },
  ],
  [
    444,
    `Schedule lifeguard certification tests when the pool is closed to recreational swimming.`,
    { topic: 'facilities' },
  ],
  [
    445,
    `Ensure CPR/First Aid certification blocks are offered at least once on a weekend for working students.`,
    { topic: 'student-policy' },
  ],
  [
    446,
    `Assign designated parking spots for guest lecturers directly tied to the time block of their assigned room.`,
    { topic: 'events' },
  ],
  [
    447,
    `Ensure VIP parking is released immediately after the guest lecture block ends.`,
    { topic: 'events' },
  ],
  [
    448,
    `Prevent the scheduling of delivery trucks to the campus bookstore during the first week's peak class-change hours.`,
    { topic: 'transitions' },
  ],
  [
    449,
    `Ensure cafeteria delivery trucks do not idle near rooms holding air-quality-sensitive experiments.`,
    { topic: 'adjacency' },
  ],
  [
    450,
    `Assign courses requiring high concentration to rooms furthest from the campus quad where student events occur.`,
    { soft: true, rule: 'noisyAdjacency', topic: 'adjacency' },
  ],
  [
    451,
    `Ensure the campus radio station live-broadcast room is soundproofed against adjacent classrooms.`,
    { rule: 'roomFeatureRequired', args: { feature: 'soundproof' }, topic: 'adjacency' },
  ],
  [
    452,
    `Prevent the booking of the astronomy roof deck during daytime hours for non-solar classes.`,
    { topic: 'specialised' },
  ],
  [
    453,
    `Ensure solar astronomy classes are scheduled exactly at noon.`,
    {
      rule: 'solarNoon',
      topic: 'specialised',
      params: [P.time('at', 'Solar noon', '12:00')],
    },
  ],
  [
    454,
    `Assign evening photography classes to times aligning with the golden hour or sunset.`,
    { rule: 'nightClass', topic: 'specialised' },
  ],
  [
    455,
    `Ensure ornithology (bird watching) classes are scheduled at dawn.`,
    { rule: 'dawnClass', topic: 'specialised' },
  ],
  [
    456,
    `Assign bat/nocturnal ecology classes strictly to night blocks.`,
    { rule: 'nightClass', topic: 'specialised' },
  ],
  [
    457,
    `Ensure campus lighting curfews do not interfere with night-ecology field labs.`,
    { rule: 'gateCurfew', topic: 'safety' },
  ],
  [
    458,
    `Prevent the scheduling of loud concerts in the arena if final exams are occurring in the adjacent building.`,
    { rule: 'quietExamAdjacency', topic: 'adjacency' },
  ],
  [
    459,
    `Ensure the central HVAC system is programmed to cool rooms 30 minutes before a 500-person lecture begins.`,
    { topic: 'facilities' },
  ],
  [
    460,
    `Schedule preventative maintenance on projectors during the two weeks between semesters.`,
    { topic: 'it' },
  ],
  [
    461,
    `Ensure software licenses for computer labs are active and renewed before the first day of the class using them.`,
    { topic: 'it' },
  ],
  [
    462,
    `Prevent the algorithm from assigning a class to a room where the required software license has expired.`,
    { topic: 'it' },
  ],
  [
    463,
    `Ensure cloud-computing courses have guaranteed server uptime blocks reserved with the IT department.`,
    { topic: 'it' },
  ],
  [
    464,
    `Assign courses requiring heavy 3D rendering to the server farm's off-peak hours (usually overnight).`,
    { topic: 'it' },
  ],
  [
    465,
    `Ensure students in rendering classes are explicitly instructed that their processing time does not overlap with lectures.`,
    { topic: 'it' },
  ],
  [
    466,
    `Schedule regular database backups for the scheduling software itself at 3:00 AM.`,
    { topic: 'platform' },
  ],
  [
    467,
    `Ensure the add/drop deadline triggers a hard lock on room capacities, preventing further automated shifts.`,
    { rule: 'capacityOverrideGuard', topic: 'governance' },
  ],
  [
    468,
    `Allow manual override for room changes only if the new room's capacity is greater than the current active enrollment.`,
    { rule: 'capacityOverrideGuard', topic: 'governance' },
  ],
  [
    469,
    `Ensure financial audits of course profitability run only after the add/drop period closes.`,
    { topic: 'governance' },
  ],
  [
    470,
    `Assign low-enrollment warning flags to department heads two weeks prior to the semester start.`,
    { soft: true, rule: 'lowEnrolmentFlag', topic: 'governance' },
  ],
  [
    471,
    `Ensure canceled low-enrollment courses immediately release their room blocks back to the general pool.`,
    { rule: 'courseSuspended', topic: 'governance' },
  ],
  [
    472,
    `Prioritize relocated classes (due to emergencies) over new, ad-hoc event bookings.`,
    { topic: 'emergency' },
  ],
  [
    473,
    `Ensure the alumni office cannot bump an academic class for a donor tour.`,
    { topic: 'governance' },
  ],
  [
    474,
    `Prevent the athletic department from bumping academic classes for televised press conferences.`,
    { topic: 'governance' },
  ],
  [
    475,
    `Ensure graduation ceremonies have absolute priority over all campus spaces during commencement week.`,
    { topic: 'events' },
  ],
  [
    476,
    `Schedule specific rehearsal times for the commencement band that do not conflict with their own final exams.`,
    { topic: 'events' },
  ],
  [
    477,
    `Ensure valedictorian and speaker rehearsals are booked in the actual commencement venue.`,
    { topic: 'events' },
  ],
  [
    478,
    `Assign dedicated staging rooms for faculty robing before commencement.`,
    { rule: 'restrictedSpaces', topic: 'events' },
  ],
  [
    479,
    `Ensure these robing rooms are not simultaneously booked for summer-session makeup classes.`,
    { rule: 'roomNoOverlap', topic: 'events' },
  ],
  [
    480,
    `Prevent the central algorithm from optimizing the schedule so tightly that one single delay cascades into a university-wide failure.`,
    { soft: true, rule: 'gridSlack', topic: 'governance' },
  ],
  [
    481,
    `Include a 5% "slack" time across the entire university grid to absorb ad-hoc delays.`,
    {
      soft: true,
      rule: 'gridSlack',
      topic: 'governance',
      params: [P.percent('bufferShare', 'Grid slack', 5)],
    },
  ],
  [
    482,
    `Ensure that if a fire alarm goes off, the timetable system has a protocol to dynamically reschedule missed exams.`,
    { topic: 'emergency' },
  ],
  [
    483,
    `Assign backup power generators priority to buildings hosting critical lab experiments, regardless of the class schedule.`,
    { topic: 'emergency' },
  ],
  [
    484,
    `Ensure campus emergency text alerts are not suppressed during class hours.`,
    { topic: 'emergency' },
  ],
  [
    485,
    `Schedule regular "active shooter" or emergency drills during standard class hours at least once a year, notifying faculty to buffer their syllabi.`,
    { topic: 'emergency' },
  ],
  [
    486,
    `Ensure the scheduling software integrates securely with the university's central identity management system (SSO).`,
    { topic: 'platform' },
  ],
  [
    487,
    `Prevent students with financial holds from locking up seats in high-demand courses during the preliminary scheduling run.`,
    { topic: 'governance' },
  ],
  [
    488,
    `Ensure waitlisted students are automatically moved into empty seats before the final room capacity check.`,
    { topic: 'governance' },
  ],
  [
    489,
    `Assign secondary "overflow" rooms with live video feeds for mega-lectures that unexpectedly exceed capacity.`,
    { rule: 'overflowRoom', topic: 'facilities' },
  ],
  [
    490,
    `Ensure overflow rooms have a dedicated TA present to facilitate Q&A with the main lecturer.`,
    { topic: 'facilities' },
  ],
  [
    491,
    `Schedule regular meetings between the university registrar, facilities, and IT to review algorithm performance.`,
    { topic: 'platform' },
  ],
  [
    492,
    `Ensure union representatives have access to view instructor workload calculations generated by the timetable.`,
    { topic: 'platform' },
  ],
  [
    493,
    `Prevent the algorithm from using race, gender, or age as variables in scheduling, ensuring equity and compliance with discrimination laws.`,
    { rule: 'equityBlind', topic: 'compliance' },
  ],
  [
    494,
    `Ensure the timetable output is compatible with screen readers for visually impaired students and faculty.`,
    { topic: 'platform' },
  ],
  [
    495,
    `Allow for a "sandbox" mode where administrators can test the impact of adding a new major without affecting the live database.`,
    { topic: 'platform' },
  ],
  [
    496,
    `Ensure historical timetable data is archived for at least 7 years for accreditation audits.`,
    { topic: 'platform' },
  ],
  [
    497,
    `Assign a dedicated server cluster to handle the massive computational load of running the genetic scheduling algorithm.`,
    { topic: 'platform' },
  ],
  [
    498,
    `Ensure the algorithm completes its optimization run within a reasonable timeframe (e.g., 48 hours for a 50,000-student university).`,
    {
      rule: 'solveTimeLimit',
      topic: 'platform',
      params: [P.count('seconds', 'Solver time budget', 20, 600)],
    },
  ],
  [
    499,
    `Provide human schedulers with clear error logs when the algorithm hits an impossible constraint loop.`,
    { topic: 'platform' },
  ],
  [
    500,
    `Maintain a "human-in-the-loop" final approval process before the timetable is published globally to the student body.`,
    { topic: 'platform' },
  ],
]
