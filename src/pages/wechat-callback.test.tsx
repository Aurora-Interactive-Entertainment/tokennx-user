import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WECHAT_CALLBACK_MESSAGE } from '@/auth/wechat-authorization'
import i18n from '@/i18n'
import { WechatCallbackPage } from './wechat-callback'

describe('微信顶层回调页', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('zh-CN')
    window.history.replaceState(null, '', '/weixin/callback?code=popup-code&state=popup-state')
    Object.defineProperty(window, 'opener', { configurable: true, value: null })
  })

  afterEach(() => {
    cleanup()
    Object.defineProperty(window, 'opener', { configurable: true, value: null })
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
    }, '*')
    expect(screen.getByText('微信登录信息已返回，请回到登录页。')).toBeTruthy()
    expect(window.location.pathname).toBe('/weixin/callback')
    expect(window.location.search).toBe('')
  })
})
