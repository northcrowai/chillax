import type { JSX } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import {
  MAX_CUSTOM_DURATION_MINUTES,
  MIN_CUSTOM_DURATION_MINUTES,
} from '../lib/session'
import { POMODORO_LIMITS } from '../lib/pomodoro'
import type { CustomSessionMode, PomodoroConfig, SessionPlanV1 } from '../types'
import { CloseIcon } from './Icons'

interface CustomSessionDialogProps {
  plan: SessionPlanV1
  pomodoroConfig: PomodoroConfig
  onApply: (plan: SessionPlanV1, config: PomodoroConfig) => void
  onClose: () => void
}

interface NumberSettingProps {
  id: string
  label: string
  hint: string
  value: string
  minimum: number
  maximum: number
  onInput: (value: string) => void
}

const clampWholeNumber = (value: string, minimum: number, maximum: number) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return minimum
  return Math.min(maximum, Math.max(minimum, Math.round(parsed)))
}

function NumberSetting({
  id,
  label,
  hint,
  value,
  minimum,
  maximum,
  onInput,
}: NumberSettingProps) {
  const hintId = `${id}-hint`

  return (
    <label class="session-setting" for={id}>
      <span>{label}</span>
      <span class="session-setting__input">
        <input
          aria-describedby={hintId}
          id={id}
          inputMode="numeric"
          max={maximum}
          min={minimum}
          onInput={(event) => onInput(event.currentTarget.value)}
          required
          step="1"
          type="number"
          value={value}
        />
        <small id={hintId}>{hint}</small>
      </span>
    </label>
  )
}

