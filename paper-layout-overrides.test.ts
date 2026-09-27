import { describe, expect, it } from 'vitest'
import { parsePageSizeMmParam } from '@/lib/pdf/pageSizeParam'

// parsePageSizeMmParam backs the `?pageSizeMm=210x285` download-time page
// size override (PDF/DOCX export routes + the print route's live-preview
// path) — it must degrade to "no override" for anything malformed rather
// than ever throwing and breaking an export.
describe('parsePageSizeMmParam', () => {
  it('parses a valid WxH string', () => {
    expect(parsePageSizeMmParam('210x285')).toEqual({ widthMm: 210, heightMm: 285 })
  })

  it('parses decimal dimensions and is case-insensitive on the separator', () => {
    expect(parsePageSizeMmParam('215.9x279.4')).toEqual({ widthMm: 215.9, heightMm: 279.4 })
    expect(parsePageSizeMmParam('210X285')).toEqual({ widthMm: 210, heightMm: 285 })
  })

  it('returns null for missing/empty input', () => {
    expect(parsePageSizeMmParam(null)).toBeNull()
    expect(parsePageSizeMmParam(undefined)).toBeNull()
    expect(parsePageSizeMmParam('')).toBeNull()
  })

  it('returns null for malformed strings', () => {
    expect(parsePageSizeMmParam('not-a-size')).toBeNull()
    expect(parsePageSizeMmParam('210')).toBeNull()
    expect(parsePageSizeMmParam('210x')).toBeNull()
    expect(parsePageSizeMmParam('x285')).toBeNull()
    expect(parsePageSizeMmParam('210x285x300')).toBeNull()
    expect(parsePageSizeMmParam('-210x285')).toBeNull()
  })

  it('rejects zero, negative, or absurdly large dimensions', () => {
    expect(parsePageSizeMmParam('0x285')).toBeNull()
    expect(parsePageSizeMmParam('210x0')).toBeNull()
    expect(parsePageSizeMmParam('5000x285')).toBeNull()
  })
})
