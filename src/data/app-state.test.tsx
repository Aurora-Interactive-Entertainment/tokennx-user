import { act, render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { describe, expect, it, beforeEach } from 'vitest'
import { AppStoreProvider, useAppStore } from './app-state'

function StoreProbe({ onReady }: { onReady: (store: ReturnType<typeof useAppStore>) => void }) {
  const store = useAppStore()
  useEffect(() => onReady(store), [onReady, store])
  return <div><span data-testid="workspace">{store.activeWorkspace.name}</span><span data-testid="keys">{store.apiKeys.length}</span><span data-testid="sessions">{store.playgroundSessions.length}</span></div>
}

describe('工作空间本地状态', () => {
  beforeEach(() => window.localStorage.clear())

  it('同步真实企业空间并创建演示密钥', () => {
    let store: ReturnType<typeof useAppStore> | undefined
    render(<AppStoreProvider><StoreProbe onReady={(value) => { store = value }} /></AppStoreProvider>)
    expect(screen.getByTestId('workspace')).toHaveTextContent('个人空间')
    act(() => store?.replaceEnterpriseWorkspaces([{ id: 'enterprise-real', name: '真实关联企业', type: 'enterprise', role: 'member' }]))
    act(() => store?.switchWorkspace('enterprise-real'))
    expect(screen.getByTestId('workspace')).toHaveTextContent('真实关联企业')
    act(() => store?.switchWorkspace('unknown-enterprise'))
    expect(screen.getByTestId('workspace')).toHaveTextContent('真实关联企业')
    const before = store?.apiKeys.length ?? 0
    act(() => { store?.createApiKey({ name: '单测密钥', expiresAt: '长期有效', scope: 'all', modelIds: [], limit: '未设置' }) })
    expect(screen.getByTestId('keys')).toHaveTextContent(String(before + 1))
  })

  it('切换空间后持久化激活空间，重新挂载后恢复选择', () => {
    let store: ReturnType<typeof useAppStore> | undefined
    const firstRender = render(<AppStoreProvider><StoreProbe onReady={(value) => { store = value }} /></AppStoreProvider>)
    act(() => store?.replaceEnterpriseWorkspaces([{ id: 'enterprise-persisted', name: '持久化企业', type: 'enterprise', role: 'member' }]))
    act(() => store?.switchWorkspace('enterprise-persisted'))

    expect(JSON.parse(String(window.localStorage.getItem('token-nx:user-front:v1')))).toMatchObject({ activeWorkspaceId: 'enterprise-persisted' })
    firstRender.unmount()

    let restoredStore: ReturnType<typeof useAppStore> | undefined
    render(<AppStoreProvider><StoreProbe onReady={(value) => { restoredStore = value }} /></AppStoreProvider>)
    expect(restoredStore?.activeWorkspace).toMatchObject({ id: 'enterprise-persisted', name: '持久化企业' })
  })

  it('运行模型测试只在当前页面保留会话，不重复伪造用量或扣余额', () => {
    let store: ReturnType<typeof useAppStore> | undefined
    render(<AppStoreProvider><StoreProbe onReady={(value) => { store = value }} /></AppStoreProvider>)
    const sessionsBefore = store?.playgroundSessions.length ?? 0
    const usageBefore = store?.usageRecords.length ?? 0
    const balanceBefore = store?.balance ?? 0
    act(() => { store?.runPlayground({ modelId: 'deepseek-chat', prompt: '测试请求', response: '真实响应', reasoning: '临时思考内容', inputTokens: 8, outputTokens: 4, cost: 0.01, latency: 96 }) })
    expect(screen.getByTestId('sessions')).toHaveTextContent(String(sessionsBefore + 1))
    expect(store?.usageRecords.length).toBe(usageBefore)
    expect(store?.balance).toBe(balanceBefore)
    expect(store?.playgroundSessions[0]?.cost).toBe(0.01)
    expect(store?.playgroundSessions[0]?.messages[1]?.reasoning).toBe('临时思考内容')
    expect(window.localStorage.getItem('token-nx:user-front:v1')).toBeNull()
  })

  it('单个智能会话最多允许 10 轮并拒绝第 11 轮', () => {
    let store: ReturnType<typeof useAppStore> | undefined
    render(<AppStoreProvider><StoreProbe onReady={(value) => { store = value }} /></AppStoreProvider>)
    let sessionId = ''
    act(() => {
      sessionId = store!.runPlayground({ modelId: 'deepseek-chat', prompt: '第 1 轮', response: '回复' }).id
    })
    for (let round = 2; round <= 10; round += 1) {
      act(() => { store?.runPlayground({ modelId: 'deepseek-chat', sessionId, prompt: `第 ${round} 轮`, response: '回复' }) })
    }
    expect(store?.playgroundSessions[0]?.rounds).toBe(10)
    let error: unknown
    act(() => {
      try {
        store?.runPlayground({ modelId: 'deepseek-chat', sessionId, prompt: '第 11 轮', response: '回复' })
      } catch (caught) {
        error = caught
      }
    })
    expect(error).toBeInstanceOf(Error)
    expect(store?.playgroundSessions[0]?.rounds).toBe(10)
  })

  it('失败尝试不占用轮次，重试成功后替换失败内容', () => {
    let store: ReturnType<typeof useAppStore> | undefined
    render(<AppStoreProvider><StoreProbe onReady={(value) => { store = value }} /></AppStoreProvider>)

    let failedSessionId = ''
    let failedAttemptId = ''
    act(() => {
      const session = store!.recordPlaygroundFailure({ modelId: 'deepseek-chat', prompt: '失败请求', response: '部分响应', error: '请求失败' })
      failedSessionId = session.id
      failedAttemptId = session.messages[1]!.attemptId
    })

    expect(store?.playgroundSessions[0]?.rounds).toBe(0)
    expect(store?.playgroundSessions[0]?.messages[1]?.status).toBe('failed')
    expect(store?.playgroundSessions[0]?.messages[1]?.error).toBe('请求失败')

    act(() => {
      store?.runPlayground({ modelId: 'deepseek-chat', sessionId: failedSessionId, replaceAttemptId: failedAttemptId, prompt: '修正请求', response: '成功响应' })
    })

    expect(store?.playgroundSessions[0]?.rounds).toBe(1)
    expect(store?.playgroundSessions[0]?.messages).toHaveLength(2)
    expect(store?.playgroundSessions[0]?.messages.every((message) => message.status === 'complete')).toBe(true)
    expect(store?.playgroundSessions[0]?.prompt).toBe('修正请求')
  })

  it('智能会话保存在浏览器中，重新挂载后恢复正文', () => {
    let store: ReturnType<typeof useAppStore> | undefined
    const firstRender = render(<AppStoreProvider><StoreProbe onReady={(value) => { store = value }} /></AppStoreProvider>)
    act(() => { store?.runPlayground({ modelId: 'deepseek-chat', prompt: '刷新前的私密问题', response: '刷新前的回复' }) })
    expect(store?.playgroundSessions).toHaveLength(1)
    expect(window.localStorage.getItem('token-nx:playground:v1')).toContain('刷新前的私密问题')
    firstRender.unmount()

    let remountedStore: ReturnType<typeof useAppStore> | undefined
    render(<AppStoreProvider><StoreProbe onReady={(value) => { remountedStore = value }} /></AppStoreProvider>)
    expect(remountedStore?.playgroundSessions).toHaveLength(1)
    expect(remountedStore?.playgroundSessions[0]?.messages[0]?.content).toBe('刷新前的私密问题')
  })

  it('清除上下文保留同一条历史会话并重置轮次', () => {
    let store: ReturnType<typeof useAppStore> | undefined
    render(<AppStoreProvider><StoreProbe onReady={(value) => { store = value }} /></AppStoreProvider>)

    let sessionId = ''
    act(() => {
      sessionId = store!.runPlayground({ modelId: 'deepseek-chat', prompt: '旧上下文问题', response: '旧上下文回复' }).id
    })
    act(() => { store?.clearPlaygroundContext(sessionId) })

    expect(store?.playgroundSessions).toHaveLength(1)
    expect(store?.playgroundSessions[0]).toMatchObject({ id: sessionId, rounds: 0, contextBreaks: [2] })
    expect(store?.playgroundSessions[0]?.messages).toHaveLength(2)

    // 中文：没有新增消息时重复清除，不应生成连续的空分割线。
    act(() => { store?.clearPlaygroundContext(sessionId) })
    expect(store?.playgroundSessions[0]?.contextBreaks).toEqual([2])
  })

  it('默认不创建演示会话，并忽略历史持久化会话内容', () => {
    let store: ReturnType<typeof useAppStore> | undefined
    const firstRender = render(<AppStoreProvider><StoreProbe onReady={(value) => { store = value }} /></AppStoreProvider>)
    expect(store?.playgroundSessions).toHaveLength(0)
    firstRender.unmount()

    window.localStorage.setItem('token-nx:user-front:v1', JSON.stringify({
      playgroundSessions: [
        { id: 'session_001', modelId: 'deepseek-chat', prompt: '演示问题', response: '演示回复', requestId: 'req_demo_0010', createdAt: '2026-07-14 18:20:41', inputTokens: 1, outputTokens: 1, cost: 0, latency: 1 },
        { id: 'session_live', modelId: 'deepseek-chat', prompt: '真实问题', response: '真实回复', requestId: 'req-live-test', createdAt: '2026-07-28 10:00:00', inputTokens: 2, outputTokens: 3, cost: 0.01, latency: 2 },
      ],
    }))
    let restoredStore: ReturnType<typeof useAppStore> | undefined
    render(<AppStoreProvider><StoreProbe onReady={(value) => { restoredStore = value }} /></AppStoreProvider>)

    expect(restoredStore?.playgroundSessions).toHaveLength(0)
  })

  it('恢复部分本地快照并处理异常存储', () => {
    window.localStorage.setItem('token-nx:user-front:v1', JSON.stringify({ nickname: 'stored-user', activeWorkspaceId: 'missing', workspaces: [], apiKeys: null, usageRecords: null, playgroundSessions: null }))
    let store: ReturnType<typeof useAppStore> | undefined
    render(<AppStoreProvider><StoreProbe onReady={(value) => { store = value }} /></AppStoreProvider>)
    expect(screen.getByTestId('workspace')).toHaveTextContent('个人空间')
    expect(store?.nickname).toBe('stored-user')
    window.localStorage.setItem('token-nx:user-front:v1', '{bad json')
    expect(() => render(<AppStoreProvider><StoreProbe onReady={() => undefined} /></AppStoreProvider>)).not.toThrow()
  })

  it('管理指定模型密钥、资料与未知空间', () => {
    let store: ReturnType<typeof useAppStore> | undefined
    render(<AppStoreProvider><StoreProbe onReady={(value) => { store = value }} /></AppStoreProvider>)
    act(() => { store?.switchWorkspace('missing'); store?.updateProfile({ nickname: '新昵称', phone: '139****0000', avatar: '新' }) })
    expect(store?.activeWorkspace.id).toBe('personal')
    const before = store?.apiKeys.length ?? 0
    act(() => { store?.createApiKey({ name: '范围密钥', expiresAt: '2026-08-16', scope: 'selected', modelIds: ['gpt-4o'], limit: '¥ 50.00' }) })
    expect(store?.apiKeys.length).toBe(before + 1)
    const created = store?.apiKeys[0]
    act(() => { if (created) store?.disableApiKey(created.id) })
    expect(store?.apiKeys[0]?.status).toBe('disabled')
    act(() => { if (created) store?.deleteApiKey(created.id) })
    expect(store?.apiKeys.some((key) => key.id === created?.id)).toBe(false)
    act(() => { store?.runPlayground({ modelId: 'unknown-model', prompt: 'a very long prompt'.repeat(40) }) })
    expect(store?.playgroundSessions[0]?.modelId).toBe('unknown-model')
  })

  it('在 Provider 外使用状态钩子会抛出明确错误', () => {
    expect(() => render(<StoreProbe onReady={() => undefined} />)).toThrow('AppStoreProvider')
  })
})
