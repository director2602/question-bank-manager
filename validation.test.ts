import { describe, it, expect } from 'vitest'
import {
  createQuestionSchema,
  updateQuestionTagsSchema,
  questionListQuerySchema,
  validateAnswerForQuestionType,
  INTEGER_ANSWER_PATTERN,
} from '@/lib/validation/question'
import { generatePaperSchema } from '@/lib/validation/paper'
import { createChapterSchema, createTopicSchema, reorderChaptersSchema } from '@/lib/validation/chapterTopic'
import { confirmHandwrittenRowSchema } from '@/lib/validation/handwrittenImport'

const uuid1 = '11111111-1111-1111-1111-111111111111'
const uuid2 = '22222222-2222-2222-2222-222222222222'
const uuid3 = '33333333-3333-3333-3333-333333333333'
const uuid4 = '44444444-4444-4444-4444-444444444444'

describe('createQuestionSchema', () => {
  it('accepts a minimal valid question', () => {
    const result = createQuestionSchema.safeParse({
      questionText: 'What is 2 + 2?',
      questionNumber: '1',
      subjectId: uuid1,
      examClassId: uuid2,
      codeId: uuid3,
      difficultyId: uuid4,
    })
    expect(result.success).toBe(true)
  })

  it('rejects a question with empty text (business rule: question text is required)', () => {
    const result = createQuestionSchema.safeParse({
      questionText: '   ',
      questionNumber: '1',
      subjectId: uuid1,
      examClassId: uuid2,
      codeId: uuid3,
      difficultyId: uuid4,
    })
    expect(result.success).toBe(false)
  })

  it('rejects a question missing a required tag', () => {
    const result = createQuestionSchema.safeParse({
      questionText: 'What is 2 + 2?',
      questionNumber: '1',
      subjectId: uuid1,
      examClassId: uuid2,
      codeId: uuid3,
      // difficultyId missing
    })
    expect(result.success).toBe(false)
  })

  it('supports alphanumeric question numbers like "Q-25"', () => {
    const result = createQuestionSchema.safeParse({
      questionText: 'Sample',
      questionNumber: 'Q-25',
      subjectId: uuid1,
      examClassId: uuid2,
      codeId: uuid3,
      difficultyId: uuid4,
    })
    expect(result.success).toBe(true)
  })
})

