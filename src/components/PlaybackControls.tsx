import type { TimerStatus } from '../types'
import { PauseIcon, PlayIcon, ResetIcon } from './Icons'

interface PlaybackControlsProps {
  status: TimerStatus
  isBusy: boolean
  onToggle: () => void
  onReset: () => void
  sessionName?: string
}

export function PlaybackControls({
  status,
  isBusy,
  onToggle,
  onReset,
  sessionName = 'focus session',
}: PlaybackControlsProps) {
  const isPlaying = status === 'running'
  const actionLabel = isPlaying
    ? `Pause ${sessionName}`
    : status === 'completed'
      ? `Start a new ${sessionName}`
      : status === 'paused'
        ? `Resume ${sessionName}`
        : `Start ${sessionName}`

  return (
    <div class="playback-controls">
      <button
        aria-label={`Reset ${sessionName}`}
        class="secondary-action"
        disabled={isBusy || status === 'idle'}
        onClick={onReset}
        type="button"
      >
        <ResetIcon />
        <span>Reset</span>
      </button>
      <button
        aria-label={actionLabel}
        class="primary-action"
        disabled={isBusy}
        onClick={onToggle}
        type="button"
      >
        {isPlaying ? <PauseIcon /> : <PlayIcon />}
        <span>{isBusy ? 'Preparing…' : isPlaying ? 'Pause' : status === 'paused' ? 'Resume' : 'Begin'}</span>
      </button>
      <span class="playback-controls__spacer" aria-hidden="true" />
    </div>
  )
}
