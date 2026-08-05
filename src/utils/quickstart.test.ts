import { describe, expect, it } from 'vitest'
import { MODEL_API_BASE_URL } from '@/api/http'
import { QUICKSTART_API_BASE_URL, normalizeQuickstartLanguage, normalizeQuickstartProtocol, quickstartCodeSample } from './quickstart'

describe('快速接入代码样例', () => {
  it('使用模型运行时共用的配置 Base URL', () => {
    expect(QUICKSTART_API_BASE_URL).toBe(MODEL_API_BASE_URL)
    expect(QUICKSTART_API_BASE_URL).toMatch(/\/v1$/)
    expect(QUICKSTART_API_BASE_URL).not.toContain('.invalid')
  })

  it('归一化未知的协议和语言参数', () => {
    expect(normalizeQuickstartProtocol(null)).toBe('openai')
    expect(normalizeQuickstartProtocol('unsupported')).toBe('openai')
    expect(normalizeQuickstartLanguage(null)).toBe('python')
    expect(normalizeQuickstartLanguage('unsupported')).toBe('python')
  })

  it('生成 OpenAI 三种语言的可执行请求地址', () => {
    const endpoint = 'https://gateway.example.com/v1/'
    const cases = [
      ['python', 'base_url="https://gateway.example.com/v1"'],
      ['node', 'baseURL: "https://gateway.example.com/v1"'],
      ['curl', 'https://gateway.example.com/v1/chat/completions'],
    ] as const

    cases.forEach(([language, expected]) => {
      const sample = quickstartCodeSample({ protocol: 'openai', language, modelAlias: 'deepseek-public', endpoint })
      expect(sample).toContain(expected)
      expect(sample).toContain('deepseek-public')
      expect(sample).not.toContain('/v1/v1')
    })
  })

  it('生成 Claude SDK 和 cURL 的 Messages 地址', () => {
    const endpoint = 'https://gateway.example.com/v1'
    const pythonSample = quickstartCodeSample({ protocol: 'anthropic', language: 'python', modelAlias: 'claude-public', endpoint })
    const nodeSample = quickstartCodeSample({ protocol: 'anthropic', language: 'node', modelAlias: 'claude-public', endpoint })
    const curlSample = quickstartCodeSample({ protocol: 'anthropic', language: 'curl', modelAlias: 'claude-public', endpoint })

    expect(pythonSample).toContain('base_url="https://gateway.example.com"')
    expect(nodeSample).toContain('baseURL: "https://gateway.example.com"')
    expect(curlSample).toContain('https://gateway.example.com/v1/messages')
    expect(pythonSample).toContain('/v1/messages')
    expect(nodeSample).toContain('/v1/messages')
    expect([pythonSample, nodeSample, curlSample].every((sample) => sample.includes('YOUR_TOKEN_NX_API_KEY'))).toBe(true)
  })
})
