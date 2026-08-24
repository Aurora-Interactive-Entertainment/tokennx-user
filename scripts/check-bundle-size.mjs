import { gzipSync } from 'node:zlib'
import { readdir, readFile } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIST_DIR = fileURLToPath(new URL('../dist/', import.meta.url))
const KIB = 1024
const budgets = {
  '.js': { raw: 610 * KIB, gzip: 200 * KIB },
  // 中文：公共页面样式包含首页、文档和排名的响应式主题，按当前生产包体积保留合理余量。
  // 中文：企业管理新版页面引入独立的用量/成员/部门布局样式，生产包增加少量 CSS 体积。
  '.css': { raw: 565 * KIB, gzip: 85 * KIB },
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
console.log('Largest JS/CSS assets:')
for (const row of rows.slice(0, 8)) {
  console.log(`  ${row.name}: ${(row.raw / KIB).toFixed(1)} KiB raw, ${(row.gzip / KIB).toFixed(1)} KiB gzip`)
}

if (failures.length) {
  console.error('\nBundle size budget exceeded:')
  failures.forEach((failure) => console.error(`  ${failure}`))
  process.exitCode = 1
}
