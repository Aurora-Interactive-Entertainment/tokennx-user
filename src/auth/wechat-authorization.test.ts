import { describe, expect, it } from 'vitest'
import { parseWechatCallbackSearch, parseWechatRedirectUri, readWechatCallback, wechatFrameUrl, WECHAT_CALLBACK_MESSAGE } from './wechat-authorization'
import type { WechatQrResult } from '@/api/auth'

const session: WechatQrResult = {
  app_id: 'wx1234567890abcdef', scope: 'snsapi_login',
  redirect_uri: 'http://localhost/weixin/callback?flow=login&next=%2Fconsole',
  state: 'one-time_state', expires_at: Date.now() + 60000,
}
describe('微信官方参数及回调边界', () => {
  it('读取回调查询参数并拒绝缺失或非法 state', () => {
    expect(parseWechatCallbackSearch('?code=wechat-code&state=one-time_state')).toEqual({ code: 'wechat-code', state: 'one-time_state' })
    expect(parseWechatCallbackSearch('?code=&state=one-time_state')).toBeNull()
    expect(parseWechatCallbackSearch('?code=wechat-code&state=state%20with%20space')).toBeNull()
    expect(parseWechatCallbackSearch(`?code=${'x'.repeat(513)}&state=valid`)).toBeNull()
  })

  it('只编码一次回调地址，保留后端参数并启用内嵌快捷登录', () => {
    const url = new URL(wechatFrameUrl(session, 'dark', 'en-US'))
    expect(url.origin).toBe('https://open.weixin.qq.com')
    expect(url.searchParams.get('redirect_uri')).toBe(session.redirect_uri)
    expect(url.searchParams.get('state')).toBe(session.state)
    expect(url.searchParams.get('appid')).toBe(session.app_id)
    expect(url.searchParams.get('scope')).toBe('snsapi_login')
    expect(url.searchParams.get('self_redirect')).toBe('true')
    expect(url.searchParams.get('fast_login')).toBe('1')
    expect(url.searchParams.get('stylelite')).toBe('1')
    expect(url.searchParams.get('color_scheme')).toBe('dark')
    expect(url.searchParams.get('lang')).toBe('en')
  })

  it.each(['javascript:alert(1)', '<iframe src="x"></iframe>', 'https://user:pass@localhost/callback', 'https://localhost/callback?code=old', 'https://localhost/callback#state'])('拒绝不安全回调地址 %s', value => {
    expect(parseWechatRedirectUri(value)).toBeNull()
  })

  it('回调必须同时匹配来源、iframe 窗口、state 和消息格式', () => {
    const frame = document.createElement('iframe')
    document.body.append(frame)
    const source = frame.contentWindow!
    const message = { type: WECHAT_CALLBACK_MESSAGE, code: 'test-code', state: session.state }
    const event = (options = {}) => new MessageEvent('message', { origin: window.location.origin, source, data: message, ...options })
    expect(readWechatCallback(event(), source, session.state)).toBe('test-code')
    expect(readWechatCallback(event({ origin: 'https://tokennx.cn' }), source, session.state, 'https://tokennx.cn')).toBe('test-code')
    expect(readWechatCallback(event({ origin: 'https://evil.example' }), source, session.state)).toBeNull()
    expect(readWechatCallback(event({ source: window }), source, session.state)).toBeNull()
    expect(readWechatCallback(event({ data: { ...message, state: 'stale' } }), source, session.state)).toBeNull()
    expect(readWechatCallback(event({ data: { ...message, code: '' } }), source, session.state)).toBeNull()
    expect(readWechatCallback(event({ data: JSON.stringify(message) }), source, session.state)).toBeNull()
    frame.remove()
  })
})
