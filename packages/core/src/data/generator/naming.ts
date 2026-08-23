/**
 * Generator — turns a `SetupConfig` into a schedulable `Institution`.
 *
 * Two rules govern this file:
 *  1. Deterministic. The same config and seed always produce the same
 *     institution, so a saved project reopens identically.
 *  2. Never emit a structurally impossible demand. If the configured rooms
 *     have no fume hood, no course is given a fume-hood requirement — the
 *     solver should fail on real scarcity, never on generator fiction.
 */

/**
 * Plausible names for generated entities.
 *
 * A demonstration institution reads as fiction if every course is "CSE 301".
 * The banks are per department and wrap, and the fallbacks are deliberately
 * dull rather than absent — a course named `undefined` reached the CSV export
 * once already.
 */

const SUBJECTS: Record<string, string[][]> = {
  CSE: [
    [
      'Programming Fundamentals',
      'Discrete Mathematics',
      'Digital Logic',
      'Data Structures',
      'Computer Organisation',
      'Linear Algebra',
    ],
    [
      'Algorithms',
      'Operating Systems',
      'Database Systems',
      'Computer Networks',
      'Theory of Computation',
      'Software Engineering',
    ],
    [
      'Machine Learning',
      'Compiler Design',
      'Distributed Systems',
      'Information Security',
      'Cloud Architecture',
      'Computer Graphics',
    ],
    [
      'Advanced Algorithms',
      'Natural Language Processing',
      'Reinforcement Learning',
      'Systems Security',
      'Data Mining',
      'Quantum Computing',
    ],
  ],
  ECE: [
    [
      'Circuit Theory',
      'Semiconductor Devices',
      'Signals & Systems',
      'Network Analysis',
      'Electromagnetics',
      'Applied Mathematics',
    ],
    [
      'Analog Circuits',
      'Digital Communication',
      'Control Systems',
      'Microprocessors',
      'Transmission Lines',
      'Measurements',
    ],
    [
      'VLSI Design',
      'Embedded Systems',
      'Antennas & Wave Propagation',
      'Digital Signal Processing',
      'Optical Communication',
      'RF Design',
    ],
    [
      'Advanced VLSI',
      'Wireless Networks',
      'Radar Systems',
      'Photonics',
      'MEMS',
      'Satellite Systems',
    ],
  ],
  ME: [
    [
      'Engineering Mechanics',
      'Thermodynamics',
      'Material Science',
      'Engineering Drawing',
      'Applied Mathematics',
      'Manufacturing Basics',
    ],
    [
      'Fluid Mechanics',
      'Kinematics of Machinery',
      'Manufacturing Processes',
      'Heat Transfer',
      'Strength of Materials',
      'Metrology',
    ],
    [
      'Machine Design',
      'Automobile Engineering',
      'Robotics',
      'Industrial Engineering',
      'Refrigeration',
      'Finite Element Methods',
    ],
    [
      'Advanced Manufacturing',
      'Computational Fluid Dynamics',
      'Tribology',
      'Mechatronics',
      'Turbomachinery',
      'Composites',
    ],
  ],
  CE: [
    [
      'Surveying',
      'Building Materials',
      'Engineering Geology',
      'Strength of Materials',
      'Applied Mathematics',
      'Engineering Drawing',
    ],
    [
      'Structural Analysis',
      'Geotechnical Engineering',
      'Hydraulics',
      'Concrete Technology',
      'Fluid Mechanics',
      'Surveying II',
    ],
    [
      'Steel Structures',
      'Transportation Engineering',
      'Environmental Engineering',
      'Estimation & Costing',
      'Foundation Design',
      'Water Resources',
    ],
    [
      'Earthquake Engineering',
      'Bridge Design',
      'Urban Planning',
      'Pavement Design',
      'Coastal Engineering',
      'Construction Management',
    ],
  ],
  SH: [
    [
      'Engineering Mathematics I',
      'Engineering Physics',
      'Engineering Chemistry',
      'Professional English',
      'Environmental Studies',
      'Basic Electrical',
    ],
    [
      'Engineering Mathematics III',
      'Numerical Methods',
      'Probability & Statistics',
      'Economics for Engineers',
      'Technical Communication',
      'Discrete Structures',
    ],
    [
      'Operations Research',
      'Technical Writing',
      'Ethics & Governance',
      'Entrepreneurship',
      'Organisational Behaviour',
      'Project Management',
    ],
    [
      'Advanced Statistics',
      'Public Policy',
      'Behavioural Economics',
      'Research Methods',
      'Science & Society',
      'Data Ethics',
    ],
  ],
}

