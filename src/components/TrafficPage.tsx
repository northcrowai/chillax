import type { JSX, Ref } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { LocationIcon, PauseIcon, PlayIcon, RefreshIcon, TrafficIcon } from './Icons'
import type { TimerStatus } from '../types'

export type ArrivalCushionMinutes = 0 | 5 | 10 | 15

export type TrafficPageStatus =
  | 'idle'
  | 'locating'
  | 'loading'
  | 'refreshing'
  | 'ready'
  | 'error'

export interface TrafficPlanView {
  leaveBy: string
  predictedArrivalTime: string
  durationSeconds: number
  staticDurationSeconds: number
  fetchedAt: string
  leaveNow?: boolean
}

export interface TrafficCalculationRequest {
  useManualOrigin: boolean
}

export interface TrafficPageProps {
  arrivalTime: string
  configurationMessage?: string
  configurationMissing?: boolean
  cushionMinutes: ArrivalCushionMinutes
  errorMessage: string | null
  headingRef?: Ref<HTMLHeadingElement>
  homeAddress: string
  isAudioBusy: boolean
  manualOrigin: string
  mapUrl: string | null
  needsManualOrigin: boolean
  onArrivalTimeChange: (value: string) => void
  onCalculate: (request: TrafficCalculationRequest) => void | Promise<void>
  onCushionMinutesChange: (value: ArrivalCushionMinutes) => void
  onHomeAddressChange: (value: string) => void
  onManualOriginChange: (value: string) => void
  onReturnToFocus: () => void
  onTogglePlayback: () => void
  plan: TrafficPlanView | null
  playbackSessionName: string
  presetName: string
  sessionLabel: string
  status: TrafficPageStatus
  timerDisplay: string
  timerStatus: TimerStatus
}

type OriginMode = 'current-location' | 'manual'

const CUSHION_OPTIONS: ArrivalCushionMinutes[] = [0, 5, 10, 15]

const getPlaybackAction = (status: TimerStatus, sessionName: string) => {
  if (status === 'running') return { label: `Pause ${sessionName}`, text: 'Pause' }
  if (status === 'paused') return { label: `Resume ${sessionName}`, text: 'Resume' }
  if (status === 'completed') return { label: `Start a new ${sessionName}`, text: 'Start again' }
  return { label: `Start ${sessionName}`, text: 'Begin' }
}

const getSessionStatus = (status: TimerStatus) => {
  if (status === 'running') return 'Playing'
  if (status === 'paused') return 'Paused'
  if (status === 'completed') return 'Complete'
  return 'Ready'
}

