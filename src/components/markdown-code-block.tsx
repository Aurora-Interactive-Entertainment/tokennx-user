import { useEffect, useId, useState } from 'react'
import { Toast } from '@douyinfe/semi-ui'
import { Highlight, type Language, type PrismTheme } from 'prism-react-renderer'
import { useTranslation } from 'react-i18next'
import { useResolvedTheme } from '@/theme'
import { Prism } from '@/prism-languages'
import '@/markdown-code-block.css'

export interface MarkdownCodeVariant {
  code: string
  language: string
}

const LANGUAGE_LABELS: Record<string, string> = {
  bash: 'Shell',
  csharp: 'C#',
  css: 'CSS',
  curl: 'cURL',
  go: 'Go',
  html: 'HTML',
  javascript: 'JavaScript',
  js: 'JavaScript',
  json: 'JSON',
  jsx: 'JSX',
  markdown: 'Markdown',
  md: 'Markdown',
  nxconfig: 'Text',
  python: 'Python',
  py: 'Python',
  shell: 'Shell',
  sh: 'Shell',
  sql: 'SQL',
  text: 'Text',
  ts: 'TypeScript',
  tsx: 'TSX',
  typescript: 'TypeScript',
  xml: 'XML',
  yaml: 'YAML',
  yml: 'YAML',
}

const PRISM_LANGUAGE_ALIASES: Record<string, Language> = {
  csharp: 'csharp',
  curl: 'bash',
  html: 'markup',
  js: 'javascript',
  md: 'markdown',
  py: 'python',
  shell: 'bash',
  sh: 'bash',
  text: 'plain',
  ts: 'typescript',
  yml: 'yaml',
}

const LIGHT_DOCS_CODE_THEME: PrismTheme = {
  plain: { color: '#24292f', backgroundColor: 'transparent' },
  styles: [
    { types: ['comment', 'prolog', 'doctype', 'cdata'], style: { color: '#6e7781', fontStyle: 'italic' } },
    { types: ['punctuation'], style: { color: '#57606a' } },
    { types: ['property', 'tag', 'constant', 'symbol', 'deleted'], style: { color: '#0550ae' } },
    { types: ['boolean', 'number'], style: { color: '#b35c00' } },
    { types: ['selector', 'attr-name', 'string', 'char', 'builtin', 'inserted'], style: { color: '#0a7b5c' } },
    { types: ['operator', 'entity', 'url', 'variable', 'parameter'], style: { color: '#8a4600' } },
    { types: ['atrule', 'keyword'], style: { color: '#8250df' } },
    { types: ['function', 'class-name'], style: { color: '#6f42c1' } },
    { types: ['regex', 'important'], style: { color: '#b35900' } },
  ],
}

const DARK_DOCS_CODE_THEME: PrismTheme = {
  plain: { color: '#d7dde5', backgroundColor: 'transparent' },
  styles: [
    { types: ['comment', 'prolog', 'doctype', 'cdata'], style: { color: '#7d8590', fontStyle: 'italic' } },
    { types: ['punctuation'], style: { color: '#adbac7' } },
    { types: ['property', 'tag', 'constant', 'symbol', 'deleted'], style: { color: '#6cb6ff' } },
    { types: ['boolean', 'number'], style: { color: '#f69d50' } },
    { types: ['selector', 'attr-name', 'string', 'char', 'builtin', 'inserted'], style: { color: '#8ddb8c' } },
    { types: ['operator', 'entity', 'url', 'variable', 'parameter'], style: { color: '#f0b72f' } },
    { types: ['atrule', 'keyword'], style: { color: '#c690e7' } },
    { types: ['function', 'class-name'], style: { color: '#dcbdfb' } },
    { types: ['regex', 'important'], style: { color: '#f69d50' } },
  ],
}

function normalizedLanguage(language: string): Language {
  const normalized = language.trim().toLowerCase() || 'text'
  return PRISM_LANGUAGE_ALIASES[normalized] ?? normalized as Language
}

function isGenericLanguage(language: string): boolean {
  return ['', 'plain', 'text'].includes(language.trim().toLowerCase())
}

