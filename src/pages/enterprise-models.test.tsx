import '@/i18n'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { Provider } from 'react-redux'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthResult } from '@/api/auth'
import { clearAuthTokens, saveAuthTokens } from '@/auth/token-storage'
import { ApiError } from '@/api/http'
import {
  getAllEnterpriseMembers,
  getEnterpriseContext,
  getEnterpriseDepartments,
  getEnterpriseModels,
  updateEnterpriseModel,
  type EnterpriseContext,
  type EnterpriseDepartment,
  type EnterpriseModel,
  type EnterpriseModelPage,
} from '@/api/enterprise-console'
import { AppStoreProvider } from '@/data/app-state'
import { createAppStore } from '@/store'
import { EnterpriseModelsPage } from './enterprise-models'

vi.mock('@/api/enterprise-console', async () => {
  const actual = await vi.importActual<typeof import('@/api/enterprise-console')>('@/api/enterprise-console')
  return {
    ...actual,
    getAllEnterpriseMembers: vi.fn(),
    getEnterpriseContext: vi.fn(),
    getEnterpriseDepartments: vi.fn(),
    getEnterpriseModels: vi.fn(),
    updateEnterpriseModel: vi.fn(),
  }
})

const getEnterpriseContextMock = vi.mocked(getEnterpriseContext)
const getEnterpriseDepartmentsMock = vi.mocked(getEnterpriseDepartments)
const getAllEnterpriseMembersMock = vi.mocked(getAllEnterpriseMembers)
const getEnterpriseModelsMock = vi.mocked(getEnterpriseModels)
const updateEnterpriseModelMock = vi.mocked(updateEnterpriseModel)

const ENTERPRISE_ID = 'ent_test'
const AUTH_RESULT: AuthResult = {
  status: 'succeeded',
  binding_required: false,
  access_token: 'enterprise-token',
  refresh_token: 'enterprise-refresh',
  refresh_expires_at: Date.UTC(2099, 0, 1),
  user: {
    id: 'user_test',
    display_name: '测试用户',
    avatar_url: '',
    locale: 'zh-CN',
    timezone: 'Asia/Shanghai',
    status: 'active',
  },
}

const CONTEXT: EnterpriseContext = {
  id: ENTERPRISE_ID,
  name: '测试企业',
  code: 'ENT-TEST',
  member_id: 'membership_test',
  role: 'owner',
  roles: ['owner'],
  capabilities: {
    can_manage_members: true,
    can_manage_roles: true,
    can_manage_tags: true,
    can_manage_models: true,
    can_manage_usage: true,
    can_view_models: true,
    can_view_usage: true,
    can_view_audit: true,
    can_view_analytics: true,
  },
}

const GPT_MODEL: EnterpriseModel = {
  id: 'model-gpt-4o',
  code: 'gpt-4o',
  name: 'GPT-4o',
  company: 'OpenAI',
  modality: 'text',
  capabilities: ['对话', '视觉理解'],
  enabled: true,
  setting_version: 1,
}

const CLAUDE_MODEL: EnterpriseModel = {
  id: 'model-claude-35',
  code: 'claude-3-5-sonnet',
  name: 'Claude 3.5 Sonnet',
  company: 'Anthropic',
  modality: 'text',
  capabilities: ['对话', '代码'],
  enabled: false,
  setting_version: 4,
}

function modelPage(items: EnterpriseModel[] = [GPT_MODEL, CLAUDE_MODEL], overrides: Partial<EnterpriseModelPage> = {}): EnterpriseModelPage {
  return {
    context: CONTEXT,
    items,
    total: items.length,
    page: 1,
    page_size: 10,
    enabled_count: items.filter((item) => item.enabled).length,
    disabled_count: items.filter((item) => !item.enabled).length,
    ...overrides,
  }
}

function setEnterpriseWorkspace(): void {
  window.localStorage.setItem('token-nx:user-front:v1', JSON.stringify({
    activeWorkspaceId: ENTERPRISE_ID,
    workspaces: [{ id: ENTERPRISE_ID, name: CONTEXT.name, type: 'enterprise', role: 'owner' }],
  }))
}

function renderPage(): void {
  setEnterpriseWorkspace()
  const appStore = createAppStore()
  appStore.dispatch({ type: 'auth/loginWithEmail/fulfilled', payload: AUTH_RESULT.user })
  render(<MemoryRouter initialEntries={['/console/enterprise-models']}><Provider store={appStore}><AppStoreProvider><EnterpriseModelsPage /></AppStoreProvider></Provider></MemoryRouter>)
}

