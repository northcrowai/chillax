import { describe, expect, it } from 'vitest'
import { FOCUS_QUOTES, getRandomFocusQuote } from './quotes'

describe('focus quotes', () => {
  it('keeps every quote short, attributed, and source-backed', () => {
    expect(FOCUS_QUOTES).toHaveLength(10)
    for (const quote of FOCUS_QUOTES) {
      expect(quote.text.trim().split(/\s+/).length).toBeLessThanOrEqual(22)
      expect(quote.author).not.toBe('')
      expect(quote.work).not.toBe('')
      expect(() => new URL(quote.sourceUrl)).not.toThrow()
    }
  })

  it('selects across the full list and safely bounds unusual random values', () => {
    expect(getRandomFocusQuote(() => 0)).toBe(FOCUS_QUOTES[0])
    expect(getRandomFocusQuote(() => 0.999_999)).toBe(FOCUS_QUOTES.at(-1))
    expect(getRandomFocusQuote(() => -1)).toBe(FOCUS_QUOTES[0])
    expect(getRandomFocusQuote(() => 1)).toBe(FOCUS_QUOTES.at(-1))
    expect(getRandomFocusQuote(() => Number.NaN)).toBe(FOCUS_QUOTES[0])
  })
})
