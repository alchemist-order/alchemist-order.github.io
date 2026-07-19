import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const DIST = path.join(ROOT, 'dist')
const PUBLIC = path.join(ROOT, 'public')
const MAX_DIST = 35 * 1024 * 1024
const MAX_IMAGE = 400 * 1024
const IMAGE_RE = /\.(png|jpe?g|webp|gif)$/i
const EXCEPTIONS = new Map([
  ['public/bg/title.jpg', 500 * 1024],
])

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, files)
    else files.push(full)
  }
  return files
}

function rel(file) {
  return path.relative(ROOT, file).split(path.sep).join('/')
}

const distFiles = walk(DIST)
const distTotal = distFiles.reduce((sum, file) => sum + fs.statSync(file).size, 0)
const distAppTotal = distFiles
  .filter((file) => !rel(file).startsWith('dist/audio/'))
  .reduce((sum, file) => sum + fs.statSync(file).size, 0)
const audioTotal = distTotal - distAppTotal
const failures = []
if (distAppTotal > MAX_DIST) failures.push(`dist app assets ${(distAppTotal / 1024 / 1024).toFixed(1)}MB > 35MB`)

for (const file of walk(PUBLIC)) {
  if (!IMAGE_RE.test(file)) continue
  const r = rel(file)
  if (r.startsWith('public/bg/map/') && r.endsWith('.png')) failures.push(`${r}: bg/map png remains`)
  const max = EXCEPTIONS.get(r) ?? MAX_IMAGE
  const size = fs.statSync(file).size
  if (size > max) failures.push(`${r}: ${(size / 1024).toFixed(0)}KB > ${(max / 1024).toFixed(0)}KB`)
}

if (failures.length) {
  console.error('check_asset_budget failed:')
  for (const f of failures) console.error(`- ${f}`)
  process.exit(1)
}
console.log(`✓ check_asset_budget: app ${(distAppTotal / 1024 / 1024).toFixed(1)}MB, audio ${(audioTotal / 1024 / 1024).toFixed(1)}MB`)
