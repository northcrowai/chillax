import { useEffect, useRef } from 'preact/hooks'
import { CloseIcon } from './Icons'

interface SettingsDialogProps {
  open: boolean
  wakeLockEnabled: boolean
  wakeLockSupported: boolean
  isStandalone: boolean
  offlineReady: boolean
  onClose: () => void
  onResetPreferences: () => void
  onWakeLockChange: (enabled: boolean) => void
}

export function SettingsDialog({
  open,
  wakeLockEnabled,
  wakeLockSupported,
  isStandalone,
  offlineReady,
  onClose,
  onResetPreferences,
  onWakeLockChange,
}: SettingsDialogProps) {
  const dialogRef = useRef<HTMLElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
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
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
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
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, open])

  if (!open) return null

  return (
    <div class="dialog-backdrop">
      <button
        aria-label="Close settings"
        class="dialog-backdrop__dismiss"
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />
      <section
        aria-labelledby="settings-title"
        aria-modal="true"
        class="settings-dialog"
        ref={dialogRef}
        role="dialog"
      >
        <header class="settings-dialog__header">
          <div>
            <span class="eyebrow">Preferences</span>
            <h2 id="settings-title">Keep it simple.</h2>
          </div>
          <button
            aria-label="Close settings"
            class="icon-button"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            <CloseIcon />
          </button>
        </header>

        <div class="settings-row">
          <div>
            <strong>Keep screen awake</strong>
            <p>{wakeLockSupported ? 'Prevent Windows from dimming the display during a session.' : 'Wake Lock is unavailable in this browser.'}</p>
          </div>
          <label class="toggle">
            <input
              checked={wakeLockEnabled}
              disabled={!wakeLockSupported}
              onChange={(event) => onWakeLockChange(event.currentTarget.checked)}
              type="checkbox"
            />
            <span aria-hidden="true" />
            <span class="sr-only">Keep screen awake</span>
          </label>
        </div>

        <div class="settings-row settings-row--status">
          <div>
            <strong>App status</strong>
            <p>
              {isStandalone ? 'Installed as a Windows app' : 'Running in your browser'} ·{' '}
              {offlineReady ? 'available offline' : 'offline setup pending'}
            </p>
          </div>
          <span class={`status-dot${offlineReady ? ' is-ready' : ''}`} aria-hidden="true" />
        </div>

        <div class="privacy-note">
          <strong>Private by design</strong>
          <p>Your sound choices and timer settings stay in this browser. Chillax has no account, analytics, or remote data storage.</p>
        </div>

        <button class="text-action text-action--danger" onClick={onResetPreferences} type="button">
          Restore default settings
        </button>
      </section>
    </div>
  )
}
