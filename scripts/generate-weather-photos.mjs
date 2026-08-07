import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outputDirectory = path.join(root, 'public', 'weather-photos')

const photos = [
  ['clear-day', '1722068992302-3dd5fab7e06f'],
  ['clouds', '1537633902875-122ee7f93be6'],
  ['rain', '1712323374006-b29d66576909'],
  ['snow', '1608764545005-791b9ec07964'],
  ['storm', '1713799398784-05fb8a3a2ef3'],
  ['fog', '1642954092871-2c4ce0d49914'],
  ['clear-night', '1541400827243-b6744bc55160'],
  ['golden-hour', '1649301379226-19a62316808a'],
]

await mkdir(outputDirectory, { recursive: true })

for (const [name, id] of photos) {
  const source = new URL(`https://images.unsplash.com/photo-${id}`)
  source.searchParams.set('auto', 'format')
  source.searchParams.set('fit', 'crop')
  source.searchParams.set('fm', 'jpg')
  source.searchParams.set('q', '86')
  source.searchParams.set('w', '2400')

  const response = await fetch(source, {
    headers: { 'User-Agent': 'Chillax weather photo asset builder' },
  })
  if (!response.ok) {
    throw new Error(`Could not download ${name}: ${response.status} ${response.statusText}`)
  }

  const input = Buffer.from(await response.arrayBuffer())
  const output = path.join(outputDirectory, `${name}.webp`)
  await sharp(input)
    .resize(1600, 900, { fit: 'cover', position: 'attention' })
    .webp({ effort: 5, quality: 80 })
    .toFile(output)

  console.log(`Generated ${path.relative(root, output)}`)
}
