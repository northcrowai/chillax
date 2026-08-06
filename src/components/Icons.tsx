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

export function LeafMark(props: IconProps) {
  return (
    <svg {...iconProps} {...props} viewBox="0 0 32 32">
      <path
        d="M5.5 18.4C9.1 8.9 22.3 6.1 27 11.2c-5.1 1.3-8.7 4.9-10.5 10.7-4 .6-8.3-.6-11-3.5Z"
        fill="currentColor"
      />
      <path d="M8.6 23.2c4.6-5.6 9.7-9.1 16.3-11" stroke="white" stroke-linecap="round" stroke-width="1.8" />
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
      <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8" />
      <path d="M12 3.8v2M12 18.2v2M3.8 12h2M18.2 12h2M6.2 6.2l1.4 1.4M16.4 16.4l1.4 1.4M17.8 6.2l-1.4 1.4M7.6 16.4l-1.4 1.4" stroke="currentColor" stroke-linecap="round" stroke-width="1.8" />
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
