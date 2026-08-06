import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface ProcessorOptions {
  processorOptions?: {
    seed?: number
    brownGain?: number
    pinkGain?: number
    rainGain?: number
    rainDensity?: number
  }
}

interface TestProcessor {
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean
}

type TestProcessorConstructor = new (options?: ProcessorOptions) => TestProcessor

describe('chillax-focus-noise worklet', () => {
  let Processor: TestProcessorConstructor

  beforeEach(async () => {
    vi.resetModules()
    vi.stubGlobal('sampleRate', 48_000)
    vi.stubGlobal('AudioWorkletProcessor', class {})
    vi.stubGlobal(
      'registerProcessor',
      (name: string, constructor: TestProcessorConstructor): void => {
        expect(name).toBe('chillax-focus-noise')
        Processor = constructor
      },
    )

    await import('../focus-noise-processor')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const render = (seed: number): [Float32Array, Float32Array] => {
    const processor = new Processor({
      processorOptions: {
        seed,
        brownGain: 0.15,
        pinkGain: 0.08,
        rainGain: 0.03,
        rainDensity: 3,
      },
    })
    const left = new Float32Array(512)
    const right = new Float32Array(512)

    expect(processor.process([], [[left, right]], {})).toBe(true)
    return [left, right]
  }

  it('renders repeatable stereo samples for a session seed', () => {
    const first = render(123_456)
    const second = render(123_456)

    expect(first[0]).toEqual(second[0])
    expect(first[1]).toEqual(second[1])
    expect(first[0]).not.toEqual(first[1])
  })

  it('changes the signal with a different seed and keeps output bounded', () => {
    const first = render(1)
    const second = render(2)

    expect(first[0]).not.toEqual(second[0])
    for (const channel of first) {
      expect(channel.some((sample) => sample !== 0)).toBe(true)
      expect(Math.max(...channel)).toBeLessThanOrEqual(0.9)
      expect(Math.min(...channel)).toBeGreaterThanOrEqual(-0.9)
    }
  })

  it('handles a missing output bus without terminating the processor', () => {
    const processor = new Processor()

    expect(processor.process([], [], {})).toBe(true)
  })
})