// 中文：后端有时只返回 Text 代码块，根据内容推断语法；无法归类时使用通用配置高亮，避免整块单色。
function inferredHighlightLanguage(language: string, code: string): Language {
  if (!isGenericLanguage(language)) return normalizedLanguage(language)

  const trimmed = code.trim()
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      JSON.parse(trimmed)
      return 'json'
    } catch {
      // 中文：不是合法 JSON 时继续检查其他语言特征，避免错误高亮。
    }
  }
  if (/^(?:\$\s*)?(?:curl|wget|git|npm|pnpm|yarn|pip|docker|kubectl)\b/m.test(trimmed)) return 'bash'
  if (/^(?:const|let|var|function)\s+\w+|=>|\bconsole\.(?:log|error|warn)\s*\(/m.test(trimmed)) return 'javascript'
  if (/^(?:from\s+\w+|import\s+\w+)|^\s*(?:async\s+def|def|class|print)\b|^\s*\w+\s*=\s*\w+(?:\.\w+)+\s*\(/m.test(trimmed)) return 'python'
  if (/^\s*(?:select\b.+\bfrom|insert\s+into|update\b.+\bset|delete\s+from|create\s+table)\b/im.test(trimmed)) return 'sql'
  if (/^\s*<\/?[a-z][^>]*>/im.test(trimmed)) return 'markup'
  if (/[^{}]+\{[^{}]*[\w-]+\s*:\s*[^{}]+\}/s.test(trimmed)) return 'css'
  if (/^(?:---\s*$)?(?:\s*[\w.-]+\s*:\s*.+$){2,}/m.test(trimmed)) return 'yaml'
  return 'nxconfig' as Language
}

function codeLanguageLabel(variant: MarkdownCodeVariant): string {
  const inferredLanguage = inferredHighlightLanguage(variant.language, variant.code)
  return languageLabel(isGenericLanguage(variant.language) && inferredLanguage !== 'nxconfig' ? inferredLanguage : variant.language)
}

function languageLabel(language: string): string {
  const normalized = language.trim().toLowerCase() || 'text'
  return LANGUAGE_LABELS[normalized] ?? (language || 'Text')
}

export function MarkdownCodeBlock({ variants }: { variants: MarkdownCodeVariant[] }) {
  const { t } = useTranslation()
  const theme = useResolvedTheme()
  const tabId = useId()
  const [activeIndex, setActiveIndex] = useState(0)
  const safeVariants = variants.length ? variants : [{ code: '', language: 'text' }]
  const activeVariant = safeVariants[Math.min(activeIndex, safeVariants.length - 1)] ?? safeVariants[0]
  const activeLanguage = inferredHighlightLanguage(activeVariant.language, activeVariant.code)

  useEffect(() => { setActiveIndex(0) }, [variants])

  async function copyCode(): Promise<void> {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(activeVariant.code)
      Toast.success(t('public.docs.manuscript.copyCodeSuccess'))
    } catch {
      Toast.error(t('public.docs.manuscript.copyUnsupported'))
    }
  }

  return <section className="markdown-code-reader">
    <header className="markdown-code-reader-header">
      {safeVariants.length > 1 ? <div className="markdown-code-reader-tabs" role="tablist" aria-label={t('public.docs.manuscript.codeLanguages')}>
        {safeVariants.map((variant, index) => <button id={`${tabId}-tab-${index}`} className={activeIndex === index ? 'is-active' : ''} type="button" role="tab" aria-selected={activeIndex === index} aria-controls={`${tabId}-panel`} key={`${variant.language}-${index}`} onClick={() => setActiveIndex(index)}>{codeLanguageLabel(variant)}</button>)}
      </div> : <span className="markdown-code-reader-language">{codeLanguageLabel(activeVariant)}</span>}
      <button className="markdown-code-reader-copy" type="button" aria-label={t('public.docs.manuscript.copyCode')} title={t('public.docs.manuscript.copyCode')} onClick={() => void copyCode()}><span className="markdown-code-reader-copy-icon" aria-hidden="true" /></button>
    </header>
    <div className="markdown-code-reader-scroll" id={`${tabId}-panel`} role="tabpanel" aria-labelledby={safeVariants.length > 1 ? `${tabId}-tab-${activeIndex}` : undefined}>
      <Highlight prism={Prism} code={activeVariant.code.replace(/\n$/, '')} language={activeLanguage} theme={theme === 'light' ? LIGHT_DOCS_CODE_THEME : DARK_DOCS_CODE_THEME}>
        {({ className, style, tokens, getLineProps, getTokenProps }) => <pre className={className} style={{ ...style, background: 'transparent' }}><code>{tokens.map((line, lineIndex) => {
          const lineProps = getLineProps({ line })
          return <span {...lineProps} className={`markdown-code-reader-line${lineProps.className ? ` ${lineProps.className}` : ''}`} key={lineIndex}><span className="markdown-code-reader-line-number" aria-hidden="true">{lineIndex + 1}</span><span className="markdown-code-reader-line-content">{line.map((token, tokenIndex) => {
            const tokenProps = getTokenProps({ token })
            return <span {...tokenProps} key={tokenIndex} />
          })}</span></span>
        })}</code></pre>}
      </Highlight>
    </div>
  </section>
}
