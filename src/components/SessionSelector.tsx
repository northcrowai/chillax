import type { Ref } from 'preact'
import type { SessionChoice, SessionPlanV1 } from '../types'

interface SessionSelectorProps {
  plan: SessionPlanV1
  disabled?: boolean
  customButtonRef?: Ref<HTMLButtonElement>
  onOpenCustom: () => void
  onSelect: (choice: Exclude<SessionChoice, 'custom'>) => void
}

export function SessionSelector({
  plan,
  disabled = false,
  customButtonRef,
  onOpenCustom,
  onSelect,
}: SessionSelectorProps) {
  return (
    <fieldset class="control-group session-selector">
      <legend>Session</legend>
      <div class="segmented-control segmented-control--session">
        <button
          aria-pressed={plan.choice === 'sixty'}
          disabled={disabled}
          onClick={() => onSelect('sixty')}
          type="button"
        >
          60 minutes
        </button>
        <button
          aria-pressed={plan.choice === 'endless'}
          disabled={disabled}
          onClick={() => onSelect('endless')}
          type="button"
        >
          Infinite
        </button>
        <button
          aria-haspopup="dialog"
          aria-pressed={plan.choice === 'custom'}
          disabled={disabled}
          onClick={onOpenCustom}
          ref={customButtonRef}
          type="button"
        >
          Custom
        </button>
      </div>
    </fieldset>
  )
}
