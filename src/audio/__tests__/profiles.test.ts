import { describe, expect, it } from 'vitest'

import type { Intensity, PresetId } from '../../types'
import { getAudioProfile } from '../profiles'

const presets: PresetId[] = ['deep-work', 'flow', 'calm-focus']
const intensities: Intensity[] = ['soft', 'standard', 'strong']

describe('getAudioProfile', () => {
  it('returns deterministic, safe profiles for every supported combination', () => {
    for (const preset of presets) {
      for (const intensity of intensities) {
        const profile = getAudioProfile(preset, intensity)

        expect(profile).toEqual(getAudioProfile(preset, intensity))
        expect(profile.noise.seed).toBeGreaterThan(0)
        expect(profile.noise.brownGain + profile.noise.pinkGain + profile.noise.rainGain).toBeLessThan(
          0.4,
        )
        expect(profile.brightnessHz).toBeGreaterThanOrEqual(900)
        expect(profile.brightnessHz).toBeLessThanOrEqual(3_000)
        expect(profile.padGain).toBeLessThan(0.08)
        expect(profile.motionRateHz).toBeLessThan(0.1)
        expect(profile.motionDepth).toBeLessThanOrEqual(0.4)
      }
    }
  })

  it('changes only density and brightness when intensity changes', () => {
    for (const preset of presets) {
      const soft = getAudioProfile(preset, 'soft')
      const standard = getAudioProfile(preset, 'standard')
      const strong = getAudioProfile(preset, 'strong')

      expect(soft.noise.brownGain).toBeLessThan(standard.noise.brownGain)
      expect(standard.noise.brownGain).toBeLessThan(strong.noise.brownGain)
      expect(soft.noise.rainDensity).toBeLessThan(standard.noise.rainDensity)
      expect(standard.noise.rainDensity).toBeLessThan(strong.noise.rainDensity)
      expect(soft.brightnessHz).toBeLessThan(standard.brightnessHz)
      expect(standard.brightnessHz).toBeLessThan(strong.brightnessHz)
      expect(soft.chordHz).toBe(standard.chordHz)
      expect(standard.chordHz).toBe(strong.chordHz)
      expect(soft.motionRateHz).toBe(standard.motionRateHz)
      expect(standard.motionRateHz).toBe(strong.motionRateHz)
      expect(soft.motionDepth).toBe(standard.motionDepth)
      expect(standard.motionDepth).toBe(strong.motionDepth)
    }
  })

  it('preserves each preset sound signature', () => {
    const deepWork = getAudioProfile('deep-work', 'standard')
    const flow = getAudioProfile('flow', 'standard')
    const calm = getAudioProfile('calm-focus', 'standard')

    expect(deepWork.noise.brownGain).toBeGreaterThan(deepWork.noise.pinkGain)
    expect(flow.noise.rainGain).toBeGreaterThan(deepWork.noise.rainGain)
    expect(flow.padGain).toBeGreaterThan(deepWork.padGain)
    expect(flow.motionDepth).toBeGreaterThan(calm.motionDepth)
    expect(calm.brightnessHz).toBeLessThan(deepWork.brightnessHz)
  })
})
