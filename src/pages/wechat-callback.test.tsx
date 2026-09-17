import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WECHAT_CALLBACK_MESSAGE } from '@/auth/wechat-authorization'
import i18n from '@/i18n'
import { WechatCallbackPage } from './wechat-callback'

describe('微信顶层回调页', () => {
  const originalParent = window.parent
  beforeEach(async () => {
    await i18n.changeLanguage('zh-CN')
    window.history.replaceState(null, '', '/weixin/callback?code=popup-code&state=popup-state')
    Object.defineProperty(window, 'opener', { configurable: true, value: null })
    Object.defineProperty(window, 'parent', { configurable: true, value: originalParent })
  })

  afterEach(() => {
    cleanup()
    Object.defineProperty(window, 'opener', { configurable: true, value: null })
    Object.defineProperty(window, 'parent', { configurable: true, value: originalParent })
    window.history.replaceState(null, '', '/')
    vi.restoreAllMocks()
  })

  it('有 opener 时把 code/state 回传给发起登录页', async () => {
    const opener = { closed: false, postMessage: vi.fn() }
    Object.defineProperty(window, 'opener', { configurable: true, value: opener })

    await act(async () => {
      render(<WechatCallbackPage />)
    })

    expect(opener.postMessage).toHaveBeenCalledWith({
      type: WECHAT_CALLBACK_MESSAGE,
      code: 'popup-code',
      state: 'popup-state',
    }, window.location.origin)
    expect(opener.postMessage.mock.calls.every(([, origin]) => origin !== '*')).toBe(true)
    expect(screen.getByText('微信登录信息已返回，请回到登录页。')).toBeTruthy()
    expect(window.location.pathname).toBe('/weixin/callback')
    expect(window.location.search).toBe('')
  })

  it('恶意来源的 opener 收不到 code/state', async () => {
    const opener = { closed: false, postMessage: vi.fn() }
    Object.defineProperty(window, 'opener', { configurable: true, value: opener })
    vi.spyOn(document, 'referrer', 'get').mockReturnValue('https://evil.example/login')
    await act(async () => { render(<WechatCallbackPage />) })
    expect(opener.postMessage).not.toHaveBeenCalled()
    expect(window.location.search).toBe('')
  })

  it.each(['https://www.tokennx.cn/login', 'http://localhost:5173/login'])('iframe 回调精确发送到合法来源 %s', referrer => {
    const parent = { postMessage: vi.fn() }
    Object.defineProperty(window, 'parent', { configurable: true, value: parent })
    vi.spyOn(document, 'referrer', 'get').mockReturnValue(referrer)
    render(<WechatCallbackPage />)
    expect(parent.postMessage).toHaveBeenCalledOnce()
    expect(parent.postMessage).toHaveBeenCalledWith({ type: WECHAT_CALLBACK_MESSAGE, code: 'popup-code', state: 'popup-state' }, new URL(referrer).origin)
  })

  it('微信内部跳转 referrer 丢失发起来源时仍为别名发送限定目标消息', () => {
    const parent = { postMessage: vi.fn() }
    Object.defineProperty(window, 'parent', { configurable: true, value: parent })
    vi.spyOn(document, 'referrer', 'get').mockReturnValue('https://open.weixin.qq.com/connect/qrconnect')
    render(<WechatCallbackPage />)
    expect(parent.postMessage).toHaveBeenCalledWith(expect.objectContaining({ code: 'popup-code' }), 'https://www.tokennx.cn')
    expect(parent.postMessage.mock.calls.every(([, origin]) => origin !== '*')).toBe(true)
  })
})
