import type { JSX, Ref } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { PauseIcon, PlayIcon, RefreshIcon, TrafficIcon } from './Icons'
import type { TimerStatus } from '../types'

export type ArrivalCushionMinutes = 0 | 5 | 10 | 15

export type TrafficPageStatus = 'idle' | 'locating' | 'loading' | 'refreshing' | 'ready' | 'error'

export interface TrafficPlanView {
  leaveBy: string
  predictedArrivalTime: string
  durationSeconds: number
  staticDurationSeconds: number
  fetchedAt: string
  leaveNow?: boolean
}

export interface TrafficDriveView {
  dayLabel: string
  routeLabel: string
  arrivalLabel: string
  desiredArrival: Date
}

export interface TrafficPageProps {
  configurationMessage?: string
  configurationMissing?: boolean
  cushionMinutes: ArrivalCushionMinutes
  drive: TrafficDriveView
  errorMessage: string | null
  headingRef?: Ref<HTMLHeadingElement>
  homeAddress: string
  homeArrivalTime: string
  isAudioBusy: boolean
  mapUrl: string | null
  onCalculate: () => void | Promise<void>
  onCushionMinutesChange: (value: ArrivalCushionMinutes) => void
  onHomeAddressChange: (value: string) => void
  onHomeArrivalTimeChange: (value: string) => void
  onReturnToFocus: () => void
  onTogglePlayback: () => void
  onWorkAddressChange: (value: string) => void
  onWorkArrivalTimeChange: (value: string) => void
  plan: TrafficPlanView | null
  playbackSessionName: string
  presetName: string
  sessionLabel: string
  status: TrafficPageStatus
  timerDisplay: string
  timerStatus: TimerStatus
  workAddress: string
  workArrivalTime: string
}

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

