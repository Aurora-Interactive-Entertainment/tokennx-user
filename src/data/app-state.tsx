import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { canStartPlaygroundRound, PLAYGROUND_MAX_ROUNDS } from '@/utils/playground'
import { LEGACY_PLAYGROUND_HISTORY_KEY, LEGACY_VIDEO_HISTORY_KEY, PLAYGROUND_SESSION_HISTORY_KEY, readUserSessionHistory, writeUserSessionHistory } from '@/utils/ephemeral-history'
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
  contextBreaks?: number[]
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
      playgroundSessions: EMPTY_PLAYGROUND_SESSIONS,
    }
  } catch {
    return makeDefaultSnapshot()
  }
}

function loadLegacyPlaygroundSessions(): PlaygroundSession[] {
  try {
    const raw = localStorage.getItem(LEGACY_PLAYGROUND_HISTORY_KEY)
    if (!raw) return EMPTY_PLAYGROUND_SESSIONS
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return EMPTY_PLAYGROUND_SESSIONS
    return parsed.filter((item): item is PlaygroundSession => Boolean(item && typeof item === 'object' && typeof item.id === 'string' && typeof item.modelId === 'string' && Array.isArray(item.messages)))
  } catch {
    return EMPTY_PLAYGROUND_SESSIONS
  }
}

function saveSnapshot(snapshot: AppSnapshot): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...snapshot, playgroundSessions: undefined }))
  } catch {
    // 本地演示环境可能关闭存储，内存状态仍可继续使用。
  }
}

function isPlaygroundSession(value: unknown): value is PlaygroundSession {
  return Boolean(
    value
    && typeof value === 'object'
    && typeof (value as PlaygroundSession).id === 'string'
    && typeof (value as PlaygroundSession).modelId === 'string'
    && Array.isArray((value as PlaygroundSession).messages),
  )
}

function compactPlaygroundSession(session: PlaygroundSession): PlaygroundSession {
  const clip = (value: string | null, max: number): string | null => value === null ? null : value.slice(0, max)
  return {
    ...session,
    prompt: session.prompt.slice(0, 8_000),
    response: session.response.slice(0, 16_000),
    messages: session.messages.map((message) => ({
      ...message,
      content: message.content.slice(0, 16_000),
      reasoning: message.reasoning.slice(0, 8_000),
      error: clip(message.error, 4_000),
    })),
  }
}

// 中文：替换消息时截断目标轮次及其后续内容，避免编辑后旧回复继续残留在时间线中。
function preparePlaygroundReplacement(session: PlaygroundSession, attemptId: string): {
  messages: PlaygroundMessage[]
  contextBreaks: number[]
} | undefined {
  const targetIndex = session.messages.findIndex((message) => message.attemptId === attemptId)
  if (targetIndex < 0) return undefined
  const messages = session.messages.slice(0, targetIndex)
  const contextBreaks = (session.contextBreaks ?? []).filter((index) => index <= messages.length)
  return { messages, contextBreaks }
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
  deletePlaygroundAttempt: (sessionId: string, attemptId: string) => void
  clearPlaygroundContext: (sessionId: string) => PlaygroundSession | undefined
  updateProfile: (input: Pick<AppSnapshot, 'nickname' | 'phone' | 'avatar'>) => void
}

const AppStoreContext = createContext<AppStoreValue | null>(null)

type AppStoreProviderWithUserProps = {
  children: ReactNode
  userId?: string | null
}

export function AppStoreProvider({ children, userId }: AppStoreProviderWithUserProps) {
  // 中文：按账号作用域挂载，防止切换用户时旧会话在 effect 刷新前短暂可见。
  const scopeKey = userId === undefined
    ? 'legacy'
    : userId === null
      ? 'guest'
      : `user:${userId}`
  return <AppStoreProviderWithUser key={scopeKey} children={children} userId={userId} />
}

