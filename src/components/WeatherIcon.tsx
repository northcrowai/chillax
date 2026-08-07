import type { WeatherConditionKind } from '../lib/weather'

interface WeatherIconProps {
  class?: string
  isDay?: boolean
  kind: WeatherConditionKind
}

const renderCloud = () => (
  <path
    d="M8.2 18.2h8.9a3.6 3.6 0 0 0 .5-7.1 5.5 5.5 0 0 0-10.5-1 4.1 4.1 0 0 0 1.1 8.1Z"
    fill="currentColor"
    opacity="0.92"
  />
)

export function WeatherIcon({ class: className, isDay = true, kind }: WeatherIconProps) {
  if (kind === 'clear') {
    return (
      <svg aria-hidden="true" class={className} focusable="false" viewBox="0 0 24 24">
        {isDay ? (
          <>
            <circle cx="12" cy="12" fill="currentColor" r="4.2" />
            <path
              d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-width="1.6"
            />
          </>
        ) : (
          <path
            d="M19.3 15.6A7.8 7.8 0 0 1 8.4 4.8a7.8 7.8 0 1 0 10.9 10.8Z"
            fill="currentColor"
          />
        )}
      </svg>
    )
  }

  if (kind === 'fog') {
    return (
      <svg aria-hidden="true" class={className} focusable="false" viewBox="0 0 24 24">
        {renderCloud()}
        <path
          d="M5 19.5h13M7 22h10"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-width="1.5"
        />
      </svg>
    )
  }

  if (kind === 'storm') {
    return (
      <svg aria-hidden="true" class={className} focusable="false" viewBox="0 0 24 24">
        {renderCloud()}
        <path d="m12.2 17-2.1 4h2.2l-1 2.5 4-4.9H13l1.2-1.6Z" fill="currentColor" />
      </svg>
    )
  }

  if (kind === 'snow') {
    return (
      <svg aria-hidden="true" class={className} focusable="false" viewBox="0 0 24 24">
        {renderCloud()}
        <path
          d="M8 19v3M6.7 19.8l2.6 1.4M9.3 19.8l-2.6 1.4M16 19v3M14.7 19.8l2.6 1.4M17.3 19.8l-2.6 1.4"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-width="1.1"
        />
      </svg>
    )
  }

  if (kind === 'rain' || kind === 'drizzle') {
    return (
      <svg aria-hidden="true" class={className} focusable="false" viewBox="0 0 24 24">
        {renderCloud()}
        <path
          d={kind === 'drizzle' ? 'M8 20v1M12 20v1M16 20v1' : 'm8.5 20-.7 1.5M12.5 20l-.7 1.5M16.5 20l-.7 1.5'}
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-width="1.6"
        />
      </svg>
    )
  }

  return (
    <svg aria-hidden="true" class={className} focusable="false" viewBox="0 0 24 24">
      {kind === 'partly-cloudy' ? (
        <circle cx="8" cy="8" fill="currentColor" opacity="0.55" r="3.6" />
      ) : null}
      {renderCloud()}
    </svg>
  )
}
