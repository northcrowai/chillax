import { INTENSITIES } from '../data/presets'
import type { Intensity } from '../types'

interface IntensitySelectorProps {
  value: Intensity
  disabled?: boolean
  onChange: (intensity: Intensity) => void
}

export function IntensitySelector({ value, disabled = false, onChange }: IntensitySelectorProps) {
  return (
    <fieldset class="control-group intensity-selector">
      <legend>Texture</legend>
      <div class="segmented-control">
        {INTENSITIES.map((intensity) => (
          <button
            aria-label={`${intensity.label}: ${intensity.description}`}
            aria-pressed={value === intensity.id}
            disabled={disabled}
            key={intensity.id}
            onClick={() => onChange(intensity.id)}
            type="button"
          >
            {intensity.label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}
