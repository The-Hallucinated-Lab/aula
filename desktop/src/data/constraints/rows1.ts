/**
 * Constraints 1–180 — the fourteen named operational domains.
 * Text is reproduced verbatim from the source catalogue.
 */

import { P, type Row } from './types'

/* I. Universal Hard Constraints (1–10) — all hard */
export const UNIVERSAL: Row[] = [
  [1, `No instructor can be scheduled for two classes simultaneously.`, { rule: 'facultyNoOverlap' }],
  [2, `No room can host more than one class at the same time.`, { rule: 'roomNoOverlap' }],
  [3, `No student cohort can have overlapping mandatory core courses.`, { rule: 'cohortNoOverlap' }],
  [4, `Course enrollment must not exceed the maximum fire code capacity of the assigned room.`, { rule: 'roomCapacity' }],
  [5, `Classes cannot be scheduled outside of the university's official operating hours.`, { rule: 'operatingHours' }],
  [6, `Buildings closed for scheduled maintenance cannot be assigned classes.`, { rule: 'buildingMaintenance' }],
  [7, `Instructors on sabbatical cannot be assigned teaching duties.`, { rule: 'facultySabbatical' }],
  [8, `Suspended or canceled courses must not consume room time blocks.`, { rule: 'courseSuspended' }],
  [9, `Two courses requiring the same unique piece of portable equipment cannot run simultaneously.`, { rule: 'equipmentContention' }],
  [10, `Classes cannot be scheduled on official university holidays.`, { rule: 'holidayBlackout' }],
]

/* II. Instructor Workload & Legal Constraints (11–30) — hard */
export const WORKLOAD: Row[] = [
  [11, `Full-time faculty cannot exceed their contractual maximum teaching hours per week.`, {
    rule: 'facultyMaxWeekly', params: [P.hours('maxHours', 'Maximum teaching hours per week', 18, 40)],
  }],
  [12, `Adjunct faculty cannot exceed part-time hour limits.`, {
    rule: 'adjunctMaxWeekly', params: [P.hours('maxHours', 'Adjunct weekly cap', 9, 30)],
  }],
  [13, `Teaching Assistants (TAs) cannot exceed their union-mandated weekly working hours.`, {
    rule: 'taMaxWeekly', params: [P.hours('maxHours', 'TA weekly cap', 12, 30)],
  }],
  [14, `TAs cannot be scheduled to teach during their own required graduate courses.`, { rule: 'facultyBlockedSlots' }],
  [15, `Instructors must have a mandated minimum rest period between a late-evening class and an early-morning class the next day.`, {
    rule: 'facultyMinRest', params: [P.hours('restHours', 'Minimum overnight rest', 12, 24)],
  }],
  [16, `Instructors cannot teach more than a specified number of consecutive hours without a break.`, {
    rule: 'facultyMaxConsecutive', params: [P.count('maxConsecutive', 'Consecutive teaching hours allowed', 3, 8)],
  }],
  [17, `Instructors must be granted a guaranteed lunch break if teaching across the midday block.`, { rule: 'facultyLunch' }],
  [18, `Faculty members cannot be scheduled to teach on their approved research or administrative days.`, { rule: 'facultyBlockedDays' }],
  [19, `Tenured faculty minimum teaching loads must be met before assigning classes to adjuncts.`, {
    soft: true, rule: 'seniorityLoadFloor', params: [P.hours('floorHours', 'Tenured minimum load', 8, 30)],
  }],
  [20, `Instructors with approved medical accommodations must not be assigned to non-compliant rooms.`, { rule: 'facultyAccessibleRoom' }],
  [21, `Visiting professors must have all classes compressed into the specific days they are on campus.`, { rule: 'visitingCampusDays' }],
  [22, `Instructors sharing a course (co-teaching) must have coordinated schedules for joint sessions.`],
  [23, `Instructors cannot be scheduled during mandatory departmental meetings.`, {
    rule: 'reservedFreeHour',
    args: { scope: 'faculty' },
    params: [P.count('day', 'Day index (0 = Monday)', 2, 6), P.count('slot', 'Slot index', 4, 15)],
  }],
  [24, `Instructors cannot be scheduled during university-wide faculty senate or assembly meetings.`, {
    rule: 'reservedFreeHour',
    args: { scope: 'faculty' },
    params: [P.count('day', 'Day index (0 = Monday)', 3, 6), P.count('slot', 'Slot index', 3, 15)],
  }],
  [25, `Workload calculations must weigh large-lecture courses differently than small seminars.`],
  [26, `Clinical faculty must not be scheduled to teach during their hospital rotation hours.`, { rule: 'facultyBlockedSlots' }],
  [27, `Faculty supervising lab sessions cannot exceed safety supervision hour limits.`, {
    rule: 'labSupervisionCap', params: [P.hours('maxLabHours', 'Lab supervision hours per week', 8, 24)],
  }],
  [28, `New faculty may have a reduced teaching load constraint in their first year.`, {
    rule: 'newFacultyLoad', params: [P.hours('maxHours', 'First-year weekly cap', 12, 30)],
  }],
  [29, `Instructors cannot be scheduled to invigilate exams during their own teaching slots.`, {}],
  [30, `Overtime pay triggers must be avoided for unionized teaching staff where applicable.`, {
    soft: true, rule: 'overtimeAvoid', params: [P.hours('threshold', 'Overtime threshold', 16, 40)],
  }],
]

