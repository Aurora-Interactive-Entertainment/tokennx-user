import { MODEL_API_BASE_URL } from '@/api/http'

export type QuickstartProtocol = 'openai' | 'anthropic'
export type QuickstartLanguage = 'python' | 'node' | 'curl'

const QUICKSTART_PROTOCOLS = new Set<QuickstartProtocol>(['openai', 'anthropic'])
const QUICKSTART_LANGUAGES = new Set<QuickstartLanguage>(['python', 'node', 'curl'])

// 中文：代码样例与控制台请求使用同一个后端 Base URL，复制后可以直接复用当前网关。
export const QUICKSTART_API_BASE_URL = MODEL_API_BASE_URL

export function normalizeQuickstartProtocol(value: string | null): QuickstartProtocol {
  return QUICKSTART_PROTOCOLS.has(value as QuickstartProtocol) ? value as QuickstartProtocol : 'openai'
}

export function normalizeQuickstartLanguage(value: string | null): QuickstartLanguage {
  return QUICKSTART_LANGUAGES.has(value as QuickstartLanguage) ? value as QuickstartLanguage : 'python'
}

export function quickstartCodeSample({
  protocol,
  language,
  modelAlias,
  endpoint = QUICKSTART_API_BASE_URL,
}: {
  protocol: QuickstartProtocol
  language: QuickstartLanguage
  modelAlias: string
  endpoint?: string
}): string {
  const baseEndpoint = endpoint.replace(/\/+$/, '')
  const rootEndpoint = baseEndpoint.replace(/\/v1$/i, '')
  const lineContinuation = '\\'

  if (protocol === 'openai' && language === 'python') {
    return [
      'from openai import OpenAI',
      '',
      'client = OpenAI(',
      '    api_key="YOUR_TOKEN_NX_API_KEY",',
      '    base_url="' + baseEndpoint + '"',
      ')',
      '',
      'response = client.chat.completions.create(',
      '    model="' + modelAlias + '",',
      '    messages=[{"role": "user", "content": "你好"}]',
      ')',
      'print(response.choices[0].message.content)',
    ].join('\n')
  }

  if (protocol === 'openai' && language === 'node') {
    return [
      'import OpenAI from "openai";',
      '',
      'const client = new OpenAI({',
      '  apiKey: "YOUR_TOKEN_NX_API_KEY",',
      '  baseURL: "' + baseEndpoint + '"',
      '});',
      '',
      'const response = await client.chat.completions.create({',
      '  model: "' + modelAlias + '",',
      '  messages: [{ role: "user", content: "你好" }]',
      '});',
      'console.log(response.choices[0].message.content);',
    ].join('\n')
  }

  if (protocol === 'openai') {
    return [
      'curl ' + baseEndpoint + '/chat/completions ' + lineContinuation,
      '  -H "Authorization: Bearer YOUR_TOKEN_NX_API_KEY" ' + lineContinuation,
      '  -H "Content-Type: application/json" ' + lineContinuation,
      '  -d \'{"model":"' + modelAlias + '","messages":[{"role":"user","content":"你好"}]}\'',
    ].join('\n')
  }

  if (language === 'python') {
    return [
      'from anthropic import Anthropic',
      '',
      '# Anthropic SDK 会自动请求 /v1/messages。',
      'client = Anthropic(',
      '    api_key="YOUR_TOKEN_NX_API_KEY",',
      '    base_url="' + rootEndpoint + '"',
      ')',
      '',
      'message = client.messages.create(',
      '    model="' + modelAlias + '",',
      '    max_tokens=1024,',
      '    messages=[{"role": "user", "content": "你好"}]',
      ')',
      'print(message.content[0].text)',
    ].join('\n')
  }

  if (language === 'node') {
    return [
      'import Anthropic from "@anthropic-ai/sdk";',
      '',
      '// Anthropic SDK 会自动请求 /v1/messages。',
      'const client = new Anthropic({',
      '  apiKey: "YOUR_TOKEN_NX_API_KEY",',
      '  baseURL: "' + rootEndpoint + '"',
      '});',
      '',
      'const message = await client.messages.create({',
      '  model: "' + modelAlias + '",',
      '  max_tokens: 1024,',
      '  messages: [{ role: "user", content: "你好" }]',
      '});',
      'console.log(message.content[0].text);',
    ].join('\n')
  }

  return [
    'curl ' + baseEndpoint + '/messages ' + lineContinuation,
    '  -H "x-api-key: YOUR_TOKEN_NX_API_KEY" ' + lineContinuation,
    '  -H "anthropic-version: 2023-06-01" ' + lineContinuation,
    '  -H "Content-Type: application/json" ' + lineContinuation,
    '  -d \'{"model":"' + modelAlias + '","max_tokens":1024,"messages":[{"role":"user","content":"你好"}]}\'',
  ].join('\n')
}
