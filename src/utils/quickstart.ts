import { MODEL_API_BASE_URL } from '@/api/http'

export type QuickstartProtocol = 'openai' | 'anthropic' | 'gemini'
export type QuickstartLanguage = 'python' | 'node' | 'curl'

const QUICKSTART_PROTOCOLS = new Set<QuickstartProtocol>(['openai', 'anthropic', 'gemini'])
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

  if (protocol === 'anthropic' && language === 'python') {
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

  if (protocol === 'anthropic' && language === 'node') {
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

  if (protocol === 'anthropic') {
    return [
      'curl ' + baseEndpoint + '/messages ' + lineContinuation,
      '  -H "x-api-key: YOUR_TOKEN_NX_API_KEY" ' + lineContinuation,
      '  -H "anthropic-version: 2023-06-01" ' + lineContinuation,
      '  -H "Content-Type: application/json" ' + lineContinuation,
      '  -d \'{"model":"' + modelAlias + '","max_tokens":1024,"messages":[{"role":"user","content":"你好"}]}\'',
    ].join('\n')
  }

  // 中文：Gemini SDK 支持自定义网关地址；这里保留 v1beta 路径并沿用 Token NX 的 Bearer 鉴权。
  const geminiBaseEndpoint = rootEndpoint + '/v1beta'
  const geminiModelEndpoint = geminiBaseEndpoint + '/models/' + modelAlias + ':generateContent'
  if (language === 'python') {
    return [
      'from google import genai',
      'from google.genai import types',
      '',
      'client = genai.Client(',
      '    api_key="YOUR_TOKEN_NX_API_KEY",',
      '    http_options=types.HttpOptions(',
      '        base_url="' + rootEndpoint + '",',
      '        api_version="v1beta",',
      '        headers={"Authorization": "Bearer YOUR_TOKEN_NX_API_KEY"},',
      '    ),',
      ')',
      '',
      'response = client.models.generate_content(',
      '    model="' + modelAlias + '",',
      '    contents="你好",',
      ')',
      'print(response.text)',
    ].join('\n')
  }

  if (language === 'node') {
    return [
      'import { GoogleGenAI } from "@google/genai";',
      '',
      'const client = new GoogleGenAI({',
      '  apiKey: "YOUR_TOKEN_NX_API_KEY",',
      '  apiVersion: "v1beta",',
      '  httpOptions: {',
      '    baseUrl: "' + rootEndpoint + '",',
      '    headers: { Authorization: "Bearer YOUR_TOKEN_NX_API_KEY" }',
      '  }',
      '});',
      '',
      'const response = await client.models.generateContent({',
      '  model: "' + modelAlias + '",',
      '  contents: "你好"',
      '});',
      'console.log(response.text);',
    ].join('\n')
  }

  return [
    'curl -X POST "' + geminiModelEndpoint + '" ' + lineContinuation,
    '  -H "Authorization: Bearer YOUR_TOKEN_NX_API_KEY" ' + lineContinuation,
    '  -H "Content-Type: application/json" ' + lineContinuation,
    '  -d \'{"contents":[{"parts":[{"text":"你好"}]}]}\'',
  ].join('\n')
}
