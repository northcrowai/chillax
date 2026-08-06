import type { Ref } from 'preact'
import type { PomodoroConfig, SessionChoice, SessionPlanV1 } from '../types'

interface SessionSelectorProps {
  plan: SessionPlanV1
  pomodoroConfig: PomodoroConfig
  disabled?: boolean
  customButtonRef?: Ref<HTMLButtonElement>
  onOpenCustom: () => void
  onSelect: (choice: Exclude<SessionChoice, 'custom'>) => void
}

const getPlanSummary = (plan: SessionPlanV1, pomodoroConfig: PomodoroConfig) => {
  if (plan.choice === 'sixty') return 'One uninterrupted hour'
  if (plan.choice === 'endless') return 'Count up without a finish time'
  if (plan.customMode === 'duration') return `${plan.customDurationMinutes} minute custom session`

  return `${pomodoroConfig.workMinutes} focus / ${pomodoroConfig.shortBreakMinutes} short / ${pomodoroConfig.longBreakMinutes} long / every ${pomodoroConfig.focusSessionsBeforeLongBreak}`
}

export function SessionSelector({
  plan,
  pomodoroConfig,
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
      <p class="session-selector__summary">
        <span aria-hidden="true" />
        {getPlanSummary(plan, pomodoroConfig)}
      </p>
    </fieldset>
  )
}
