import type { JSX } from 'preact'

type IconProps = Omit<
  JSX.SVGAttributes<SVGSVGElement>,
  'aria-hidden' | 'focusable' | 'viewBox'
>

const iconProps = {
  'aria-hidden': true,
  fill: 'none',
  focusable: 'false',
  viewBox: '0 0 24 24',
} as const

export function ChillaxMark(props: IconProps) {
  return (
    <svg {...iconProps} {...props} viewBox="0 0 64 64">
      <defs>
        <radialGradient
          id="chillax-orb-gradient"
          cx="0"
          cy="0"
          r="1"
          gradientTransform="translate(22 19) rotate(45) scale(50)"
          gradientUnits="userSpaceOnUse"
        >
          <stop stop-color="#b8ddce" />
          <stop offset="0.48" stop-color="#5f9689" />
          <stop offset="1" stop-color="#254f47" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" fill="url(#chillax-orb-gradient)" r="27" />
      <path
        d="M15.5 36.1C21.3 27.9 27.6 26.4 33.1 30.9C38 34.9 42.2 34.6 48.5 26.7"
        fill="none"
        stroke="#fffdf9"
        stroke-linecap="round"
        stroke-width="4.8"
      />
      <circle cx="23.5" cy="21.4" fill="#fffdf9" opacity="0.46" r="3.2" />
    </svg>
  )
}

export function PlayIcon(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <path d="m9 7 8 5-8 5V7Z" fill="currentColor" stroke="currentColor" stroke-linejoin="round" />
    </svg>
  )
}

export function PauseIcon(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M9 7v10M15 7v10" stroke="currentColor" stroke-linecap="round" stroke-width="2.2" />
    </svg>
  )
}

export function ResetIcon(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M7.4 7.7A6.5 6.5 0 1 1 5.5 12" stroke="currentColor" stroke-linecap="round" stroke-width="1.8" />
      <path d="M4.8 6.2v4h4" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" />
    </svg>
  )
}

export function VolumeIcon({ muted = false, ...props }: IconProps & { muted?: boolean }) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M5 10v4h3l4 3V7L8 10H5Z" fill="currentColor" />
      {muted ? (
        <path d="m16 10 4 4m0-4-4 4" stroke="currentColor" stroke-linecap="round" stroke-width="1.7" />
      ) : (
        <path d="M15.5 9.2a4 4 0 0 1 0 5.6M18 7a7 7 0 0 1 0 10" stroke="currentColor" stroke-linecap="round" stroke-width="1.6" />
      )}
    </svg>
  )
}

export function SettingsIcon(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M5 7h6M15 7h4M5 12h2M11 12h8M5 17h8M17 17h2" stroke="currentColor" stroke-linecap="round" stroke-width="1.8" />
      <circle cx="13" cy="7" r="2" stroke="currentColor" stroke-width="1.8" />
      <circle cx="9" cy="12" r="2" stroke="currentColor" stroke-width="1.8" />
      <circle cx="15" cy="17" r="2" stroke="currentColor" stroke-width="1.8" />
    </svg>
  )
}

export function MoonIcon(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <path
        d="M19 15.2A7.5 7.5 0 0 1 8.8 5a7.5 7.5 0 1 0 10.2 10.2Z"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.8"
      />
    </svg>
  )
}

export function SunIcon(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <circle cx="12" cy="12" r="3.6" stroke="currentColor" stroke-width="1.8" />
      <path
        d="M12 2.8v2M12 19.2v2M2.8 12h2M19.2 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M18.5 5.5l-1.4 1.4M6.9 17.1l-1.4 1.4"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-width="1.8"
      />
    </svg>
  )
}

export function InstallIcon(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M12 4v10m0 0 3.5-3.5M12 14l-3.5-3.5M5 17.5v1.2c0 .7.6 1.3 1.3 1.3h11.4c.7 0 1.3-.6 1.3-1.3v-1.2" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" />
    </svg>
  )
}

export function TimerIcon(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <circle cx="12" cy="13" r="7" stroke="currentColor" stroke-width="1.8" />
      <path
        d="M9 3h6M12 6V3M12 10v3.4l2.4 1.5"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.8"
      />
    </svg>
  )
}

export function CloudIcon(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <path
        d="M7.2 18h10.2a4.1 4.1 0 0 0 .7-8.1A6.3 6.3 0 0 0 6 8.6 4.8 4.8 0 0 0 7.2 18Z"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.8"
      />
    </svg>
  )
}

export function TrafficIcon(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <path
        d="M6.5 20 9.4 4M17.5 20 14.6 4M12 5.5v3M12 11v3M12 16.5v2"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.8"
      />
      <path d="M4.5 20h15" stroke="currentColor" stroke-linecap="round" stroke-width="1.8" />
    </svg>
  )
}

export function LocationIcon(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <path
        d="M19 10c0 5-7 10-7 10S5 15 5 10a7 7 0 1 1 14 0Z"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.8"
      />
      <circle cx="12" cy="10" r="2.2" stroke="currentColor" stroke-width="1.8" />
    </svg>
  )
}

export function RefreshIcon(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <path
        d="M18.2 8.1A7 7 0 1 0 19 13"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-width="1.8"
      />
      <path
        d="M18.5 4.8v4h-4"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.8"
      />
    </svg>
  )
}

export function PhotoIcon(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <rect
        height="15"
        rx="2.5"
        stroke="currentColor"
        stroke-width="1.8"
        width="18"
        x="3"
        y="4.5"
      />
      <circle cx="8.3" cy="9.1" r="1.6" fill="currentColor" />
      <path
        d="m4.8 17 4.4-4.2 2.7 2.5 2.9-3 4.4 4.7"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.8"
      />
    </svg>
  )
}

export function HeartIcon({ filled = false, ...props }: IconProps & { filled?: boolean }) {
  return (
    <svg {...iconProps} {...props}>
      <path
        d="M20.8 8.7c0 5.2-8.8 10.1-8.8 10.1S3.2 13.9 3.2 8.7A4.5 4.5 0 0 1 12 7.4a4.5 4.5 0 0 1 8.8 1.3Z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.8"
      />
    </svg>
  )
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <path d="m7 7 10 10M17 7 7 17" stroke="currentColor" stroke-linecap="round" stroke-width="1.8" />
    </svg>
  )
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <path d="m6 12.5 3.5 3.5L18 7.5" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" />
    </svg>
  )
}
