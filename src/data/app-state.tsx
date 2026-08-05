import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { canStartPlaygroundRound, PLAYGROUND_MAX_ROUNDS } from '@/utils/playground'
const STORAGE_KEY = 'token-nx:user-front:v1'

export type WorkspaceType = 'personal' | 'enterprise'
export type WorkspaceRole = string

export interface Workspace {
  id: string
  name: string
  type: WorkspaceType
  role: WorkspaceRole
}

export interface ApiKeyRecord {
  id: string
  name: string
  prefix: string
  createdAt: string
  expiresAt: string
  status: 'active' | 'disabled'
  scope: 'all' | 'selected'
  modelIds: string[]
  limit: string
  lastUsedAt: string
}

export interface UsageRecord {
  id: string
  requestId: string
  modelId: string
  status: 'success' | 'failed'
  createdAt: string
  inputTokens: number
  outputTokens: number
  cost: number
  latency: number
  source: '控制台测试' | 'API'
}

export type PlaygroundMessageStatus = 'complete' | 'failed'

export interface PlaygroundMessage {
  id: string
  attemptId: string
  role: 'user' | 'assistant'
  status: PlaygroundMessageStatus
  content: string
  reasoning: string
  requestId: string | null
  error: string | null
  createdAt: string
  inputTokens: number | null
  outputTokens: number | null
  cost: number | null
  latency: number | null
}

export interface PlaygroundRunInput {
  modelId: string
  sessionId?: string
  replaceAttemptId?: string
  prompt: string
  response?: string
  requestId?: string
  reasoning?: string
  inputTokens?: number | null
  outputTokens?: number | null
  cost?: number | null
  latency?: number
}

export interface PlaygroundFailureInput {
  modelId: string
  sessionId?: string
  replaceAttemptId?: string
  prompt: string
  response?: string
  requestId?: string
  reasoning?: string
  error: string
}

export interface PlaygroundSession {
  id: string
  modelId: string
  messages: PlaygroundMessage[]
  rounds: number
  prompt: string
  response: string
  requestId: string
  createdAt: string
  updatedAt: string
  inputTokens: number | null
  outputTokens: number | null
  cost: number | null
  latency: number | null
}

export interface AppSnapshot {
  nickname: string
  phone: string
  avatar: string
  activeWorkspaceId: string
  workspaces: Workspace[]
  balance: number
  apiKeys: ApiKeyRecord[]
  usageRecords: UsageRecord[]
  playgroundSessions: PlaygroundSession[]
}

const PERSONAL_WORKSPACE_ID = 'personal'
const PERSONAL_WORKSPACE: Workspace = { id: PERSONAL_WORKSPACE_ID, name: '个人空间', type: 'personal', role: 'owner' }
const LEGACY_DEMO_ENTERPRISE_IDS = new Set(['ent-nx-labs', 'ent-yunqi'])
const DEFAULT_WORKSPACES: Workspace[] = [PERSONAL_WORKSPACE]
const DEFAULT_API_KEYS: ApiKeyRecord[] = [
  {
    id: 'key_prod',
    name: '本地演示密钥',
    prefix: 'nx_demo_••••••••7K2P',
    createdAt: '2026-07-12 14:28',
    expiresAt: '长期有效',
    status: 'active',
    scope: 'all',
    modelIds: [],
    limit: '未设置',
    lastUsedAt: '2026-07-16 09:42',
  },
  {
    id: 'key_archive',
    name: '旧版测试密钥',
    prefix: 'nx_demo_••••••••3FQ8',
    createdAt: '2026-06-30 18:12',
    expiresAt: '2026-07-30',
    status: 'disabled',
    scope: 'selected',
    modelIds: ['deepseek-chat', 'gpt-4o'],
    limit: '¥ 100.00',
    lastUsedAt: '2026-07-03 11:06',
  },
]

const DEFAULT_USAGE: UsageRecord[] = []

const EMPTY_PLAYGROUND_SESSIONS: PlaygroundSession[] = []

