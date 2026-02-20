/**
 * Generates PREVIEW icons so you can see them before applying.
 * - Tray: black inner lines only (line-art style).
 * - App/Dock: white background + colorful brain and pen.
 * Run: node scripts/generate-icon-previews.js
 * Output: public/icon-previews/preview-tray.png, preview-app-dock.png
 */
import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const sourcePath = path.join(root, 'public', 'logo-source.png')
const previewDir = path.join(root, 'public', 'icon-previews')

const W = 1024
const H = 559
const third = Math.floor(W / 3)
const squareSize = Math.min(third, H)
const top = Math.floor((H - squareSize) / 2)

async function main() {
  const source = sharp(sourcePath)
  const meta = await source.metadata()
  if (!meta.width || !meta.height) throw new Error('Invalid source image')

  fs.mkdirSync(previewDir, { recursive: true })

  // ─── 1. Tray: left panel → grayscale → dark lines = black, rest = transparent ───
  const leftGray = await source
    .clone()
    .extract({ left: 0, top, width: squareSize, height: squareSize })
    .resize(44, 44)
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const { data: grayData, info } = leftGray
  const trayPixels = Buffer.alloc(info.width * info.height * 4)
  const threshold = 200
  for (let i = 0; i < grayData.length; i++) {
    const g = grayData[i]
    const isLine = g < threshold
    trayPixels[i * 4] = 0
    trayPixels[i * 4 + 1] = 0
    trayPixels[i * 4 + 2] = 0
    trayPixels[i * 4 + 3] = isLine ? 255 : 0
  }

  const trayPng = await sharp(trayPixels, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer()

  fs.writeFileSync(path.join(previewDir, 'preview-tray.png'), trayPng)
  console.log('Wrote public/icon-previews/preview-tray.png (black lines only)')

  // ─── 2. App/Dock: right panel (colorful brain+pen) on white background ───
  const rightCrop = await source
    .clone()
    .extract({ left: third * 2, top, width: squareSize, height: squareSize })
    .resize(512, 512)
    .png()
    .toBuffer()

  const whiteBg = await sharp({
    create: { width: 512, height: 512, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .png()
    .toBuffer()

  const appDockPng = await sharp(whiteBg)
    .composite([{ input: rightCrop, left: 0, top: 0 }])
    .png()
    .toBuffer()

  fs.writeFileSync(path.join(previewDir, 'preview-app-dock.png'), appDockPng)
  console.log('Wrote public/icon-previews/preview-app-dock.png (white + colorful brain & pen)')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
