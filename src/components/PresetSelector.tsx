import { useEffect, useState } from 'preact/hooks'
import { getPreset, PRESETS, type SoundCollection } from '../data/presets'
import type { PresetId } from '../types'

interface PresetSelectorProps {
  value: PresetId
  disabled?: boolean
  onChange: (preset: PresetId) => void
}

const COLLECTIONS: readonly { id: SoundCollection; label: string; hint: string }[] = [
  { id: 'focus', label: 'Focus tones', hint: 'Generated here' },
  { id: 'nature', label: 'Nature', hint: 'Streams on demand' },
]

export function PresetSelector({ value, disabled = false, onChange }: PresetSelectorProps) {
  const [collection, setCollection] = useState<SoundCollection>(() => getPreset(value).collection)

  useEffect(() => {
    setCollection(getPreset(value).collection)
  }, [value])

  const visiblePresets = PRESETS.filter((preset) => preset.collection === collection)

  return (
    <section class="sound-library" aria-labelledby="sound-library-title">
      <header class="sound-library__header">
        <div>
          <span class="eyebrow">Sound library</span>
          <h2 id="sound-library-title">Choose your atmosphere.</h2>
        </div>
        <div aria-label="Sound collections" class="library-tabs" role="tablist">
          {COLLECTIONS.map((item) => (
            <button
              aria-controls={`sound-panel-${item.id}`}
              aria-selected={collection === item.id}
              disabled={disabled}
              id={`sound-tab-${item.id}`}
              key={item.id}
              onClick={() => setCollection(item.id)}
              role="tab"
              type="button"
            >
              <span>{item.label}</span>
              <small>{item.hint}</small>
            </button>
          ))}
        </div>
      </header>

      <div
        aria-labelledby={`sound-tab-${collection}`}
        class={`sound-rail sound-rail--${collection}`}
        id={`sound-panel-${collection}`}
        role="tabpanel"
      >
        {visiblePresets.map((preset) => (
          <button
            aria-label={`${preset.name}: ${preset.description}`}
            aria-pressed={value === preset.id}
            class={`sound-card sound-card--${preset.id}`}
            disabled={disabled}
            key={preset.id}
            onClick={() => onChange(preset.id)}
            type="button"
          >
            <span class="sound-card__art" aria-hidden="true">
              <span />
            </span>
            <span class="sound-card__copy">
              <strong>{preset.name}</strong>
              <small>{preset.description}</small>
            </span>
            <span class="sound-card__source">
              {preset.source.type === 'procedural' ? 'Live generated' : 'Recorded loop'}
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
