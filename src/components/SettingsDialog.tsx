import { useEffect, useRef } from 'preact/hooks'
import type { StarfieldSpeedSeconds, ThemeMode } from '../types'
import { assetPath } from '../lib/assets'
import { CloseIcon } from './Icons'

interface SettingsDialogProps {
  open: boolean
  wakeLockEnabled: boolean
  wakeLockSupported: boolean
  isStandalone: boolean
  offlineReady: boolean
  starfieldSpeedSeconds: StarfieldSpeedSeconds
  theme: ThemeMode
  onClose: () => void
  onResetPreferences: () => void
  onStarfieldSpeedChange: (seconds: StarfieldSpeedSeconds) => void
  onThemeChange: (theme: ThemeMode) => void
  onWakeLockChange: (enabled: boolean) => void
}

const STARFIELD_SPEED_OPTIONS: ReadonlyArray<{ label: string; seconds: StarfieldSpeedSeconds }> = [
  { label: 'Quick', seconds: 5 },
  { label: 'Standard', seconds: 25 },
  { label: 'Slow', seconds: 50 },
  { label: 'Drift', seconds: 100 },
]

const SOUND_CREDITS = [
  { name: 'Rain loops', creator: 'Ylmir', license: 'CC0', url: 'https://opengameart.org/content/rain-loopable' },
  { name: 'Rainy roof', creator: 'Ogrebane', license: 'CC0', url: 'https://opengameart.org/content/rain-gutter-loop' },
  { name: 'Forest Hush', creator: 'TinyWorlds', license: 'CC0', url: 'https://opengameart.org/node/23888' },
  { name: 'Forest Morning', creator: 'nille', license: 'Public domain', url: 'https://commons.wikimedia.org/wiki/File:20090610_0_ambience.ogg' },
  { name: 'Fireside', creator: 'inchadney', license: 'CC0', url: 'https://freesound.org/people/inchadney/sounds/132534/' },
  { name: 'Open Wind', creator: 'felix.blume', license: 'CC0', url: 'https://freesound.org/people/felix.blume/sounds/139337/' },
  { name: 'Soft Study', creator: 'OMF-Games', license: 'CC0', url: 'https://opengameart.org/content/lofi-hip-hop-loop' },
  { name: 'Café Focus', creator: 'OMF-Games / qubodup', license: 'CC0', url: 'https://opengameart.org/content/chill-lofi-inspired-loop-edit' },
  { name: 'Night Notes', creator: 'OMF-Games', license: 'CC0', url: 'https://opengameart.org/content/lofi-again' },
  { name: 'Daybreak Beat', creator: 'omfgdude', license: 'CC0', url: 'https://opengameart.org/content/lofi-hip-hop' },
  { name: 'Autumn Colors', creator: 'pickentcode', license: 'CC0', url: 'https://opengameart.org/content/relaxing-lo-fi-songs' },
  { name: 'Under the Stars', creator: 'pickentcode', license: 'CC0', url: 'https://opengameart.org/content/relaxing-lo-fi-songs' },
] as const

export function SettingsDialog({
  open,
  wakeLockEnabled,
  wakeLockSupported,
  isStandalone,
  offlineReady,
  starfieldSpeedSeconds,
  theme,
  onClose,
  onResetPreferences,
  onStarfieldSpeedChange,
  onThemeChange,
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
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], summary, [tabindex]:not([tabindex="-1"])',
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
            <h2 id="settings-title">Make it yours.</h2>
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

        <div class="settings-row settings-row--theme">
          <div>
            <strong>Appearance</strong>
            <p>Switch the whole focus space between light and dark.</p>
          </div>
          <div aria-label="Appearance" class="theme-choice">
            <button
              aria-pressed={theme === 'light'}
              onClick={() => onThemeChange('light')}
              type="button"
            >
              Light
            </button>
            <button
              aria-pressed={theme === 'dark'}
              onClick={() => onThemeChange('dark')}
              type="button"
            >
              Dark
            </button>
          </div>
        </div>

        <div class="settings-row settings-row--starfield">
          <div>
            <strong>Starfield motion</strong>
            <p>Layered stars drift behind the orb. Standard is a 25-second journey.</p>
          </div>
          <div aria-label="Starfield motion speed" class="theme-choice settings-speed-choice">
            {STARFIELD_SPEED_OPTIONS.map((option) => (
              <button
                aria-pressed={starfieldSpeedSeconds === option.seconds}
                onClick={() => onStarfieldSpeedChange(option.seconds)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

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
              {isStandalone ? 'Installed as a Windows app' : 'Running in your browser'} /{' '}
              {offlineReady ? 'generated tones available offline' : 'offline setup pending'}
            </p>
          </div>
          <span class={`status-dot${offlineReady ? ' is-ready' : ''}`} aria-hidden="true" />
        </div>

        <details class="sound-credits">
          <summary>
            <span>
              <strong>Open sound credits</strong>
              <small>15 recordings and music loops / 25.2 MB / loaded only when selected</small>
            </span>
          </summary>
          <ul>
            {SOUND_CREDITS.map((credit) => (
              <li key={credit.name}>
                <a href={credit.url} rel="noreferrer" target="_blank">
                  <span>{credit.name}</span>
                  <small>{credit.creator} / {credit.license}</small>
                </a>
              </li>
            ))}
          </ul>
        </details>

        <div class="privacy-note">
          <strong>Private by design</strong>
          <p>Your settings, searched weather place, and Traffic preferences stay in this browser. Chillax has no account, analytics, cookies, or remote settings storage. Weather and Traffic send only the location data needed for the feature you choose; precise GPS coordinates and route results are never saved.</p>
          <p>
            <a href={assetPath('/privacy')} rel="noreferrer" target="_blank">Privacy</a>
            {' · '}
            <a href={assetPath('/terms')} rel="noreferrer" target="_blank">Terms</a>
          </p>
        </div>

        <button class="text-action text-action--danger" onClick={onResetPreferences} type="button">
          Restore default settings
        </button>
      </section>
    </div>
  )
}