function AppStoreProviderWithUser({ children, userId }: AppStoreProviderWithUserProps) {
  const [snapshot, setSnapshot] = useState<AppSnapshot>(loadSnapshot)
  const [playgroundSessions, setPlaygroundSessions] = useState<PlaygroundSession[]>(() => userId === undefined
    ? loadLegacyPlaygroundSessions()
    : readUserSessionHistory(PLAYGROUND_SESSION_HISTORY_KEY, userId, isPlaygroundSession))
  const playgroundOwnerRef = useRef(userId)
  const playgroundHydratingRef = useRef(userId !== undefined)

  useEffect(() => {
    if (userId === undefined) return
    playgroundOwnerRef.current = userId
    playgroundHydratingRef.current = true
    setPlaygroundSessions(readUserSessionHistory(PLAYGROUND_SESSION_HISTORY_KEY, userId, isPlaygroundSession))
    try {
      localStorage.removeItem(LEGACY_PLAYGROUND_HISTORY_KEY)
      localStorage.removeItem(LEGACY_VIDEO_HISTORY_KEY)
    } catch {
      // 中文：迁移到账号隔离存储时，旧的未隔离记录无法继续保留。
    }
  }, [userId])

  // 中文：登录用户的对话按账号写入本地存储，并在账号切换时阻止旧状态写入新账号。
  useEffect(() => {
    if (userId !== undefined) {
      if (playgroundOwnerRef.current !== userId || playgroundHydratingRef.current) {
        playgroundHydratingRef.current = false
        return
      }
      writeUserSessionHistory(PLAYGROUND_SESSION_HISTORY_KEY, userId, playgroundSessions.map(compactPlaygroundSession))
      return
    }
    try {
      localStorage.setItem(LEGACY_PLAYGROUND_HISTORY_KEY, JSON.stringify(playgroundSessions))
    } catch {
      // 存储不可用时继续保留内存会话。
    }
  }, [playgroundSessions, userId])
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
    const replacement = input.replaceAttemptId && existing
      ? preparePlaygroundReplacement(existing, input.replaceAttemptId)
      : undefined
    if (input.replaceAttemptId && !replacement) throw new Error('待替换的尝试不存在')
    // 中文：编辑已有完整轮次会先截断再重答，即使原会话已满轮也允许替换，不会增加轮次。
    if (existing && !replacement && !canStartPlaygroundRound(existing.rounds)) {
      throw new Error(`智能会话最多支持 ${PLAYGROUND_MAX_ROUNDS} 轮对话`)
    }
    const createdAt = new Date().toLocaleString('zh-CN', { hour12: false }).slice(0, 19)
    const requestId = input.requestId?.trim() || createId('req')
    const attemptId = createId('attempt')
    const reasoning = input.reasoning ?? ''
    const inputTokens = input.inputTokens ?? null
    const outputTokens = input.outputTokens ?? null
    const cost = input.cost ?? null
    const latency = input.latency ?? null
    const messages = replacement?.messages ?? (existing?.messages ?? [])
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
      contextBreaks: replacement?.contextBreaks ?? existing?.contextBreaks ?? [],
      rounds: messages.slice(replacement?.contextBreaks.at(-1) ?? (existing?.contextBreaks?.at(-1) ?? 0)).filter((message) => message.role === 'assistant' && message.status === 'complete').length + 1,
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
    setPlaygroundSessions((previous) => [session, ...previous.filter((item) => item.id !== session.id)])
    return session
  }, [playgroundSessions])

  const recordPlaygroundFailure = useCallback((input: PlaygroundFailureInput) => {
    const existing = input.sessionId ? playgroundSessions.find((item) => item.id === input.sessionId) : undefined
    const replacement = input.replaceAttemptId && existing
      ? preparePlaygroundReplacement(existing, input.replaceAttemptId)
      : undefined
    if (input.replaceAttemptId && !replacement) throw new Error('待替换的尝试不存在')
    if (existing && !replacement && !canStartPlaygroundRound(existing.rounds)) {
      throw new Error(`智能会话最多支持 ${PLAYGROUND_MAX_ROUNDS} 轮对话`)
    }
    const createdAt = new Date().toLocaleString('zh-CN', { hour12: false }).slice(0, 19)
    const requestId = input.requestId?.trim() || createId('req')
    const attemptId = createId('attempt')
    const messages = replacement?.messages ?? (existing?.messages ?? [])
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
      contextBreaks: replacement?.contextBreaks ?? existing?.contextBreaks ?? [],
      rounds: messages.slice(replacement?.contextBreaks.at(-1) ?? (existing?.contextBreaks?.at(-1) ?? 0)).filter((message) => message.role === 'assistant' && message.status === 'complete').length,
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
    setPlaygroundSessions((previous) => [session, ...previous.filter((item) => item.id !== session.id)])
    return session
  }, [playgroundSessions, userId])

  const clearPlaygroundContext = useCallback((sessionId: string) => {
    const existing = playgroundSessions.find((item) => item.id === sessionId)
    if (!existing) return undefined
    const lastBreak = existing.contextBreaks?.at(-1) ?? 0
    if (existing.messages.length <= lastBreak) return existing
    const updatedAt = new Date().toLocaleString('zh-CN', { hour12: false }).slice(0, 19)
    // 中文：只切断后续请求上下文，历史消息和左侧会话条目继续保留。
    const session: PlaygroundSession = {
      ...existing,
      contextBreaks: [...(existing.contextBreaks ?? []), existing.messages.length],
      rounds: 0,
      updatedAt,
    }
    setPlaygroundSessions((previous) => [session, ...previous.filter((item) => item.id !== session.id)])
    return session
  }, [playgroundSessions, userId])

  const deletePlaygroundAttempt = useCallback((sessionId: string, attemptId: string) => {
    const existing = playgroundSessions.find((item) => item.id === sessionId)
    if (!existing) return
    const messages = existing.messages.filter((message) => message.attemptId !== attemptId)
    if (messages.length === 0) {
      setPlaygroundSessions((previous) => previous.filter((item) => item.id !== sessionId))
      return
    }
    const lastAssistant = [...messages].reverse().find((message) => message.role === 'assistant')
    const lastUser = [...messages].reverse().find((message) => message.role === 'user')
    const lastBreak = existing.contextBreaks?.at(-1) ?? 0
    const rounds = messages.slice(lastBreak).filter((message) => message.role === 'assistant' && message.status === 'complete').length
    const session: PlaygroundSession = {
      ...existing,
      messages,
      rounds,
      prompt: lastUser?.content ?? '',
      response: lastAssistant?.content ?? '',
      requestId: lastAssistant?.requestId ?? existing.requestId,
      updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }).slice(0, 19),
      inputTokens: lastAssistant?.inputTokens ?? null,
      outputTokens: lastAssistant?.outputTokens ?? null,
      cost: lastAssistant?.cost ?? null,
      latency: lastAssistant?.latency ?? null,
    }
    setPlaygroundSessions((previous) => [session, ...previous.filter((item) => item.id !== session.id)])
  }, [playgroundSessions, userId])

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
    deletePlaygroundAttempt,
    clearPlaygroundContext,
    updateProfile,
  }), [snapshot, playgroundSessions, activeWorkspace, selectedModelId, switchWorkspace, replaceEnterpriseWorkspaces, createApiKey, disableApiKey, deleteApiKey, runPlayground, recordPlaygroundFailure, deletePlaygroundAttempt, clearPlaygroundContext, updateProfile])

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>
}

export function useAppStore(): AppStoreValue {
  const value = useContext(AppStoreContext)
  if (!value) throw new Error('useAppStore 必须在 AppStoreProvider 内使用')
  return value
}