/* III. Instructor Preferences (31–40) — all soft */
export const INSTRUCTOR_PREFS: Row[] = [
  [31, `Avoid scheduling an instructor for an 8:00 AM class if they requested otherwise.`, { rule: 'avoidEarlySlot' }],
  [32, `Prefer scheduling an instructor's classes on consecutive days (e.g., T/Th) rather than spreading them out.`, { rule: 'compactTeachingDays' }],
  [33, `Prefer scheduling an instructor's classes in the same building to minimize travel.`, { rule: 'sameBuildingPerDay' }],
  [34, `Avoid assigning an instructor to a room they have historically disliked.`],
  [35, `Attempt to grant an instructor's request for a specific time window for childcare drop-off.`, { rule: 'facultyTimeWindow' }],
  [36, `Prefer back-to-back classes for instructors who wish to minimize time spent on campus.`, { rule: 'preferBackToBack' }],
  [37, `Avoid back-to-back classes for instructors who prefer preparation time between lectures.`, { rule: 'preferPrepGap' }],
  [38, `Honor instructor preferences for teaching strictly morning, afternoon, or evening sessions.`, { rule: 'preferDayPart' }],
  [39, `Prefer assigning senior faculty to their top-choice time slots over junior faculty.`, { rule: 'seniorityPriority' }],
  [40, `Minimize the number of different rooms an instructor must use throughout the week.`, { rule: 'minimiseRoomCount' }],
]

/* IV. Student Cohort & Pathway Constraints (41–60) */
export const COHORT: Row[] = [
  [41, `Mandatory courses for a specific major must not overlap in any semester.`, { rule: 'cohortNoOverlap' }],
  [42, `Prerequisite courses must not overlap with their co-requisite counterparts.`, { rule: 'coursePrerequisiteOrder' }],
  [43, `Core courses for dual-degree programs must not conflict.`, { rule: 'cohortNoOverlap' }],
  [44, `High-demand elective courses should not overlap with core courses of the target major.`, { soft: true, rule: 'electiveGroupClashFree' }],
  [45, `Popular electives across different departments should be spread out to allow maximum enrollment.`, { soft: true, rule: 'spreadAcrossWeek' }],
  [46, `First-year seminar courses must not conflict with standard first-year introductory lectures.`, { rule: 'cohortNoOverlap' }],
  [47, `Graduate-level core courses must be scheduled outside of standard undergraduate core times to allow TAs to attend.`],
  [48, `Student cohorts must not be subjected to more than four consecutive hours of lectures without a break.`, {
    rule: 'cohortMaxConsecutive', params: [P.count('maxConsecutive', 'Consecutive lecture hours allowed', 4, 10)],
  }],
  [49, `A guaranteed university-wide lunch hour or break period must be maintained for all students.`, { rule: 'cohortLunch' }],
  [50, `Evening programs designed for working professionals must not start before 5:30 PM.`, {
    rule: 'eveningProgramStart', params: [P.time('earliest', 'Earliest evening start', '17:30')],
  }],
  [51, `Classes for part-time students should be clustered on specific days (e.g., weekends or evenings).`, { soft: true, rule: 'clusterCohortDays' }],
  [52, `Honors program seminars must not conflict with honors cohort core requirements.`, { rule: 'cohortNoOverlap' }],
  [53, `Varsity student-athletes must not have required classes scheduled during mandatory practice blocks.`, { rule: 'protectedCohortSlots' }],
  [54, `Avoid scheduling heavy credit-load cohorts with only early morning or only late evening classes.`, { soft: true, rule: 'cohortDayPartBalance' }],
  [55, `Avoid scheduling students with three or more final exams on the exact same day.`, {
    soft: true, params: [P.count('maxPerDay', 'Exams per day', 2, 6)],
  }],
  [56, `Minimize "gaps" of more than 3 hours between classes for commuter students.`, {
    soft: true, rule: 'cohortMaxGap', params: [P.count('maxGap', 'Tolerated gap', 3, 8, )],
  }],
  [57, `Maximize "gaps" for specific cohorts who require long laboratory or studio preparation.`, { soft: true, rule: 'cohortMinGap' }],
  [58, `Ensure at least one section of a multi-section required course is offered in the evening.`],
  [59, `Ensure online asynchronous sections do not have synchronous exam times that conflict with major core courses.`],
  [60, `Distance-learning synchronous cohorts must be scheduled according to their primary time zone.`],
]

