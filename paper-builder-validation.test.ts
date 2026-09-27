import { describe, it, expect } from 'vitest'
import { createSectionedPaperSchema, paperSectionInputSchema } from '@/lib/validation/paperBuilder'

const uuid1 = '11111111-1111-1111-1111-111111111111'
const uuid2 = '22222222-2222-2222-2222-222222222222'
const uuid3 = '33333333-3333-3333-3333-333333333333'

function baseSection(overrides: Record<string, unknown> = {}) {
  return {
    key: 's1',
    label: 'A',
    title: 'Multiple Choice Questions',
    selectionMode: 'AUTOMATIC',
    types: [{ key: 't1', questionType: 'MCQ', count: 10, marksPerQuestion: 1 }],
    ...overrides,
  }
}

describe('paperSectionInputSchema', () => {
  it('accepts a minimal valid AUTOMATIC section', () => {
    const result = paperSectionInputSchema.safeParse(baseSection())
    expect(result.success).toBe(true)
  })

  it('rejects an AUTOMATIC section with no question types (never silently allows an empty section)', () => {
    const result = paperSectionInputSchema.safeParse(baseSection({ selectionMode: 'AUTOMATIC', types: [] }))
    expect(result.success).toBe(false)
  })

  it('rejects a MANUAL section with no selected questions', () => {
    const result = paperSectionInputSchema.safeParse(baseSection({ selectionMode: 'MANUAL', types: [], manualQuestionIds: [] }))
    expect(result.success).toBe(false)
  })

  it('accepts a MANUAL section that supplies explicit question ids', () => {
    const result = paperSectionInputSchema.safeParse(
      baseSection({ selectionMode: 'MANUAL', types: [], manualQuestionIds: [uuid1, uuid2] })
    )
    expect(result.success).toBe(true)
  })

  it('rejects chapterScope=SELECTED with an empty chapterIds list (never silently falls back to All)', () => {
    const result = paperSectionInputSchema.safeParse(baseSection({ chapterScope: 'SELECTED', chapterIds: [] }))
    expect(result.success).toBe(false)
  })

  it('accepts chapterScope=SELECTED with at least one chapter id', () => {
    const result = paperSectionInputSchema.safeParse(baseSection({ chapterScope: 'SELECTED', chapterIds: [uuid1] }))
    expect(result.success).toBe(true)
  })

  it('rejects a section with no title (never forces a fixed default like "Section A")', () => {
    const result = paperSectionInputSchema.safeParse(baseSection({ title: '' }))
    expect(result.success).toBe(false)
  })

  it('rejects marksPerQuestion of 0 (a missing-marks configuration must be caught, not silently zeroed)', () => {
    const result = paperSectionInputSchema.safeParse(
      baseSection({ types: [{ key: 't1', questionType: 'MCQ', count: 5, marksPerQuestion: 0 }] })
    )
    expect(result.success).toBe(false)
  })
})

describe('createSectionedPaperSchema', () => {
  const basePaper = {
    title: 'Half-Yearly Examination',
    subjectId: uuid1,
    examClassId: uuid2,
    codeId: uuid3,
    sections: [baseSection()],
  }

  it('accepts a full, valid multi-section payload', () => {
    const result = createSectionedPaperSchema.safeParse({
      ...basePaper,
      subtitle: 'Physics',
      instructions: ['Answer all questions.', 'Each question carries equal marks unless stated.'],
      sections: [
        baseSection({ key: 's1', label: 'A', title: 'MCQ Section' }),
        baseSection({
          key: 's2',
          label: 'B',
          title: 'Subjective Section',
          types: [{ key: 't2', questionType: 'SUBJECTIVE', count: 5, marksPerQuestion: 5 }],
          answerSpace: 'LARGE',
        }),
      ],
    })
    expect(result.success).toBe(true)
  })

  it('rejects a paper with zero sections (never generates an empty paper)', () => {
    const result = createSectionedPaperSchema.safeParse({ ...basePaper, sections: [] })
    expect(result.success).toBe(false)
  })

  it('requires subjectId/examClassId/codeId to be real UUIDs', () => {
    const result = createSectionedPaperSchema.safeParse({ ...basePaper, subjectId: 'not-a-uuid' })
    expect(result.success).toBe(false)
  })

  it('defaults numberingMode to CONTINUE and answerSpace to MEDIUM when omitted', () => {
    const result = createSectionedPaperSchema.parse(basePaper)
    expect(result.sections[0].numberingMode).toBe('CONTINUE')
    expect(result.sections[0].answerSpace).toBe('MEDIUM')
  })

  it('accepts a CUSTOM answer space with an explicit height', () => {
    const result = createSectionedPaperSchema.safeParse({
      ...basePaper,
      sections: [baseSection({ answerSpace: 'CUSTOM', customAnswerSpaceMm: 55 })],
    })
    expect(result.success).toBe(true)
  })
})