function makeDefaultSnapshot(): AppSnapshot {
  return {
    nickname: 'han',
    phone: '137****7000',
    avatar: 'H',
    activeWorkspaceId: 'personal',
    workspaces: DEFAULT_WORKSPACES,
    balance: 0,
    apiKeys: DEFAULT_API_KEYS,
    usageRecords: DEFAULT_USAGE,
    playgroundSessions: EMPTY_PLAYGROUND_SESSIONS,
  }
}

function isStoredEnterpriseWorkspace(value: unknown): value is Workspace {
  if (!value || typeof value !== 'object') return false
  const workspace = value as Partial<Workspace>
  return workspace.type === 'enterprise'
    && typeof workspace.id === 'string'
    && workspace.id.trim().length > 0
    && !LEGACY_DEMO_ENTERPRISE_IDS.has(workspace.id)
    && typeof workspace.name === 'string'
    && workspace.name.trim().length > 0
    && typeof workspace.role === 'string'
    && workspace.role.trim().length > 0
}

function normalizeStoredWorkspaces(value: unknown): Workspace[] {
  const stored = Array.isArray(value) ? value : []
  const seenEnterpriseIds = new Set<string>()
  const enterprises = stored.filter(isStoredEnterpriseWorkspace).filter((workspace) => {
    if (seenEnterpriseIds.has(workspace.id)) return false
    seenEnterpriseIds.add(workspace.id)
    return true
  })
  return [PERSONAL_WORKSPACE, ...enterprises]
}

function loadSnapshot(): AppSnapshot {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return makeDefaultSnapshot()
    const parsed = JSON.parse(raw) as Partial<AppSnapshot>
    return {
      ...makeDefaultSnapshot(),
      ...parsed,
      activeWorkspaceId: parsed.activeWorkspaceId ?? PERSONAL_WORKSPACE_ID,
      workspaces: normalizeStoredWorkspaces(parsed.workspaces),
      apiKeys: parsed.apiKeys ?? DEFAULT_API_KEYS,
      usageRecords: parsed.usageRecords ?? DEFAULT_USAGE,
      // 中文：智能会话只存在当前页面内，刷新后必须从空会话开始。
      playgroundSessions: EMPTY_PLAYGROUND_SESSIONS,
    }
  } catch {
    return makeDefaultSnapshot()
  }
}

function saveSnapshot(snapshot: AppSnapshot): void {
  try {
    // 中文：持久化快照只保存账号配置，绝不把智能会话正文或请求元数据写入浏览器存储。
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...snapshot, playgroundSessions: undefined }))
  } catch {
    // 本地演示环境可能关闭存储，内存状态仍可继续使用。
  }
}

function createId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export interface AppStoreValue extends AppSnapshot {
  activeWorkspace: Workspace
  selectedModelId: string
  setSelectedModelId: (modelId: string) => void
  switchWorkspace: (workspaceId: string) => void
  replaceEnterpriseWorkspaces: (workspaces: Workspace[]) => void
  createApiKey: (input: Pick<ApiKeyRecord, 'name' | 'expiresAt' | 'scope' | 'modelIds' | 'limit'>) => string
  disableApiKey: (keyId: string) => void
  deleteApiKey: (keyId: string) => void
  runPlayground: (input: PlaygroundRunInput) => PlaygroundSession
  recordPlaygroundFailure: (input: PlaygroundFailureInput) => PlaygroundSession
  updateProfile: (input: Pick<AppSnapshot, 'nickname' | 'phone' | 'avatar'>) => void
}