/* V. Course & Curriculum Sequencing (61–80) */
export const CURRICULUM: Row[] = [
  [61, `A laboratory session must occur in the same week as its associated lecture.`],
  [62, `A laboratory session must ideally follow, not precede, the theoretical lecture in a given week.`, { soft: true, rule: 'labAfterLecture' }],
  [63, `Tutorial/Recitation sections must be scheduled after the main lecture but before the week ends.`, { soft: true, rule: 'tutorialAfterLecture' }],
  [64, `Multi-part lectures (e.g., Part 1 on Tuesday, Part 2 on Thursday) must occur in the correct sequence.`, { rule: 'coursePrerequisiteOrder' }],
  [65, `Courses that span multiple terms (Year-long courses) should ideally retain the same time slot in both terms.`, { soft: true }],
  [66, `Connected courses (e.g., Theory of Music and Ear Training) must be scheduled sequentially on the same day.`, { soft: true, rule: 'linkedCoursesSameDay' }],
  [67, `Classes offering multiple sections must have those sections spread evenly across the week (not all on Mondays).`, { soft: true, rule: 'spreadSectionsAcrossWeek' }],
  [68, `If a course has a required film screening, the screening time must not conflict with the lecture time.`],
  [69, `"Block teaching" intensive courses (3 weeks, full time) cannot overlap with standard semester courses for that cohort.`],
  [70, `Studio critiques must be scheduled in blocks large enough to accommodate all student presentations.`, { soft: true, rule: 'contiguousBlock' }],
  [71, `Language courses must be scheduled for short bursts over many days (e.g., 4 days a week) rather than one long block.`, {
    soft: true, rule: 'shortBurstsPerWeek', params: [P.count('minDays', 'Minimum distinct days', 4, 7)],
  }],
  [72, `Creative writing workshops require continuous uninterrupted 3-hour blocks.`, {
    rule: 'contiguousBlock', params: [P.count('minBlock', 'Minimum contiguous slots', 3, 8)],
  }],
  [73, `Independent study blocks do not require rooms but must be logged to calculate instructor workload.`, { rule: 'noRoomNeeded' }],
  [74, `Experiential learning/fieldwork must be scheduled on days where students have no on-campus classes.`, { rule: 'fieldworkFreeDay' }],
  [75, `Co-op preparation seminars must be scheduled during the term prior to the co-op placement.`],
  [76, `Courses requiring external guest speakers should be scheduled in standard midday slots to accommodate travel.`, { soft: true, rule: 'preferDayPart' }],
  [77, `Capstone project meetings must be scheduled at a time when all group members and the advisor are free.`],
  [78, `Courses with heavy reading loads should ideally not be scheduled back-to-back with each other.`, { soft: true, rule: 'avoidBackToBackHeavy' }],
  [79, `Performance rehearsals (theater/dance) must be scheduled after standard lecture hours.`, { rule: 'rehearsalAfterHours' }],
  [80, `Courses that share a common midterm exam must have that exam time block reserved at the start of the semester.`, {}],
]

