import { VolumeIcon } from './Icons'

interface VolumeControlProps {
  value: number
  disabled?: boolean
  onChange: (volume: number) => void
  onToggleMute: () => void
}

export function VolumeControl({ value, disabled = false, onChange, onToggleMute }: VolumeControlProps) {
  const percent = Math.round(value * 100)

  return (
    <div class="control-group volume-control">
      <span class="control-group__label">Volume</span>
      <div class="volume-control__row">
        <button
          aria-label={value === 0 ? 'Unmute soundscape' : 'Mute soundscape'}
          class="icon-button icon-button--small"
          disabled={disabled}
          onClick={onToggleMute}
          type="button"
        >
          <VolumeIcon muted={value === 0} />
        </button>
        <label>
          <span class="sr-only">Soundscape volume</span>
          <input
            disabled={disabled}
            max="1"
            min="0"
            onInput={(event) => onChange(Number(event.currentTarget.value))}
            step="0.01"
            type="range"
            value={value}
          />
        </label>
        <output aria-label={`Volume ${percent} percent`}>{percent}</output>
      </div>
    </div>
  )
}
