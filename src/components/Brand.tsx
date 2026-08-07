interface BrandProps {
  onNavigateHome?: () => void
}

export function Brand({ onNavigateHome }: BrandProps) {
  return (
    <a
      class="brand"
      href={import.meta.env.BASE_URL}
      aria-label="North Crow home"
      onClick={(event) => {
        if (!onNavigateHome) return
        event.preventDefault()
        onNavigateHome()
      }}
    >
      <span class="brand__logo" aria-hidden="true">
        <img alt="" class="brand__logo-full brand__logo-full--light" src={assetPath('/north-crow-horizontal-logo-dark.png')} />
        <img alt="" class="brand__logo-full brand__logo-full--dark" src={assetPath('/north-crow-horizontal-logo-white.png')} />
        <img alt="" class="brand__logo-mark brand__logo-mark--light" src={assetPath('/north-crow-color-no-words.png')} />
        <img alt="" class="brand__logo-mark brand__logo-mark--dark" src={assetPath('/north-crow-white-no-words.png')} />
      </span>
    </a>
  )
}
import { assetPath } from '../lib/assets'