/* VI. Standard Time Blocks & Grid Rules (81–90) */
export const GRID: Row[] = [
  [81, `Standard 3-credit courses must fit the grid (e.g., MWF 50 mins or TTh 75 mins).`, { rule: 'blockLengthAllowed' }],
  [82, `Non-standard length classes must align their start times with the standard grid to minimize orphaned time slots.`, { rule: 'gridAlignment' }],
  [83, `Classes must end at least 10-15 minutes before the next standard block begins to allow for transitions.`, {
    rule: 'transitionGap', params: [P.minutes('gapMinutes', 'Transition time', 10, 60)],
  }],
  [84, `Evening blocks must align with campus transit schedules.`],
  [85, `Once-a-week 3-hour seminars must be scheduled on specific days (usually Fridays or evenings) to avoid blocking grid slots.`, { soft: true }],
  [86, `Departmental colloquiums must adhere to the university's designated "free hour" (e.g., Thursday at noon).`, {
    rule: 'reservedFreeHour',
    args: { scope: 'all' },
    params: [P.count('day', 'Day index (0 = Monday)', 3, 6), P.count('slot', 'Slot index', 3, 15)],
  }],
  [87, `Labs must be scheduled in standard 2-hour, 3-hour, or 4-hour blocks.`, {
    rule: 'blockLengthAllowed',
    args: { kind: 'Lab' },
    params: [P.count('minBlock', 'Minimum lab block', 2, 8), P.count('maxBlock', 'Maximum lab block', 4, 8)],
  }],
  [88, `4-credit courses must either meet 4 days a week or have extended lecture times that fit the overarching grid.`, { soft: true, rule: 'creditContactHours' }],
  [89, `Summer term compressed courses must map their hours to meet accreditation contact-hour requirements.`, { soft: true, rule: 'creditContactHours' }],
  [90, `Weekend courses must include mandatory breaks mapping to union regulations.`],
]

/* VII. Room Types & Physical Capabilities (91–110) */
export const ROOM_TYPES: Row[] = [
  [91, `A lecture course of 200 students must be assigned a tiered lecture hall, not a flat classroom.`, {
    rule: 'roomFeatureRequired', args: { feature: 'tiered', whenSizeAbove: 150 },
  }],
  [92, `Seminar courses of 15 students should be assigned to seminar rooms with a central table, not a large lecture hall.`, { soft: true, rule: 'roomRightSize' }],
  [93, `Chemistry courses requiring fume hoods must be assigned to wet labs.`, { rule: 'roomFeatureRequired', args: { feature: 'fumeHood' } }],
  [94, `Computer Science courses requiring desktop terminals must be assigned to computer labs.`, { rule: 'roomFeatureRequired', args: { feature: 'computers' } }],
  [95, `Dance classes must be assigned to studios with sprung floors and mirrors.`, { rule: 'roomFeatureRequired', args: { feature: 'sprungFloor' } }],
  [96, `Music performance classes must be assigned to acoustically treated rooms.`, { rule: 'roomFeatureRequired', args: { feature: 'acoustic' } }],
  [97, `Engineering design courses must be assigned to maker-spaces or drafting rooms.`, { rule: 'roomFeatureRequired', args: { feature: 'makerSpace' } }],
  [98, `Anatomy classes must be scheduled in specific biosafety-rated labs.`, { rule: 'roomFeatureRequired', args: { feature: 'biosafety' } }],
  [99, `Physical Education indoor classes must be scheduled in gymnasiums.`, { rule: 'roomFeatureRequired', args: { feature: 'gymnasium' } }],
  [100, `Art history classes must be assigned rooms with high-resolution projection capabilities.`, { rule: 'roomFeatureRequired', args: { feature: 'projectorHiRes' } }],
  [101, `Law school mock trials must be scheduled in the moot court facility.`, { rule: 'roomFeatureRequired', args: { feature: 'mootCourt' } }],
  [102, `Broadcast journalism classes must be scheduled in the media studio.`, { rule: 'roomFeatureRequired', args: { feature: 'mediaStudio' } }],
  [103, `Culinary arts classes must be scheduled in instructional kitchens.`, { rule: 'roomFeatureRequired', args: { feature: 'kitchen' } }],
  [104, `Astronomy classes must have access to the observatory for evening sessions.`, { rule: 'roomFeatureRequired', args: { feature: 'observatory' } }],
  [105, `Theater technical classes must be scheduled in the auditorium or scene shop.`, { rule: 'roomFeatureRequired', args: { feature: 'auditorium' } }],
  [106, `Physics classes requiring heavy equipment setups must be in ground-floor labs.`, { rule: 'roomFeatureRequired', args: { feature: 'groundFloor' } }],
  [107, `Active-learning classes must be scheduled in rooms with movable, modular furniture.`, { rule: 'roomFeatureRequired', args: { feature: 'movableFurniture' } }],
  [108, `Standard exams must be scheduled in rooms that allow for alternating seating (50% capacity usage).`, {
    params: [P.percent('capacityShare', 'Exam capacity share', 50)],
  }],
  [109, `Confidential group counseling courses must be scheduled in soundproofed rooms.`, { rule: 'roomFeatureRequired', args: { feature: 'soundproof' } }],
  [110, `Rooms with fixed, bolted seating cannot be assigned to courses requiring physical group activities.`, { rule: 'roomForbiddenFeature', args: { feature: 'fixedSeating' } }],
]

