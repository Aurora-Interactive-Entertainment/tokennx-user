import { Prism } from 'prism-react-renderer'

// 中文：项目内置轻量 Shell 语法，避免动态 Prism 扩展与 Vite 依赖预构建互相影响。
Prism.languages.bash = {
  comment: { pattern: /(^|[^\\])#.*/, lookbehind: true },
  string: [
    { pattern: /"(?:\\.|[^"\\])*"/, greedy: true, inside: { variable: /\$(?:[A-Z_][A-Z0-9_]*|\{[^}]+\})/i } },
    { pattern: /'(?:[^']|'')*'/, greedy: true },
  ],
  function: /\b(?:curl|wget|git|npm|pnpm|yarn|pip|docker|kubectl)\b/,
  parameter: { pattern: /(^|\s)-{1,2}[\w-]+/, lookbehind: true, alias: 'variable' },
  variable: /\$(?:[A-Z_][A-Z0-9_]*|\{[^}]+\})/i,
  keyword: /\b(?:case|do|done|elif|else|esac|fi|for|function|if|in|then|until|while)\b/,
  number: /\b\d+(?:\.\d+)?\b/,
  operator: /&&?|\|\|?|[<>]=?|=/,
  punctuation: /[()[\]{},;\\]/,
}
Prism.languages.shell = Prism.languages.bash
Prism.languages.sh = Prism.languages.bash

// 中文：纯文本配置也按 URL、请求头、变量和值着色，保证所有代码示例都有清晰层次。
Prism.languages.nxconfig = {
  comment: /(^|\s)#[^\r\n]*/,
  url: { pattern: /https?:\/\/[^\s"']+/, greedy: true },
  property: /^[A-Za-z][\w-]*(?=\s*:)/m,
  keyword: /\b(?:Authorization|Bearer|Content-Type|api-key|model|messages|max_tokens|role|content)\b/i,
  string: { pattern: /([:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,]+)/, lookbehind: true },
  variable: /\$[A-Z_][A-Z0-9_]*|\bnx-(?:\.\.\.|[\w-]+)|你的API密钥/g,
  number: /\b\d+(?:\.\d+)?\b/,
  operator: /[:=]/,
  punctuation: /[()[\]{},]/,
}

export { Prism }