export function CustomSessionDialog({
  plan,
  pomodoroConfig,
  onApply,
  onClose,
}: CustomSessionDialogProps) {
  const [mode, setMode] = useState<CustomSessionMode>(plan.customMode)
  const [durationMinutes, setDurationMinutes] = useState(String(plan.customDurationMinutes))
  const [workMinutes, setWorkMinutes] = useState(String(pomodoroConfig.workMinutes))
  const [shortBreakMinutes, setShortBreakMinutes] = useState(String(pomodoroConfig.shortBreakMinutes))
  const [longBreakMinutes, setLongBreakMinutes] = useState(String(pomodoroConfig.longBreakMinutes))
  const [focusSessions, setFocusSessions] = useState(String(
    pomodoroConfig.focusSessionsBeforeLongBreak,
  ))
  const dialogRef = useRef<HTMLElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return

      const focusableElements = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      )
      const firstElement = focusableElements[0]
      const lastElement = focusableElements.at(-1)
      if (!firstElement || !lastElement) return

      const activeElement = document.activeElement
      if (event.shiftKey && (activeElement === firstElement || !dialogRef.current?.contains(activeElement))) {
        event.preventDefault()
        lastElement.focus()
      } else if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault()
        firstElement.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  const handleSubmit = (event: JSX.TargetedSubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextDuration = clampWholeNumber(
      durationMinutes,
      MIN_CUSTOM_DURATION_MINUTES,
      MAX_CUSTOM_DURATION_MINUTES,
    )
    const nextConfig: PomodoroConfig = {
      workMinutes: clampWholeNumber(
        workMinutes,
        POMODORO_LIMITS.workMinutes.minimum,
        POMODORO_LIMITS.workMinutes.maximum,
      ),
      shortBreakMinutes: clampWholeNumber(
        shortBreakMinutes,
        POMODORO_LIMITS.shortBreakMinutes.minimum,
        POMODORO_LIMITS.shortBreakMinutes.maximum,
      ),
      longBreakMinutes: clampWholeNumber(
        longBreakMinutes,
        POMODORO_LIMITS.longBreakMinutes.minimum,
        POMODORO_LIMITS.longBreakMinutes.maximum,
      ),
      focusSessionsBeforeLongBreak: clampWholeNumber(
        focusSessions,
        POMODORO_LIMITS.focusSessionsBeforeLongBreak.minimum,
        POMODORO_LIMITS.focusSessionsBeforeLongBreak.maximum,
      ),
    }

    onApply({
      version: 1,
      choice: 'custom',
      customMode: mode,
      customDurationMinutes: nextDuration,
    }, nextConfig)
  }

  return (
    <div class="dialog-backdrop session-dialog-backdrop">
      <button
        aria-label="Close custom session"
        class="dialog-backdrop__dismiss"
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />
      <section
        aria-labelledby="custom-session-title"
        aria-modal="true"
        class="custom-session-dialog"
        ref={dialogRef}
        role="dialog"
      >
        <header class="custom-session-dialog__header">
          <div>
            <span class="eyebrow">Custom session</span>
            <h2 id="custom-session-title">Set your rhythm.</h2>
            <p>Choose one timer or a repeating focus-and-break cycle.</p>
          </div>
          <button
            aria-label="Close custom session"
            class="icon-button"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            <CloseIcon />
          </button>
        </header>

        <form onSubmit={handleSubmit}>
          <fieldset class="session-mode-selector">
            <legend class="sr-only">Custom session type</legend>
            <button
              aria-pressed={mode === 'duration'}
              onClick={() => setMode('duration')}
              type="button"
            >
              <strong>Single timer</strong>
              <small>One countdown, your length</small>
            </button>
            <button
              aria-pressed={mode === 'pomodoro'}
              onClick={() => setMode('pomodoro')}
              type="button"
            >
              <strong>Pomodoro</strong>
              <small>Focus and break cycles</small>
            </button>
          </fieldset>

          {mode === 'duration' ? (
            <div class="custom-session-dialog__body custom-session-dialog__body--single">
              <NumberSetting
                hint={`${MIN_CUSTOM_DURATION_MINUTES}-${MAX_CUSTOM_DURATION_MINUTES} minutes`}
                id="custom-session-minutes"
                label="Session length"
                maximum={MAX_CUSTOM_DURATION_MINUTES}
                minimum={MIN_CUSTOM_DURATION_MINUTES}
                onInput={setDurationMinutes}
                value={durationMinutes}
              />
              <p class="session-preview">
                A single <strong>{durationMinutes || '0'} minute</strong> focus session.
              </p>
            </div>
          ) : (
            <div class="custom-session-dialog__body">
              <div class="pomodoro-settings">
                <NumberSetting
                  hint="minutes"
                  id="pomodoro-work-minutes"
                  label="Focus session"
                  maximum={POMODORO_LIMITS.workMinutes.maximum}
                  minimum={POMODORO_LIMITS.workMinutes.minimum}
                  onInput={setWorkMinutes}
                  value={workMinutes}
                />
                <NumberSetting
                  hint="minutes"
                  id="pomodoro-short-break-minutes"
                  label="Short break"
                  maximum={POMODORO_LIMITS.shortBreakMinutes.maximum}
                  minimum={POMODORO_LIMITS.shortBreakMinutes.minimum}
                  onInput={setShortBreakMinutes}
                  value={shortBreakMinutes}
                />
                <NumberSetting
                  hint="minutes"
                  id="pomodoro-long-break-minutes"
                  label="Long break"
                  maximum={POMODORO_LIMITS.longBreakMinutes.maximum}
                  minimum={POMODORO_LIMITS.longBreakMinutes.minimum}
                  onInput={setLongBreakMinutes}
                  value={longBreakMinutes}
                />
                <NumberSetting
                  hint="focus sessions"
                  id="pomodoro-focus-sessions"
                  label="Long break after"
                  maximum={POMODORO_LIMITS.focusSessionsBeforeLongBreak.maximum}
                  minimum={POMODORO_LIMITS.focusSessionsBeforeLongBreak.minimum}
                  onInput={setFocusSessions}
                  value={focusSessions}
                />
              </div>
              <p class="session-preview">
                <strong>{workMinutes || '0'} focus</strong> / {shortBreakMinutes || '0'} short /{' '}
                {longBreakMinutes || '0'} long / every {focusSessions || '0'}
              </p>
            </div>
          )}

          <footer class="custom-session-dialog__actions">
            <button class="dialog-secondary-action" onClick={onClose} type="button">
              Cancel
            </button>
            <button class="dialog-primary-action" type="submit">
              Use this session
            </button>
          </footer>
        </form>
      </section>
    </div>
  )
}
