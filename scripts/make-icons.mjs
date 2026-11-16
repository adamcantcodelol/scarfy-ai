import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'public', 'icons')

const PAPER = [247, 243, 238, 255]
const INK = [33, 29, 25, 255]
const ACCENT = [154, 91, 60, 255]

const crcTable = new Uint32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  crcTable[n] = c >>> 0
}

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii')
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])))
  return Buffer.concat([length, typeBuffer, data, crc])
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc(height * (width * 4 + 1))
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1)
    raw[rowStart] = 0
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function createCanvas(size) {
  const rgba = Buffer.alloc(size * size * 4)
  const set = (x, y, color) => {
    const xi = Math.round(x)
    const yi = Math.round(y)
    if (xi < 0 || yi < 0 || xi >= size || yi >= size) return
    const offset = (yi * size + xi) * 4
    rgba[offset] = color[0]
    rgba[offset + 1] = color[1]
    rgba[offset + 2] = color[2]
    rgba[offset + 3] = color[3]
  }
  const fillRect = (x, y, w, h, color) => {
    for (let yy = Math.floor(y); yy < y + h; yy++) {
      for (let xx = Math.floor(x); xx < x + w; xx++) set(xx, yy, color)
    }
  }
  const fillCircle = (cx, cy, radius, color) => {
    const r2 = radius * radius
    for (let y = Math.floor(cy - radius); y <= cy + radius; y++) {
      for (let x = Math.floor(cx - radius); x <= cx + radius; x++) {
        const dx = x - cx
        const dy = y - cy
        if (dx * dx + dy * dy <= r2) set(x, y, color)
      }
    }
  }
  const fillRing = (cx, cy, outer, inner, color) => {
    const outer2 = outer * outer
    const inner2 = inner * inner
    for (let y = Math.floor(cy - outer); y <= cy + outer; y++) {
      for (let x = Math.floor(cx - outer); x <= cx + outer; x++) {
        const dx = x - cx
        const dy = y - cy
        const d2 = dx * dx + dy * dy
        if (d2 <= outer2 && d2 >= inner2) set(x, y, color)
      }
    }
  }
  const distanceToSegment = (px, py, x1, y1, x2, y2) => {
    const dx = x2 - x1
    const dy = y2 - y1
    const length2 = dx * dx + dy * dy
    let t = length2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / length2
    t = Math.max(0, Math.min(1, t))
    const x = x1 + t * dx
    const y = y1 + t * dy
    return Math.hypot(px - x, py - y)
  }
  const strokeSegment = (x1, y1, x2, y2, width, color) => {
    const pad = width / 2 + 1
    const minX = Math.floor(Math.min(x1, x2) - pad)
    const maxX = Math.ceil(Math.max(x1, x2) + pad)
    const minY = Math.floor(Math.min(y1, y2) - pad)
    const maxY = Math.ceil(Math.max(y1, y2) + pad)
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (distanceToSegment(x, y, x1, y1, x2, y2) <= width / 2) set(x, y, color)
      }
    }
  }
  const fillPolygon = (points, color) => {
    const ys = points.map((point) => point[1])
    const minY = Math.floor(Math.min(...ys))
    const maxY = Math.ceil(Math.max(...ys))
    for (let y = minY; y <= maxY; y++) {
      const scanY = y + 0.5
      const xs = []
      for (let i = 0; i < points.length; i++) {
        const [x1, y1] = points[i]
        const [x2, y2] = points[(i + 1) % points.length]
        if ((y1 <= scanY && y2 > scanY) || (y2 <= scanY && y1 > scanY)) {
          xs.push(x1 + ((scanY - y1) / (y2 - y1)) * (x2 - x1))
        }
      }
      xs.sort((a, b) => a - b)
      for (let i = 0; i < xs.length; i += 2) {
        const start = Math.ceil(xs[i] - 0.5)
        const end = Math.floor(xs[i + 1] - 0.5)
        for (let x = start; x <= end; x++) set(x, y, color)
      }
    }
  }
  return { size, rgba, set, fillRect, fillCircle, fillRing, strokeSegment, fillPolygon }
}

function drawIcon(size) {
  const canvas = createCanvas(size)
  canvas.fillRect(0, 0, size, size, PAPER)
  const s = size / 512
  const px = (value) => value * s

  canvas.fillRing(px(256), px(104), px(54), px(32), ACCENT)
  canvas.strokeSegment(px(256), px(150), px(256), px(226), px(22), INK)
  canvas.fillPolygon(
    [
      [px(256), px(214)],
      [px(118), px(292)],
      [px(394), px(292)],
      [px(394), px(338)],
      [px(118), px(338)],
    ],
    INK,
  )
  canvas.fillCircle(px(256), px(214), px(18), ACCENT)
  return canvas.rgba
}

for (const size of [192, 512]) {
  const rgba = drawIcon(size)
  fs.writeFileSync(path.join(outDir, `icon-${size}.png`), encodePng(size, size, rgba))
}
fs.writeFileSync(path.join(outDir, 'icon-maskable-512.png'), encodePng(512, 512, drawIcon(512)))
console.log('Generated PWA icons')
