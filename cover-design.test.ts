import { describe, it, expect } from 'vitest'
import { coverDesignSchema, coverElementSchema, emptyCoverDesign, saveCoverDesignSchema } from '@/lib/validation/coverDesign'
import { buildCoverPlaceholderMap, resolveCoverElementText } from '@/lib/pdf/coverPlaceholders'
import { convertAnalysisToCoverDesign } from '@/lib/pdf/coverDesignConvert'
import type { PaperSettings } from '@/lib/pdf/paperHtml'
import type { CoverDesignAnalysisResult } from '@/lib/ai/coverDesignAnalysis'

describe('coverDesignSchema', () => {
  it('produces a valid, empty A4 design with sensible defaults', () => {
    const design = emptyCoverDesign()
    expect(design.pageSize).toBe('A4')
    expect(design.elements).toEqual([])
    expect(design.background.mode).toBe('none')
    expect(design.settings.showGrid).toBe(false)
  })

  it('accepts a minimal valid text element and fills in defaults', () => {
    const result = coverElementSchema.safeParse({ id: 'a', type: 'text', x: 0, y: 0, width: 10, height: 10 })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.fontFamily).toBe('Calibri')
      expect(result.data.alignment).toBe('left')
      expect(result.data.needsReview).toBe(false)
    }
  })

  it('rejects an element with an unsupported font family — never silently substitutes one', () => {
    const result = coverElementSchema.safeParse({
      id: 'a',
      type: 'text',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      fontFamily: 'Comic Sans MS',
    })
    expect(result.success).toBe(false)
  })

  it('rejects a non-hex color', () => {
    const result = coverElementSchema.safeParse({ id: 'a', type: 'text', x: 0, y: 0, width: 10, height: 10, color: 'red' })
    expect(result.success).toBe(false)
  })

  it('rejects a non-positive width/height — an element must occupy real space', () => {
    const result = coverElementSchema.safeParse({ id: 'a', type: 'text', x: 0, y: 0, width: 0, height: 10 })
    expect(result.success).toBe(false)
  })

  it('requires rowVersion on saveCoverDesignSchema for optimistic-lock safety', () => {
    const result = saveCoverDesignSchema.safeParse({ coverDesign: emptyCoverDesign() })
    expect(result.success).toBe(false)
  })

  it('accepts a full save payload with rowVersion', () => {
    const result = saveCoverDesignSchema.safeParse({ coverDesign: emptyCoverDesign(), separateFrontPage: true, rowVersion: 3 })
    expect(result.success).toBe(true)
  })
})

const paperContent: PaperSettings = {
  title: 'Sample Paper',
  paperNumber: 7,
  instituteName: 'Demo Institute',
  logoUrl: null,
  examName: 'Mid Term',
  subjectLabel: 'Chemistry',
  classLabel: '12 NEET',
  examDate: '2026-03-01',
  examTime: '9:00 AM',
  maxMarks: 70,
  instructions: 'Read carefully.',
  headerText: null,
  footerText: null,
}

describe('buildCoverPlaceholderMap / resolveCoverElementText', () => {
  it('maps every built-in placeholder key to the paper’s real data', () => {
    const map = buildCoverPlaceholderMap(paperContent, { settings: emptyCoverDesign().settings })
    expect(map.schoolName).toBe('Demo Institute')
    expect(map.examName).toBe('Mid Term')
    expect(map.subject).toBe('Chemistry')
    expect(map.maximumMarks).toBe('70')
  })

  it('merges custom fields into the same map by their own key', () => {
    const design = emptyCoverDesign()
    design.settings.customFields = [{ key: 'academicSession', label: 'Academic Session', value: '2026–27' }]
    const map = buildCoverPlaceholderMap(paperContent, { settings: design.settings })
    expect(map.academicSession).toBe('2026–27')
  })

  it('a bound placeholderKey always wins over stale literal text', () => {
    const map = buildCoverPlaceholderMap(paperContent, { settings: emptyCoverDesign().settings })
    const text = resolveCoverElementText({ text: 'OLD PREVIEW', placeholderKey: 'examName', customFieldKey: null }, map)
    expect(text).toBe('Mid Term')
  })

  it('substitutes an inline {{token}} inside literal text', () => {
    const map = buildCoverPlaceholderMap(paperContent, { settings: emptyCoverDesign().settings })
    const text = resolveCoverElementText({ text: '{{subject}} Paper', placeholderKey: null, customFieldKey: null }, map)
    expect(text).toBe('Chemistry Paper')
  })

  it('leaves an unrecognized {{token}} visibly as-is rather than deleting it', () => {
    const map = buildCoverPlaceholderMap(paperContent, { settings: emptyCoverDesign().settings })
    const text = resolveCoverElementText({ text: 'Hello {{notARealField}}', placeholderKey: null, customFieldKey: null }, map)
    expect(text).toBe('Hello {{notARealField}}')
  })

  it('falls back to literal text when there is no placeholder binding at all', () => {
    const map = buildCoverPlaceholderMap(paperContent, { settings: emptyCoverDesign().settings })
    const text = resolveCoverElementText({ text: 'Plain literal text', placeholderKey: null, customFieldKey: null }, map)
    expect(text).toBe('Plain literal text')
  })
})