/* VIII. Specialized Equipment & IT Requirements (111–125) */
export const EQUIPMENT: Row[] = [
  [111, `Courses requiring dual-screen projection must be assigned to specific equipped rooms.`, { rule: 'roomFeatureRequired', args: { feature: 'dualProjection' } }],
  [112, `Courses requiring lecture-capture/recording technology must be in equipped halls.`, { rule: 'roomFeatureRequired', args: { feature: 'lectureCapture' } }],
  [113, `Mac-specific software courses must be assigned to Apple computer labs.`, { rule: 'roomFeatureRequired', args: { feature: 'macLab' } }],
  [114, `PC-specific software courses must be assigned to Windows computer labs.`, { rule: 'roomFeatureRequired', args: { feature: 'windowsLab' } }],
  [115, `Courses requiring a Grand Piano must be scheduled in specific recital halls.`, { rule: 'roomFeatureRequired', args: { feature: 'grandPiano' } }],
  [116, `Classes requiring specialized 3D printers must be scheduled in the 3D lab.`, { rule: 'roomFeatureRequired', args: { feature: 'threeDPrinters' } }],
  [117, `Classes utilizing dangerous chemicals cannot be scheduled back-to-back to allow for air cycling.`, {
    rule: 'roomTurnover', args: { feature: 'fumeHood' }, params: [P.minutes('turnover', 'Air-cycling gap', 30)],
  }],
  [118, `Classes requiring portable smartboards must have time padded for IT delivery.`, {
    rule: 'roomTurnover', args: { requiresEquipment: true },
    params: [P.minutes('turnover', 'IT delivery pad', 15)],
  }],
  [119, `Language classes requiring audio listening stations must be in the language lab.`, { rule: 'roomFeatureRequired', args: { feature: 'languageLab' } }],
  [120, `Virtual reality (VR) courses must be scheduled in labs with sufficient spatial tracking zones.`, { rule: 'roomFeatureRequired', args: { feature: 'vrTracking' } }],
  [121, `E-sports management courses must be scheduled in the gaming arena.`, { rule: 'roomFeatureRequired', args: { feature: 'esports' } }],
  [122, `Classes requiring specific financial terminals (e.g., Bloomberg terminals) must be in the trading lab.`, { rule: 'roomFeatureRequired', args: { feature: 'financeTerminals' } }],
  [123, `Film editing classes must be scheduled in rooms with specialized color-calibrated monitors.`, { rule: 'roomFeatureRequired', args: { feature: 'colorCalibrated' } }],
  [124, `Radiology courses must be in rooms with medical-grade displays.`, { rule: 'roomFeatureRequired', args: { feature: 'medicalDisplays' } }],
  [125, `Classes requiring live animals (veterinary/biology) must be in certified animal-safe facilities.`, { rule: 'roomFeatureRequired', args: { feature: 'animalSafe' } }],
]

