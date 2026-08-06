const FALLBACK_SEED = 0x6d2b79f5

/** A small deterministic PRNG suitable for repeatable procedural audio. */
export class SeededRandom {
  private state: number

  constructor(seed: number) {
    this.state = (seed >>> 0) || FALLBACK_SEED
  }

  nextUint32(): number {
    let value = this.state
    value ^= value << 13
    value ^= value >>> 17
    value ^= value << 5
    this.state = value >>> 0
    return this.state
  }

  nextFloat(): number {
    return this.nextUint32() / 0x1_0000_0000
  }

  nextBipolar(): number {
    return this.nextFloat() * 2 - 1
  }
}

/** Stable FNV-1a hash used to derive repeatable seeds from preset names. */
export function seedFromString(value: string): number {
  let hash = 0x811c9dc5

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }

  return (hash >>> 0) || FALLBACK_SEED
}
