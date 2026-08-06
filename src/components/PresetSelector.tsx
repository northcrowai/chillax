import { PRESETS } from '../data/presets'
import type { PresetId } from '../types'

interface PresetSelectorProps {
  value: PresetId
  disabled?: boolean
  onChange: (preset: PresetId) => void
}

export function PresetSelector({ value, disabled = false, onChange }: PresetSelectorProps) {
  return (
    <fieldset class="preset-selector" aria-label="Choose a soundscape">
      <legend class="sr-only">Soundscape</legend>
      {PRESETS.map((preset, index) => (
        <button
          aria-pressed={value === preset.id}
          class={`preset-option preset-option--${preset.id}`}
          disabled={disabled}
          key={preset.id}
          onClick={() => onChange(preset.id)}
          type="button"
        >
          <span class="preset-option__number">0{index + 1}</span>
          <span class="preset-option__copy">
            <strong>{preset.name}</strong>
            <small>{preset.description}</small>
          </span>
          <span class="preset-option__dot" aria-hidden="true" />
        </button>
      ))}
    </fieldset>
  )
}
