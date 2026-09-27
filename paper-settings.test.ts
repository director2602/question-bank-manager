import { describe, it, expect } from 'vitest'
import { paperSettingsSchema } from '@/lib/validation/paperSettings'

describe('paperSettingsSchema', () => {
  it('accepts a full valid settings object', () => {
    const result = paperSettingsSchema.safeParse({
      pageSize: 'A4',
      orientation: 'PORTRAIT',
      marginTopMm: 18,
      marginBottomMm: 18,
      marginLeftMm: 16,
      marginRightMm: 16,
      columns: 2,
      columnGapMm: 8,
      showHeader: true,
      showFooter: true,
      showPageNumbers: true,
      fontFamily: 'Calibri',
      fontSizePt: 11,
      lineSpacing: 1.5,
      questionSpacingPx: 16,
      imageQualityPercent: 90,
      maxImageWidthMm: 85,
      imageAlignment: 'LEFT',
    })
    expect(result.success).toBe(true)
  })

  it('accepts an empty object — every field is a partial update', () => {
    const result = paperSettingsSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('rejects an unknown page size', () => {
    const result = paperSettingsSchema.safeParse({ pageSize: 'A3' })
    expect(result.success).toBe(false)
  })

  it('rejects a column count outside the supported range', () => {
    expect(paperSettingsSchema.safeParse({ columns: 0 }).success).toBe(false)
    expect(paperSettingsSchema.safeParse({ columns: 6 }).success).toBe(false)
    expect(paperSettingsSchema.safeParse({ columns: 2 }).success).toBe(true)
  })

  it('rejects a font size outside a sane printable range', () => {
    expect(paperSettingsSchema.safeParse({ fontSizePt: 2 }).success).toBe(false)
    expect(paperSettingsSchema.safeParse({ fontSizePt: 100 }).success).toBe(false)
    expect(paperSettingsSchema.safeParse({ fontSizePt: 11 }).success).toBe(true)
  })

  it('rejects a blank font family', () => {
    expect(paperSettingsSchema.safeParse({ fontFamily: '' }).success).toBe(false)
    expect(paperSettingsSchema.safeParse({ fontFamily: '   ' }).success).toBe(false)
  })

  it('rejects an unknown image alignment', () => {
    expect(paperSettingsSchema.safeParse({ imageAlignment: 'MIDDLE' }).success).toBe(false)
  })

  it('rejects an out-of-range image quality percent', () => {
    expect(paperSettingsSchema.safeParse({ imageQualityPercent: 5 }).success).toBe(false)
    expect(paperSettingsSchema.safeParse({ imageQualityPercent: 101 }).success).toBe(false)
    expect(paperSettingsSchema.safeParse({ imageQualityPercent: 90 }).success).toBe(true)
  })
})
