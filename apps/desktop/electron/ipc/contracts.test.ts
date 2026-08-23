import { describe, expect, it } from 'vitest'
import { ChatRequest, OpenRequest, SaveRequest, parsePayload } from './contracts'

/**
 * These are the checks that stand between an untrusted renderer and the two
 * privileged things the main process can do: touch the filesystem and reach
 * the network. Each case below is a payload the previous, unvalidated handlers
 * would have accepted and acted on.
 */

const validSave = {
  suggestedName: 'timetable.csv',
  data: 'a,b,c\n1,2,3\n',
  filters: [{ name: 'CSV', extensions: ['csv'] }],
}

describe('SaveRequest', () => {
  it('accepts what the application actually sends', () => {
    const result = parsePayload(SaveRequest, validSave, 'save request')
    expect(result.ok).toBe(true)
  })

  it.each([
    ['a path separator', '../../../.bashrc'],
    ['a Windows path separator', '..\\..\\system32\\drivers\\etc\\hosts'],
    ['a null byte', 'report.csv\u0000.exe'],
    ['a bare parent reference', '..'],
    ['a reserved Windows device name', 'CON.csv'],
    ['an empty name', ''],
  ])('refuses a suggested filename containing %s', (_label, suggestedName) => {
    const result = parsePayload(SaveRequest, { ...validSave, suggestedName }, 'save request')
    expect(result.ok).toBe(false)
  })

  it('refuses a payload that is not an object at all', () => {
    for (const payload of [null, undefined, 'string', 42, []]) {
      expect(parsePayload(SaveRequest, payload, 'save request').ok).toBe(false)
    }
  })

  it('refuses an extension that is a glob or a path', () => {
    for (const extension of ['*', '.csv', 'csv/../exe', '']) {
      const filters = [{ name: 'X', extensions: [extension] }]
      expect(parsePayload(SaveRequest, { ...validSave, filters }, 'save request').ok).toBe(false)
    }
  })

  it('refuses a file larger than the ceiling', () => {
    const data = 'x'.repeat(64 * 1024 * 1024 + 1)
    expect(parsePayload(SaveRequest, { ...validSave, data }, 'save request').ok).toBe(false)
  })

  it('names the offending field when it refuses', () => {
    const result = parsePayload(
      SaveRequest,
      { ...validSave, suggestedName: '../x' },
      'save request',
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('suggestedName')
  })
})

describe('OpenRequest', () => {
  it('accepts a filter list', () => {
    expect(
      parsePayload(OpenRequest, [{ name: 'Aula project', extensions: ['json'] }], 'x').ok,
    ).toBe(true)
  })

  it('refuses an empty list, which would open a picker for anything', () => {
    expect(parsePayload(OpenRequest, [], 'x').ok).toBe(false)
  })
})

describe('ChatRequest', () => {
  const valid = {
    requestId: 1,
    model: 'gemma4:e4b',
    messages: [{ role: 'user', content: 'why is CSE 1A busy on Monday?' }],
  }

  it('accepts a normal turn', () => {
    expect(parsePayload(ChatRequest, valid, 'assistant request').ok).toBe(true)
  })

  it.each([
    ['a shell metacharacter', 'gemma4;rm -rf /'],
    ['whitespace', 'gemma 4'],
    ['a quote', 'gemma4"'],
    ['a newline', 'gemma4\ne4b'],
    ['nothing', ''],
  ])('refuses a model name containing %s', (_label, model) => {
    expect(parsePayload(ChatRequest, { ...valid, model }, 'assistant request').ok).toBe(false)
  })

  it('accepts a namespaced model tag', () => {
    const model = 'library/gemma4:e4b-instruct'
    expect(parsePayload(ChatRequest, { ...valid, model }, 'assistant request').ok).toBe(true)
  })

  it('refuses an unknown role', () => {
    const messages = [{ role: 'root', content: 'hi' }]
    expect(parsePayload(ChatRequest, { ...valid, messages }, 'assistant request').ok).toBe(false)
  })

  it('refuses more messages than a conversation can hold', () => {
    const messages = Array.from({ length: 33 }, () => ({ role: 'user', content: 'x' }))
    expect(parsePayload(ChatRequest, { ...valid, messages }, 'assistant request').ok).toBe(false)
  })

  it('refuses an empty conversation', () => {
    expect(parsePayload(ChatRequest, { ...valid, messages: [] }, 'assistant request').ok).toBe(
      false,
    )
  })

  it('refuses a negative or fractional request id', () => {
    for (const requestId of [-1, 1.5, Number.NaN]) {
      expect(parsePayload(ChatRequest, { ...valid, requestId }, 'assistant request').ok).toBe(false)
    }
  })
})
