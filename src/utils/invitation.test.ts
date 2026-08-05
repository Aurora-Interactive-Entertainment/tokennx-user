import { describe, expect, it } from 'vitest'
import { resolveInvitationURL } from './invitation'

describe('邀请链接地址', () => {
  it('将接口返回的站内路径补全为当前站点的完整链接', () => {
    expect(resolveInvitationURL('/join?token=token%2Fabc', 'https://console.example.com/console/members')).toBe('https://console.example.com/join?token=token%2Fabc')
  })

  it('保留已经是完整链接的邀请地址', () => {
    expect(resolveInvitationURL('https://invite.example.com/join?token=abc', 'https://console.example.com')).toBe('https://invite.example.com/join?token=abc')
  })

  it('拒绝空值、非法协议和包含认证信息的地址', () => {
    expect(resolveInvitationURL('', 'https://console.example.com')).toBe('')
    expect(resolveInvitationURL('javascript:alert(1)', 'https://console.example.com')).toBe('')
    expect(resolveInvitationURL('mailto:invite@example.com', 'https://console.example.com')).toBe('')
    expect(resolveInvitationURL('https://user:secret@example.com/join', 'https://console.example.com')).toBe('')
  })
})