const parseDate = (value: string) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const formatTime = (value: string) => {
  const date = parseDate(value)
  if (!date) return 'Unavailable'

  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

const formatDuration = (seconds: number) => {
  const minutes = Math.max(1, Math.round(seconds / 60))
  if (minutes < 60) return `${minutes} min`

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes ? `${hours} hr ${remainingMinutes} min` : `${hours} hr`
}

const formatTrafficDelay = (durationSeconds: number, staticDurationSeconds: number) => {
  const delaySeconds = Math.max(0, durationSeconds - staticDurationSeconds)
  return delaySeconds < 60 ? 'No extra delay' : `+${formatDuration(delaySeconds)}`
}

const isPlanLeaveNow = (plan: TrafficPlanView, currentTime: number) => {
  if (plan.leaveNow) return true
  const departure = parseDate(plan.leaveBy)
  return departure ? departure.getTime() <= currentTime : false
}

export function TrafficPage({
  arrivalTime,
  configurationMessage = 'Traffic needs Google Maps browser keys before routes can be calculated.',
  configurationMissing = false,
  cushionMinutes,
  errorMessage,
  headingRef,
  homeAddress,
  isAudioBusy,
  manualOrigin,
  mapUrl,
  needsManualOrigin,
  onArrivalTimeChange,
  onCalculate,
  onCushionMinutesChange,
  onHomeAddressChange,
  onManualOriginChange,
  onReturnToFocus,
  onTogglePlayback,
  plan,
  playbackSessionName,
  presetName,
  sessionLabel,
  status,
  timerDisplay,
  timerStatus,
}: TrafficPageProps) {
  const [originMode, setOriginMode] = useState<OriginMode>(
    needsManualOrigin ? 'manual' : 'current-location',
  )
  const [currentTime, setCurrentTime] = useState(() => Date.now())
  const playbackAction = getPlaybackAction(timerStatus, playbackSessionName)
  const isBusy = status === 'locating' || status === 'loading' || status === 'refreshing'
  const usesManualOrigin = originMode === 'manual'
  const canCalculate = !configurationMissing
    && !isBusy
    && homeAddress.trim().length > 0
    && arrivalTime.length > 0
    && (!usesManualOrigin || manualOrigin.trim().length > 0)

  useEffect(() => {
    if (needsManualOrigin) setOriginMode('manual')
  }, [needsManualOrigin])

  useEffect(() => {
    if (!plan) return
    const updateTime = () => setCurrentTime(Date.now())
    updateTime()
    const intervalId = window.setInterval(updateTime, 30_000)
    return () => window.clearInterval(intervalId)
  }, [plan])

  const handleSubmit = (event: JSX.TargetedSubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canCalculate) return
    void onCalculate({ useManualOrigin: usesManualOrigin })
  }

  const calculateLabel = status === 'locating'
    ? 'Finding location...'
    : status === 'loading'
      ? 'Checking traffic...'
      : status === 'refreshing'
        ? 'Refreshing...'
        : plan
          ? 'Recalculate'
          : 'Calculate leave time'
  const planLeaveNow = plan ? isPlanLeaveNow(plan, currentTime) : false

  return (
    <main class="app-main traffic-main">
      <section class="traffic-hero" aria-labelledby="traffic-page-title">
        <div class="traffic-hero__copy">
          <span class="eyebrow">Traffic</span>
          <TrafficIcon />
          <h1 id="traffic-page-title" ref={headingRef} tabIndex={-1}>
            Get home on time.
          </h1>
          <p>Choose when you want to arrive today. Chillax will work backward from live traffic.</p>
        </div>

        <aside class="traffic-session" aria-label="Current Chillax session">
          <div class="traffic-session__topline">
            <span>Your Chillax session</span>
            <span class={`play-state${timerStatus === 'running' ? ' is-active' : ''}`}>
              <i aria-hidden="true" />
              {getSessionStatus(timerStatus)}
            </span>
          </div>
          <div class="traffic-session__body">
            <div>
              <strong>{presetName}</strong>
              <span>{sessionLabel}</span>
            </div>
            <output aria-label={`${timerDisplay} on the Chillax timer`}>{timerDisplay}</output>
          </div>
          <div class="traffic-session__actions">
            <button
              aria-label={playbackAction.label}
              class="traffic-session__playback"
              disabled={isAudioBusy}
              onClick={onTogglePlayback}
              type="button"
            >
              {timerStatus === 'running' ? <PauseIcon /> : <PlayIcon />}
              <span>{isAudioBusy ? 'Preparing...' : playbackAction.text}</span>
            </button>
            <button class="traffic-session__return" onClick={onReturnToFocus} type="button">
              Back to focus
            </button>
          </div>
        </aside>
      </section>

      <div class="traffic-workspace">
        <form class="traffic-form traffic-card" onSubmit={handleSubmit}>
          <div class="traffic-card__heading">
            <span class="eyebrow">Your route</span>
            <h2>Plan today&rsquo;s drive</h2>
          </div>

          <div class="traffic-field">
            <label htmlFor="traffic-home-address">Home</label>
            <input
              aria-describedby="traffic-home-note"
              autoComplete="street-address"
              id="traffic-home-address"
              maxLength={200}
              name="home-address"
              onInput={(event) => onHomeAddressChange(event.currentTarget.value)}
              placeholder="Enter your home address"
              required
              type="text"
              value={homeAddress}
            />
            <small id="traffic-home-note">Saved only on this device.</small>
          </div>

          <fieldset class="traffic-origin">
            <legend>Starting point</legend>
            <div class="traffic-origin__options">
              <button
                aria-pressed={originMode === 'current-location'}
                onClick={() => setOriginMode('current-location')}
                type="button"
              >
                <LocationIcon />
                Current location
              </button>
              <button
                aria-pressed={usesManualOrigin}
                onClick={() => setOriginMode('manual')}
                type="button"
              >
                Enter a location
              </button>
            </div>
          </fieldset>

          {usesManualOrigin ? (
            <div class="traffic-field traffic-field--origin">
              <label htmlFor="traffic-start-address">Where are you leaving from?</label>
              <input
                autoComplete="street-address"
                id="traffic-start-address"
                maxLength={200}
                name="start-address"
                onInput={(event) => onManualOriginChange(event.currentTarget.value)}
                placeholder="Enter your current address or place"
                required
                type="text"
                value={manualOrigin}
              />
            </div>
          ) : (
            <p class="traffic-origin__note">
              Your precise location is used for this route and is not saved.
            </p>
          )}

          <div class="traffic-field">
            <label htmlFor="traffic-arrival-time">Be home by</label>
            <span class="traffic-field__time">
              <input
                aria-describedby="traffic-arrival-day"
                id="traffic-arrival-time"
                name="arrival-time"
                onInput={(event) => onArrivalTimeChange(event.currentTarget.value)}
                required
                type="time"
                value={arrivalTime}
              />
              <small id="traffic-arrival-day">Today</small>
            </span>
          </div>

          <fieldset class="traffic-cushion">
            <legend>Arrival cushion</legend>
            <div class="traffic-cushion__options">
              {CUSHION_OPTIONS.map((minutes) => (
                <button
                  aria-label={minutes === 0 ? 'No arrival cushion' : `${minutes} minute arrival cushion`}
                  aria-pressed={cushionMinutes === minutes}
                  key={minutes}
                  onClick={() => onCushionMinutesChange(minutes)}
                  type="button"
                >
                  {minutes === 0 ? 'None' : `${minutes} min`}
                </button>
              ))}
            </div>
          </fieldset>

          {configurationMissing ? (
            <div class="traffic-configuration" role="status">
              <strong>Traffic setup needed</strong>
              <p>{configurationMessage}</p>
            </div>
          ) : null}

          {errorMessage ? <p class="traffic-message traffic-message--error" role="alert">{errorMessage}</p> : null}

          <button class="traffic-calculate" disabled={!canCalculate} type="submit">
            {status === 'refreshing' ? <RefreshIcon /> : <TrafficIcon />}
            <span>{calculateLabel}</span>
          </button>
        </form>

        <section class="traffic-results traffic-card" aria-labelledby="traffic-results-title">
          <div class="traffic-card__heading">
            <span class="eyebrow">Live route</span>
            <h2 id="traffic-results-title">Your leave time</h2>
          </div>

          {plan ? (
            <>
              <div class="traffic-leave-time" aria-live="polite">
                <span>{planLeaveNow ? 'Leave' : 'Leave by'}</span>
                <strong>{planLeaveNow ? 'Now' : formatTime(plan.leaveBy)}</strong>
              </div>

              <dl class="traffic-route-details">
                <div>
                  <dt>Drive time</dt>
                  <dd>{formatDuration(plan.durationSeconds)}</dd>
                </div>
                <div>
                  <dt>Traffic delay</dt>
                  <dd>{formatTrafficDelay(plan.durationSeconds, plan.staticDurationSeconds)}</dd>
                </div>
                <div>
                  <dt>Expected home</dt>
                  <dd>{formatTime(plan.predictedArrivalTime)}</dd>
                </div>
              </dl>

              {mapUrl ? (
                <figure class="traffic-map">
                  <img
                    alt="Google Maps route from your starting point to home"
                    decoding="async"
                    referrerPolicy="origin"
                    src={mapUrl}
                  />
                  <figcaption>
                    Route map by{' '}
                    <a href="https://www.google.com/maps" rel="noreferrer" target="_blank">
                      Google Maps
                    </a>
                  </figcaption>
                </figure>
              ) : null}

              <p class="traffic-updated">
                Updated {formatTime(plan.fetchedAt)}
                {status === 'refreshing' ? ' · Refreshing traffic…' : ''}
              </p>
            </>
          ) : (
            <div class="traffic-empty" aria-live="polite" role="status">
              <TrafficIcon />
              <strong>{isBusy ? calculateLabel : 'Your route will appear here.'}</strong>
              <p>
                {isBusy
                  ? 'Chillax is finding the best time to leave.'
                  : 'Add your destination and arrival time, then calculate using current traffic.'}
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
