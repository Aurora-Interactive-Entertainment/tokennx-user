import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, useLocation } from 'react-router'
import i18n from '@/i18n'
import { ActivityCampaignModal, ACTIVITY_CAMPAIGN_CLOSED_DATE_KEY, type ActivityCampaign } from './activity-campaign-modal'

const auth = vi.hoisted(() => ({ status: 'unauthenticated' }))
vi.mock('@/store/hooks', () => ({ useAppSelector: (select: (state: unknown) => unknown) => select({ auth }) }))
// 登录表单本身由登录导航集成测试覆盖，此处聚焦活动关闭和目标接续。
vi.mock('@/components/common', () => ({
  LoginDialog: ({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) => open ? <div role="dialog" aria-label="活动登录"><button onClick={onClose}>取消登录</button><button onClick={onSuccess}>完成登录</button></div> : null,
}))

function Location() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}{location.search}{location.hash}</output>
}

function view(campaign: ActivityCampaign) {
  return <MemoryRouter><ActivityCampaignModal campaign={campaign} /><Location /></MemoryRouter>
}

beforeEach(async () => {
  auth.status = 'unauthenticated'
  localStorage.removeItem(ACTIVITY_CAMPAIGN_CLOSED_DATE_KEY)
  await i18n.changeLanguage('zh-CN')
})

describe('活动弹窗接口展示规则', () => {
  it.each([undefined, ' ', 'http://[invalid', 'javascript:alert(1)'])('无有效 url 时保留封面和关闭操作：%s', (targetUrl) => {
    render(view({ image: '/cover.png', targetUrl }))
    expect(screen.getByRole('img')).toHaveAttribute('src', '/cover.png')
    expect(screen.getByRole('button', { name: '再想想' })).toBeVisible()
    expect(screen.queryByRole('button', { name: '立即领取' })).not.toBeInTheDocument()
  })

  it('已登录用户直接跳转，缺省文案沿用默认值', () => {
    auth.status = 'authenticated'
    render(view({ image: '/cover.png', targetUrl: '/models' }))
    fireEvent.click(screen.getByRole('button', { name: '立即领取' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/models')
    expect(localStorage.getItem(ACTIVITY_CAMPAIGN_CLOSED_DATE_KEY)).toBeTruthy()
  })

  it('未登录点击后先登录，活动更新后仍跳转本次点击的原始目标', async () => {
    const { rerender } = render(view({ image: '/cover.png', loginRequired: false, targetUrl: '/console/models?q=test#details' }))
    fireEvent.click(screen.getByRole('button', { name: '立即领取' }))
    expect(screen.getByTestId('location').textContent).toBe('/')
    await screen.findByRole('dialog', { name: '活动登录' })
    rerender(view({ image: '/cover.png', targetUrl: '/other', activityEndAt: Date.now() - 1 }))
    fireEvent.click(screen.getByRole('button', { name: '完成登录' }))
    expect(screen.getByTestId('location').textContent).toBe('/console/models?q=test#details')
  })

  it('取消登录不跳转，继续保留当天已关闭记录', async () => {
    render(view({ image: '/cover.png', targetUrl: '/console/models' }))
    fireEvent.click(screen.getByRole('button', { name: '立即领取' }))
    fireEvent.click(await screen.findByRole('button', { name: '取消登录' }))
    expect(screen.getByTestId('location').textContent).toBe('/')
    expect(screen.queryByRole('dialog', { name: '活动登录' })).not.toBeInTheDocument()
    expect(localStorage.getItem(ACTIVITY_CAMPAIGN_CLOSED_DATE_KEY)).toBeTruthy()
  })

  it('封面缺省时仍展示倒计时和自定义跳转文案', () => {
    render(view({ activityEndAt: Date.now() + 86400000, targetUrl: '/models', targetText: '查看详情' }))
    expect(document.querySelector('.activity-campaign-visual')).toBeNull()
    expect(screen.getByRole('heading', { name: '活动倒计时' })).toBeVisible()
    expect(screen.getByRole('button', { name: '查看详情' })).toBeVisible()
  })

  it('受限活动仅登录可见，退出后立即隐藏而不写入每日关闭记录', () => {
    const campaign = { image: '/cover.png', loginRequired: true }
    const { rerender } = render(view(campaign))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    auth.status = 'authenticated'
    rerender(view(campaign))
    expect(screen.getByRole('dialog')).toBeVisible()
    auth.status = 'unauthenticated'
    rerender(view(campaign))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(localStorage.getItem(ACTIVITY_CAMPAIGN_CLOSED_DATE_KEY)).toBeNull()
  })

  it('到期活动及当天已关闭活动不展示', () => {
    const { rerender, unmount } = render(view({ image: '/cover.png', activityEndAt: Date.now() - 1 }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    rerender(view({ image: '/cover.png' }))
    fireEvent.click(screen.getByRole('button', { name: '再想想' }))
    // 模拟刷新后重新挂载，避免 jsdom 不触发 CSS 关闭动画影响断言。
    unmount()
    render(view({ image: '/another-cover.png' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