describe('updateQuestionTagsSchema', () => {
  it('requires rowVersion for optimistic locking', () => {
    const withoutRowVersion = updateQuestionTagsSchema.safeParse({
      questionNumber: '1',
      subjectId: uuid1,
      examClassId: uuid2,
      codeId: uuid3,
      difficultyId: uuid4,
    })
    expect(withoutRowVersion.success).toBe(false)

    const withRowVersion = updateQuestionTagsSchema.safeParse({
      questionNumber: '1',
      subjectId: uuid1,
      examClassId: uuid2,
      codeId: uuid3,
      difficultyId: uuid4,
      rowVersion: 1,
    })
    expect(withRowVersion.success).toBe(true)
  })

  it('never accepts question content fields (tags/content stay separated)', () => {
    const parsed = updateQuestionTagsSchema.safeParse({
      questionNumber: '1',
      subjectId: uuid1,
      examClassId: uuid2,
      codeId: uuid3,
      difficultyId: uuid4,
      rowVersion: 1,
      questionText: 'this should be ignored/stripped, not applied',
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect((parsed.data as any).questionText).toBeUndefined()
    }
  })
})

describe('questionListQuerySchema', () => {
  it('defaults to ACTIVE status, page 1, pageSize 25', () => {
    const parsed = questionListQuerySchema.parse({})
    expect(parsed.status).toBe('ACTIVE')
    expect(parsed.page).toBe(1)
    expect(parsed.pageSize).toBe(25)
  })

  it('caps pageSize at 100 to prevent loading the whole bank at once', () => {
    const parsed = questionListQuerySchema.safeParse({ pageSize: '5000' })
    expect(parsed.success).toBe(false)
  })
})

describe('INTEGER_ANSWER_PATTERN / validateAnswerForQuestionType', () => {
  it('accepts whole numbers, including negatives and zero', () => {
    for (const v of ['0', '5', '12', '-4', '-0']) {
      expect(INTEGER_ANSWER_PATTERN.test(v)).toBe(true)
    }
  })

  it('rejects decimals for INTEGER questions (this was a real bug: the old regex allowed them)', () => {
    expect(INTEGER_ANSWER_PATTERN.test('2.5')).toBe(false)
    expect(validateAnswerForQuestionType('INTEGER', '2.5')).not.toBeNull()
    expect(validateAnswerForQuestionType('INTEGER', '-4.1')).not.toBeNull()
  })

  it('accepts a valid integer answer with no error', () => {
    expect(validateAnswerForQuestionType('INTEGER', '-4')).toBeNull()
    expect(validateAnswerForQuestionType('INTEGER', '0')).toBeNull()
  })

  it('never validates the integer pattern for MCQ/SUBJECTIVE answers', () => {
    expect(validateAnswerForQuestionType('MCQ', 'A')).toBeNull()
    expect(validateAnswerForQuestionType('SUBJECTIVE', 'Explain photosynthesis in your own words.')).toBeNull()
  })

  it('treats an empty/missing answer as valid (answer is optional at creation time)', () => {
    expect(validateAnswerForQuestionType('INTEGER', '')).toBeNull()
    expect(validateAnswerForQuestionType('INTEGER', null)).toBeNull()
    expect(validateAnswerForQuestionType('INTEGER', undefined)).toBeNull()
  })
})

describe('createQuestionSchema — INTEGER answer validation wired in via superRefine', () => {
  it('rejects a decimal answer on an INTEGER question', () => {
    const result = createQuestionSchema.safeParse({
      questionText: 'What is 10 / 4, rounded down?',
      questionNumber: '1',
      subjectId: uuid1,
      examClassId: uuid2,
      codeId: uuid3,
      difficultyId: uuid4,
      questionType: 'INTEGER',
      correctAnswer: '2.5',
    })
    expect(result.success).toBe(false)
  })

  it('accepts a whole-number answer on an INTEGER question', () => {
    const result = createQuestionSchema.safeParse({
      questionText: 'What is 10 / 4, rounded down?',
      questionNumber: '1',
      subjectId: uuid1,
      examClassId: uuid2,
      codeId: uuid3,
      difficultyId: uuid4,
      questionType: 'INTEGER',
      correctAnswer: '2',
    })
    expect(result.success).toBe(true)
  })
})

describe('chapter/topic validation schemas', () => {
  it('rejects a chapter code with spaces or punctuation', () => {
    const result = createChapterSchema.safeParse({ subjectId: uuid1, code: 'not a code!', label: 'Mechanics' })
    expect(result.success).toBe(false)
  })

  it('accepts a clean chapter code', () => {
    const result = createChapterSchema.safeParse({ subjectId: uuid1, code: 'MECHANICS', label: 'Mechanics' })
    expect(result.success).toBe(true)
  })

  it('requires a chapterId for a topic', () => {
    const result = createTopicSchema.safeParse({ code: 'KINEMATICS', label: 'Kinematics' })
    expect(result.success).toBe(false)
  })

  it('reorder requires at least one ordered id', () => {
    const result = reorderChaptersSchema.safeParse({ subjectId: uuid1, orderedIds: [] })
    expect(result.success).toBe(false)
  })
})

describe('confirmHandwrittenRowSchema', () => {
  it('accepts a minimal valid row with no diagrams', () => {
    const result = confirmHandwrittenRowSchema.safeParse({
      tempId: 'hw-q-0-123',
      questionNumber: '1',
      subjectId: uuid1,
      examClassId: uuid2,
      codeId: uuid3,
      difficultyId: uuid4,
      questionType: 'MCQ',
      questionText: 'What is the SI unit of force?',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.diagramSelections).toEqual([])
    }
  })

  it('rejects an unknown diagram choice value', () => {
    const result = confirmHandwrittenRowSchema.safeParse({
      tempId: 'hw-q-0-123',
      questionNumber: '1',
      subjectId: uuid1,
      examClassId: uuid2,
      codeId: uuid3,
      difficultyId: uuid4,
      questionType: 'MCQ',
      questionText: 'What is the SI unit of force?',
      diagramSelections: [{ key: 'd1', choice: 'photograph' }],
    })
    expect(result.success).toBe(false)
  })
})

describe('generatePaperSchema', () => {
  it('requires at least one filter line', () => {
    const parsed = generatePaperSchema.safeParse({ title: 'Test Paper', mode: 'RANDOM', lines: [] })
    expect(parsed.success).toBe(false)
  })

  it('accepts a valid random-mode request', () => {
    const parsed = generatePaperSchema.safeParse({
      title: 'Physics Unit Test',
      mode: 'RANDOM',
      lines: [{ subjectId: uuid1, examClassId: uuid2, codeId: uuid3, difficultyId: uuid4, count: 10 }],
    })
    expect(parsed.success).toBe(true)
  })
})
