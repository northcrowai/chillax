import { ChillaxMark } from './Icons'

interface BrandProps {
  onNavigateHome?: () => void
}

export function Brand({ onNavigateHome }: BrandProps) {
  return (
    <a
      class="brand"
      href="/"
      aria-label="Chillax home"
      onClick={(event) => {
        if (!onNavigateHome) return
        event.preventDefault()
        onNavigateHome()
      }}
    >
      <span class="brand__mark">
        <ChillaxMark />
      </span>
      <span class="brand__word">Chillax</span>
    </a>
  )
}