describe('convertAnalysisToCoverDesign ("Use as Template")', () => {
  function analysis(overrides: Partial<CoverDesignAnalysisResult> = {}): CoverDesignAnalysisResult {
    return {
      textBlocks: [],
      images: [],
      shapes: [],
      backgroundColorGuess: null,
      ...overrides,
    } as CoverDesignAnalysisResult
  }

  it('creates one editable CoverElement per detected text block, preserving confidence/needsReview', () => {
    const result = analysis({
      textBlocks: [
        {
          text: 'ABC School',
          fieldGuess: 'schoolName',
          boundingBox: { x: 100, y: 50, width: 400, height: 60 },
          confidence: 'HIGH',
          needsReview: false,
          reviewReason: null,
          fontSizeGuessPt: 22,
          fontWeightGuess: 'bold',
          fontStyleGuess: 'normal',
          alignmentGuess: 'center',
          colorGuess: '#222222',
        },
      ] as unknown as CoverDesignAnalysisResult['textBlocks'],
    })
    const design = convertAnalysisToCoverDesign(result, 'A4')
    expect(design.elements).toHaveLength(1)
    expect(design.elements[0]?.type).toBe('text')
    expect(design.elements[0]?.text).toBe('ABC School')
    expect(design.elements[0]?.placeholderKey).toBe('schoolName')
    expect(design.elements[0]?.ocrConfidence).toBe('HIGH')
    expect(design.elements[0]?.needsReview).toBe(false)
    // 100/1000 * 210mm = 21mm
    expect(design.elements[0]?.x).toBeCloseTo(21, 0)
  })

  it('creates an image/logo element with imagePath null and needsReview true — never fabricates pixels', () => {
    const result = analysis({
      images: [
        {
          kind: 'logo',
          boundingBox: { x: 400, y: 20, width: 100, height: 100 },
          confidence: 'MEDIUM',
        },
      ] as unknown as CoverDesignAnalysisResult['images'],
    })
    const design = convertAnalysisToCoverDesign(result, 'A4')
    expect(design.elements).toHaveLength(1)
    expect(design.elements[0]?.type).toBe('logo')
    expect(design.elements[0]?.imagePath).toBeNull()
    expect(design.elements[0]?.needsReview).toBe(true)
  })

  it('never produces a single flat background element — every detection becomes its own editable element', () => {
    const result = analysis({
      textBlocks: [
        { text: 'A', fieldGuess: null, boundingBox: { x: 0, y: 0, width: 100, height: 20 }, confidence: 'HIGH', needsReview: false, reviewReason: null } as unknown as CoverDesignAnalysisResult['textBlocks'][number],
        { text: 'B', fieldGuess: null, boundingBox: { x: 0, y: 30, width: 100, height: 20 }, confidence: 'HIGH', needsReview: false, reviewReason: null } as unknown as CoverDesignAnalysisResult['textBlocks'][number],
      ],
      shapes: [
        { kind: 'line', boundingBox: { x: 0, y: 60, width: 500, height: 2 }, confidence: 'HIGH', needsReview: false } as unknown as CoverDesignAnalysisResult['shapes'][number],
      ],
    })
    const design = convertAnalysisToCoverDesign(result, 'A4')
    expect(design.elements).toHaveLength(3)
    expect(new Set(design.elements.map((e) => e.type))).toEqual(new Set(['text', 'line']))
  })
})
