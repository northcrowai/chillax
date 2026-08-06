import type {
  DurationOption,
  Intensity,
  PresetId,
  ProceduralPresetId,
} from '../types'

export type SoundCollection = 'focus' | 'nature'

export interface ProceduralSoundSource {
  type: 'procedural'
}

export interface RecordedSoundSource {
  type: 'recorded'
  src: string
  credit: string
  license: 'CC0' | 'Public domain'
  sourceUrl: string
}

export interface PresetDefinition {
  id: PresetId
  name: string
  shortName: string
  description: string
  sound: string
  collection: SoundCollection
  source: ProceduralSoundSource | RecordedSoundSource
}

export const PRESETS: readonly PresetDefinition[] = [
  {
    id: 'deep-work',
    name: 'Deep Work',
    shortName: 'Deep',
    description: 'Steady, low, and grounded',
    sound: 'Generated / brown noise + soft rain',
    collection: 'focus',
    source: { type: 'procedural' },
  },
  {
    id: 'flow',
    name: 'Flow State',
    shortName: 'Flow',
    description: 'Warm movement without distraction',
    sound: 'Generated / synth bed + pink noise',
    collection: 'focus',
    source: { type: 'procedural' },
  },
  {
    id: 'calm-focus',
    name: 'Calm Focus',
    shortName: 'Calm',
    description: 'Soft, light, and spacious',
    sound: 'Generated / air + distant tones',
    collection: 'focus',
    source: { type: 'procedural' },
  },
  {
    id: 'rain-light',
    name: 'Light Rain',
    shortName: 'Light rain',
    description: 'A gentle window-side shower',
    sound: 'Field loop / variation one',
    collection: 'nature',
    source: {
      type: 'recorded',
      src: '/audio/ambient/rain-light.ogg',
      credit: 'Ylmir',
      license: 'CC0',
      sourceUrl: 'https://opengameart.org/content/rain-loopable',
    },
  },
  {
    id: 'rain-soft',
    name: 'Soft Rain',
    shortName: 'Soft rain',
    description: 'Even rain with a softer texture',
    sound: 'Field loop / variation two',
    collection: 'nature',
    source: {
      type: 'recorded',
      src: '/audio/ambient/rain-soft.ogg',
      credit: 'Ylmir',
      license: 'CC0',
      sourceUrl: 'https://opengameart.org/content/rain-loopable',
    },
  },
  {
    id: 'rain-steady',
    name: 'Steady Rain',
    shortName: 'Steady rain',
    description: 'A fuller, consistent rainfall',
    sound: 'Field loop / variation three',
    collection: 'nature',
    source: {
      type: 'recorded',
      src: '/audio/ambient/rain-steady.ogg',
      credit: 'Ylmir',
      license: 'CC0',
      sourceUrl: 'https://opengameart.org/content/rain-loopable',
    },
  },
  {
    id: 'rain-full',
    name: 'Full Rain',
    shortName: 'Full rain',
    description: 'Dense rain for deeper masking',
    sound: 'Field loop / variation four',
    collection: 'nature',
    source: {
      type: 'recorded',
      src: '/audio/ambient/rain-full.ogg',
      credit: 'Ylmir',
      license: 'CC0',
      sourceUrl: 'https://opengameart.org/content/rain-loopable',
    },
  },
  {
    id: 'rain-gutter',
    name: 'Rainy Roof',
    shortName: 'Rainy roof',
    description: 'Rain landing on a roof and gutter',
    sound: 'Field loop / Ogrebane',
    collection: 'nature',
    source: {
      type: 'recorded',
      src: '/audio/ambient/rain-gutter.mp3',
      credit: 'Ogrebane',
      license: 'CC0',
      sourceUrl: 'https://opengameart.org/content/rain-gutter-loop',
    },
  },
  {
    id: 'forest-ambience',
    name: 'Forest Hush',
    shortName: 'Forest hush',
    description: 'A seamless, peaceful woodland bed',
    sound: 'Ambient loop / TinyWorlds',
    collection: 'nature',
    source: {
      type: 'recorded',
      src: '/audio/ambient/forest-ambience.mp3',
      credit: 'TinyWorlds',
      license: 'CC0',
      sourceUrl: 'https://opengameart.org/node/23888',
    },
  },
  {
    id: 'forest-morning',
    name: 'Forest Morning',
    shortName: 'Forest morning',
    description: 'Birds, breeze, and a distant crow',
    sound: 'Natural recording / nille',
    collection: 'nature',
    source: {
      type: 'recorded',
      src: '/audio/ambient/forest-morning.ogg',
      credit: 'nille',
      license: 'Public domain',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:20090610_0_ambience.ogg',
    },
  },
  {
    id: 'fireplace',
    name: 'Fireside',
    shortName: 'Fireside',
    description: 'Close crackle and a warm room',
    sound: 'Field loop / inchadney',
    collection: 'nature',
    source: {
      type: 'recorded',
      src: '/audio/ambient/fireplace.ogg',
      credit: 'inchadney',
      license: 'CC0',
      sourceUrl: 'https://freesound.org/people/inchadney/sounds/132534/',
    },
  },
  {
    id: 'wind',
    name: 'Open Wind',
    shortName: 'Open wind',
    description: 'Wide, natural air in motion',
    sound: 'Field loop / felix.blume',
    collection: 'nature',
    source: {
      type: 'recorded',
      src: '/audio/ambient/wind.ogg',
      credit: 'felix.blume',
      license: 'CC0',
      sourceUrl: 'https://freesound.org/people/felix.blume/sounds/139337/',
    },
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

export const isProceduralPreset = (id: PresetId): id is ProceduralPresetId =>
  getPreset(id).source.type === 'procedural'
