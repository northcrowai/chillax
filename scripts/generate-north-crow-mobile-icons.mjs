import path from 'node:path'
import sharp from 'sharp'

const outputDir = path.resolve('public')
const markPath = path.join(outputDir, 'north-crow-color-no-words.png')
const background = '#ffffff'

const outputs = [
  { name: 'north-crow-app-icon-192-white.png', size: 192, markScale: 0.68 },
  { name: 'north-crow-app-icon-512-white.png', size: 512, markScale: 0.68 },
  // Android launchers can crop heavily around a maskable icon's edges.
  { name: 'north-crow-app-icon-maskable-512-white.png', size: 512, markScale: 0.60 },
  { name: 'north-crow-app-icon-apple-touch-white.png', size: 180, markScale: 0.68 },
  { name: 'north-crow-favicon-16-white.png', size: 16, markScale: 0.78 },
  { name: 'north-crow-favicon-32-white.png', size: 32, markScale: 0.78 },
]

const createIcon = async ({ name, size, markScale }) => {
  const markSize = Math.round(size * markScale)
  const mark = await sharp(markPath)
    .resize({
      width: markSize,
      height: markSize,
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      withoutEnlargement: false,
    })
    .png()
    .toBuffer()

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background,
    },
  })
    .composite([{ input: mark, gravity: 'centre' }])
    .png()
    .toFile(path.join(outputDir, name))
}

await Promise.all(outputs.map(createIcon))
console.log(`Generated ${outputs.length} padded North Crow mobile icons.`)