/* IX. Campus Geography & Travel Times (126–135) */
export const GEOGRAPHY: Row[] = [
  [126, `Instructors teaching consecutive classes on different campuses must be given adequate travel time (e.g., 60 minutes).`, {
    rule: 'interCampusTravel', params: [P.minutes('travelMinutes', 'Inter-campus travel time', 60)],
  }],
  [127, `Students with consecutive classes on different campuses must not be penalized for arriving late, or the schedule must forbid such overlaps.`, {
    rule: 'crossCampusGap', params: [P.minutes('travelMinutes', 'Student inter-campus allowance', 60)],
  }],
  [128, `Classes scheduled in remote satellite buildings must account for bus shuttle schedules.`],
  [129, `Back-to-back classes for an instructor within the same massive building are permitted.`, { rule: 'walkWindow', args: { sameBuildingExempt: true } }],
  [130, `Back-to-back classes for an instructor across a large main campus must allow a 15-minute walking window.`, {
    rule: 'walkWindow', params: [P.minutes('walkMinutes', 'Walking window', 15, 60)],
  }],
  [131, `Classes utilizing off-campus sports fields must include transit time in the schedule block.`, { rule: 'interCampusTravel' }],
  [132, `Inter-campus faculty must not be scheduled to travel during peak city rush hour traffic.`, { soft: true, rule: 'rushHourAvoid' }],
  [133, `Winter term scheduling in cold-climate universities may require extended transit times due to snow.`, { soft: true }],
  [134, `Departments located entirely on the "North Campus" should prioritize North Campus rooms for their courses.`, { soft: true, rule: 'homeCampusPreference' }],
  [135, `Instructors with physical mobility issues must have zero-travel or highly localized schedules.`, { rule: 'mobilityLocalised' }],
]

/* X. Facility Maintenance, Setup & Logistics (136–145) */
export const LOGISTICS: Row[] = [
  [136, `Large lecture halls require a minimum 15-minute turnover time between classes.`, {
    rule: 'roomTurnover', args: { minCapacity: 120 }, params: [P.minutes('turnover', 'Turnover time', 15)],
  }],
  [137, `Chemistry labs require a 30-minute teardown and setup block between different lab sessions.`, {
    rule: 'roomTurnover', args: { kind: 'Lab' }, params: [P.minutes('turnover', 'Teardown & setup', 30)],
  }],
  [138, `Art studios require cleanup time blocks at the end of each day.`, { rule: 'roomBlocked', args: { kind: 'Studio', position: 'lastSlot' } }],
  [139, `Gymnasiums require setup time to transition from basketball to volleyball configurations.`, {
    rule: 'roomTurnover', args: { kind: 'Gymnasium' }, params: [P.minutes('turnover', 'Reconfiguration time', 30)],
  }],
  [140, `Rooms must be blocked off for daily janitorial cleaning during specific hours.`, { rule: 'roomBlocked' }],
  [141, `Buildings lacking central HVAC cannot be heavily scheduled during peak summer afternoon heat.`, { soft: true }],
  [142, `Rooms designated for maintenance or renovation must be completely locked out of the scheduling system.`, { rule: 'roomBlocked' }],
  [143, `IT maintenance windows (usually early mornings or weekends) must not conflict with online synchronous classes.`],
  [144, `High-security labs require mandatory downtime for daily audits.`, { rule: 'roomBlocked' }],
  [145, `Auditoriums must be blocked for a full day prior to a major performance for technical rehearsals.`, { rule: 'roomBlocked', args: { kind: 'Auditorium' } }],
]

/* XI. Accessibility, Inclusivity & ADA Compliance (146–155) */
export const ACCESSIBILITY: Row[] = [
  [146, `A student requiring wheelchair access must have all their classes relocated to ADA-compliant, accessible rooms.`, { rule: 'accessibleRoomForCohort' }],
  [147, `If an elevator breaks, classes with mobility-impaired students must be dynamically rescheduled to ground floors.`, { rule: 'elevatorFallbackGroundFloor' }],
  [148, `Instructors with visual impairments must be scheduled in rooms with specific lighting and podium setups.`, { rule: 'adjustablePodium' }],
  [149, `Students requiring sign language interpreters must be scheduled in rooms with clear sightlines and adequate space for the interpreter.`, { rule: 'interpreterSpace' }],
  [150, `Exams for students requiring extended time must be scheduled in rooms that are free for the extended duration.`],
  [151, `Avoid scheduling mandatory core classes during major religious holidays.`, { rule: 'religiousHoliday' }],
  [152, `Allow scheduling flexibility for students participating in daily religious prayers (e.g., Friday midday prayers).`, {
    rule: 'prayerWindow',
    params: [P.count('day', 'Day index (0 = Monday)', 4, 6), P.count('slot', 'Slot index', 3, 15)],
  }],
  [153, `Classes with neurodivergent students requiring low-stimulation environments should not be scheduled next to noisy music rooms.`, { soft: true, rule: 'lowStimulusAdjacency' }],
  [154, `Service animal accommodations require adequate aisle spacing in the assigned room.`],
  [155, `Lactation space availability must be geographically close to the schedule of nursing staff and students.`],
]

