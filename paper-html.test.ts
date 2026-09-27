import { describe, it, expect } from 'vitest'
import {
  renderPaperHtml,
  renderCoverOnlyHtml,
  getPageDimensionsMm,
  computeQuestionNumbers,
  formatMarksDisplay,
  DEFAULT_PAPER_LAYOUT_SETTINGS,
  type PaperSettings,
  type PaperLayoutSettings,
} from '@/lib/pdf/paperHtml'
import type { SnapshotQuestion } from '@/lib/paper-snapshot'
import { emptyCoverDesign, type CoverDesign, type CoverElement } from '@/lib/validation/coverDesign'

const settings: PaperSettings = {
  title: 'Demo Paper',
  paperNumber: 1,
  instituteName: 'Demo Institute',
  logoUrl: null,
  examName: 'Unit Test',
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
    questionText: 'What is $x^2$ when x = 2?',
    optionA: 'A) 2',
    optionB: 'B) 4',
    optionC: 'C) 8',
    optionD: 'D) 16',
    correctAnswer: 'B',
    explanation: 'x^2 = 4 when x = 2.',
    subject: 'Physics',
    examClass: '11 JEE',
    code: 'A',
    difficulty: 'Easy',
    marks: null,
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

describe('renderPaperHtml', () => {
  it('escapes HTML-unsafe characters in question text (never trusts it as raw HTML)', () => {
    const html = renderPaperHtml(settings, [makeQuestion({ questionText: '<script>alert(1)</script>' })], 'question')
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('preserves math delimiters verbatim so MathJax can typeset them', () => {
    const html = renderPaperHtml(settings, [makeQuestion()], 'question')
    expect(html).toContain('$x^2$')
  })

  it('answer key mode lists the correct answer per question number, not the question text', () => {
    const html = renderPaperHtml(settings, [makeQuestion({ correctAnswer: 'B' })], 'answerKey')
    expect(html).toContain('<strong>1.</strong> B')
    expect(html).not.toContain('What is')
  })

  it('solutions mode includes the explanation text', () => {
    const html = renderPaperHtml(settings, [makeQuestion()], 'solutions')
    expect(html).toContain('x^2 = 4 when x = 2')
  })

  it('question mode omits the correct-answer/explanation panel entirely', () => {
    const html = renderPaperHtml(settings, [makeQuestion()], 'question')
    expect(html).not.toContain('x^2 = 4 when x = 2')
  })
})

describe('renderPaperHtml — PaperSettings (Feature 4) layout application', () => {
  it('defaults to 2 columns / Calibri / 11pt when no layout is given, matching the schema defaults', () => {
    const html = renderPaperHtml(settings, [makeQuestion()], 'question')
    expect(html).toContain("font-family: 'Calibri'")
    expect(html).toContain('font-size: 11pt')
    expect(html).toContain('multi-column')
    expect(html).toContain('column-count: 2')
  })

  it('applies a custom font family/size/line-spacing/question-spacing', () => {
    const layout: PaperLayoutSettings = { ...DEFAULT_PAPER_LAYOUT_SETTINGS, fontFamily: 'Georgia', fontSizePt: 13, lineSpacing: 2, questionSpacingPx: 24 }
    const html = renderPaperHtml(settings, [makeQuestion()], 'question', layout)
    expect(html).toContain("font-family: 'Georgia'")
    expect(html).toContain('font-size: 13pt')
    expect(html).toContain('line-height: 2')
    expect(html).toContain('margin-bottom: 24px')
  })

  it('renders a single-column body (no multi-column class) when columns=1', () => {
    const layout: PaperLayoutSettings = { ...DEFAULT_PAPER_LAYOUT_SETTINGS, columns: 1 }
    const html = renderPaperHtml(settings, [makeQuestion()], 'question', layout)
    expect(html).not.toContain('class="paper-body multi-column"')
  })

  it('never applies multi-column layout to the answer key body, even when columns > 1', () => {
    const html = renderPaperHtml(settings, [makeQuestion({ correctAnswer: 'B' })], 'answerKey', {
      ...DEFAULT_PAPER_LAYOUT_SETTINGS,
      columns: 2,
    })
    expect(html).not.toContain('class="paper-body multi-column"')
  })

  it('omits the header/footer band elements entirely when showHeader/showFooter are false', () => {
    // Note: the CSS ruleset for .page-band-header/.page-band-footer stays
    // in the stylesheet either way (it's static, not per-render) — what
    // must actually disappear is the <div> element itself, since an empty
    // unused CSS rule is harmless but a leftover empty band div is not.
    const layout: PaperLayoutSettings = { ...DEFAULT_PAPER_LAYOUT_SETTINGS, showHeader: false, showFooter: false }
    const html = renderPaperHtml(settings, [makeQuestion()], 'question', layout)
    expect(html).not.toContain('<div class="page-band-header">')
    expect(html).not.toContain('<div class="page-band-footer">')
  })

  it('applies configured page margins and page size to the printable area', () => {
    const layout: PaperLayoutSettings = { ...DEFAULT_PAPER_LAYOUT_SETTINGS, pageSize: 'LETTER', orientation: 'LANDSCAPE', marginLeftMm: 20, marginRightMm: 22 }
    const html = renderPaperHtml(settings, [makeQuestion()], 'question', layout)
    expect(html).toContain('@page { size: LETTER landscape; margin: 0; }')
    expect(html).toContain('22mm')
  })

  it('applies the configured max image width and alignment', () => {
    const layout: PaperLayoutSettings = { ...DEFAULT_PAPER_LAYOUT_SETTINGS, maxImageWidthMm: 60, imageAlignment: 'CENTER' }
    const html = renderPaperHtml(settings, [makeQuestion({ images: [{ url: 'https://example.com/img.png', altText: 'Diagram' }] })], 'question', layout)
    expect(html).toContain('max-width: 60mm')
    expect(html).toContain('text-align: center')
  })
})

describe('renderPaperHtml — Advanced Paper Builder (sections/numbering/marks/answer-space)', () => {
  function sectionedQuestions(): SnapshotQuestion[] {
    return [
      makeQuestion({
        questionId: 'q1',
        position: 1,
        marks: 1,
        sectionId: 'sec-a',
        sectionLabel: 'A',
        sectionTitle: 'Multiple Choice Questions',
        sectionInstructions: 'Choose the single best answer.',
        sectionNumberingMode: 'CONTINUE',
      }),
      makeQuestion({
        questionId: 'q2',
        position: 2,
        marks: 1,
        sectionId: 'sec-a',
        sectionLabel: 'A',
        sectionTitle: 'Multiple Choice Questions',
        sectionNumberingMode: 'CONTINUE',
      }),
      makeQuestion({
        questionId: 'q3',
        position: 3,
        marks: 5,
        questionType: 'SUBJECTIVE',
        optionA: null,
        optionB: null,
        optionC: null,
        optionD: null,
        sectionId: 'sec-b',
        sectionLabel: 'B',
        sectionTitle: 'Long Answer Questions',
        sectionNumberingMode: 'RESTART',
        sectionAnswerSpace: 'LARGE',
      }),
    ]
  }

  it('renders one section heading per section, not per question', () => {
    const html = renderPaperHtml(settings, sectionedQuestions(), 'question')
    // Match the rendered <div>, not the bare class name — the static CSS
    // ruleset for .section-heading-title also contains that substring
    // regardless of how many times the div itself renders (same pitfall
    // documented for .page-band-header above).
    expect((html.match(/<div class="section-heading-title">/g) || []).length).toBe(2)
    expect(html).toContain('Section A: Multiple Choice Questions')
    expect(html).toContain('Section B: Long Answer Questions')
  })

  it('renders the section instructions block only when the section has instructions', () => {
    const html = renderPaperHtml(settings, sectionedQuestions(), 'question')
    expect(html).toContain('Choose the single best answer.')
  })

  it('renders the configured marks display next to each question', () => {
    const html = renderPaperHtml(settings, sectionedQuestions(), 'question', {
      ...DEFAULT_PAPER_LAYOUT_SETTINGS,
      marksDisplayStyle: 'BRACKET_NUMBER',
    })
    expect(html).toContain('[1]')
    expect(html).toContain('[5]')
  })

  it('renders a reserved answer-space block after a SUBJECTIVE question, never after an MCQ question', () => {
    const html = renderPaperHtml(settings, sectionedQuestions(), 'question')
    expect(html).toContain('class="answer-space"')
    expect((html.match(/class="answer-space"/g) || []).length).toBe(1)
  })

  it('never renders an answer space when the section is configured for NONE', () => {
    const questions = sectionedQuestions().map((q) => (q.questionType === 'SUBJECTIVE' ? { ...q, sectionAnswerSpace: 'NONE' as const } : q))
    const html = renderPaperHtml(settings, questions, 'question')
    expect(html).not.toContain('class="answer-space"')
  })
})

describe('computeQuestionNumbers', () => {
  function q(overrides: Partial<SnapshotQuestion> = {}): SnapshotQuestion {
    return makeQuestion(overrides)
  }

  it('numbers plainly with PLAIN style, ignoring sections', () => {
    const qs = [q({ sectionId: 'a' }), q({ sectionId: 'a' }), q({ sectionId: 'b' })]
    expect(computeQuestionNumbers(qs, 'PLAIN')).toEqual(['1', '2', '3'])
  })

  it('prefixes with Q under Q_PREFIX style', () => {
    const qs = [q(), q(), q()]
    expect(computeQuestionNumbers(qs, 'Q_PREFIX')).toEqual(['Q1', 'Q2', 'Q3'])
  })

  it('restarts a section at 1 when that section is configured RESTART', () => {
    const qs = [
      q({ sectionId: 'a', sectionNumberingMode: 'CONTINUE' }),
      q({ sectionId: 'a', sectionNumberingMode: 'CONTINUE' }),
      q({ sectionId: 'b', sectionNumberingMode: 'RESTART' }),
      q({ sectionId: 'b', sectionNumberingMode: 'RESTART' }),
    ]
    expect(computeQuestionNumbers(qs, 'PLAIN')).toEqual(['1', '2', '1', '2'])
  })

  it('groups every question in a section under one outer number with LETTERED style', () => {
    const qs = [
      q({ sectionId: 'a' }),
      q({ sectionId: 'a' }),
      q({ sectionId: 'a' }),
      q({ sectionId: 'b' }),
      q({ sectionId: 'b' }),
    ]
    expect(computeQuestionNumbers(qs, 'LETTERED')).toEqual(['1(a)', '1(b)', '1(c)', '2(a)', '2(b)'])
  })
})

describe('formatMarksDisplay', () => {
  it('formats BRACKET_MARKS as "[N Marks]", singular for 1', () => {
    expect(formatMarksDisplay(1, 'BRACKET_MARKS')).toBe('[1 Mark]')
    expect(formatMarksDisplay(2, 'BRACKET_MARKS')).toBe('[2 Marks]')
  })

  it('formats PAREN_NUMBER as "(N)"', () => {
    expect(formatMarksDisplay(4, 'PAREN_NUMBER')).toBe('(4)')
  })

  it('formats BRACKET_NUMBER as "[N]"', () => {
    expect(formatMarksDisplay(4, 'BRACKET_NUMBER')).toBe('[4]')
  })

  it('returns an empty string when marks is null — never fabricates a value', () => {
    expect(formatMarksDisplay(null, 'BRACKET_MARKS')).toBe('')
  })
})

describe('renderPaperHtml — Cover Page Designer (add-on)', () => {
  function textElement(overrides: Partial<CoverElement> = {}): CoverElement {
    return {
      id: 'el-1',
      type: 'text',
      x: 10,
      y: 10,
      width: 80,
      height: 20,
      zIndex: 1,
      locked: false,
      hidden: false,
      text: 'Custom Cover Text',
      placeholderKey: null,
      customFieldKey: null,
      fontFamily: 'Georgia',
      fontSizePt: 18,
      fontWeight: 'bold',
      fontStyle: 'normal',
      alignment: 'center',
      color: '#112233',
      backgroundColor: null,
      borderColor: null,
      borderWidthPt: 0,
      imagePath: null,
      opacity: 100,
      ocrConfidence: null,
      needsReview: false,
      ...overrides,
    }
  }

  it('renders EXACTLY the same cover markup as before when coverDesign is null — the critical backward-compatibility guarantee', () => {
    const withoutArgs = renderPaperHtml(settings, [makeQuestion()], 'question')
    const withNullDesign = renderPaperHtml(settings, [makeQuestion()], 'question', DEFAULT_PAPER_LAYOUT_SETTINGS, null, true)
    expect(withNullDesign).toBe(withoutArgs)
    expect(withoutArgs).toContain('class="cover-frame"')
    expect(withoutArgs).not.toContain('<div class="cover-designed-canvas"')
  })

  it('falls back to the original hardcoded cover when coverDesign has no elements', () => {
    const html = renderPaperHtml(settings, [makeQuestion()], 'question', DEFAULT_PAPER_LAYOUT_SETTINGS, emptyCoverDesign(), true)
    expect(html).toContain('class="cover-frame"')
    expect(html).not.toContain('<div class="cover-designed-canvas"')
  })

  it('renders a designed cover on its own page when coverDesign has elements, with the literal element text', () => {
    const design: CoverDesign = { ...emptyCoverDesign(), elements: [textElement()] }
    const html = renderPaperHtml(settings, [makeQuestion()], 'question', DEFAULT_PAPER_LAYOUT_SETTINGS, design, true)
    expect(html).toContain('<div class="cover-designed-canvas"')
    expect(html).toContain('Custom Cover Text')
    expect(html).not.toContain('class="cover-frame"')
  })

  it('resolves a bound placeholderKey to the paper’s real data instead of the element’s literal text', () => {
    const design: CoverDesign = {
      ...emptyCoverDesign(),
      elements: [textElement({ text: 'stale preview text', placeholderKey: 'schoolName' })],
    }
    const html = renderPaperHtml(settings, [makeQuestion()], 'question', DEFAULT_PAPER_LAYOUT_SETTINGS, design, true)
    expect(html).toContain(settings.instituteName as string)
    expect(html).not.toContain('stale preview text')
  })

  it('substitutes {{token}} placeholders inside literal text', () => {
    const design: CoverDesign = {
      ...emptyCoverDesign(),
      elements: [textElement({ text: '{{examName}} — {{subject}}', placeholderKey: null })],
    }
    const html = renderPaperHtml(settings, [makeQuestion()], 'question', DEFAULT_PAPER_LAYOUT_SETTINGS, design, true)
    expect(html).toContain(`${settings.examName} — ${settings.subjectLabel}`)
  })

  it('never renders a cover at all when separateFrontPage is false, even with a designed cover set', () => {
    const design: CoverDesign = { ...emptyCoverDesign(), elements: [textElement()] }
    const html = renderPaperHtml(settings, [makeQuestion()], 'question', DEFAULT_PAPER_LAYOUT_SETTINGS, design, false)
    expect(html).not.toContain('<div class="cover-designed-canvas"')
    expect(html).not.toContain('class="cover-frame"')
    expect(html).not.toContain('<div class="cover-page')
  })

  it('never shows a designed cover for answerKey/solutions modes, matching the original mode===question-only rule', () => {
    const design: CoverDesign = { ...emptyCoverDesign(), elements: [textElement()] }
    const html = renderPaperHtml(settings, [makeQuestion({ correctAnswer: 'B' })], 'answerKey', DEFAULT_PAPER_LAYOUT_SETTINGS, design, true)
    expect(html).not.toContain('<div class="cover-designed-canvas"')
  })

  it('omits an image/logo element entirely when its imagePath is not yet set, rather than a broken <img>', () => {
    const design: CoverDesign = {
      ...emptyCoverDesign(),
      elements: [{ ...textElement({ type: 'logo' }), imagePath: null }],
    }
    const html = renderPaperHtml(settings, [makeQuestion()], 'question', DEFAULT_PAPER_LAYOUT_SETTINGS, design, true)
    expect(html).not.toContain('<img class="cover-el cover-el-image"')
  })
})

describe('renderCoverOnlyHtml (DOCX flatten-to-image source)', () => {
  it('renders a standalone document sized to the physical page, with no MathJax/print-button/header-band markup', () => {
    const design: CoverDesign = {
      ...emptyCoverDesign(),
      elements: [
        {
          id: 'el-1',
          type: 'text',
          x: 10,
          y: 10,
          width: 80,
          height: 20,
          zIndex: 1,
          locked: false,
          hidden: false,
          text: 'Flattened Cover Text',
          placeholderKey: null,
          customFieldKey: null,
          fontFamily: 'Calibri',
          fontSizePt: 16,
          fontWeight: 'normal',
          fontStyle: 'normal',
          alignment: 'left',
          color: '#000000',
          backgroundColor: null,
          borderColor: null,
          borderWidthPt: 0,
          imagePath: null,
          opacity: 100,
          ocrConfidence: null,
          needsReview: false,
        },
      ],
    }
    const html = renderCoverOnlyHtml(design, settings, DEFAULT_PAPER_LAYOUT_SETTINGS)
    expect(html).toContain('Flattened Cover Text')
    expect(html).toContain('width: 210mm')
    expect(html).toContain('height: 297mm')
    expect(html).not.toContain('MathJax')
    expect(html).not.toContain('Print / Save as PDF')
    expect(html).not.toContain('page-band-header')
  })
})

describe('getPageDimensionsMm', () => {
  it('returns real A4 portrait dimensions by default', () => {
    expect(getPageDimensionsMm({ pageSize: 'A4', orientation: 'PORTRAIT' })).toEqual({ widthMm: 210, heightMm: 297 })
  })

  it('swaps width/height for landscape orientation', () => {
    expect(getPageDimensionsMm({ pageSize: 'A4', orientation: 'LANDSCAPE' })).toEqual({ widthMm: 297, heightMm: 210 })
  })

  it('returns real Letter/Legal dimensions, not A4 approximations', () => {
    expect(getPageDimensionsMm({ pageSize: 'LETTER', orientation: 'PORTRAIT' })).toEqual({ widthMm: 215.9, heightMm: 279.4 })
    expect(getPageDimensionsMm({ pageSize: 'LEGAL', orientation: 'PORTRAIT' })).toEqual({ widthMm: 215.9, heightMm: 355.6 })
  })
})
