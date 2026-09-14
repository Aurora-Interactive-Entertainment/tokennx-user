import { readFile, readdir, stat } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'

// 构建完成后校验发布目录，尽早发现“HTML 已更新但引用资源没上传”的不完整产物。
const DIST_DIR = resolve(process.argv[2] ?? 'dist')
const failures = []
const checked = new Set()

async function existsFile(relativePath) {
  const normalized = relativePath.replaceAll('\\', '/')
  if (!normalized || normalized.startsWith('../') || normalized.includes('/../')) {
    failures.push(`非法资源路径：${relativePath}`)
    return false
  }

  const absolutePath = resolve(DIST_DIR, normalized)
  const rootPrefix = DIST_DIR.endsWith(sep) ? DIST_DIR : `${DIST_DIR}${sep}`
  if (absolutePath !== DIST_DIR && !absolutePath.startsWith(rootPrefix)) {
    failures.push(`资源路径越过发布目录：${relativePath}`)
    return false
  }
  if (checked.has(absolutePath)) return true
  checked.add(absolutePath)

  try {
    const metadata = await stat(absolutePath)
    if (!metadata.isFile()) {
      failures.push(`资源不是文件：${relativePath}`)
      return false
    }
    return true
  } catch {
    failures.push(`发布目录缺少资源：${relativePath}`)
    return false
  }
}

async function htmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...await htmlFiles(path))
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) {
      files.push(path)
    }
  }
  return files
}

function localAssetReferences(text) {
  const references = new Set()
  // 只接受以 /assets/ 开头的同源 URL，避免把 /api/homepage/assets/... 当成前端文件。
  const pattern = /["'`()\s]((?:\/assets\/)[^"'`()\s<>]+)/g
  for (const match of text.matchAll(pattern)) {
    const value = match[1].split(/[?#]/, 1)[0].replace(/[),;]+$/, '')
    if (value) references.add(value)
  }
  return references
}

async function verifyHtmlReferences() {
  let files
  try {
    files = await htmlFiles(DIST_DIR)
  } catch {
    failures.push(`找不到发布目录或无法读取：${DIST_DIR}`)
    return
  }

  if (!files.some((file) => file.toLowerCase() === join(DIST_DIR, 'index.html').toLowerCase())) {
    failures.push('发布目录缺少 index.html')
  }

  for (const file of files) {
    const content = await readFile(file, 'utf8')
    for (const reference of localAssetReferences(content)) {
      await existsFile(reference.slice(1))
    }
  }
}

async function verifyManifest() {
  const manifestPath = join(DIST_DIR, '.vite', 'manifest.json')
  let manifest
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  } catch {
    failures.push('发布目录缺少可解析的 .vite/manifest.json')
    return
  }

  const manifestReferences = new Set()
  const visit = (value, key = '') => {
    if (typeof value === 'string') {
      if (key === 'file' || key === 'css' || key === 'assets') {
        const normalized = value.replace(/^\/+/, '')
        if (normalized.startsWith('assets/')) manifestReferences.add(normalized)
      }
      return
    }
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) {
      value.forEach((child) => visit(child, key))
      return
    }
    for (const [childKey, child] of Object.entries(value)) visit(child, childKey)
  }
  visit(manifest)
  await Promise.all([...manifestReferences].map((reference) => existsFile(reference)))
}

async function verifyVersion() {
  try {
    const payload = JSON.parse(await readFile(join(DIST_DIR, 'version.json'), 'utf8'))
    if (!payload || typeof payload.version !== 'string' || !payload.version.trim()) {
      failures.push('version.json 缺少有效 version')
    }
  } catch {
    failures.push('发布目录缺少可解析的 version.json')
  }
}

await verifyHtmlReferences()
await verifyManifest()
await verifyVersion()

if (failures.length > 0) {
  console.error('静态发布产物校验失败：')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exitCode = 1
} else {
  console.log(`静态发布产物校验通过：${DIST_DIR}（${checked.size} 个文件）`)
}
