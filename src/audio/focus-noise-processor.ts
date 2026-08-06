import { SeededRandom } from './prng'

interface NoiseProcessorConfig {
  seed: number
  brownGain: number
  pinkGain: number
  rainGain: number
  rainDensity: number
}

interface ProcessorOptions {
  processorOptions?: Partial<NoiseProcessorConfig>
}

interface ChannelState {
  random: SeededRandom
  pink: Float64Array
  brown: number
  previousWhite: number
  rainEnvelope: number
  rainCountdown: number
}

declare const sampleRate: number

declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort
  constructor(options?: ProcessorOptions)
  abstract process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean
}

declare function registerProcessor(
  name: string,
  processorCtor: new (options?: ProcessorOptions) => AudioWorkletProcessor,
): void

const DEFAULT_CONFIG: NoiseProcessorConfig = {
  seed: 0x6d2b79f5,
  brownGain: 0.12,
  pinkGain: 0.08,
  rainGain: 0.025,
  rainDensity: 2,
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value))

const finiteOr = (value: number | undefined, fallback: number): number =>
  Number.isFinite(value) ? (value as number) : fallback

class FocusNoiseProcessor extends AudioWorkletProcessor {
  private readonly config: NoiseProcessorConfig
  private readonly channels: [ChannelState, ChannelState]
  private readonly rainDecay: number

  constructor(options?: ProcessorOptions) {
    super(options)
    const supplied = options?.processorOptions
    const seed = finiteOr(supplied?.seed, DEFAULT_CONFIG.seed) >>> 0

    this.config = {
      seed,
      brownGain: clamp(finiteOr(supplied?.brownGain, DEFAULT_CONFIG.brownGain), 0, 0.4),
      pinkGain: clamp(finiteOr(supplied?.pinkGain, DEFAULT_CONFIG.pinkGain), 0, 0.4),
      rainGain: clamp(finiteOr(supplied?.rainGain, DEFAULT_CONFIG.rainGain), 0, 0.2),
      rainDensity: clamp(finiteOr(supplied?.rainDensity, DEFAULT_CONFIG.rainDensity), 0.1, 12),
    }
    this.channels = [this.createChannel(seed ^ 0x9e3779b9), this.createChannel(seed ^ 0x85ebca6b)]
    this.rainDecay = Math.exp(-1 / (sampleRate * 0.045))
  }

  private createChannel(seed: number): ChannelState {
    return {
      random: new SeededRandom(seed),
      pink: new Float64Array(7),
      brown: 0,
      previousWhite: 0,
      rainEnvelope: 0,
      rainCountdown: 0,
    }
  }

  private nextSample(state: ChannelState): number {
    const white = state.random.nextBipolar()

    state.brown = (state.brown + white * 0.018) / 1.015
    const brown = state.brown * 2.8

    const pink = state.pink
    pink[0] = 0.99886 * pink[0] + white * 0.0555179
    pink[1] = 0.99332 * pink[1] + white * 0.0750759
    pink[2] = 0.969 * pink[2] + white * 0.153852
    pink[3] = 0.8665 * pink[3] + white * 0.3104856
    pink[4] = 0.55 * pink[4] + white * 0.5329522
    pink[5] = -0.7616 * pink[5] - white * 0.016898
    const pinkSample =
      (pink[0] + pink[1] + pink[2] + pink[3] + pink[4] + pink[5] + pink[6] + white * 0.5362) *
      0.11
    pink[6] = white * 0.115926

    state.rainCountdown -= 1
    if (state.rainCountdown <= 0) {
      const spacing = sampleRate / this.config.rainDensity
      state.rainCountdown = Math.max(1, Math.round(spacing * (0.35 + state.random.nextFloat() * 1.3)))
      state.rainEnvelope = 0.35 + state.random.nextFloat() * 0.65
    }
    const rainTransient = (white - state.previousWhite) * state.rainEnvelope
    state.previousWhite = white
    state.rainEnvelope *= this.rainDecay

    const mixed =
      brown * this.config.brownGain +
      pinkSample * this.config.pinkGain +
      rainTransient * this.config.rainGain

    return clamp(mixed, -0.9, 0.9)
  }

  process(
    _inputs: Float32Array[][],
    outputs: Float32Array[][],
    _parameters: Record<string, Float32Array>,
  ): boolean {
    const output = outputs[0]
    if (!output) return true

    for (let channelIndex = 0; channelIndex < output.length; channelIndex += 1) {
      const channel = output[channelIndex]
      const state = this.channels[Math.min(channelIndex, 1)]
      for (let sampleIndex = 0; sampleIndex < channel.length; sampleIndex += 1) {
        channel[sampleIndex] = this.nextSample(state)
      }
    }

    return true
  }
}

registerProcessor('chillax-focus-noise', FocusNoiseProcessor)
