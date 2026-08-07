import { useEffect, useState } from 'preact/hooks'

export interface LeaveByClockProps {
  departureTime: string | null
  expiresAt?: string | null
  leaveNow?: boolean
}

const formatTime = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null

  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

const parseTimestamp = (value: string | null | undefined) => {
  if (!value) return null
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : null
}

export function LeaveByClock({
  departureTime,
  expiresAt = null,
  leaveNow = false,
}: LeaveByClockProps) {
  const [currentTime, setCurrentTime] = useState(() => Date.now())

  useEffect(() => {
    if (!departureTime && !expiresAt) return
    const updateTime = () => setCurrentTime(Date.now())
    updateTime()
    const intervalId = window.setInterval(updateTime, 30_000)
    return () => window.clearInterval(intervalId)
  }, [departureTime, expiresAt])

  const departureTimestamp = parseTimestamp(departureTime)
  const expirationTimestamp = parseTimestamp(expiresAt)
  const formattedTime = departureTime ? formatTime(departureTime) : null
  const hasExpired = expirationTimestamp !== null && currentTime >= expirationTimestamp
  const shouldLeaveNow = leaveNow
    || (departureTimestamp !== null && currentTime >= departureTimestamp)
  if (hasExpired || (!shouldLeaveNow && !formattedTime)) return null

  const value = shouldLeaveNow ? 'Now' : formattedTime
  const announcement = shouldLeaveNow
    ? 'Traffic reminder: leave now'
    : `Traffic reminder: leave by ${value}`

  return (
    <aside
      aria-label={announcement}
      aria-live="polite"
      class="leave-by-clock leave-by-clock--header"
      role="status"
    >
      <span class="leave-by-clock__label">{shouldLeaveNow ? 'Leave' : 'Leave by'}</span>
      <strong class="leave-by-clock__time">{value}</strong>
    </aside>
  )
}
