import { describe, it, expect } from 'vitest'
import { splitIntoQuestions } from '@/lib/pdf/extractQuestions'

const SAMPLE_TEXT = `
Physics Practice Set

1. What is the SI unit of force?
A) Joule
B) Newton
C) Watt
D) Pascal
Ans: B
Explanation: Force is measured in Newtons by definition of Newton's second law.

2. A body moving with constant velocity has:
A) Zero acceleration
B) Non-zero acceleration
C) Increasing speed
D) Decreasing speed
Answer: A

Q3. Which of the following is a vector quantity?
(A) Mass
(B) Speed
(C) Velocity
(D) Time
`

describe('splitIntoQuestions', () => {
  it('detects each numbered question as a separate block', () => {
    const result = splitIntoQuestions(SAMPLE_TEXT)
    expect(result).toHaveLength(3)
    expect(result[0].questionNumber).toBe('1')
    expect(result[1].questionNumber).toBe('2')
    expect(result[2].questionNumber).toBe('3')
  })

  it('extracts options A–D without altering their text', () => {
    const result = splitIntoQuestions(SAMPLE_TEXT)
    expect(result[0].optionA).toContain('Joule')
    expect(result[0].optionB).toContain('Newton')
    expect(result[0].optionC).toContain('Watt')
    expect(result[0].optionD).toContain('Pascal')
  })

  it('extracts the answer letter when present', () => {
    const result = splitIntoQuestions(SAMPLE_TEXT)
    expect(result[0].correctAnswer).toBe('B')
    expect(result[1].correctAnswer).toBe('A')
  })

  it('extracts the explanation text separately from the question', () => {
    const result = splitIntoQuestions(SAMPLE_TEXT)
    expect(result[0].explanation).toContain("Newton's second law")
    expect(result[0].questionText).not.toContain('Explanation')
  })

  it('never rewrites the question text itself — it is a verbatim substring of the source', () => {
    const result = splitIntoQuestions(SAMPLE_TEXT)
    expect(SAMPLE_TEXT).toContain(result[1].questionText)
  })

  it('returns an empty array for text with no detectable numbering', () => {
    const result = splitIntoQuestions('This is just a paragraph of prose with no question numbers at all.')
    expect(result).toHaveLength(0)
  })
})