/* XII. Departmental & Administrative Rules (156–165) */
export const DEPARTMENTAL: Row[] = [
  [156, `The Physics department has priority override for all rooms in the Physics Building.`, { soft: true, rule: 'deptRoomPriority' }],
  [157, `The Business School controls its own wing and other departments can only use it after 5:00 PM.`, {
    rule: 'deptAfterHoursOnly', params: [P.time('after', 'Open to other departments after', '17:00')],
  }],
  [158, `Room hoarding by departments (booking a room "just in case") must be restricted by the central algorithm.`, { soft: true, rule: 'manualLock' }],
  [159, `Shared/General Purpose classrooms are distributed proportionally based on departmental enrollment sizes.`, { soft: true }],
  [160, `Classes with historical enrollments of <10 students may be flagged for cancellation before room assignment.`, {
    soft: true, rule: 'lowEnrolmentFlag', params: [P.count('minEnrolment', 'Minimum enrolment', 10, 60)],
  }],
  [161, `First-year mega-lectures (500+ students) must be scheduled first, as only 1 or 2 rooms on campus can fit them.`, {
    rule: 'megaLectureFirst', params: [P.count('threshold', 'Mega-lecture size', 200, 1000)],
  }],
  [162, `Exam scheduling must take precedence over extra-curricular room bookings.`],
  [163, `Student Union spaces cannot be booked for academic lectures.`, { rule: 'restrictedSpaces' }],
  [164, `Library seminar rooms can only be booked for specific research-based courses.`, { rule: 'restrictedSpaces' }],
  [165, `Campus police require that classes ending after 10:00 PM are clustered in specific well-lit buildings.`, {
    soft: true, rule: 'lateNightClustering', params: [P.time('after', 'Late-night threshold', '22:00')],
  }],
]

/* XIII. Examination Specific Constraints (166–175) */
export const EXAMS: Row[] = [
  [166, `A student cannot have two final exams at the same time.`, {}],
  [167, `A student cannot have three exams within a 24-hour period.`, {
    params: [P.count('maxPerDay', 'Exams per 24 hours', 2, 6)],
  }],
  [168, `Exams for large multi-section courses must be scheduled simultaneously across multiple rooms to prevent cheating.`, {}],
  [169, `Room capacity for exams is calculated at 50% of lecture capacity to allow empty seats between students.`, {
    params: [P.percent('capacityShare', 'Exam capacity share', 50)],
  }],
  [170, `Take-home exams do not require room bookings but must not overlap in due dates with major core exams.`],
  [171, `Practical lab exams require specialized lab room bookings, preventing regular classes from running there.`, { rule: 'roomKindMatch', args: { kind: 'Lab' } }],
  [172, `Oral exams require multiple small office or seminar bookings over several days.`],
  [173, `Instructors must not be double-booked for invigilation duties.`, {}],
  [174, `TAs union rules dictate maximum hours for exam invigilation blocks.`, {
    rule: 'taMaxWeekly', params: [P.hours('maxHours', 'TA invigilation cap', 12, 30)],
  }],
  [175, `Accommodated testing centers must have sufficient staggered start times for extra-time students.`],
]

/* XIV. Financial, Environmental & Energy Constraints (176–180) */
export const ENERGY: Row[] = [
  [176, `Buildings should be powered down on weekends; therefore, weekend classes should be consolidated into a single building.`, { soft: true, rule: 'weekendConsolidation' }],
  [177, `Heating/cooling systems are zoned; classes should be clustered geographically to save energy.`, { soft: true, rule: 'zoneClustering' }],
  [178, `Adjunct hiring budget limits dictate that classes must be collapsed if enrollment is below a financial break-even point.`, {
    soft: true, rule: 'lowEnrolmentFlag', params: [P.count('minEnrolment', 'Break-even enrolment', 12, 80)],
  }],
  [179, `Specialized lighting in media rooms is expensive to run and must only be scheduled when necessary.`, { soft: true }],
  [180, `Certain campus gates close at specific times; classes cannot be scheduled in zones inaccessible after those hours.`, {
    rule: 'gateCurfew', params: [P.time('closes', 'Gate closing time', '21:00')],
  }],
]