const GENERIC = [
  'Foundations',
  'Principles',
  'Methods',
  'Systems',
  'Applications',
  'Advanced Topics',
]

const LAB_NAMES: Record<string, string[]> = {
  CSE: ['Programming Lab', 'Systems Lab', 'AI/ML Lab', 'Security Lab'],
  ECE: ['Circuits Lab', 'Communication Lab', 'VLSI Lab', 'RF Lab'],
  ME: ['Workshop Practice', 'Thermal Lab', 'CAD/CAM Lab', 'Metrology Lab'],
  CE: ['Surveying Lab', 'Materials Testing Lab', 'Environmental Lab', 'Geotech Lab'],
  SH: ['Physics Lab', 'Chemistry Lab', 'Language Lab', 'Statistics Lab'],
}

const ELECTIVES: Record<string, string[]> = {
  CSE: ['Cloud Computing', 'Cyber Security', 'Data Visualisation', 'Edge Computing'],
  ECE: ['IoT Systems', 'Satellite Communication', 'Nano Electronics', 'Bio-signals'],
  ME: ['Renewable Energy', 'Mechatronics', 'Additive Manufacturing', 'Automotive Design'],
  CE: ['Smart Cities', 'Remote Sensing & GIS', 'Green Buildings', 'Disaster Management'],
  SH: ['Design Thinking', 'Cognitive Science', 'Public Policy', 'Science Communication'],
}

export const subjectName = (dept: string, year: number, i: number): string => {
  const bank = SUBJECTS[dept]
  if (bank) {
    const row = bank[Math.min(year - 1, bank.length - 1)]
    if (row && row[i]) return row[i]
  }
  return `${dept} ${GENERIC[i % GENERIC.length]} ${year}`
}

/**
 * Pick from a name bank, wrapping.
 *
 * The length test is not ceremony: `x % 0` is `NaN`, so an empty bank used to
 * index with `NaN` and hand back `undefined` — which then became the literal
 * course name "undefined" on screen and in the CSV export.
 */
const fromBank = (bank: string[] | undefined, offset: number): string | null =>
  bank && bank.length > 0 ? (bank[offset % bank.length] ?? null) : null

export const labName = (dept: string, year: number, i: number): string =>
  fromBank(LAB_NAMES[dept], year - 1 + i) ?? `${dept} Laboratory ${year}.${i + 1}`

export const electiveName = (dept: string, year: number, i: number): string =>
  fromBank(ELECTIVES[dept], year - 1 + i) ?? `${dept} Elective ${year}.${i + 1}`

export const FIRST = [
  'Ananya',
  'Rohan',
  'Priya',
  'Arjun',
  'Kavya',
  'Vikram',
  'Meera',
  'Aditya',
  'Sneha',
  'Rahul',
  'Divya',
  'Karthik',
  'Pooja',
  'Nikhil',
  'Shreya',
  'Sanjay',
  'Lakshmi',
  'Varun',
  'Ishita',
  'Manoj',
  'Farhan',
  'Ritika',
  'Devika',
  'Imran',
  'Tanvi',
  'Gaurav',
  'Neha',
  'Abhinav',
  'Swati',
  'Rajesh',
]
export const LAST = [
  'Sharma',
  'Iyer',
  'Reddy',
  'Patel',
  'Nair',
  'Gupta',
  'Rao',
  'Menon',
  'Kulkarni',
  'Das',
  'Joshi',
  'Bose',
  'Mishra',
  'Pillai',
  'Chandra',
  'Verma',
  'Hegde',
  'Saxena',
  'Banerjee',
  'Naidu',
  'Qureshi',
  'Deshpande',
  'Chatterjee',
  'Bhat',
  'Sethi',
  'Trivedi',
  'Kapoor',
  'Ganguly',
  'Shetty',
  'Prasad',
]
