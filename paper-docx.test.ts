import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { buildPaperDocxBuffer } from '@/lib/docx/paperDocx'
import { DEFAULT_PAPER_LAYOUT_SETTINGS, type PaperSettings } from '@/lib/pdf/paperHtml'
import type { SnapshotQuestion } from '@/lib/paper-snapshot'

const content: PaperSettings = {
  title: 'Demo Paper',
  paperNumber: 7,
  instituteName: 'Demo Institute',
  logoUrl: null,
  examName: 'Unit Test Exam',
  subjectLabel: 'Physics',
  classLabel: '11 JEE',
  examDate: '2026-01-01',
  examTime: '10:00 AM',
  maxMarks: 100,
  instructions: 'Answer all questions.',
  headerText: null,
  footerText: null,
}

function makeQuestion(overrides: Partial<SnapshotQuestion> = {}): SnapshotQuestion {
  return {
    questionId: 'q1',
    questionVersionId: 'v1',
    position: 1,
    questionNumber: '1',
    questionText: 'What is the SI unit of force?',
    optionA: 'Newton',
    optionB: 'Joule',
    optionC: 'Watt',
    optionD: 'Pascal',
    correctAnswer: 'A',
    explanation: 'Force = mass × acceleration.',
    subject: 'Physics',
    examClass: '11 JEE',
    code: 'A',
    difficulty: 'Easy',
    marks: 4,
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

// docx's Packer.toBuffer() output is a real ZIP (OOXML) package — unzipping
// it and checking for [Content_Types].xml / word/document.xml is a much
// stronger check than "the promise resolved": a lot of docx-library misuse
// (wrong option shapes, missing required fields) still produces a Buffer,
// just one that Word can't open.
describe('buildPaperDocxBuffer', () => {
  it('produces a well-formed .docx (OOXML zip) package for a question paper', async () => {
    const buffer = await buildPaperDocxBuffer(content, [makeQuestion()], 'question', DEFAULT_PAPER_LAYOUT_SETTINGS)
    const zip = await JSZip.loadAsync(buffer)
    expect(zip.file('[Content_Types].xml')).not.toBeNull()
    expect(zip.file('word/document.xml')).not.toBeNull()
    const documentXml = await zip.file('word/document.xml')!.async('string')
    expect(documentXml).toContain('Demo Paper')
    expect(documentXml).toContain('Newton')
  })

  it('produces a valid package for the answer key and solutions modes too', async () => {
    for (const mode of ['answerKey', 'solutions'] as const) {
      const buffer = await buildPaperDocxBuffer(content, [makeQuestion()], mode, DEFAULT_PAPER_LAYOUT_SETTINGS)
      const zip = await JSZip.loadAsync(buffer)
      expect(zip.file('word/document.xml')).not.toBeNull()
    }
  })

  it('embeds the configured page-number field codes in the footer when showPageNumbers is true', async () => {
    const buffer = await buildPaperDocxBuffer(content, [makeQuestion()], 'question', {
      ...DEFAULT_PAPER_LAYOUT_SETTINGS,
      showPageNumbers: true,
    })
    const zip = await JSZip.loadAsync(buffer)
    const footerFile = zip.file('word/footer1.xml')
    expect(footerFile).not.toBeNull()
    const footerXml = await footerFile!.async('string')
    expect(footerXml).toContain('PAGE')
  })

  it('omits the header/footer parts entirely when showHeader/showFooter are false', async () => {
    const buffer = await buildPaperDocxBuffer(content, [makeQuestion()], 'question', {
      ...DEFAULT_PAPER_LAYOUT_SETTINGS,
      showHeader: false,
      showFooter: false,
    })
    const zip = await JSZip.loadAsync(buffer)
    expect(zip.file('word/header1.xml')).toBeNull()
    expect(zip.file('word/footer1.xml')).toBeNull()
  })

  it('never fabricates a subject breakdown table for a single-subject paper', async () => {
    const buffer = await buildPaperDocxBuffer(content, [makeQuestion(), makeQuestion({ questionId: 'q2', position: 2 })], 'question', DEFAULT_PAPER_LAYOUT_SETTINGS)
    const zip = await JSZip.loadAsync(buffer)
    const documentXml = await zip.file('word/document.xml')!.async('string')
    // A subject table would render a "Subject" header cell; with only one
    // subject present, buildSubjectTable() returns null and no such cell
    // should appear anywhere in the document body.
    expect(documentXml).not.toContain('>Subject<')
  })

  it('does render a subject breakdown table when the paper spans multiple subjects', async () => {
    const buffer = await buildPaperDocxBuffer(
      content,
      [makeQuestion({ subject: 'Physics' }), makeQuestion({ questionId: 'q2', position: 2, subject: 'Chemistry' })],
      'question',
      DEFAULT_PAPER_LAYOUT_SETTINGS
    )
    const zip = await JSZip.loadAsync(buffer)
    const documentXml = await zip.file('word/document.xml')!.async('string')
    expect(documentXml).toContain('Chemistry')
  })
})