const AppStoreContext = createContext<AppStoreValue | null>(null)

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<AppSnapshot>(loadSnapshot)
  const [playgroundSessions, setPlaygroundSessions] = useState<PlaygroundSession[]>([])
  const [selectedModelId, setSelectedModelId] = useState('deepseek-public')

  const updateSnapshot = useCallback((updater: (previous: AppSnapshot) => AppSnapshot) => {
    setSnapshot((previous) => {
      const next = updater(previous)
      saveSnapshot(next)
      return next
    })
  }, [])

  const switchWorkspace = useCallback((workspaceId: string) => {
    updateSnapshot((previous) => previous.workspaces.some((workspace) => workspace.id === workspaceId)
      ? { ...previous, activeWorkspaceId: workspaceId }
      : previous)
  }, [updateSnapshot])

  const replaceEnterpriseWorkspaces = useCallback((workspaces: Workspace[]) => {
    updateSnapshot((previous) => {
      const nextWorkspaces = normalizeStoredWorkspaces([PERSONAL_WORKSPACE, ...workspaces])
      const activeWorkspaceId = nextWorkspaces.some((workspace) => workspace.id === previous.activeWorkspaceId)
        ? previous.activeWorkspaceId
        : PERSONAL_WORKSPACE_ID
      return { ...previous, workspaces: nextWorkspaces, activeWorkspaceId }
    })
  }, [updateSnapshot])

  const createApiKey = useCallback((input: Pick<ApiKeyRecord, 'name' | 'expiresAt' | 'scope' | 'modelIds' | 'limit'>) => {
    const rawKey = `nx_demo_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`
    const nextKey: ApiKeyRecord = {
      ...input,
      id: createId('key'),
      prefix: `${rawKey.slice(0, 10)}••••••••${rawKey.slice(-4)}`,
      createdAt: new Date().toLocaleString('zh-CN', { hour12: false }).slice(0, 16),
      status: 'active',
      lastUsedAt: '尚未使用',
    }
    updateSnapshot((previous) => ({ ...previous, apiKeys: [nextKey, ...previous.apiKeys] }))
    return rawKey
  }, [updateSnapshot])

  const disableApiKey = useCallback((keyId: string) => {
    updateSnapshot((previous) => ({
      ...previous,
      apiKeys: previous.apiKeys.map((key) => key.id === keyId ? { ...key, status: 'disabled' } : key),
    }))
  }, [updateSnapshot])

  const deleteApiKey = useCallback((keyId: string) => {
    updateSnapshot((previous) => ({ ...previous, apiKeys: previous.apiKeys.filter((key) => key.id !== keyId) }))
  }, [updateSnapshot])

  const runPlayground = useCallback((input: PlaygroundRunInput) => {
    const existing = input.sessionId ? playgroundSessions.find((item) => item.id === input.sessionId) : undefined
    if (existing && !canStartPlaygroundRound(existing.rounds)) {
      throw new Error(`智能会话最多支持 ${PLAYGROUND_MAX_ROUNDS} 轮对话`)
    }
    const replacingFailedAttempt = input.replaceAttemptId
      ? existing?.messages.some((message) => message.attemptId === input.replaceAttemptId && message.status === 'failed')
      : false
    if (input.replaceAttemptId && !replacingFailedAttempt) {
      throw new Error('待替换的失败尝试不存在')
    }
    const createdAt = new Date().toLocaleString('zh-CN', { hour12: false }).slice(0, 19)
    const requestId = input.requestId?.trim() || createId('req')
    const attemptId = createId('attempt')
    const reasoning = input.reasoning ?? ''
    const inputTokens = input.inputTokens ?? null
    const outputTokens = input.outputTokens ?? null
    const cost = input.cost ?? null
    const latency = input.latency ?? null
    const messages = input.replaceAttemptId
      ? (existing?.messages ?? []).filter((message) => message.attemptId !== input.replaceAttemptId)
      : (existing?.messages ?? [])
    const userMessage: PlaygroundMessage = {
      id: createId('message'), attemptId, role: 'user', status: 'complete', content: input.prompt, reasoning: '', requestId: null, error: null, createdAt,
      inputTokens: null, outputTokens: null, cost: null, latency: null,
    }
    const assistantMessage: PlaygroundMessage = {
      id: createId('message'), attemptId, role: 'assistant', status: 'complete', content: input.response ?? '模型未返回文本内容。', reasoning, requestId, error: null, createdAt,
      inputTokens, outputTokens, cost, latency,
    }
    const session: PlaygroundSession = {
      id: existing?.id ?? createId('session'),
      modelId: input.modelId,
      messages: [...messages, userMessage, assistantMessage],
      rounds: (existing?.rounds ?? 0) + 1,
      prompt: input.prompt,
      response: assistantMessage.content,
      requestId,
      createdAt: existing?.createdAt ?? createdAt,
      updatedAt: createdAt,
      inputTokens,
      outputTokens,
      cost,
      latency,
    }
    // 中文：会话正文只进入 React 内存状态，避免刷新后残留，也避免写入持久化快照。
    setPlaygroundSessions((previous) => [session, ...previous.filter((item) => item.id !== session.id)])
    return session
  }, [playgroundSessions])

  const recordPlaygroundFailure = useCallback((input: PlaygroundFailureInput) => {
    const existing = input.sessionId ? playgroundSessions.find((item) => item.id === input.sessionId) : undefined
    if (existing && !canStartPlaygroundRound(existing.rounds)) {
      throw new Error(`智能会话最多支持 ${PLAYGROUND_MAX_ROUNDS} 轮对话`)
    }
    const replacingFailedAttempt = input.replaceAttemptId
      ? existing?.messages.some((message) => message.attemptId === input.replaceAttemptId && message.status === 'failed')
      : false
    if (input.replaceAttemptId && !replacingFailedAttempt) {
      throw new Error('待替换的失败尝试不存在')
    }
    const createdAt = new Date().toLocaleString('zh-CN', { hour12: false }).slice(0, 19)
    const requestId = input.requestId?.trim() || createId('req')
    const attemptId = createId('attempt')
    const messages = input.replaceAttemptId
      ? (existing?.messages ?? []).filter((message) => message.attemptId !== input.replaceAttemptId)
      : (existing?.messages ?? [])
    const userMessage: PlaygroundMessage = {
      id: createId('message'), attemptId, role: 'user', status: 'failed', content: input.prompt, reasoning: '', requestId: null, error: null, createdAt,
      inputTokens: null, outputTokens: null, cost: null, latency: null,
    }
    const assistantMessage: PlaygroundMessage = {
      id: createId('message'), attemptId, role: 'assistant', status: 'failed', content: input.response ?? '', reasoning: input.reasoning ?? '', requestId, error: input.error, createdAt,
      inputTokens: null, outputTokens: null, cost: null, latency: null,
    }
    const session: PlaygroundSession = {
      id: existing?.id ?? createId('session'),
      modelId: input.modelId,
      messages: [...messages, userMessage, assistantMessage],
      rounds: existing?.rounds ?? 0,
      prompt: input.prompt,
      response: assistantMessage.content,
      requestId,
      createdAt: existing?.createdAt ?? createdAt,
      updatedAt: createdAt,
      inputTokens: null,
      outputTokens: null,
      cost: null,
      latency: null,
    }
    // 中文：失败尝试保留在会话中供编辑，但轮次和下一次模型上下文都不包含它。
    setPlaygroundSessions((previous) => [session, ...previous.filter((item) => item.id !== session.id)])
    return session
  }, [playgroundSessions])

  const updateProfile = useCallback((input: Pick<AppSnapshot, 'nickname' | 'phone' | 'avatar'>) => {
    updateSnapshot((previous) => ({ ...previous, ...input }))
  }, [updateSnapshot])

  const activeWorkspace = snapshot.workspaces.find((workspace) => workspace.id === snapshot.activeWorkspaceId) ?? snapshot.workspaces[0]
  const value = useMemo<AppStoreValue>(() => ({
    ...snapshot,
    playgroundSessions,
    activeWorkspace,
    selectedModelId,
    setSelectedModelId,
    switchWorkspace,
    replaceEnterpriseWorkspaces,
    createApiKey,
    disableApiKey,
    deleteApiKey,
    runPlayground,
    recordPlaygroundFailure,
    updateProfile,
  }), [snapshot, playgroundSessions, activeWorkspace, selectedModelId, switchWorkspace, replaceEnterpriseWorkspaces, createApiKey, disableApiKey, deleteApiKey, runPlayground, recordPlaygroundFailure, updateProfile])

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>
}

export function useAppStore(): AppStoreValue {
  const value = useContext(AppStoreContext)
  if (!value) throw new Error('useAppStore 必须在 AppStoreProvider 内使用')
  return value
}