beforeEach(() => {
  vi.clearAllMocks()
  clearAuthTokens()
  window.localStorage.clear()
  saveAuthTokens(AUTH_RESULT)
  getEnterpriseContextMock.mockResolvedValue(CONTEXT)
  getEnterpriseDepartmentsMock.mockResolvedValue({ context: CONTEXT, items: [], total: 0, page: 1, page_size: 100 })
  getAllEnterpriseMembersMock.mockResolvedValue([])
  getEnterpriseModelsMock.mockResolvedValue(modelPage())
  updateEnterpriseModelMock.mockResolvedValue({ ...GPT_MODEL, enabled: false, setting_version: 2 })
})

describe('企业模型管理页面', () => {
  it('英文厂商名的 GLM 和 Kimi 使用品牌图标，接口图标仍优先', async () => {
    const models = [
      { ...GPT_MODEL, id: 'glm-52', code: 'glm5.2', name: 'glm5.2', company: 'Zhipu AI' },
      { ...GPT_MODEL, id: 'glm-53', code: 'glm5.3', name: 'glm5.3', company: 'Zhipu AI' },
      { ...GPT_MODEL, id: 'kimi-3', code: 'kimi3', name: 'kimi3', company: 'Moonshot AI' },
      { ...GPT_MODEL, id: 'seedance-25', code: 'seedance2.5', name: 'seedance2.5', company: 'Jimeng', modality: 'video' },
      { ...GPT_MODEL, id: 'custom-glm', code: 'custom-glm', name: 'Custom GLM', company: 'Zhipu AI', icon_url: '/custom-model.svg' },
    ]
    getEnterpriseModelsMock.mockResolvedValue(modelPage(models))
    renderPage()

    for (const [name, title] of [['glm5.2', 'Zhipu'], ['glm5.3', 'Zhipu'], ['kimi3', 'MoonshotAI']]) {
      const row = (await screen.findByText(name)).closest('tr')
      expect(row?.querySelector('.model-logo svg title')).toHaveTextContent(title)
    }
    expect(screen.getByText('Custom GLM').closest('tr')?.querySelector('.model-logo img')).toHaveAttribute('src', '/custom-model.svg')
    expect(screen.getByText('seedance2.5').closest('tr')?.querySelector('.model-logo img')?.getAttribute('src')).toContain('Seedance.svg')
    expect(updateEnterpriseModelMock).not.toHaveBeenCalled()
  })

  it('加载企业模型目录并按固定参数请求完整目录', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: '模型' })).toBeInTheDocument()
    expect(await screen.findByText('GPT-4o')).toBeInTheDocument()
    expect(screen.getByText('Claude 3.5 Sonnet')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '模型管理' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '刷新模型目录' })).toBeNull()
    expect(getEnterpriseModelsMock).toHaveBeenCalledWith(
      { enterprise_id: ENTERPRISE_ID },
      expect.objectContaining({ page: 1, page_size: 10, include_disabled: true }),
    )
  })

  it('管理者可以从更多操作打开模型可见范围弹窗', async () => {
    const user = userEvent.setup()
    renderPage()

    const moreActions = await screen.findAllByRole('button', { name: '更多操作' })
    await user.click(moreActions[0])
    await user.click(await screen.findByRole('menuitem', { name: '可见范围' }))

    expect(await screen.findByRole('dialog', { name: '模型可见范围' })).toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: '模型可见范围' })).toBeInTheDocument()
  })

  it('成员只能查看模型目录，不能操作模型状态或可见范围', async () => {
    getEnterpriseContextMock.mockResolvedValue({
      ...CONTEXT,
      role: 'member',
      capabilities: { ...CONTEXT.capabilities, can_manage_models: false },
    })
    renderPage()

    expect(await screen.findByText('GPT-4o')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: '禁用 GPT-4o' })).toBeDisabled()
    expect(screen.getByRole('switch', { name: '启用 Claude 3.5 Sonnet' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: '更多操作' })).toBeNull()
    expect(updateEnterpriseModelMock).not.toHaveBeenCalled()
  })

  it('接口返回空目录时如实展示空状态，不注入本地模型', async () => {
    getEnterpriseModelsMock.mockResolvedValue(modelPage([]))
    renderPage()

    expect(await screen.findByText('当前空间暂无可用模型')).toBeInTheDocument()
    expect(screen.queryByText('Doubao-Seed-Evolving')).toBeNull()
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('按当前版本提交模型启用状态并更新页面状态', async () => {
    const user = userEvent.setup()
    renderPage()

    const toggle = await screen.findByRole('switch', { name: '禁用 GPT-4o' })
    await user.click(toggle)

    await waitFor(() => expect(updateEnterpriseModelMock).toHaveBeenCalledWith(
      { enterprise_id: ENTERPRISE_ID },
      GPT_MODEL.id,
      { enabled: false, expected_version: GPT_MODEL.setting_version },
    ))
    expect(await screen.findByRole('switch', { name: '启用 GPT-4o' })).toHaveAttribute('aria-checked', 'false')
  })

  it('保存可见范围时调用模型 PATCH 并提交范围和当前版本', async () => {
    const user = userEvent.setup()
    getEnterpriseDepartmentsMock.mockResolvedValue({
      context: CONTEXT,
      items: [{
        id: 'operations',
        name: '运营',
        depth: 1,
        child_count: 0,
        member_count: 0,
        version: '1',
        created_at: 0,
        updated_at: 0,
      } as EnterpriseDepartment],
      total: 1,
      page: 1,
      page_size: 100,
    })
    const modelWithVisibility: EnterpriseModel = {
      ...GPT_MODEL,
      visibility: {
        scope: 'all',
        departments: [],
        members: [],
      },
    }
    getEnterpriseModelsMock.mockResolvedValue(modelPage([modelWithVisibility, CLAUDE_MODEL]))
    updateEnterpriseModelMock.mockResolvedValue({
      ...modelWithVisibility,
      visibility: {
        scope: 'partial',
        departments: [{ id: 'operations', name: '运营' }],
        members: [],
      },
      setting_version: '2',
    })
    renderPage()

    const moreActions = await screen.findAllByRole('button', { name: '更多操作' })
    await user.click(moreActions[0])
    await user.click(await screen.findByRole('menuitem', { name: '可见范围' }))
    await waitFor(() => expect(getEnterpriseDepartmentsMock).toHaveBeenCalledWith(
      { enterprise_id: ENTERPRISE_ID },
      expect.objectContaining({ page: 1, page_size: 100 }),
    ))
    expect(getAllEnterpriseMembersMock).toHaveBeenCalledWith(
      { enterprise_id: ENTERPRISE_ID },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    await user.click(screen.getByRole('radio', { name: '部分人员可见' }))
    await user.click(screen.getByRole('button', { name: /部门/ }))
    await user.click(screen.getByRole('checkbox', { name: '运营' }))
    await user.click(screen.getByRole('button', { name: '确定' }))

    await waitFor(() => expect(updateEnterpriseModelMock).toHaveBeenCalledWith(
      { enterprise_id: ENTERPRISE_ID },
      GPT_MODEL.id,
      {
        enabled: true,
        visibility_scope: 'partial',
        department_ids: ['operations'],
        member_ids: [],
        expected_version: GPT_MODEL.setting_version,
      },
    ))
  })

  it('版本冲突时展示错误并自动刷新模型目录', async () => {
    const user = userEvent.setup()
    const refreshedPage = modelPage([{ ...GPT_MODEL, enabled: false, setting_version: 2 }, CLAUDE_MODEL])
    getEnterpriseModelsMock.mockResolvedValueOnce(modelPage()).mockResolvedValueOnce(refreshedPage)
    updateEnterpriseModelMock.mockRejectedValueOnce(new ApiError('版本冲突', 409, 140004, 'request-conflict'))
    renderPage()

    await user.click(await screen.findByRole('switch', { name: '禁用 GPT-4o' }))

    await waitFor(() => expect(updateEnterpriseModelMock).toHaveBeenCalledWith(
      { enterprise_id: ENTERPRISE_ID },
      GPT_MODEL.id,
      { enabled: false, expected_version: GPT_MODEL.setting_version },
    ))
    await waitFor(() => expect(getEnterpriseModelsMock).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('switch', { name: '启用 GPT-4o' })).toHaveAttribute('aria-checked', 'false')
  })

  it('目录已有数据时刷新失败仍显示错误，并允许重试恢复最新版本', async () => {
    const user = userEvent.setup()
    getEnterpriseModelsMock.mockResolvedValueOnce(modelPage())
      .mockRejectedValueOnce(new ApiError('模型刷新服务暂不可用', 503, 100003, 'request-refresh'))
      .mockResolvedValueOnce(modelPage([{ ...GPT_MODEL, enabled: false, setting_version: 2 }]))
    updateEnterpriseModelMock.mockRejectedValueOnce(new ApiError('版本冲突', 409, 140004, 'request-conflict'))
    renderPage()

    await user.click(await screen.findByRole('switch', { name: '禁用 GPT-4o' }))
    const retry = await screen.findByRole('button', { name: '重试' })
    expect(retry.closest('[role="alert"]')).toHaveTextContent('模型刷新服务暂不可用')
    await user.click(retry)
    expect(await screen.findByRole('switch', { name: '启用 GPT-4o' })).toHaveAttribute('aria-checked', 'false')
    expect(getEnterpriseModelsMock).toHaveBeenCalledTimes(3)
  })
})
