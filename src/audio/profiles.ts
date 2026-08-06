import type { Intensity, ProceduralPresetId } from '../types'
import { seedFromString } from './prng'

export interface NoiseProfile {
  readonly seed: number
  readonly brownGain: number
  readonly pinkGain: number
  readonly rainGain: number
  readonly rainDensity: number
}

export interface AudioProfile {
  readonly preset: ProceduralPresetId
  readonly intensity: Intensity
  readonly noise: NoiseProfile
  readonly brightnessHz: number
  readonly padGain: number
  readonly chordHz: readonly number[]
  readonly motionRateHz: number
  readonly motionDepth: number
}

interface PresetProfile {
  readonly brownGain: number
  readonly pinkGain: number
  readonly rainGain: number
  readonly rainDensity: number
  readonly brightnessHz: number
  readonly padGain: number
  readonly chordHz: readonly number[]
  readonly motionRateHz: number
  readonly motionDepth: number
}

interface IntensityProfile {
  readonly density: number
  readonly brightness: number
}

const PRESETS: Readonly<Record<ProceduralPresetId, PresetProfile>> = {
  'deep-work': {
    brownGain: 0.17,
    pinkGain: 0.08,
    rainGain: 0.025,
    rainDensity: 2.2,
    brightnessHz: 1_500,
    padGain: 0.035,
    chordHz: [73.42, 110, 146.83],
    motionRateHz: 0.018,
    motionDepth: 0.12,
  },
  flow: {
    brownGain: 0.08,
    pinkGain: 0.12,
    rainGain: 0.06,
    rainDensity: 5,
    brightnessHz: 2_300,
    padGain: 0.055,
    chordHz: [65.41, 98, 130.81, 164.81],
    motionRateHz: 0.03,
    motionDepth: 0.32,
  },
  'calm-focus': {
    brownGain: 0.16,
    pinkGain: 0.05,
    rainGain: 0.018,
    rainDensity: 1.6,
    brightnessHz: 1_200,
    padGain: 0.04,
    chordHz: [87.31, 130.81, 174.61],
    motionRateHz: 0.012,
    motionDepth: 0.18,
  },
}

const INTENSITIES: Readonly<Record<Intensity, IntensityProfile>> = {
  soft: { density: 0.72, brightness: 0.82 },
  standard: { density: 1, brightness: 1 },
  strong: { density: 1.18, brightness: 1.16 },
}

const round = (value: number): number => Math.round(value * 100_000) / 100_000

/**
 * Resolves a deterministic sound profile. Intensity only changes layer density
 * and spectral brightness; chord and slow motion rates remain unchanged.
 */
export function getAudioProfile(preset: ProceduralPresetId, intensity: Intensity): AudioProfile {
  const base = PRESETS[preset]
  const strength = INTENSITIES[intensity]

  return {
    preset,
    intensity,
    noise: {
      seed: seedFromString(`chillax:${preset}:noise:v1`),
      brownGain: round(base.brownGain * strength.density),
      pinkGain: round(base.pinkGain * strength.density),
      rainGain: round(base.rainGain * strength.density),
      rainDensity: round(base.rainDensity * strength.density),
    },
    brightnessHz: Math.round(base.brightnessHz * strength.brightness),
    padGain: round(base.padGain * strength.density),
    chordHz: base.chordHz,
    motionRateHz: base.motionRateHz,
    motionDepth: base.motionDepth,
  }
}
