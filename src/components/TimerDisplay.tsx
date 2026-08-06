import type { TimerMode, TimerStatus } from '../types'

interface TimerDisplayProps {
  display: string
  mode: TimerMode
  status: TimerStatus
  presetName: string
  progress: number | null
}

const STATUS_LABELS: Record<TimerStatus, string> = {
  idle: 'Ready when you are',
  running: 'Focus session in progress',
  paused: 'Session paused',
  completed: 'Session complete',
}

export function TimerDisplay({ display, mode, status, presetName, progress }: TimerDisplayProps) {
  const normalizedProgress = progress === null ? null : Math.max(0, Math.min(1, progress))

  return (
    <div class="timer-display">
      <div class="timer-display__meta">
        <span>{presetName}</span>
        <span aria-hidden="true">·</span>
        <span>{mode === 'endless' ? 'Open session' : 'Timed session'}</span>
      </div>
      <output
        class="timer-display__time"
        aria-label={`${display} ${mode === 'endless' ? 'elapsed' : 'remaining'}`}
      >
        {display}
      </output>
      {normalizedProgress === null ? null : (
        <progress
          aria-label="Session progress"
          class="timer-display__track"
          max="1"
          value={normalizedProgress}
        />
      )}
      <p class="timer-display__status" aria-live="polite">
        {STATUS_LABELS[status]}
      </p>
    </div>
  )
}
