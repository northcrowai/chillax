import { LeafMark } from './Icons'

export function Brand() {
  return (
    <a class="brand" href="/" aria-label="Chillax home">
      <span class="brand__mark">
        <LeafMark />
      </span>
      <span class="brand__word">Chillax</span>
    </a>
  )
}
