import { describe, it, expect } from 'vitest'
import {
  normalizeQuestionText,
  hashNormalizedText,
  tokenOverlapSimilarity,
  SIMILARITY_WARNING_THRESHOLD,
} from '@/lib/duplicate-detection'

describe('normalizeQuestionText', () => {
  it('is case-insensitive and ignores punctuation/whitespace differences', () => {
    const a = normalizeQuestionText('What is the SI unit of Force?')
    const b = normalizeQuestionText('what is the si unit of force')
    expect(a).toBe(b)
  })

  it('collapses repeated whitespace', () => {
    expect(normalizeQuestionText('a   b\n\nc')).toBe('a b c')
  })
})

describe('hashNormalizedText', () => {
  it('produces the same hash for texts that only differ in case/punctuation', () => {
    const h1 = hashNormalizedText('What is Newton’s Second Law?')
    const h2 = hashNormalizedText('what is newtons second law')
    expect(h1).toBe(h2)
  })

  it('produces different hashes for genuinely different questions', () => {
    const h1 = hashNormalizedText('What is the SI unit of force?')
    const h2 = hashNormalizedText('What is the SI unit of energy?')
    expect(h1).not.toBe(h2)
  })
})

describe('tokenOverlapSimilarity', () => {
  it('returns 1 for identical text', () => {
    expect(tokenOverlapSimilarity('the quick brown fox', 'the quick brown fox')).toBeCloseTo(1)
  })

  it('returns 0 for completely disjoint text', () => {
    expect(tokenOverlapSimilarity('physics kinematics velocity', 'chemistry bonding valence')).toBe(0)
  })

  it('flags near-duplicate wording above the warning threshold', () => {
    const a = 'Which of the following best describes Newtons first law of motion'
    const b = 'Which of the following best describes Newtons first law of motion in physics'
    expect(tokenOverlapSimilarity(a, b)).toBeGreaterThanOrEqual(SIMILARITY_WARNING_THRESHOLD)
  })
})
