import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { isValidBuildVersion, normalizeBuildVersion } from '../../build/build-version'

const fixturePrefix = join(tmpdir(), 'tokennx-release-version-')
let fixtureDirectory: string
let guardSource: string

beforeAll(async () => {
  fixtureDirectory = await mkdtemp(fixturePrefix)
  guardSource = await readFile(resolve('src/runtime/build-version-guard.js'), 'utf8')
  await mkdir(join(fixtureDirectory, '.vite'))
  await mkdir(join(fixtureDirectory, 'og'))
  await Promise.all([
    writeFile(join(fixtureDirectory, '.vite/manifest.json'), '{}'),
    writeFile(join(fixtureDirectory, 'sitemap.xml'), '<urlset><url><loc>https://example.test/</loc></url></urlset>'),
    writeFile(join(fixtureDirectory, 'robots.txt'), 'Sitemap: https://example.test/sitemap.xml'),
    ...['logo.png', 'og/share.png', 'favicon.ico'].map(path => writeFile(join(fixtureDirectory, path), 'fixture')),
  ])
})

afterAll(async () => {
  // 只清理此测试明确创建的临时目录，避免影响其他窗口的构建产物。
  if (fixtureDirectory?.startsWith(fixturePrefix)) await rm(fixtureDirectory, { recursive: true, force: true })
})

async function verifyRelease(version: string) {
  await Promise.all([
    writeFile(join(fixtureDirectory, 'version.json'), JSON.stringify({ version })),
    writeFile(join(fixtureDirectory, 'index.html'), `<meta name="token-nx-build-version" content="${version}"><link rel="canonical" href="https://example.test/"><script>${guardSource}</script>`),
  ])
  // 执行真实发布校验器，确保探针与 HTML 一致时也不会放行守卫无法识别的格式。
  return spawnSync(process.execPath, [resolve('scripts/verify-static-release.mjs'), fixtureDirectory], { encoding: 'utf8' })
}

describe('构建版本与发布校验格式', () => {
  it.each(['.release-20260917', '_release-20260917', '-release-20260917'])('显式版本 %s 稳定规范化并通过发布校验', async input => {
    const version = normalizeBuildVersion(input)
    expect(version).toBe(`build-${input}`)
    expect(normalizeBuildVersion(input)).toBe(version)
    expect(isValidBuildVersion(version)).toBe(true)
    const result = await verifyRelease(version)
    expect(result.status, result.stderr).toBe(0)
  })

  it('保留已有合法版本并在完整长度上限内规范化', () => {
    expect(normalizeBuildVersion('v1.2_release-20260917')).toBe('v1.2_release-20260917')
    expect(normalizeBuildVersion('v'.repeat(160))).toHaveLength(160)
    const version = normalizeBuildVersion(`_${'x'.repeat(200)}`)
    expect(version).toHaveLength(160)
    expect(isValidBuildVersion(version)).toBe(true)
  })

  it.each(['.release', '_release', '-release', 'v'.repeat(161), 'release version', ''])('发布校验拒绝与入口一致但格式非法的版本 %s', async version => {
    const result = await verifyRelease(version)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('version 格式无效')
  })
})
