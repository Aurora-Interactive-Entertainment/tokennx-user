import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const typographyCss = readFileSync(new URL('src/console-custom-typography.css', `file://${process.cwd().replace(/\\/g, '/')}/`), 'utf8')
const mainSource = readFileSync(new URL('src/main.tsx', `file://${process.cwd().replace(/\\/g, '/')}/`), 'utf8')

describe('后台自研字体样式作用域', () => {
  it('通过独立入口加载，并且不覆盖 Semi UI 或公开页面', () => {
    expect(mainSource).toContain("import './console-custom-typography.css'")
    expect(typographyCss).toContain('.console-page')
    expect(typographyCss).toContain('ui-sans-serif')
    expect(typographyCss).toContain('SF Pro Text')
    expect(typographyCss).not.toMatch(/\.semi-[^{]*\{[^}]*font-family/i)
    expect(typographyCss).not.toMatch(/(?:^|[\s,])(?:body|html|\.console-frame|\.public-main)\b[^{}]*\{[^}]*font-family/i)
    expect(typographyCss).not.toMatch(/\.public(?:-|\b)[^{]*\{[^}]*font-family/i)

    const fontRuleSelectors = [...typographyCss.matchAll(/([^{}]+)\{[^{}]*font-family\s*:/g)].map((match) => match[1])
    expect(fontRuleSelectors.length).toBeGreaterThan(0)
    expect(fontRuleSelectors.every((selector) => selector.includes('.console-page'))).toBe(true)
  })
})
