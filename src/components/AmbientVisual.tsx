import type { PresetId } from '../types'

interface AmbientVisualProps {
  isPlaying: boolean
  preset: PresetId
}

export function AmbientVisual({ isPlaying, preset }: AmbientVisualProps) {
  return (
    <div
      aria-hidden="true"
      class={`ambient-visual ambient-visual--${preset}${isPlaying ? ' is-playing' : ''}`}
    >
      <span class="ambient-visual__halo ambient-visual__halo--outer" />
      <span class="ambient-visual__halo ambient-visual__halo--middle" />
      <span class="ambient-visual__core">
        <span class="ambient-visual__grain" />
      </span>
      <span class="ambient-visual__leaf ambient-visual__leaf--one" />
      <span class="ambient-visual__leaf ambient-visual__leaf--two" />
    </div>
  )
}
