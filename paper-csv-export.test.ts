import { describe, it, expect } from 'vitest'
import { buildPaperCsvRows, paperRowsToCsv } from '@/lib/csv/paperCsvExport'
import type { SnapshotQuestion } from '@/lib/paper-snapshot'

function makeQuestion(overrides: Partial<SnapshotQuestion> = {}): SnapshotQuestion {
  return {
    questionId: 'q1',
    questionVersionId: 'v1',
    position: 1,
    questionNumber: '1',
    questionText: 'What is 2 + 2?',
    optionA: '2',
    optionB: '4',
    optionC: '6',
    optionD: '8',
    correctAnswer: 'B',
    explanation: null,
    subject: 'Mathematics',
    examClass: '10 CBSE',
    code: 'A',
    difficulty: 'Easy',
    marks: 2,
    images: [],
    questionType: 'MCQ',
    sectionId: null,
    sectionPosition: null,
    sectionLabel: null,
    sectionTitle: null,
    sectionInstructions: null,
    sectionNumberingMode: null,
    sectionAnswerSpace: null,
    sectionCustomAnswerSpaceMm: null,
    ...overrides,
  }
}

describe('buildPaperCsvRows', () => {
  it('maps every field from real snapshot data — never fabricates a column', () => {
    const rows = buildPaperCsvRows('Term 1 Paper', 'Grade 10', [makeQuestion()])
    expect(rows).toEqual([
      {
        paperTitle: 'Term 1 Paper',
        folderName: 'Grade 10',
        questionNumber: '1',
        section: 'Mathematics',
        question: 'What is 2 + 2?',
        questionType: 'MCQ',
        optionA: '2',
        optionB: '4',
        optionC: '6',
        optionD: '8',
        correctAnswer: 'B',
        marks: 2,
        difficulty: 'Easy',
        imageReference: null,
      },
    ])
  })

  it('reports the real questionType (Subjective) for a non-MCQ question, never inferring it from option presence', () => {
    const rows = buildPaperCsvRows('Paper', null, [
      makeQuestion({
        questionType: 'SUBJECTIVE',
        optionA: null,
        optionB: null,
        optionC: null,
        optionD: null,
        correctAnswer: 'A long written answer.',
      }),
    ])
    expect(rows[0]?.questionType).toBe('Subjective')
  })

  it('uses the real section title/label when the question belongs to an Advanced Paper Builder section', () => {
    const rows = buildPaperCsvRows('Paper', null, [
      makeQuestion({ sectionLabel: 'A', sectionTitle: 'Multiple Choice Questions' }),
    ])
    expect(rows[0]?.section).toBe('A: Multiple Choice Questions')
  })

  it('passes null folderName through for an uncategorized paper', () => {
    const rows = buildPaperCsvRows('Paper', null, [makeQuestion()])
    expect(rows[0]?.folderName).toBeNull()
  })

  it('joins multiple image alt texts for the Image Reference column', () => {
    const rows = buildPaperCsvRows('Paper', null, [
      makeQuestion({ images: [{ url: 'a', altText: 'Diagram 1' }, { url: 'b', altText: null }] }),
    ])
    expect(rows[0]?.imageReference).toBe('Diagram 1; image')
  })
})

describe('paperRowsToCsv', () => {
  it('escapes commas, quotes, and newlines inside question text', () => {
    const rows = buildPaperCsvRows('Paper', null, [
      makeQuestion({ questionText: 'Choose the correct option: "A, B, or C"\nSecond line.' }),
    ])
    const csv = paperRowsToCsv(rows)
    // Papaparse quotes fields containing the delimiter/quote/newline and
    // doubles internal quotes — this is what makes a comma inside a
    // question NOT shift every later column.
    expect(csv).toContain('"Choose the correct option: ""A, B, or C""\nSecond line."')
  })

  it('preserves Unicode / math notation verbatim', () => {
    const rows = buildPaperCsvRows('Paper', null, [makeQuestion({ questionText: 'Evaluate $\\int_0^1 x^2\\,dx$ — αβγ' })])
    const csv = paperRowsToCsv(rows)
    expect(csv).toContain('αβγ')
    expect(csv).toContain('\\int_0^1')
  })

  it('renders null fields as empty cells, not the string "null"', () => {
    const rows = buildPaperCsvRows('Paper', null, [makeQuestion({ marks: null, explanation: null })])
    const csv = paperRowsToCsv(rows)
    expect(csv).not.toContain('null')
  })

  it('writes the expected header row with all real, existing fields', () => {
    const csv = paperRowsToCsv(buildPaperCsvRows('Paper', null, [makeQuestion()]))
    const withoutBom = csv.charCodeAt(0) === 0xfeff ? csv.slice(1) : csv
    // Papaparse defaults to CRLF line endings (correct/expected for a CSV
    // meant for Excel) — split on \r?\n so that trailing \r doesn't make
    // an otherwise-correct header line fail a strict string comparison.
    const headerLine = withoutBom.split(/\r?\n/)[0]
    expect(headerLine).toBe(
      'Paper,Folder,Question Number,Section,Question,Question Type,Option A,Option B,Option C,Option D,Correct Answer,Marks,Difficulty,Image Reference'
    )
  })

  it('includes a UTF-8 BOM so Excel detects encoding correctly', () => {
    const csv = paperRowsToCsv(buildPaperCsvRows('Paper', null, [makeQuestion()]))
    expect(csv.charCodeAt(0)).toBe(0xfeff)
  })
})
