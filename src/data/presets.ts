import type { DurationOption, Intensity, PresetId } from '../types'

export interface PresetDefinition {
  id: PresetId
  name: string
  shortName: string
  description: string
  sound: string
}

export const PRESETS: readonly PresetDefinition[] = [
  {
    id: 'deep-work',
    name: 'Deep Work',
    shortName: 'Deep',
    description: 'Steady and grounded',
    sound: 'Brown noise · soft rain',
  },
  {
    id: 'flow',
    name: 'Flow',
    shortName: 'Flow',
    description: 'Warm and gently moving',
    sound: 'Soft synth · pink noise',
  },
  {
    id: 'calm-focus',
    name: 'Calm Focus',
    shortName: 'Calm',
    description: 'Light and spacious',
    sound: 'Air · distant tones',
  },
] as const

export const DURATION_OPTIONS: readonly DurationOption[] = [
  { id: '25', label: '25 min', mode: 'countdown', minutes: 25 },
  { id: '50', label: '50 min', mode: 'countdown', minutes: 50 },
  { id: '90', label: '90 min', mode: 'countdown', minutes: 90 },
  { id: 'endless', label: 'Endless', mode: 'endless', minutes: null },
] as const

export const INTENSITIES: readonly {
  id: Intensity
  label: string
  description: string
}[] = [
  { id: 'soft', label: 'Soft', description: 'Lighter and quieter texture' },
  { id: 'standard', label: 'Standard', description: 'Balanced sound texture' },
  { id: 'strong', label: 'Strong', description: 'Fuller, brighter texture' },
] as const

export const getPreset = (id: PresetId): PresetDefinition =>
  PRESETS.find((preset) => preset.id === id) ?? PRESETS[0]
