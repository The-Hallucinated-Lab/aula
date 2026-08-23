import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../src/data/config'
import { importCourses, importRooms, importStaff, parseCsv } from '../src/data/importers'

/**
 * CSV import.
 *
 * This is the only place Aula reads a file it did not write, so it is the only
 * place hostile or merely broken input arrives. Two rules govern it, and every
 * case here is one of them:
 *
 *   1. no row is ever silently dropped;
 *   2. nothing trusts the file.
 */

const config = DEFAULT_CONFIG
const deptCode = config.departments[0]?.code ?? 'CSE'

describe('parseCsv', () => {
  it('reads a plain table', () => {
    expect(parseCsv('a,b\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('keeps a comma inside a quoted field', () => {
    // The case that makes a naive split wrong on real data.
    expect(parseCsv('code,name\nCS1,"Design, Analysis of Algorithms"')).toEqual([
      ['code', 'name'],
      ['CS1', 'Design, Analysis of Algorithms'],
    ])
  })

  it('reads a doubled quote as a literal one', () => {
    expect(parseCsv('name\n"The ""Old"" Hall"')).toEqual([['name'], ['The "Old" Hall']])
  })

  it('handles CRLF, which is what Excel writes', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('strips the byte-order mark Excel leaves on the first column name', () => {
    const [header] = parseCsv('﻿name,dept\nAda,CSE')
    expect(header?.[0]).toBe('name')
  })

  it('drops rows that are entirely empty, and keeps ones that are only partly', () => {
    expect(parseCsv('a,b\n,\n1,\n')).toEqual([
      ['a', 'b'],
      ['1', ''],
    ])
  })

  it('handles a newline inside a quoted field', () => {
    expect(parseCsv('name\n"two\nlines"')).toEqual([['name'], ['two\nlines']])
  })

  it('survives an unterminated quote instead of hanging or throwing', () => {
    expect(() => parseCsv('name\n"never closed')).not.toThrow()
  })
})

describe('importStaff', () => {
  const header = 'Name,Dept,Rank,Max per week\n'

  it('reads a well-formed roster', () => {
    const result = importStaff(`${header}Ada Lovelace,${deptCode},Professor,14\n`, config)
    expect(result.problems).toEqual([])
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toMatchObject({
      name: 'Ada Lovelace',
      rank: 'Professor',
      maxPerWeek: 14,
    })
  })

  it('accepts any spelling of a column name', () => {
    const result = importStaff(
      `full_name,DEPARTMENT,designation\nAda,${deptCode},Professor\n`,
      config,
    )
    expect(result.rows).toHaveLength(1)
  })

  it('reports a missing required column rather than importing a blank roster', () => {
    const result = importStaff('Rank\nProfessor\n', config)
    expect(result.rows).toEqual([])
    expect(result.missingColumns).toContain('name')
  })

  it('refuses a row with no name, and says which line', () => {
    const result = importStaff(
      `${header},${deptCode},Professor,14\nAda,${deptCode},Professor,14\n`,
      config,
    )
    expect(result.rows).toHaveLength(1)
    expect(result.problems).toHaveLength(1)
    expect(result.problems[0]?.line).toBe(2)
  })

  it('refuses a department that is not in this project, naming the ones that are', () => {
    const result = importStaff(`${header}Ada,NOPE,Professor,14\n`, config)
    expect(result.rows).toEqual([])
    expect(result.problems[0]?.message).toContain('NOPE')
    expect(result.problems[0]?.message).toContain(deptCode)
  })

  it('refuses a duplicate staff code rather than overwriting the first', () => {
    const text = `Name,Dept,Staff code\nAda,${deptCode},E1\nGrace,${deptCode},E1\n`
    const result = importStaff(text, config)
    expect(result.rows).toHaveLength(1)
    expect(result.problems[0]?.message).toMatch(/already appears/)
  })

  it('reports a number that is not a number instead of absorbing it', () => {
    const result = importStaff(`${header}Ada,${deptCode},Professor,sixty\n`, config)
    expect(result.rows).toHaveLength(1)
    // `asInt` used to return the default for both "blank" and "sixty", so a
    // typo'd cap imported silently and the roster looked correct.
    expect(result.rows[0]?.maxPerWeek).toBe(18)
    expect(result.problems.some(p => /weekly cap "sixty"/.test(p.message))).toBe(true)
  })

  it('reports an unusable daily cap the same way', () => {
    const result = importStaff(
      `Name,Dept,Max per day
Ada,${deptCode},half
`,
      config,
    )
    expect(result.rows[0]?.maxPerDay).toBe(5)
    expect(result.problems.some(p => /daily cap "half"/.test(p.message))).toBe(true)
  })

  it('says nothing when a cap is simply blank, because that is not a mistake', () => {
    const result = importStaff(
      `${header}Ada,${deptCode},Professor,
`,
      config,
    )
    expect(result.rows[0]?.maxPerWeek).toBe(18)
    expect(result.problems).toEqual([])
  })

  it('reduces a daily cap that exceeds the weekly one, and says so', () => {
    const text = `Name,Dept,Max per day,Max per week\nAda,${deptCode},9,4\n`
    const result = importStaff(text, config)
    expect(result.rows[0]?.maxPerDay).toBe(4)
    expect(result.problems[0]?.message).toMatch(/daily cap/)
  })

  it('omits an absent optional field rather than storing undefined', () => {
    const result = importStaff(`${header}Ada,${deptCode},Professor,14\n`, config)
    expect(result.rows[0] && 'preferredRoomKind' in result.rows[0]).toBe(false)
  })

  it('names columns it does not read, so a mis-mapped file is visible', () => {
    const result = importStaff(`Name,Dept,Shoe size\nAda,${deptCode},9\n`, config)
    expect(result.ignoredColumns).toContain('Shoe size')
  })

  it('reports an empty file as empty', () => {
    const result = importStaff('', config)
    expect(result.rows).toEqual([])
    expect(result.problems[0]?.message).toMatch(/empty/i)
  })

  it('does not throw on any of these', () => {
    for (const text of ['\n\n\n', ',,,', '"', '﻿', 'Name\n'.repeat(200)]) {
      expect(() => importStaff(text, config)).not.toThrow()
    }
  })
})

describe('importRooms', () => {
  it('reads a room list', () => {
    const building = config.buildings[0]?.name ?? ''
    const result = importRooms(
      `Name,Building,Kind,Capacity\nLH-1,${building},Lecture Hall,120\n`,
      config,
    )
    expect(result.rows.length + result.problems.length).toBeGreaterThan(0)
  })

  it('reports a missing required column', () => {
    const result = importRooms('Capacity\n60\n', config)
    expect(result.missingColumns.length).toBeGreaterThan(0)
  })

  it('does not throw on junk', () => {
    for (const text of ['', 'x', '﻿,,\n,,']) {
      expect(() => importRooms(text, config)).not.toThrow()
    }
  })
})

describe('importCourses', () => {
  it('reports a missing required column', () => {
    const result = importCourses('Credits\n4\n', config)
    expect(result.missingColumns.length).toBeGreaterThan(0)
  })

  it('does not throw on junk', () => {
    for (const text of ['', 'x', '"unterminated']) {
      expect(() => importCourses(text, config)).not.toThrow()
    }
  })
})
