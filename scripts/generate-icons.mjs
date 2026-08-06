import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const outputDir = path.resolve('public')
await mkdir(outputDir, { recursive: true })

const iconSvg = (size, maskable = false) => {
  const margin = maskable ? Math.round(size * 0.18) : 0
  const canvas = size - margin * 2
  const radius = maskable ? 0 : Math.round(size * 0.27)
  const leafPath = `M ${margin + canvas * 0.2} ${margin + canvas * 0.56} C ${margin + canvas * 0.34} ${margin + canvas * 0.3}, ${margin + canvas * 0.72} ${margin + canvas * 0.2}, ${margin + canvas * 0.82} ${margin + canvas * 0.4} C ${margin + canvas * 0.68} ${margin + canvas * 0.44}, ${margin + canvas * 0.58} ${margin + canvas * 0.58}, ${margin + canvas * 0.5} ${margin + canvas * 0.72} C ${margin + canvas * 0.38} ${margin + canvas * 0.74}, ${margin + canvas * 0.28} ${margin + canvas * 0.68}, ${margin + canvas * 0.2} ${margin + canvas * 0.56} Z`
  const veinPath = `M ${margin + canvas * 0.28} ${margin + canvas * 0.71} C ${margin + canvas * 0.43} ${margin + canvas * 0.53}, ${margin + canvas * 0.59} ${margin + canvas * 0.43}, ${margin + canvas * 0.76} ${margin + canvas * 0.4}`

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop stop-color="#526c61"/>
          <stop offset="1" stop-color="#7785a5"/>
        </linearGradient>
      </defs>
      <rect width="${size}" height="${size}" rx="${radius}" fill="#f3f0e9"/>
      <path d="${leafPath}" fill="url(#g)"/>
      <path d="${veinPath}" fill="none" stroke="#f3f0e9" stroke-width="${Math.max(4, size * 0.055)}" stroke-linecap="round"/>
    </svg>`
}

const outputs = [
  { name: 'pwa-192x192.png', size: 192 },
  { name: 'pwa-512x512.png', size: 512 },
  { name: 'pwa-maskable-512x512.png', size: 512, maskable: true },
  { name: 'apple-touch-icon.png', size: 180 },
]

await Promise.all(
  outputs.map(({ name, size, maskable = false }) =>
    sharp(Buffer.from(iconSvg(size, maskable))).png().toFile(path.join(outputDir, name)),
  ),
)

console.log(`Generated ${outputs.length} Chillax icons.`)
