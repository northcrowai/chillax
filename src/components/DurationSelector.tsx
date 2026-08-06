import { useEffect, useState } from 'preact/hooks'
import { DURATION_OPTIONS } from '../data/presets'

interface DurationSelectorProps {
  durationMinutes: number | null
  customMinutes: number
  disabled?: boolean
  onSelect: (minutes: number | null) => void
  onCustomChange: (minutes: number) => void
}

const isQuickDuration = (duration: number | null) =>
  DURATION_OPTIONS.some((option) => option.minutes === duration)

export function DurationSelector({
  durationMinutes,
  customMinutes,
  disabled = false,
  onSelect,
  onCustomChange,
}: DurationSelectorProps) {
  const customSelected = durationMinutes !== null && !isQuickDuration(durationMinutes)
  const [customDraft, setCustomDraft] = useState(String(customMinutes))

  useEffect(() => {
    setCustomDraft(String(customMinutes))
  }, [customMinutes])

  const commitCustomDuration = () => {
    const parsedValue = Number(customDraft)
    const nextValue = Number.isFinite(parsedValue) && customDraft.trim() !== ''
      ? Math.max(5, Math.min(180, Math.round(parsedValue)))
      : 25
    setCustomDraft(String(nextValue))
    onCustomChange(nextValue)
  }

  return (
    <fieldset class="control-group duration-selector">
      <legend>Session</legend>
      <div class="segmented-control segmented-control--duration">
        {DURATION_OPTIONS.map((option) => (
          <button
            aria-label={option.label}
            aria-pressed={durationMinutes === option.minutes}
            disabled={disabled}
            key={option.id}
            onClick={() => onSelect(option.minutes)}
            type="button"
          >
            {option.minutes === null ? '∞' : option.minutes}
          </button>
        ))}
        <button
          aria-pressed={customSelected}
          class="segmented-control__custom"
          disabled={disabled}
          onClick={() => onSelect(customMinutes)}
          type="button"
        >
          Custom
        </button>
      </div>
      {customSelected ? (
        <label class="custom-duration">
          <span>Minutes</span>
          <input
            aria-describedby="custom-duration-hint"
            disabled={disabled}
            inputMode="numeric"
            max="180"
            min="5"
            onBlur={commitCustomDuration}
            onInput={(event) => setCustomDraft(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur()
            }}
            step="1"
            type="number"
            value={customDraft}
          />
          <small id="custom-duration-hint">5–180</small>
        </label>
      ) : null}
    </fieldset>
  )
}
