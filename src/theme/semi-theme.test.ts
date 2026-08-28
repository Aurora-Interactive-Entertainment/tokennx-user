import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('Semi 主题接入契约', () => {
  it('通过官方 Vite 插件加载独立 SCSS 主题入口', () => {
    const viteConfig = projectFile('vite.config.ts')

    expect(viteConfig).toContain("from '@douyinfe/semi-vite-plugin'")
    expect(viteConfig).toContain('semiTheming({')
    expect(viteConfig).toContain("new URL('./src/theme/semi-theme.scss', import.meta.url)")
  })

  it('固定插件版本并在全局样式后加载运行时主题颜色', () => {
    const packageJson = JSON.parse(projectFile('package.json')) as {
      devDependencies?: Record<string, string>
    }
    const mainEntry = projectFile('src/main.tsx')

    expect(packageJson.devDependencies?.['@douyinfe/semi-vite-plugin']).toBe('2.101.1')
    expect(mainEntry).toContain("import './theme/semi-theme-tokens.css'")
    expect(mainEntry.indexOf("import './theme/semi-theme-tokens.css'"))
      .toBeGreaterThan(mainEntry.indexOf("import './styles.css'"))
  })

  it('只定义颜色主题，不改变 Semi 的排版与组件尺寸', () => {
    const runtimeTheme = projectFile('src/theme/semi-theme-tokens.css')
    const compileTheme = projectFile('src/theme/semi-theme.scss')
    const forbiddenProperties = [
      'font-family:',
      'font-size:',
      'line-height:',
      'letter-spacing:',
      'border-radius:',
      'padding:',
      'margin:',
      'width:',
      'height:',
    ]

    expect(runtimeTheme).toContain("body[theme-mode='light']")
    expect(runtimeTheme).toContain("body[theme-mode='dark']")
    expect(runtimeTheme).toContain('--app-theme-brand:')
    expect(runtimeTheme).toContain('--semi-color-primary:')
    expect(runtimeTheme).not.toMatch(/\.[a-zA-Z0-9_-]*semi-[a-zA-Z0-9_-]*/)
    expect(runtimeTheme).not.toMatch(/\.public(?:[-_][a-zA-Z0-9_-]+)?\b/)
    forbiddenProperties.forEach((property) => {
      expect(runtimeTheme).not.toContain(property)
      expect(compileTheme).not.toContain(property)
    })
  })
})
