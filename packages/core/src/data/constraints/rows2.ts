/**
 * Constraints 181–360 — granular sub-constraints & nuances, part one.
 * Text is reproduced verbatim from the source catalogue.
 */

import { P, type Row } from './types'

export const GRANULAR_A: Row[] = [
  [
    181,
    `Ensure a 10-minute gap between classes in the same room.`,
    {
      rule: 'sameRoomGap',
      topic: 'transitions',
      params: [P.minutes('gapMinutes', 'Same-room gap', 10)],
    },
  ],
  [
    182,
    `Ensure a 20-minute gap between classes in different buildings on the same quad.`,
    {
      rule: 'walkWindow',
      topic: 'transitions',
      params: [P.minutes('walkMinutes', 'Cross-building gap', 20)],
    },
  ],
  [
    183,
    `Ensure a 30-minute gap between classes on opposite ends of a large campus.`,
    {
      rule: 'crossCampusGap',
      topic: 'transitions',
      params: [P.minutes('travelMinutes', 'Cross-campus gap', 30)],
    },
  ],
  [
    184,
    `Restrict first-year students from enrolling in night classes.`,
    { rule: 'firstYearNoNight', topic: 'student-policy' },
  ],
  [
    185,
    `Restrict high school dual-enrollment students to daytime hours.`,
    { topic: 'student-policy' },
  ],
  [
    186,
    `Give priority registration and scheduling to graduating seniors.`,
    { soft: true, topic: 'student-policy' },
  ],
  [
    187,
    `Ensure ROTC physical training (early morning) does not conflict with ROTC academic courses.`,
    { rule: 'protectedCohortSlots', topic: 'student-policy' },
  ],
  [
    188,
    `Prevent scheduling noisy classes (e.g., tap dance) directly above quiet classes (e.g., meditation or testing).`,
    { soft: true, rule: 'noisyAdjacency', topic: 'adjacency' },
  ],
  [
    189,
    `Prevent scheduling heavy machinery use (shop class) next to lecture halls.`,
    { soft: true, rule: 'noisyAdjacency', topic: 'adjacency' },
  ],
  [
    190,
    `Prioritize scheduling foundational courses in prime learning hours (10:00 AM - 2:00 PM).`,
    {
      soft: true,
      rule: 'primeHoursFoundational',
      topic: 'quality',
      params: [
        P.time('from', 'Prime window starts', '10:00'),
        P.time('to', 'Prime window ends', '14:00'),
      ],
    },
  ],
  [
    191,
    `Distribute upper-level seminars evenly across the week to avoid Friday emptiness.`,
    { soft: true, rule: 'spreadAcrossWeek', topic: 'quality' },
  ],
  [
    192,
    `Ensure minimum student enrollment numbers are met 2 weeks before room lock-in.`,
    { topic: 'governance' },
  ],
  [
    193,
    `Keep Friday afternoons free for faculty research time where possible.`,
    {
      soft: true,
      rule: 'dayFreeReserve',
      topic: 'quality',
      params: [
        P.count('day', 'Day index (0 = Monday)', 4, 6),
        P.count('fromSlot', 'From slot index', 4, 15),
      ],
    },
  ],
  [
    194,
    `Keep Monday mornings free for administrative setups where possible.`,
    {
      soft: true,
      rule: 'dayFreeReserve',
      topic: 'quality',
      params: [
        P.count('day', 'Day index (0 = Monday)', 0, 6),
        P.count('fromSlot', 'From slot index', 0, 15),
        P.count('toSlot', 'To slot index', 1, 15),
      ],
    },
  ],
  [
    195,
    `Schedule guest lectures in easily accessible ground-floor rooms.`,
    { soft: true, rule: 'roomFeatureRequired', args: { feature: 'groundFloor' }, topic: 'events' },
  ],
  [
    196,
    `Ensure VIP/high-profile lecturers have dedicated security access to their assigned rooms.`,
    { topic: 'events' },
  ],
  [
    197,
    `Avoid scheduling consecutive math-heavy courses for cognitive load management.`,
    { soft: true, rule: 'avoidBackToBackHeavy', topic: 'quality' },
  ],
  [
    198,
    `Allow dynamic room swapping in the first 2 weeks based on add/drop enrollment spikes.`,
    { topic: 'governance' },
  ],
  [
    199,
    `Tie classroom AV requirements directly to the instructor's tech proficiency profile.`,
    { soft: true, topic: 'it' },
  ],
  [
    200,
    `Automatically release booked rooms if the instructor reports sick.`,
    { topic: 'governance' },
  ],
  [
    201,
    `Schedule makeup classes only in non-conflicting time slots for the entire enrolled cohort.`,
    { rule: 'cohortNoOverlap', topic: 'governance' },
  ],
  [
    202,
    `Ensure summer sessions do not conflict with summer high school outreach camps using the same facilities.`,
    { topic: 'facilities' },
  ],
  [
    203,
    `Reserve specific rooms solely for thesis defenses during April and May.`,
    { rule: 'restrictedSpaces', topic: 'facilities' },
  ],
  [
    204,
    `Do not schedule standard classes in the campus chapel or religious centers.`,
    { rule: 'restrictedSpaces', topic: 'facilities' },
  ],
  [
    205,
    `Ensure dining halls have capacity surges aligned with the schedule's main lunch break.`,
    { soft: true, topic: 'facilities' },
  ],
  [
    206,
    `Prevent double-booking of shared TA grading rooms.`,
    { rule: 'roomNoOverlap', topic: 'facilities' },
  ],
  [
    207,
    `Assign courses with heavy paper hand-outs to rooms near departmental printing stations.`,
    { soft: true, topic: 'facilities' },
  ],
  [
    208,
    `Keep outdoor field trips restricted to weather-permissible terms.`,
    { topic: 'facilities' },
  ],
  [
    209,
    `Require backup indoor rooms for outdoor-based courses in case of rain.`,
    { topic: 'facilities' },
  ],
  [
    210,
    `Ensure international students maintain full-time scheduled status for visa compliance.`,
    { topic: 'compliance' },
  ],
  [
    211,
    `Do not schedule mandatory orientations concurrently with early-starting classes.`,
    { topic: 'events' },
  ],
  [
    212,
    `Reserve the stadium for athletics; do not schedule academic PE there during season prep.`,
    { rule: 'restrictedSpaces', topic: 'facilities' },
  ],
  [
    213,
    `Keep parking peak capacity in mind; spread morning starts between 8:00, 8:30, and 9:00 AM to prevent traffic gridlock.`,
    { soft: true, rule: 'staggerMorningStarts', topic: 'transitions' },
  ],
  [214, `Ensure safe walking paths are open at night for evening classes.`, { topic: 'safety' }],
  [
    215,
    `Limit consecutive teaching days for older faculty if requested.`,
    {
      soft: true,
      rule: 'consecutiveDayCap',
      topic: 'staffing',
      params: [P.count('maxDays', 'Consecutive teaching days', 3, 7)],
    },
  ],
  [
    216,
    `Ensure specific hazardous waste pickup times do not occur during lab classes.`,
    { topic: 'safety' },
  ],
  [
    217,
    `Guarantee dedicated room access for campus emergency response training once a semester.`,
    { topic: 'emergency' },
  ],
  [
    218,
    `Avoid scheduling introductory STEM courses at 8:00 AM to improve retention rates.`,
    { soft: true, rule: 'avoidEarlyStem', topic: 'quality' },
  ],
  [219, `Ensure nursing clinicals match hospital shift changes.`, { topic: 'specialised' }],
  [
    220,
    `Ensure education majors' student-teaching blocks align with local public school hours.`,
    { topic: 'specialised' },
  ],
  [
    221,
    `Do not assign standard chairs to courses requiring drafting tables.`,
    { rule: 'roomFeatureRequired', args: { feature: 'draftingTables' }, topic: 'specialised' },
  ],
  [
    222,
    `Ensure history courses have access to map projection equipment.`,
    { rule: 'roomFeatureRequired', args: { feature: 'projectorHiRes' }, topic: 'specialised' },
  ],
  [
    223,
    `Ensure film studies courses have blackout blinds in their assigned rooms.`,
    { rule: 'roomFeatureRequired', args: { feature: 'blackoutBlinds' }, topic: 'specialised' },
  ],
  [
    224,
    `Prevent the scheduling of music recitals during the final exam quiet period.`,
    { topic: 'events' },
  ],
  [
    225,
    `Assign heavy equipment courses to rooms with reinforced flooring.`,
    { rule: 'roomFeatureRequired', args: { feature: 'reinforcedFloor' }, topic: 'specialised' },
  ],
  [
    226,
    `Ensure courses needing specific internet bandwidth (e.g., server administration) are in hardwired rooms.`,
    { rule: 'roomFeatureRequired', args: { feature: 'wiredNetwork' }, topic: 'it' },
  ],
  [
    227,
    `Do not schedule multiple high-bandwidth classes on the same localized network switch simultaneously.`,
    { topic: 'it' },
  ],
  [
    228,
    `Ensure courses with sensitive topics have rooms with window blinds for privacy.`,
    { rule: 'roomFeatureRequired', args: { feature: 'blackoutBlinds' }, topic: 'specialised' },
  ],
  [229, `Assign large courses to rooms with multiple fire exits.`, { topic: 'safety' }],
  [
    230,
    `Keep small classes out of large halls to prevent "echo" and feelings of emptiness.`,
    { soft: true, rule: 'roomRightSize', topic: 'quality' },
  ],
  [
    231,
    `Maintain a 10% room buffer across the university for emergency relocations.`,
    {
      soft: true,
      rule: 'gridSlack',
      topic: 'governance',
      params: [P.percent('bufferShare', 'Room buffer', 10)],
    },
  ],
  [
    232,
    `Ensure cross-registered students from partner universities have commuting time buffered.`,
    { rule: 'crossCampusGap', topic: 'transitions' },
  ],
  [
    233,
    `Do not schedule consecutive classes requiring heavy voice projection for the same instructor.`,
    { soft: true, topic: 'staffing' },
  ],
  [
    234,
    `Prioritize adjuncts for evening and weekend courses if full-time faculty prefer days.`,
    { soft: true, topic: 'staffing' },
  ],
  [
    235,
    `Limit the number of pre-recorded asynchronous classes a student can take per term.`,
    { topic: 'student-policy' },
  ],
  [
    236,
    `Schedule synchronous online classes to avoid conflicts with a student's in-person schedule.`,
    { rule: 'cohortNoOverlap', topic: 'it' },
  ],
  [
    237,
    `Ensure physical education aquatic courses are scheduled when the pool is fully staffed with lifeguards.`,
    { topic: 'safety' },
  ],
  [
    238,
    `Schedule rock climbing courses only when certified safety riggers are available.`,
    { topic: 'safety' },
  ],
  [
    239,
    `Ensure scuba diving certification courses have access to the deep-water pool.`,
    { topic: 'specialised' },
  ],
  [
    240,
    `Schedule equestrian courses at the off-campus farm, factoring in 45-minute transits.`,
    {
      rule: 'interCampusTravel',
      topic: 'transitions',
      params: [P.minutes('travelMinutes', 'Transit allowance', 45)],
    },
  ],
  [
    241,
    `Allow 15 minutes of tuning time for orchestral classes before the official start.`,
    {
      rule: 'roomTurnover',
      args: { feature: 'acoustic' },
      topic: 'specialised',
      params: [P.minutes('turnover', 'Tuning time', 15)],
    },
  ],
  [
    242,
    `Ensure marching band practice field access does not conflict with intramural sports.`,
    { rule: 'roomNoOverlap', topic: 'facilities' },
  ],
  [
    243,
    `Prevent scheduling student government presidents during executive meeting times.`,
    { topic: 'student-policy' },
  ],
  [
    244,
    `Block out Wednesday afternoons for university-wide athletic events (common in some regions).`,
    {
      soft: true,
      rule: 'dayFreeReserve',
      topic: 'events',
      params: [
        P.count('day', 'Day index (0 = Monday)', 2, 6),
        P.count('fromSlot', 'From slot index', 4, 15),
      ],
    },
  ],
  [
    245,
    `Ensure courses with field trips do not penalize students who miss overlapping courses.`,
    { topic: 'student-policy' },
  ],
  [
    246,
    `Schedule continuing education courses exclusively on weekends.`,
    { rule: 'clusterCohortDays', topic: 'student-policy' },
  ],
  [
    247,
    `Limit the maximum number of daily hours a student can spend in a wet lab due to chemical exposure limits.`,
    {
      rule: 'cohortMaxConsecutive',
      args: { kind: 'Lab' },
      topic: 'safety',
      params: [P.count('maxConsecutive', 'Wet-lab hours per day', 4, 10)],
    },
  ],
  [
    248,
    `Ensure radiology students do not exceed annual radiation exposure limits in clinical labs.`,
    { topic: 'compliance' },
  ],
  [
    249,
    `Schedule psychology observation classes in rooms equipped with two-way mirrors.`,
    { rule: 'roomFeatureRequired', args: { feature: 'twoWayMirror' }, topic: 'specialised' },
  ],
  [
    250,
    `Ensure early childhood education labs have attached observation rooms.`,
    { rule: 'roomFeatureRequired', args: { feature: 'twoWayMirror' }, topic: 'specialised' },
  ],
  [
    251,
    `Assign courses requiring clay or plaster to rooms with specialized sink traps.`,
    { rule: 'roomFeatureRequired', args: { feature: 'floorDrains' }, topic: 'specialised' },
  ],
  [
    252,
    `Ensure welding classes are in rooms with heavy-duty exhaust ventilation.`,
    { rule: 'roomFeatureRequired', args: { feature: 'ventilation' }, topic: 'specialised' },
  ],
  [
    253,
    `Do not schedule standard lectures in the welding shop.`,
    { rule: 'restrictedSpaces', topic: 'facilities' },
  ],
  [
    254,
    `Assign courses with frequent breakout sessions to rooms with small pod tables.`,
    { rule: 'roomFeatureRequired', args: { feature: 'podTables' }, topic: 'specialised' },
  ],
  [
    255,
    `Ensure debate team practice rooms are sound-dampened.`,
    { rule: 'roomFeatureRequired', args: { feature: 'soundproof' }, topic: 'specialised' },
  ],
  [
    256,
    `Schedule Model UN sessions in tiered, semi-circular rooms if possible.`,
    { soft: true, rule: 'roomFeatureRequired', args: { feature: 'tiered' }, topic: 'specialised' },
  ],
  [
    257,
    `Ensure moot court rooms have designated spaces for judges, jury, and counsel.`,
    { rule: 'roomFeatureRequired', args: { feature: 'mootCourt' }, topic: 'specialised' },
  ],
  [
    258,
    `Assign geology classes examining large rock samples to ground-floor rooms.`,
    { rule: 'roomFeatureRequired', args: { feature: 'groundFloor' }, topic: 'specialised' },
  ],
  [
    259,
    `Ensure botany classes have access to the university greenhouse.`,
    { topic: 'specialised' },
  ],
  [
    260,
    `Schedule marine biology field labs aligned with local tide charts.`,
    { topic: 'specialised' },
  ],
  [
    261,
    `Ensure meteorology classes have roof access for instrument reading.`,
    { topic: 'specialised' },
  ],
  [
    262,
    `Assign aviation flight hours based on FAA daylight regulations.`,
    { rule: 'daylightOnly', topic: 'compliance' },
  ],
  [
    263,
    `Schedule simulator time evenly to prevent machine overheating.`,
    { soft: true, rule: 'spreadAcrossWeek', topic: 'specialised' },
  ],
  [
    264,
    `Ensure culinary exams have dedicated tasting and grading periods built into the block.`,
    { topic: 'specialised' },
  ],
  [
    265,
    `Assign wine tasting courses to rooms where alcohol consumption is legally permitted.`,
    { rule: 'restrictedSpaces', topic: 'compliance' },
  ],
  [
    266,
    `Ensure childcare availability at the campus center aligns with student-parent class times.`,
    { topic: 'student-policy' },
  ],
  [
    267,
    `Schedule veteran students with VA appointments around their medical availability.`,
    { topic: 'student-policy' },
  ],
  [
    268,
    `Ensure international cohorts have time block adjustments for mandatory immigration briefings.`,
    { topic: 'compliance' },
  ],
  [
    269,
    `Prevent overlapping of multiple grant-funded research seminars for faculty.`,
    { topic: 'staffing' },
  ],
  [
    270,
    `Ensure visiting dignitaries' lectures do not displace required core courses.`,
    { topic: 'events' },
  ],
  [
    271,
    `Assign courses heavily reliant on library archives to rooms inside the library building.`,
    { soft: true, rule: 'restrictedSpaces', topic: 'facilities' },
  ],
  [
    272,
    `Ensure courses requiring 35mm film projection are in the one specific vintage theater.`,
    { rule: 'roomFeatureRequired', args: { feature: 'auditorium' }, topic: 'specialised' },
  ],
  [
    273,
    `Assign courses needing multi-channel surround sound to the audio engineering wing.`,
    { rule: 'roomFeatureRequired', args: { feature: 'acoustic' }, topic: 'specialised' },
  ],
  [
    274,
    `Do not schedule classes during the university president's annual state-of-the-campus address.`,
    {
      rule: 'reservedFreeHour',
      args: { scope: 'all' },
      topic: 'events',
      params: [
        P.count('day', 'Day index (0 = Monday)', 2, 6),
        P.count('slot', 'Slot index', 3, 15),
      ],
    },
  ],
  [
    275,
    `Ensure graduation gown fitting times do not conflict with senior capstone presentations.`,
    { topic: 'events' },
  ],
  [
    276,
    `Schedule specific makeup-exam rooms that are monitored continuously via camera.`,
    { topic: 'facilities' },
  ],
  [
    277,
    `Ensure quiet reading periods (dead week) have zero scheduled standard classes.`,
    { topic: 'governance' },
  ],
  [
    278,
    `Assign review sessions to large halls in the evening during dead week.`,
    { topic: 'governance' },
  ],
  [
    279,
    `Ensure peer-tutoring centers have scheduled blocks that match high-fail-rate course schedules.`,
    { topic: 'student-policy' },
  ],
  [
    280,
    `Schedule supplemental instruction (SI) sessions adjacent to the main lecture time.`,
    { soft: true, rule: 'linkedCoursesSameDay', topic: 'quality' },
  ],
  [
    281,
    `Do not assign pregnant instructors to rooms requiring climbing multiple flights of stairs if elevators are unreliable.`,
    { rule: 'facultyAccessibleRoom', topic: 'accessibility' },
  ],
  [
    282,
    `Ensure visually impaired students are placed in courses that do not rely purely on un-narrated visual media.`,
    { topic: 'accessibility' },
  ],
  [
    283,
    `Schedule deaf students in sections where closed-captioning technology is guaranteed.`,
    { topic: 'accessibility' },
  ],
  [
    284,
    `Assign heavy-machinery labs only when a secondary safety supervisor is scheduled.`,
    { rule: 'labSupervisionCap', topic: 'safety' },
  ],
  [
    285,
    `Ensure fine arts life-drawing classes have complete privacy from hallway windows.`,
    { rule: 'roomFeatureRequired', args: { feature: 'blackoutBlinds' }, topic: 'specialised' },
  ],
  [
    286,
    `Schedule photography darkroom time in 4-hour uninterrupted blocks.`,
    {
      rule: 'contiguousBlock',
      topic: 'specialised',
      params: [P.count('minBlock', 'Minimum contiguous slots', 4, 8)],
    },
  ],
  [
    287,
    `Ensure glassblowing studios are scheduled with mandatory cooling-down periods between cohorts.`,
    {
      rule: 'roomTurnover',
      args: { kind: 'Studio' },
      topic: 'safety',
      params: [P.minutes('turnover', 'Cooling-down period', 30)],
    },
  ],
  [
    288,
    `Assign fashion design courses to rooms with ample space for cutting tables and mannequins.`,
    { rule: 'roomFeatureRequired', args: { feature: 'movableFurniture' }, topic: 'specialised' },
  ],
  [
    289,
    `Ensure robotics classes have smooth floors for rover testing.`,
    { rule: 'roomFeatureRequired', args: { feature: 'flatFloor' }, topic: 'specialised' },
  ],
  [
    290,
    `Schedule drone piloting classes outdoors only during approved municipal flight windows.`,
    { rule: 'daylightOnly', topic: 'compliance' },
  ],
  [
    291,
    `Do not schedule outdoor classes near the bell tower during the hourly chimes.`,
    { topic: 'adjacency' },
  ],
  [
    292,
    `Assign language phonetics classes to rooms with high-fidelity microphones.`,
    { rule: 'roomFeatureRequired', args: { feature: 'languageLab' }, topic: 'specialised' },
  ],
  [
    293,
    `Ensure translation/interpreting classes have isolated sound booths.`,
    { rule: 'roomFeatureRequired', args: { feature: 'soundproof' }, topic: 'specialised' },
  ],
  [
    294,
    `Schedule physical therapy labs in rooms with padded examination tables.`,
    { topic: 'specialised' },
  ],
  [
    295,
    `Assign nursing simulation labs to rooms mimicking hospital wards.`,
    { rule: 'roomKindMatch', args: { kind: 'Special' }, topic: 'specialised' },
  ],
  [
    296,
    `Do not assign general humanities courses to nursing simulation labs.`,
    { rule: 'restrictedSpaces', topic: 'facilities' },
  ],
  [
    297,
    `Ensure pharmacology classes have secure access to dummy-medication cabinets.`,
    { topic: 'specialised' },
  ],
  [
    298,
    `Schedule dental hygiene clinics during public patient availability hours.`,
    { topic: 'specialised' },
  ],
  [
    299,
    `Ensure social work counseling roleplays are in private, small rooms.`,
    { rule: 'roomRightSize', topic: 'specialised' },
  ],
  [
    300,
    `Assign criminology blood-spatter analysis to specialized easily-cleaned rooms.`,
    { rule: 'roomFeatureRequired', args: { feature: 'floorDrains' }, topic: 'specialised' },
  ],

  [
    301,
    `Limit the total number of late-night classes (ending after 9 PM) any one student can take per term.`,
    {
      rule: 'lateNightCap',
      topic: 'student-policy',
      params: [
        P.time('after', 'Late-night threshold', '21:00'),
        P.count('maxPerWeek', 'Late sessions per week', 2, 20),
      ],
    },
  ],
  [
    302,
    `Restrict professors from teaching both the last slot of the day and the first slot of the next day.`,
    { rule: 'facultyMinRest', topic: 'staffing' },
  ],
  [
    303,
    `Ensure part-time adjuncts are not scheduled 5 days a week for a single course.`,
    {
      rule: 'adjunctSpreadCap',
      topic: 'staffing',
      params: [P.count('maxDays', 'Adjunct teaching days', 3, 7)],
    },
  ],
  [
    304,
    `Guarantee a 15-minute passing period for classes in the exact same building.`,
    {
      rule: 'walkWindow',
      args: { sameBuildingExempt: false },
      topic: 'transitions',
      params: [P.minutes('walkMinutes', 'Passing period', 15)],
    },
  ],
  [
    305,
    `Guarantee a 20-minute passing period for classes crossing a multi-lane public road.`,
    {
      rule: 'walkWindow',
      topic: 'transitions',
      params: [P.minutes('walkMinutes', 'Passing period', 20)],
    },
  ],
  [
    306,
    `Prevent the scheduling of more than 3 simultaneous exams in the massive field house to control noise.`,
    {
      topic: 'exams',
      params: [P.count('maxSimultaneous', 'Simultaneous exams per venue', 3, 12)],
    },
  ],
  [
    307,
    `Ensure staggered dismissal times for mega-lectures to prevent hallway crushing.`,
    { soft: true, rule: 'staggerMorningStarts', topic: 'transitions' },
  ],
  [
    308,
    `Prioritize ground-floor rooms for classes ending after dark for safety.`,
    { soft: true, rule: 'groundFloorAfterDark', topic: 'safety' },
  ],
  [
    309,
    `Ensure the campus safe-ride shuttle operates during all scheduled evening class dismissals.`,
    { topic: 'safety' },
  ],
  [
    310,
    `Do not schedule classes during the 2-minute campus-wide emergency siren test.`,
    { topic: 'emergency' },
  ],
  [
    311,
    `Reserve specific time slots for mandatory Title IX or safety training for first-year cohorts.`,
    {
      rule: 'reservedFreeHour',
      args: { scope: 'all' },
      topic: 'compliance',
      params: [
        P.count('day', 'Day index (0 = Monday)', 1, 6),
        P.count('slot', 'Slot index', 7, 15),
      ],
    },
  ],
  [
    312,
    `Ensure intramural sports do not monopolize gym space needed for academic Kinesiology classes.`,
    { rule: 'roomNoOverlap', topic: 'facilities' },
  ],
  [313, `Assign yoga and meditation classes to carpeted rooms.`, { topic: 'specialised' }],
  [314, `Assign martial arts classes to rooms with mat storage.`, { topic: 'specialised' }],
  [
    315,
    `Schedule ski/snowboard physical education off-campus on weekends only.`,
    { topic: 'specialised' },
  ],
  [
    316,
    `Ensure public transit bus schedules align with the end times of evening mega-lectures.`,
    { topic: 'transitions' },
  ],
  [
    317,
    `Allow a 5-minute grace period for log-ins on synchronous online classes.`,
    { topic: 'it' },
  ],
  [
    318,
    `Ensure hybrid classes clearly designate which days are in-person versus online in the grid.`,
    { topic: 'it' },
  ],
  [
    319,
    `Prevent room assignments for hybrid classes on their designated "online" days.`,
    { rule: 'hybridOnlineNoRoom', topic: 'it' },
  ],
  [
    320,
    `Ensure hy-flex rooms (teaching in-person and streaming simultaneously) have dedicated camera operators or auto-tracking hardware.`,
    { rule: 'roomFeatureRequired', args: { feature: 'hyflex' }, topic: 'it' },
  ],
  [
    321,
    `Assign courses with high rates of remote guest speakers to hy-flex rooms.`,
    { soft: true, rule: 'roomFeatureRequired', args: { feature: 'hyflex' }, topic: 'it' },
  ],
  [
    322,
    `Restrict the booking of the Board of Trustees room for academic classes.`,
    { rule: 'restrictedSpaces', topic: 'facilities' },
  ],
  [
    323,
    `Allow exceptions for executive MBA programs to use boardrooms on weekends.`,
    { topic: 'facilities' },
  ],
  [
    324,
    `Ensure the culinary dining room is free during service hours for restaurant management courses.`,
    { topic: 'specialised' },
  ],
  [
    325,
    `Schedule agriculture field-harvesting classes during the correct seasonal weeks, dynamically adjusting the syllabus.`,
    { topic: 'specialised' },
  ],
  [
    326,
    `Ensure animal husbandry classes coincide with livestock feeding schedules.`,
    { topic: 'specialised' },
  ],
  [
    327,
    `Do not schedule theoretical classes during the heavy labor blocks of forestry programs.`,
    { topic: 'specialised' },
  ],
  [
    328,
    `Assign surveying classes to daylight hours exclusively.`,
    { rule: 'daylightOnly', topic: 'specialised' },
  ],
  [
    329,
    `Ensure astronomy observation labs have a flexible secondary date for cloudy nights.`,
    { topic: 'specialised' },
  ],
  [
    330,
    `Schedule oceanography ship-time based on vessel rental availability.`,
    { topic: 'specialised' },
  ],
  [
    331,
    `Limit the maximum consecutive days a student can be scheduled for 8:00 AM starts to 3.`,
    {
      soft: true,
      rule: 'earlyStartStreakCap',
      topic: 'student-policy',
      params: [P.count('maxDays', 'Consecutive early starts', 3, 7)],
    },
  ],
  [
    332,
    `Ensure students on academic probation are not scheduled for overloaded credit semesters.`,
    { topic: 'student-policy' },
  ],
  [
    333,
    `Prioritize morning schedules for students in the campus work-study evening program.`,
    { soft: true, topic: 'student-policy' },
  ],
  [
    334,
    `Allow student-parents to block off pickup/drop-off hours in the automated scheduling assistant.`,
    { rule: 'protectedCohortSlots', topic: 'student-policy' },
  ],
  [
    335,
    `Ensure faculty holding administrative chair positions have blocked-out office hours for student walk-ins.`,
    { rule: 'facultyBlockedSlots', topic: 'staffing' },
  ],
  [
    336,
    `Do not schedule the Dean of a college to teach during university senate meetings.`,
    { rule: 'reservedFreeHour', args: { scope: 'faculty' }, topic: 'staffing' },
  ],
  [
    337,
    `Ensure faculty holding office hours have those hours listed in the timetable without requiring a room booking.`,
    { rule: 'noRoomNeeded', topic: 'staffing' },
  ],
  [
    338,
    `Prevent faculty from scheduling office hours at the exact same time as their department's core required courses.`,
    { topic: 'staffing' },
  ],
  [
    339,
    `Ensure building access swipe-cards are activated for the exact duration of a weekend scheduled class.`,
    { topic: 'facilities' },
  ],
  [
    340,
    `Automatically alert security if a room is booked past midnight for an architecture studio.`,
    { topic: 'safety' },
  ],
  [
    341,
    `Allow architecture students 24/7 access to studios, removing it from standard block constraints.`,
    { rule: 'restrictedSpaces', topic: 'facilities' },
  ],
  [
    342,
    `Ensure MFA art students have permanent, un-booked studio spaces that do not enter the scheduling pool.`,
    { rule: 'restrictedSpaces', topic: 'facilities' },
  ],
  [
    343,
    `Prevent scheduling regular classes in designated student lounge spaces.`,
    { rule: 'restrictedSpaces', topic: 'facilities' },
  ],
  [
    344,
    `Ensure cafeteria staffing matches the peak break times generated by the timetable algorithm.`,
    { topic: 'facilities' },
  ],
  [
    345,
    `Schedule mandatory fire drills during times that impact the fewest number of lab experiments.`,
    { topic: 'emergency' },
  ],
  [
    346,
    `Ensure campus IT helpdesks are staffed heavily during the first week's morning class blocks.`,
    { topic: 'it' },
  ],
  [
    347,
    `Assign early morning snow-clearing priority to buildings hosting 8:00 AM classes.`,
    { topic: 'facilities' },
  ],
  [
    348,
    `Prevent scheduling classes in buildings undergoing heavy, noisy exterior construction.`,
    { rule: 'noisyBuildingAvoid', topic: 'adjacency' },
  ],
  [
    349,
    `If construction is unavoidable, restrict classes in that building to low-noise/visual-heavy courses.`,
    { soft: true, rule: 'noisyBuildingAvoid', topic: 'adjacency' },
  ],
  [
    350,
    `Ensure courses requiring high ventilation are prioritized during pandemic or health-crisis scheduling.`,
    { soft: true, rule: 'ventilationPriority', topic: 'compliance' },
  ],
  [
    351,
    `Implement 6-foot social distancing constraints in the algorithm, dynamically reducing all room capacities by 60% if a health mandate triggers.`,
    {
      rule: 'distancingCapacity',
      topic: 'compliance',
      params: [
        P.percent('capacityShare', 'Capacity retained under mandate', 40),
        P.bool('active', 'Health mandate active', false),
      ],
    },
  ],
  [
    352,
    `Schedule unidirectional hallway traffic by staggering class start times in older buildings.`,
    { soft: true, rule: 'staggerMorningStarts', topic: 'transitions' },
  ],
  [
    353,
    `Ensure contact-tracing data can be mapped to seating charts generated by the timetable.`,
    { topic: 'compliance' },
  ],
  [
    354,
    `Do not assign group-work heavy classes to tiered lecture halls with fixed forward-facing seats.`,
    { rule: 'roomForbiddenFeature', args: { feature: 'fixedSeating' }, topic: 'quality' },
  ],
  [
    355,
    `Ensure language immersion programs have dedicated "language houses" exempt from general scheduling.`,
    { rule: 'restrictedSpaces', topic: 'facilities' },
  ],
  [
    356,
    `Schedule study abroad pre-departure orientations during the weekend prior to finals.`,
    { topic: 'events' },
  ],
  [
    357,
    `Ensure international campus exchange students have timetables aligned with their home institution's credit transfer requirements.`,
    { topic: 'compliance' },
  ],
  [
    358,
    `Prevent the scheduling of specific controversial courses in rooms with poor security chokepoints.`,
    { topic: 'safety' },
  ],
  [
    359,
    `Ensure high-profile political guest lecturers are scheduled in easily secured, single-entry auditoriums.`,
    { rule: 'roomFeatureRequired', args: { feature: 'auditorium' }, topic: 'events' },
  ],
  [
    360,
    `Assign courses with heavy, bulky physical portfolios (e.g., graphic design) to rooms near ground-floor lockers.`,
    {
      soft: true,
      rule: 'roomFeatureRequired',
      args: { feature: 'groundFloor' },
      topic: 'specialised',
    },
  ],
]