const formatTime = (value: string | Date) => {
  const date = value instanceof Date ? value : parseDate(value)
  if (!date) return 'Unavailable'
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date)
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
  configurationMessage = 'Traffic needs Google Maps browser keys before routes can be calculated.',
  configurationMissing = false,
  cushionMinutes,
  drive,
  errorMessage,
  headingRef,
  homeAddress,
  homeArrivalTime,
  isAudioBusy,
  mapUrl,
  onCalculate,
  onCushionMinutesChange,
  onHomeAddressChange,
  onHomeArrivalTimeChange,
  onReturnToFocus,
  onTogglePlayback,
  onWorkAddressChange,
  onWorkArrivalTimeChange,
  plan,
  playbackSessionName,
  presetName,
  sessionLabel,
  status,
  timerDisplay,
  timerStatus,
  workAddress,
  workArrivalTime,
}: TrafficPageProps) {
  const [currentTime, setCurrentTime] = useState(() => Date.now())
  const playbackAction = getPlaybackAction(timerStatus, playbackSessionName)
  const isBusy = status === 'locating' || status === 'loading' || status === 'refreshing'
  const canCalculate = !configurationMissing
    && !isBusy
    && homeAddress.trim().length > 0
    && homeArrivalTime.length > 0
    && workAddress.trim().length > 0
    && workArrivalTime.length > 0

  useEffect(() => {
    if (!plan) return
    const updateTime = () => setCurrentTime(Date.now())
    updateTime()
    const intervalId = window.setInterval(updateTime, 30_000)
    return () => window.clearInterval(intervalId)
  }, [plan])

  const handleSubmit = (event: JSX.TargetedSubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (canCalculate) void onCalculate()
  }

  const calculateLabel = status === 'loading'
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
          <h1 id="traffic-page-title" ref={headingRef} tabIndex={-1}>Get there on time.</h1>
          <p>Set your Home and Work schedule once. Chillax chooses the next commute and works backward from live traffic.</p>
        </div>

        <aside class="traffic-session" aria-label="Current Chillax session">
          <div class="traffic-session__topline">
            <span>Your Chillax session</span>
            <span class={`play-state${timerStatus === 'running' ? ' is-active' : ''}`}><i aria-hidden="true" />{getSessionStatus(timerStatus)}</span>
          </div>
          <div class="traffic-session__body"><div><strong>{presetName}</strong><span>{sessionLabel}</span></div><output aria-label={`${timerDisplay} on the Chillax timer`}>{timerDisplay}</output></div>
          <div class="traffic-session__actions">
            <button aria-label={playbackAction.label} class="traffic-session__playback" disabled={isAudioBusy} onClick={onTogglePlayback} type="button">{timerStatus === 'running' ? <PauseIcon /> : <PlayIcon />}<span>{isAudioBusy ? 'Preparing...' : playbackAction.text}</span></button>
            <button class="traffic-session__return" onClick={onReturnToFocus} type="button">Back to focus</button>
          </div>
        </aside>
      </section>

      <div class="traffic-workspace">
        <form class="traffic-form traffic-card" onSubmit={handleSubmit}>
          <div class="traffic-card__heading"><span class="eyebrow">Your schedule</span><h2>Plan each commute</h2></div>

          <div class="traffic-field"><label htmlFor="traffic-home-address">Home address</label><input autoComplete="street-address" id="traffic-home-address" maxLength={200} name="home-address" onInput={(event) => onHomeAddressChange(event.currentTarget.value)} placeholder="Enter your home address" required type="text" value={homeAddress} /><small>Saved only on this device.</small></div>
          <div class="traffic-field"><label htmlFor="traffic-home-arrival">Arrive home by</label><input id="traffic-home-arrival" name="home-arrival" onInput={(event) => onHomeArrivalTimeChange(event.currentTarget.value)} required type="time" value={homeArrivalTime} /></div>
          <div class="traffic-field"><label htmlFor="traffic-work-address">Work address</label><input autoComplete="street-address" id="traffic-work-address" maxLength={200} name="work-address" onInput={(event) => onWorkAddressChange(event.currentTarget.value)} placeholder="Enter your work address" required type="text" value={workAddress} /></div>
          <div class="traffic-field"><label htmlFor="traffic-work-arrival">Arrive at work by</label><input id="traffic-work-arrival" name="work-arrival" onInput={(event) => onWorkArrivalTimeChange(event.currentTarget.value)} required type="time" value={workArrivalTime} /></div>

          <fieldset class="traffic-cushion"><legend>Arrival cushion</legend><div class="traffic-cushion__options">{CUSHION_OPTIONS.map((minutes) => <button aria-label={minutes === 0 ? 'No arrival cushion' : `${minutes} minute arrival cushion`} aria-pressed={cushionMinutes === minutes} key={minutes} onClick={() => onCushionMinutesChange(minutes)} type="button">{minutes === 0 ? 'None' : `${minutes} min`}</button>)}</div></fieldset>
          {configurationMissing ? <div class="traffic-configuration" role="status"><strong>Traffic setup needed</strong><p>{configurationMessage}</p></div> : null}
          {errorMessage ? <p class="traffic-message traffic-message--error" role="alert">{errorMessage}</p> : null}
          <button class="traffic-calculate" disabled={!canCalculate} type="submit">{status === 'refreshing' ? <RefreshIcon /> : <TrafficIcon />}<span>{calculateLabel}</span></button>
        </form>

        <section class="traffic-results traffic-card" aria-labelledby="traffic-results-title">
          <div class="traffic-card__heading"><span class="eyebrow">Today's drive</span><h2 id="traffic-results-title">Your leave time</h2></div>
          <div class="traffic-drive-preview"><strong>{drive.dayLabel} · {drive.routeLabel}</strong><span>{drive.arrivalLabel} by {formatTime(drive.desiredArrival)}</span></div>
          {plan ? <>
            <div class="traffic-leave-time" aria-live="polite"><span>{planLeaveNow ? 'Leave' : 'Leave by'}</span><strong>{planLeaveNow ? 'Now' : formatTime(plan.leaveBy)}</strong></div>
            <dl class="traffic-route-details"><div><dt>Drive time</dt><dd>{formatDuration(plan.durationSeconds)}</dd></div><div><dt>Traffic delay</dt><dd>{formatTrafficDelay(plan.durationSeconds, plan.staticDurationSeconds)}</dd></div><div><dt>Expected arrival</dt><dd>{formatTime(plan.predictedArrivalTime)}</dd></div></dl>
            {mapUrl ? <figure class="traffic-map"><img alt={`Google Maps route: ${drive.routeLabel}`} decoding="async" referrerPolicy="origin" src={mapUrl} /><figcaption>Route map by <a href="https://www.google.com/maps" rel="noreferrer" target="_blank">Google Maps</a></figcaption></figure> : null}
            <p class="traffic-updated">Traffic checked {formatTime(plan.fetchedAt)}. Chillax refreshes close to your departure.</p>
          </> : <div class="traffic-empty" aria-live="polite" role="status"><TrafficIcon /><strong>{isBusy ? calculateLabel : 'Your next commute will appear here.'}</strong><p>{isBusy ? 'Chillax is finding the best time to leave.' : `${drive.dayLabel}: ${drive.routeLabel}. Add both addresses, then calculate using current traffic.`}</p></div>}
        </section>
      </div>
    </main>
  )
}
