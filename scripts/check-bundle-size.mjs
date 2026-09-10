import { gzipSync } from 'node:zlib'
import { readdir, readFile } from 'node:fs/promises'
import { extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// 允许检查隔离的生产产物，不覆盖其他开发窗口正在使用的 dist。
const DIST_DIR = process.argv[2] ? resolve(process.argv[2]) : fileURLToPath(new URL('../dist/', import.meta.url))
const KIB = 1024
const budgets = {
  '.js': { raw: 610 * KIB, gzip: 200 * KIB },
  // 公共页面样式包含首页、文档和排名的响应式主题，代码分块后保留少量共享样式余量。
  // 企业管理新版页面引入独立的用量/成员/部门布局样式，生产包增加少量 CSS 体积。
  '.css': { raw: 590 * KIB, gzip: 90 * KIB },
}

// 单文件预算无法防止多个重依赖同时进入首页，额外限制首屏完整静态依赖链。
const homepageBudgets = {
  '.js': { raw: 1400 * KIB, gzip: 440 * KIB },
  '.css': { raw: 800 * KIB, gzip: 120 * KIB },
}

async function assetFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? assetFiles(path) : path
  }))
  return files.flat()
}

const failures = []
const rows = []

for (const file of await assetFiles(DIST_DIR)) {
  const extension = extname(file)
  const budget = budgets[extension]
  if (!budget) continue

  const content = await readFile(file)
  const gzipBytes = gzipSync(content, { level: 9 }).byteLength
  const name = relative(DIST_DIR, file).replaceAll('\\', '/')
  rows.push({ name, raw: content.byteLength, gzip: gzipBytes })

  if (content.byteLength > budget.raw || gzipBytes > budget.gzip) {
    failures.push(`${name}: ${(content.byteLength / KIB).toFixed(1)} KiB raw, ${(gzipBytes / KIB).toFixed(1)} KiB gzip`)
  }
}

rows.sort((left, right) => right.raw - left.raw)

const manifest = JSON.parse(await readFile(join(DIST_DIR, '.vite/manifest.json'), 'utf8'))
const homepageAssets = new Set()
const visitedChunks = new Set()
function visitChunk(key) {
  if (visitedChunks.has(key)) return
  const chunk = manifest[key]
  if (!chunk) throw new Error(`Missing homepage build entry: ${key}`)
  visitedChunks.add(key)
  homepageAssets.add(chunk.file)
  for (const css of chunk.css ?? []) homepageAssets.add(css)
  // 仅追踪静态导入；用户打开弹窗或跳转页面时才需要的动态模块不计入首屏。
  for (const dependency of chunk.imports ?? []) visitChunk(dependency)
}
visitChunk('index.html')
visitChunk('src/pages/home.tsx')
console.log('Homepage initial JS/CSS (excluding images and third-party scripts):')
for (const [extension, budget] of Object.entries(homepageBudgets)) {
  const initialRows = rows.filter((row) => homepageAssets.has(row.name) && extname(row.name) === extension)
  const raw = initialRows.reduce((total, row) => total + row.raw, 0)
  const gzip = initialRows.reduce((total, row) => total + row.gzip, 0)
  const summary = `${extension}: ${(raw / KIB).toFixed(1)} KiB raw, ${(gzip / KIB).toFixed(1)} KiB gzip`
  console.log(`  ${summary}`)
  if (raw > budget.raw || gzip > budget.gzip) failures.push(`Homepage ${summary}`)
}
for (const file of homepageAssets) {
  if (/\/(?:charts|markdown)-vendor[^/]*\.js$/.test(file)) {
    failures.push(`Homepage unexpectedly loads ${file}`)
  }
}

console.log('Largest JS/CSS assets:')
for (const row of rows.slice(0, 8)) {
  console.log(`  ${row.name}: ${(row.raw / KIB).toFixed(1)} KiB raw, ${(row.gzip / KIB).toFixed(1)} KiB gzip`)
}

if (failures.length) {
  console.error('\nBundle size budget exceeded:')
  failures.forEach((failure) => console.error(`  ${failure}`))
  process.exitCode = 1
}
