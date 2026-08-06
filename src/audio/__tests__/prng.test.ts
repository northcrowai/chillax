import { describe, expect, it } from 'vitest'

import { SeededRandom, seedFromString } from '../prng'

describe('SeededRandom', () => {
  it('replays the same sequence for the same seed', () => {
    const first = new SeededRandom(seedFromString('deep-work'))
    const second = new SeededRandom(seedFromString('deep-work'))

    const firstSequence = Array.from({ length: 16 }, () => first.nextUint32())
    const secondSequence = Array.from({ length: 16 }, () => second.nextUint32())

    expect(firstSequence).toEqual(secondSequence)
    expect(new Set(firstSequence).size).toBeGreaterThan(12)
  })

  it('produces distinct sequences for distinct labels', () => {
    const first = new SeededRandom(seedFromString('deep-work'))
    const second = new SeededRandom(seedFromString('flow'))

    expect(Array.from({ length: 8 }, () => first.nextUint32())).not.toEqual(
      Array.from({ length: 8 }, () => second.nextUint32()),
    )
  })

  it('keeps normalized and bipolar values in their documented ranges', () => {
    const random = new SeededRandom(0)

    for (let index = 0; index < 1_000; index += 1) {
      expect(random.nextFloat()).toBeGreaterThanOrEqual(0)
      expect(random.nextFloat()).toBeLessThan(1)
      expect(random.nextBipolar()).toBeGreaterThanOrEqual(-1)
      expect(random.nextBipolar()).toBeLessThan(1)
    }
  })

  it('hashes text deterministically and never emits a zero fallback seed', () => {
    expect(seedFromString('chillax')).toBe(seedFromString('chillax'))
    expect(seedFromString('chillax')).not.toBe(seedFromString('Chillax'))
    expect(seedFromString('')).not.toBe(0)
  })
})
