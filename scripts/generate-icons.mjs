import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const outputDir = path.resolve('public')
await mkdir(outputDir, { recursive: true })

const iconSvg = ({ size, markScale, rounded = true }) => {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
  <defs>
    <radialGradient id="chillax-orb" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(22 19) rotate(45) scale(50)">
      <stop stop-color="#B8DDCE"/>
      <stop offset=".48" stop-color="#5F9689"/>
      <stop offset="1" stop-color="#254F47"/>
    </radialGradient>
  </defs>
  <rect width="64" height="64" rx="${rounded ? 17 : 0}" fill="#F7F3ED"/>
  <g transform="translate(32 32) scale(${markScale}) translate(-32 -32)">
    <circle cx="32" cy="32" r="27" fill="url(#chillax-orb)"/>
    <path d="M15.5 36.1C21.3 27.9 27.6 26.4 33.1 30.9C38 34.9 42.2 34.6 48.5 26.7" fill="none" stroke="#FFFDF9" stroke-width="4.8" stroke-linecap="round"/>
    <circle cx="23.5" cy="21.4" r="3.2" fill="#FFFDF9" opacity=".46"/>
  </g>
</svg>`
}

const outputs = [
  { name: 'pwa-192x192.png', size: 192, markScale: 0.81 },
  { name: 'pwa-512x512.png', size: 512, markScale: 0.81 },
  { name: 'pwa-maskable-512x512.png', size: 512, markScale: 0.67, rounded: false },
  { name: 'apple-touch-icon.png', size: 180, markScale: 0.76 },
]

await Promise.all(
  outputs.map(({ name, ...options }) =>
    sharp(Buffer.from(iconSvg(options))).png().toFile(path.join(outputDir, name)),
  ),
)

await writeFile(
  path.join(outputDir, 'favicon.svg'),
  `${iconSvg({ size: 64, markScale: 0.9 })}\n`,
  'utf8',
)

console.log(`Generated ${outputs.length} Chillax icons and favicon.svg.`)
