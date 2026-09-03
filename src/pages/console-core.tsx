import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Link, useSearchParams, useNavigate } from 'react-router'
import Button from '@douyinfe/semi-ui/lib/es/button'
import Popover from '@douyinfe/semi-ui/lib/es/popover'
import Tooltip from '@douyinfe/semi-ui/lib/es/tooltip'
import Modal from '@/components/app-modal'
import Toast from '@douyinfe/semi-ui/lib/es/toast'
import { IconAlertTriangle, IconArrowLeft, IconArrowRight, IconArrowUp, IconChevronDown, IconClose, IconCommentStroked, IconCopy, IconCopyStroked, IconDeleteStroked, IconEdit, IconExpand, IconPlus, IconRedo, IconRedoStroked, IconSearch, IconSend, IconSetting, IconShrink, IconStop } from '@douyinfe/semi-icons'
import { EmptyPanel, ModelCard, ModelLogo, PageTitle } from '@/components/common'
import { appToast } from '@/components/app-toast'
import { ModelDetailDrawer } from '@/components/model-detail-drawer'
import { MarkdownContent } from '@/components/markdown-content'
import { BackofficeMoneyText as MoneyText } from '@/components/money'
import { TraePagination } from '@/components/trae-pagination'
import { CompatCard as Card, CompatInput as Input, CompatSelect as Select } from '@/components/semi-compat'
import { useAppStore, type PlaygroundMessage, type PlaygroundSession } from '@/data/app-state'
import { findModelInList, mapUserModels, modelAlias, type ModelRecord } from '@/data/models'
import type { UserModelModality } from '@/api/user-models'
import { useUserModelDetail, useUserModels } from '@/data/user-models'
import { ModelRuntimeError, streamChatCompletion, type ChatCompletionMessage } from '@/api/model-runtime'
import { formatNumber } from '@/utils/format'
import { canStartPlaygroundRound, limitPlaygroundPrompt, PLAYGROUND_MAX_INPUT_CHARACTERS } from '@/utils/playground'
import { clearAuthTokens, getAccessToken } from '@/auth/token-storage'
import { invalidateAuth } from '@/store/auth-slice'
import { useAppDispatch } from '@/store/hooks'
import { DEFAULT_MODEL_PAGE_SIZE, MODEL_CATEGORIES, MODEL_PAGE_SIZES, MODEL_PRICE_FILTERS, MODEL_SORTS, filterAndSortModels, modelCategoryCounts, paginateModels, type ModelCategory, type ModelPriceFilter, type ModelSort } from '@/utils/model-filters'
import { QuickstartGuide } from '@/components/quickstart-guide'
import './playground.css'
import './console-models.css'

const FIRST_MODEL_PAGE = 1

export function ConsoleModelsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [category, setCategory] = useState<ModelCategory>('all')
  const [activityId, setActivityId] = useState('')
  const [page, setPage] = useState(FIRST_MODEL_PAGE)
  const [pageSize, setPageSize] = useState<number>(DEFAULT_MODEL_PAGE_SIZE)
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedModelAlias = searchParams.get('model')
  // 搜索词初始值取 URL 的 keyword 参数（模型广场“立即体验”跳转时携带）。
  const [query, setQuery] = useState(() => searchParams.get('keyword')?.trim() ?? '')
  const [company, setCompany] = useState('all')
  const [priceFilter, setPriceFilter] = useState<ModelPriceFilter>('all')
  const [sort, setSort] = useState<ModelSort>('default')
  // 防抖后的搜索关键词：作为 keyword 参数交给后端做服务端搜索，避免每次按键都发请求。
  const [debouncedKeyword, setDebouncedKeyword] = useState(() => searchParams.get('keyword')?.trim() ?? '')
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedKeyword((current) => {
        const next = query.trim()
        return next === current ? current : next
      })
    }, 300)
    return () => window.clearTimeout(timer)
  }, [query])
  // 关键词搜索由后端完成，此时不能启用服务端分页参数（结果集已被检索过滤）。
  const canUseServerPagination = !debouncedKeyword && company === 'all' && priceFilter === 'all' && sort === 'default'
  const serverModelType: UserModelModality | undefined = category === 'all' || category === 'speech' || category === 'transcription' ? undefined : category
  const { models: userModels, activities, total: apiTotal, page: apiPage, pageSize: apiPageSize, loading, error } = useUserModels({ activityId: activityId || undefined, modelType: serverModelType, ...(debouncedKeyword ? { keyword: debouncedKeyword } : {}), ...(canUseServerPagination ? { page, pageSize } : {}) })
  const [detailModel, setDetailModel] = useState<ModelRecord | null>(null)
  const requestedDetailState = useUserModelDetail(requestedModelAlias)
  const detailState = useUserModelDetail(requestedModelAlias ?? (detailModel ? modelAlias(detailModel) : null))
  const companies = useMemo(() => [...new Set(userModels.map((model) => model.company))].sort((left, right) => left.localeCompare(right, 'zh-CN')), [userModels])
  // 关键词搜索已由服务端 keyword 参数完成，本地不再按 query 二次过滤，避免匹配字段差异造成误过滤。
  const localQuery = debouncedKeyword ? '' : query
  const filteredModels = useMemo(() => filterAndSortModels(userModels, { query: localQuery, company, category, priceFilter, sort }), [category, company, localQuery, priceFilter, sort, userModels])
  const categoryCounts = useMemo(() => modelCategoryCounts(userModels, { query: localQuery, company, priceFilter }), [company, localQuery, priceFilter, userModels])
  const pageResult = useMemo(() => {
    if (apiTotal === null) return paginateModels(filteredModels, page, pageSize)
    const currentPage = apiPage ?? page
    const currentPageSize = apiPageSize ?? pageSize
    const start = apiTotal === 0 ? 0 : (currentPage - 1) * currentPageSize + 1
    return { items: filteredModels, page: currentPage, pageSize: currentPageSize, total: apiTotal, totalPages: apiTotal === 0 ? 0 : Math.ceil(apiTotal / currentPageSize), start, end: Math.min(currentPage * currentPageSize, apiTotal) }
  }, [apiPage, apiPageSize, apiTotal, filteredModels, page, pageSize])
  // 中文：单卡页面限制卡片宽度，多卡页面继续由网格平均分配可用空间。
  const modelGridClassName = pageResult.items.length === 1 ? 'model-card-grid model-card-grid--single' : 'model-card-grid'

  useEffect(() => {
    if (error) appToast.error(error)
  }, [error])

  useEffect(() => {
    if (!requestedModelAlias) return
    const requestedModel = findModelInList(userModels, requestedModelAlias)
    if (requestedModel) {
      setDetailModel(requestedModel)
      return
    }
    // 当前列表里找不到时，用接口详情兜底构造一条本地记录打开抽屉。
    const fetchedModel = requestedDetailState.detail?.model
    if (fetchedModel) {
      const mappedModel = mapUserModels([fetchedModel])[0] ?? null
      setDetailModel(mappedModel)
    }
  }, [requestedDetailState.detail, requestedModelAlias, userModels])

  // keyword 跳转（模型广场“立即体验”）：搜索结果返回后自动打开对应模型的详情侧边栏。
  const requestedKeyword = searchParams.get('keyword')?.trim() ?? ''
  const autoOpenedKeywordRef = useRef('')
  useEffect(() => {
    // URL keyword 被清除（如关闭抽屉）时重置标记，保证下次带参跳转仍能自动打开。
    if (!requestedKeyword) {
      autoOpenedKeywordRef.current = ''
      return
    }
    // model 参数优先定位详情；同一 keyword 只自动打开一次，避免用户输入时反复弹抽屉。
    if (requestedModelAlias || loading || error || autoOpenedKeywordRef.current === requestedKeyword) return
    const loweredKeyword = requestedKeyword.toLocaleLowerCase()
    const exactMatch = userModels.find((model) => model.name.trim().toLocaleLowerCase() === loweredKeyword || modelAlias(model).toLocaleLowerCase() === loweredKeyword)
    const target = exactMatch ?? (userModels.length === 1 ? userModels[0] : undefined)
    if (!target) return
    autoOpenedKeywordRef.current = requestedKeyword
    setDetailModel(target)
  }, [error, loading, requestedKeyword, requestedModelAlias, userModels])

  useEffect(() => {
    if (pageResult.page !== page) setPage(pageResult.page)
  }, [page, pageResult.page])

  function updateFilter(update: () => void): void {
    setPage(FIRST_MODEL_PAGE)
    update()
  }

  function selectActivity(activity: string): void {
    updateFilter(() => {
      setActivityId(activity)
      setPriceFilter('all')
    })
  }

  function clearFilters(): void {
    setQuery('')
    setCompany('all')
    setPriceFilter('all')
    setCategory('all')
    setActivityId('')
    setSort('default')
    setPage(FIRST_MODEL_PAGE)
  }

  function closeModelDetail(): void {
    setDetailModel(null)
    setQuery('')
    if (!requestedModelAlias && !searchParams.get('keyword')) return
    // 关闭抽屉时清掉 model 定位参数和 keyword 搜索词（原 model_name 定位语义已迁移到 keyword）。
    const nextSearchParams = new URLSearchParams(searchParams)
    nextSearchParams.delete('model')
    nextSearchParams.delete('keyword')
    setSearchParams(nextSearchParams, { replace: true })
  }

  return <div className="page-stack models-console-page">
    <PageTitle title={t('console.models.title')} description={t('console.models.description')} />
    {loading ? <EmptyPanel title={t('console.common.loadingModels')} description={t('console.common.readingModels')} /> : null}
    {!loading && !error ? <>
    <div className="models-toolbar">
      <Input className="app-standard-input models-search-input" size="large" prefix={<IconSearch aria-hidden="true" />} value={query} onChange={(value) => updateFilter(() => setQuery(value))} placeholder={t('console.models.searchPlaceholder')} aria-label={t('console.models.searchPlaceholder').replace('...', '')} showClear />
      <Select className="models-company-select" value={company} onChange={(value) => updateFilter(() => setCompany(String(value)))} aria-label={t('console.common.allCompanies')}><Select.Option value="all">{t('console.common.allCompanies')}</Select.Option>{companies.map((item) => <Select.Option key={item} value={item}>{item}</Select.Option>)}</Select>
      <div className="models-controls">
        <div className="price-filters model-activity-filters" role="group" aria-label={activities.length ? t('console.models.activityFilter') : t('console.common.priceStatus')}>
          {activities.length ? <>
            <button className={`price-filter${activityId === '' ? ' active' : ''}`} type="button" aria-pressed={activityId === ''} onClick={() => selectActivity('')}>{t('console.common.all')}</button>
            {activities.map((activity) => <button className={`price-filter${activityId === activity.id ? ' active' : ''}`} type="button" aria-pressed={activityId === activity.id} key={activity.id} onClick={() => selectActivity(activity.id)}>{activity.name}</button>)}
          </> : MODEL_PRICE_FILTERS.map((filter) => <button className={`price-filter${priceFilter === filter.value ? ' active' : ''}`} type="button" aria-pressed={priceFilter === filter.value} key={filter.value} onClick={() => updateFilter(() => { setActivityId(''); setPriceFilter(filter.value) })}>{t(filter.labelKey)}</button>)}
        </div>
        <label className="sort-control"><span>{t('console.common.sort')}</span><Select value={sort} onChange={(value) => updateFilter(() => setSort(value as ModelSort))} aria-label={t('console.common.modelSort')}>{MODEL_SORTS.map((option) => <Select.Option key={option.value} value={option.value}>{t(option.labelKey)}</Select.Option>)}</Select></label>
      </div>
    </div>
    <div className="models-subbar">
      <div className="modality-tabs" role="group" aria-label={t('console.common.modelType')}>{MODEL_CATEGORIES.map((tab) => <button className={`modality-tab${category === tab.value ? ' active' : ''}`} type="button" aria-pressed={category === tab.value} key={tab.value} disabled={categoryCounts[tab.value] === 0} onClick={() => updateFilter(() => setCategory(tab.value))}>{t(tab.labelKey)} <span className="tab-count">{categoryCounts[tab.value]}</span></button>)}</div><span className="models-result-count">{t('console.common.modelCount', { count: pageResult.total })}</span>
    </div>
    {filteredModels.length ? <>
      <div className={modelGridClassName}>{pageResult.items.map((model) => <ModelCard key={model.id} model={model} onSelect={setDetailModel} onApi={(selectedModel) => navigate(`/console/api-keys?model=${encodeURIComponent(modelAlias(selectedModel))}`)} onChat={(selectedModel) => navigate(`/console/playground?model=${encodeURIComponent(modelAlias(selectedModel))}`)} />)}</div>
      <TraePagination ariaLabel={t('console.models.modelPage')} currentPage={pageResult.page} pageSize={pageSize} total={pageResult.total} pageSizeOpts={[...MODEL_PAGE_SIZES]} summary={t('console.common.showRange', { start: pageResult.start, end: pageResult.end, total: pageResult.total })} onChange={(nextPage, nextPageSize) => { setPageSize(nextPageSize); setPage(nextPageSize === pageSize ? nextPage : FIRST_MODEL_PAGE) }} />
    </> : <EmptyPanel title={t('console.models.modelNotFound')} description={t('console.common.adjustFilters')} action={<Button theme="outline" onClick={clearFilters}>{t('console.common.clearFilters')}</Button>} />}
    </> : null}
    <ModelDetailDrawer model={detailModel} detail={detailState.detail} loading={detailState.loading} error={detailState.error} visible={detailModel !== null} onClose={closeModelDetail} />
  </div>
}

const DEFAULT_TEMPERATURE = '0.7'
const DEFAULT_MAX_TOKENS = '2000'
const MIN_TEMPERATURE = 0
const MAX_TEMPERATURE = 2
const MIN_MAX_TOKENS = 1
const MAX_MAX_TOKENS = 128_000

function modelErrorMessage(error: unknown, t: TFunction): string {
  if (error instanceof DOMException && error.name === 'AbortError') return t('console.playground.stopped')
  if (error instanceof ModelRuntimeError && error.message.trim()) return error.message
  return t('console.playground.modelCallFailed')
}

function formatTokenMetric(value: number | null, t: TFunction): string {
  return value === null ? t('console.common.backendNotReturned') : `${formatNumber(value)} tk`
}

function formatSessionCost(value: number | null, t: TFunction): ReactNode {
  return value === null ? t('console.common.officialBilling') : <MoneyText value={value} />
}

function lastUserMessage(session: { messages: PlaygroundMessage[]; prompt: string }): string {
  return [...session.messages].reverse().find((message) => message.role === 'user')?.content ?? session.prompt
}

// 中文：消息时间只展示月日和时分，保持气泡下方信息紧凑。
function formatMessageTime(value: string): string {
  const match = value.match(/\d{4}[-/](\d{1,2})[-/](\d{1,2})[ T](\d{2}:\d{2})/)
  return match ? `${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')} ${match[3]}` : value
}

// 中文：分段之前的消息只用于展示，不再进入后续模型请求。
function sessionContextStart(session: PlaygroundSession): number {
  return session.contextBreaks?.at(-1) ?? 0
}

function sessionContextMessages(session: PlaygroundSession): PlaygroundMessage[] {
  return session.messages.slice(sessionContextStart(session))
}

// 中文：分割线属于当前会话时间线，不创建新的左侧历史记录。
function PlaygroundMessageTimeline({ session, hiddenAttemptId, dividerLabel, renderMessage }: { session: PlaygroundSession; hiddenAttemptId: string; dividerLabel: string; renderMessage: (message: PlaygroundMessage) => ReactNode }) {
  const contextBreaks = new Set(session.contextBreaks ?? [])
  return <>
    {session.messages.map((message, index) => <Fragment key={`timeline-${message.id}`}>
      {contextBreaks.has(index) ? <div className="context-divider" role="separator"><span>{dividerLabel}</span></div> : null}
      {message.attemptId !== hiddenAttemptId ? renderMessage(message) : null}
    </Fragment>)}
    {contextBreaks.has(session.messages.length) ? <div className="context-divider" role="separator"><span>{dividerLabel}</span></div> : null}
  </>
}

function PlaygroundWorkspaceNotice({ message, description, action, tone = 'error' }: { message: string; description?: string; action?: ReactNode; tone?: 'error' | 'neutral' }) {
  return <div className={`workspace-notice-state playground-workspace-notice${tone === 'neutral' ? ' is-neutral' : ''}`} role="alert">
    <span className="workspace-notice-icon"><IconAlertTriangle aria-hidden="true" /></span>
    <strong>{message}</strong>
    {description ? <p>{description}</p> : null}
    {action ? <div className="workspace-notice-actions">{action}</div> : null}
  </div>
}

// 中文：回复区操作统一使用 Semi 图标按钮，固定尺寸以避免图标切换或加载时布局抖动。
function PlaygroundMessageIconButton({ label, icon, disabled = false, onClick }: { label: string; icon: ReactNode; disabled?: boolean; onClick: () => void }) {
  return <Button className="message-icon-action" theme="borderless" size="small" icon={icon} aria-label={label} title={label} disabled={disabled} onClick={onClick} />
}

export { apiKeySupportsModel } from '@/utils/model-access'

export function PlaygroundPage() {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const store = useAppStore()
  const { models, loading: modelsLoading, error: modelsError } = useUserModels()
  const [searchParams] = useSearchParams()
  const requestedModelAlias = searchParams.get('model')?.trim() ?? ''
  const initialModelId = requestedModelAlias || store.selectedModelId
  const [modelId, setModelId] = useState(initialModelId)
  const [prompt, setPrompt] = useState('')
  const [running, setRunning] = useState(false)
  const [selectedSessionId, setSelectedSessionId] = useState('')
  const [historyCollapsed, setHistoryCollapsed] = useState(false)
  const [composerExpanded, setComposerExpanded] = useState(false)
  const [paramsVisible, setParamsVisible] = useState(false)
  const [contextMenuVisible, setContextMenuVisible] = useState(false)
  const [temperature, setTemperature] = useState(DEFAULT_TEMPERATURE)
  const [maxTokens, setMaxTokens] = useState(DEFAULT_MAX_TOKENS)
  const [activePrompt, setActivePrompt] = useState('')
  const [streamingResponse, setStreamingResponse] = useState('')
  const [streamingReasoning, setStreamingReasoning] = useState('')
  const [editingAttemptId, setEditingAttemptId] = useState('')
  const [editingUserAttemptId, setEditingUserAttemptId] = useState('')
  const [editingUserPrompt, setEditingUserPrompt] = useState('')
  const [retryingAttemptId, setRetryingAttemptId] = useState('')
  const requestControllerRef = useRef<AbortController | null>(null)
  const streamingResponseRef = useRef('')
  const streamingReasoningRef = useRef('')
  const messageListRef = useRef<HTMLDivElement | null>(null)
  const followMessageBottomRef = useRef(true)
  const abortReasonRef = useRef<'user' | 'navigation' | null>(null)
  const workspaceKey = `${store.activeWorkspace.type}:${store.activeWorkspace.id}`
  const selectedSession = store.playgroundSessions.find((session) => session.id === selectedSessionId)
  const currentContextMessages = selectedSession ? sessionContextMessages(selectedSession) : []
  const hasCurrentContextMessages = currentContextMessages.length > 0
  const currentRounds = selectedSession?.rounds ?? 0
  const canContinueConversation = canStartPlaygroundRound(currentRounds)
  const selectableModels = useMemo(
    () => models.filter((model) => model.modality === 'text' && Boolean(modelAlias(model))),
    [models],
  )
  const selectedModel = findModelInList(selectableModels, modelId) ?? selectableModels[0]

  useEffect(() => {
    if (modelsError) appToast.error(modelsError)
  }, [modelsError])

  function deleteAttempt(attemptId: string): void {
    if (!selectedSession) return
    store.deletePlaygroundAttempt(selectedSession.id, attemptId)
    appToast.info(t('console.playground.deletedAttempt'))
  }

  function handleMessageScroll(event: React.UIEvent<HTMLDivElement>): void {
    const element = event.currentTarget
    followMessageBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight <= 40
  }

  useEffect(() => {
    const element = messageListRef.current
    if (!element || !followMessageBottomRef.current) return
    element.scrollTop = element.scrollHeight
  }, [activePrompt, selectedSessionId, streamingReasoning, streamingResponse])

  useEffect(() => {
    requestControllerRef.current?.abort()
    requestControllerRef.current = null
    abortReasonRef.current = 'navigation'
    setSelectedSessionId('')
    setEditingAttemptId('')
    setEditingUserAttemptId('')
    setEditingUserPrompt('')
    setRetryingAttemptId('')
    setActivePrompt('')
    setStreamingResponse('')
    setStreamingReasoning('')
    setComposerExpanded(false)
  }, [workspaceKey])

  useEffect(() => {
    // 中文：从模型广场跳转时，接口加载期间先保留 URL 指定的模型，避免被首个模型抢先覆盖。
    if (modelsLoading) return
    if (selectableModels.some((model) => modelAlias(model) === modelId)) {
      if (store.selectedModelId !== modelId) store.setSelectedModelId(modelId)
      return
    }
    const fallback = selectableModels[0]
    const fallbackAlias = fallback ? modelAlias(fallback) : ''
    if (modelId === fallbackAlias) return
    setModelId(fallbackAlias)
    store.setSelectedModelId(fallbackAlias)
  }, [modelId, modelsLoading, selectableModels, store])

  useEffect(() => () => {
    abortReasonRef.current = 'navigation'
    requestControllerRef.current?.abort()
  }, [])

  function abortGeneration(reason: 'user' | 'navigation'): void {
    abortReasonRef.current = reason
    requestControllerRef.current?.abort()
  }

  function stopGeneration(): void {
    abortGeneration('user')
  }

  async function runTest(promptValue = prompt, replaceAttemptValue = editingAttemptId): Promise<void> {
    const trimmedPrompt = promptValue.trim()
    const replacingAttemptId = replaceAttemptValue || undefined
    const replacementIndex = replacingAttemptId && selectedSession
      ? selectedSession.messages.findIndex((message) => message.attemptId === replacingAttemptId)
      : -1
    const requestContextMessages = replacementIndex >= 0
      ? (selectedSession?.messages ?? []).slice(0, replacementIndex)
      : currentContextMessages
    if (running) return
    if (!trimmedPrompt) { Toast.warning(t('console.playground.promptRequired')); return }
    if (!selectedModel || !modelAlias(selectedModel)) { Toast.warning(t('console.playground.noTextModelAlias')); return }
    const replacingCompleteAttempt = Boolean(replacingAttemptId && selectedSession?.messages.some((message) => message.attemptId === replacingAttemptId && message.role === 'assistant' && message.status === 'complete'))
    if (!canContinueConversation && !replacingCompleteAttempt) { Toast.warning(t('console.playground.newSessionLimit')); return }
    const accessToken = getAccessToken()
    if (!accessToken) {
      clearAuthTokens({ force: true })
      dispatch(invalidateAuth())
      navigate('/', { replace: true })
      return
    }
    const parsedTemperature = Number(temperature)
    const parsedMaxTokens = Number(maxTokens)
    if (!Number.isFinite(parsedTemperature) || parsedTemperature < MIN_TEMPERATURE || parsedTemperature > MAX_TEMPERATURE) {
      Toast.warning(t('console.playground.temperatureInvalid', { min: MIN_TEMPERATURE, max: MAX_TEMPERATURE }))
      setParamsVisible(true)
      return
    }
    if (!Number.isInteger(parsedMaxTokens) || parsedMaxTokens < MIN_MAX_TOKENS || parsedMaxTokens > MAX_MAX_TOKENS) {
      Toast.warning(t('console.playground.maxTokensInvalid', { min: MIN_MAX_TOKENS, max: MAX_MAX_TOKENS }))
      setParamsVisible(true)
      return
    }
    const controller = new AbortController()
    requestControllerRef.current = controller
    abortReasonRef.current = null
    setRunning(true)
    setRetryingAttemptId(replacingAttemptId ?? '')
    setActivePrompt(trimmedPrompt)
    followMessageBottomRef.current = true
    setStreamingResponse('')
    setStreamingReasoning('')
    streamingResponseRef.current = ''
    streamingReasoningRef.current = ''
    try {
      const messages: ChatCompletionMessage[] = [
        ...requestContextMessages
          .filter((message) => message.status !== 'failed')
          .map((message) => ({ role: message.role, content: message.content })),
        { role: 'user', content: trimmedPrompt },
      ]
      const result = await streamChatCompletion({
        accessToken,
        model: modelAlias(selectedModel),
        messages,
        temperature: parsedTemperature,
        maxTokens: parsedMaxTokens,
        signal: controller.signal,
        onDelta: (delta) => {
          streamingResponseRef.current += delta
          setStreamingResponse(streamingResponseRef.current)
        },
        onReasoningDelta: (delta) => {
          streamingReasoningRef.current += delta
          setStreamingReasoning(streamingReasoningRef.current)
        },
      })
      if (!result.content.trim()) {
        throw new ModelRuntimeError(t('console.playground.emptyResponse'), 502, 'empty_response', result.requestId)
      }
      const session = store.runPlayground({
        modelId: modelAlias(selectedModel),
        sessionId: selectedSession?.id,
        replaceAttemptId: replacingAttemptId,
        prompt: trimmedPrompt,
        response: result.content,
        requestId: result.requestId,
        reasoning: result.reasoning,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        cost: null,
        latency: result.latencyMs,
      })
      setSelectedSessionId(session.id)
      setPrompt('')
      setActivePrompt('')
      setStreamingResponse('')
      setStreamingReasoning('')
      streamingResponseRef.current = ''
      streamingReasoningRef.current = ''
      setEditingAttemptId('')
      setEditingUserAttemptId('')
      setEditingUserPrompt('')
      setRetryingAttemptId('')
    } catch (error: unknown) {
      if (controller.signal.aborted && abortReasonRef.current === 'navigation') {
        setActivePrompt('')
        setStreamingResponse('')
        setStreamingReasoning('')
        streamingResponseRef.current = ''
        streamingReasoningRef.current = ''
        setEditingUserAttemptId('')
        setEditingUserPrompt('')
        setRetryingAttemptId('')
        return
      }
      if (error instanceof ModelRuntimeError && error.status === 401) {
        clearAuthTokens({ force: true })
        dispatch(invalidateAuth())
        navigate('/', { replace: true })
        return
      }
      const message = modelErrorMessage(error, t)
      const failedSession = store.recordPlaygroundFailure({
        modelId: modelAlias(selectedModel),
        sessionId: selectedSession?.id,
        replaceAttemptId: replacingAttemptId,
        prompt: trimmedPrompt,
        response: streamingResponseRef.current,
        reasoning: streamingReasoningRef.current,
        requestId: error instanceof ModelRuntimeError ? error.requestId ?? undefined : undefined,
        error: message,
      })
      setSelectedSessionId(failedSession.id)
      setPrompt('')
      setActivePrompt('')
      setStreamingResponse('')
      setStreamingReasoning('')
      streamingResponseRef.current = ''
      streamingReasoningRef.current = ''
      setEditingAttemptId('')
      setEditingUserAttemptId('')
      setEditingUserPrompt('')
      setRetryingAttemptId('')
      if (controller.signal.aborted && abortReasonRef.current === 'user') appToast.info(message)
      else appToast.error(message)
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null
        abortReasonRef.current = null
      }
      setRunning(false)
    }
  }

  function startNewSession(): void {
    if (running) abortGeneration('navigation')
    setSelectedSessionId('')
    setEditingAttemptId('')
    setEditingUserAttemptId('')
    setEditingUserPrompt('')
    setRetryingAttemptId('')
    setActivePrompt('')
    setStreamingResponse('')
    setStreamingReasoning('')
    streamingResponseRef.current = ''
    streamingReasoningRef.current = ''
    setPrompt('')
    followMessageBottomRef.current = true
  }

  function clearCurrentContext(): void {
    if (!selectedSession || !hasCurrentContextMessages || running) return
    store.clearPlaygroundContext(selectedSession.id)
    setEditingAttemptId('')
    setEditingUserAttemptId('')
    setEditingUserPrompt('')
    setRetryingAttemptId('')
    setContextMenuVisible(false)
    followMessageBottomRef.current = true
  }

  function selectSession(session: typeof store.playgroundSessions[number]): void {
    if (running) abortGeneration('navigation')
    setSelectedSessionId(session.id)
    const sessionModel = findModelInList(models, session.modelId)
    const sessionAlias = sessionModel ? modelAlias(sessionModel) : ''
    setModelId(sessionAlias)
    store.setSelectedModelId(sessionAlias)
    setEditingAttemptId('')
    setEditingUserAttemptId('')
    setEditingUserPrompt('')
    setRetryingAttemptId('')
    setActivePrompt('')
    setStreamingResponse('')
    setStreamingReasoning('')
    streamingResponseRef.current = ''
    streamingReasoningRef.current = ''
    setPrompt('')
    followMessageBottomRef.current = true
  }

  function copyMessage(value: string, successMessage: string): void {
    if (!navigator.clipboard) { Toast.error(t('console.common.copyFailed')); return }
    void navigator.clipboard.writeText(value).then(() => Toast.success(successMessage)).catch(() => Toast.error(t('console.common.copyFailed')))
  }

  // 中文：透明操作项仍支持键盘回车和空格，避免仅依赖鼠标悬浮交互。
  function activateAction(event: React.KeyboardEvent<HTMLElement>, action: () => void): void {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    action()
  }

  function editFailedAttempt(attemptId: string): void {
    const failedUserMessage = selectedSession?.messages.find((message) => message.attemptId === attemptId && message.role === 'user' && message.status === 'failed')
    if (!failedUserMessage) return
    setEditingAttemptId(attemptId)
    setEditingUserAttemptId('')
    setEditingUserPrompt('')
    setPrompt(failedUserMessage.content)
  }

  // 中文：普通用户消息在原位置进入编辑态，提交后替换该轮并重新请求模型。
  function editUserAttempt(attemptId: string): void {
    if (running) return
    const userMessage = selectedSession?.messages.find((message) => message.attemptId === attemptId && message.role === 'user' && message.status === 'complete')
    if (!userMessage) return
    setEditingUserAttemptId(attemptId)
    setEditingUserPrompt(userMessage.content)
  }

  function cancelUserEdit(): void {
    if (running) return
    setEditingUserAttemptId('')
    setEditingUserPrompt('')
  }

  // 中文：重试沿用当前会话上下文；失败尝试可被同一条消息替换，成功尝试则追加一轮新响应。
  function retryAttempt(attemptId: string): void {
    const userMessage = selectedSession?.messages.find((message) => message.attemptId === attemptId && message.role === 'user')
    if (!userMessage || running) return
    const failed = userMessage.status === 'failed'
    setEditingAttemptId(failed ? attemptId : '')
    setEditingUserAttemptId('')
    setEditingUserPrompt('')
    void runTest(userMessage.content, failed ? attemptId : '')
  }

  function renderMessage(message: PlaygroundMessage, streaming = false) {
    const hasStreamingResponse = streamingResponse.length > 0
    const content = streaming ? streamingResponse : message.content
    const reasoning = streaming ? streamingReasoning : message.reasoning
    const isAssistant = message.role === 'assistant'
    const isFailed = !streaming && message.status === 'failed'
    const isEditing = !streaming && !isAssistant && !isFailed && editingUserAttemptId === message.attemptId
    return <div className={`message ${isAssistant ? 'ai' : 'user'}${isFailed ? ' is-failed' : ''}${isEditing ? ' is-editing' : ''}`} key={message.id}>
      {isAssistant ? <div className="message-avatar message-avatar--assistant">{selectedModel?.company?.slice(0, 1) ?? 'N'}</div> : null}
      <div className="message-body">
        {isAssistant ? <div className="message-author"><span>{selectedModel?.name ?? t('console.playground.unnamedModel')}</span><small>{selectedModel?.company ?? 'Token NX'}</small></div> : null}
        {isAssistant && reasoning ? <details className="message-reasoning" open={streaming && running}><summary>{streaming && running ? t('console.playground.thinkingNow') : t('console.playground.thinking')}</summary><MarkdownContent content={reasoning} className="message-reasoning-content" /></details> : null}
        {isEditing ? <div className="user-message-editor">
          <Input.TextArea className="message-editor-input" value={editingUserPrompt} onChange={(value) => setEditingUserPrompt(limitPlaygroundPrompt(value))} maxLength={PLAYGROUND_MAX_INPUT_CHARACTERS} rows={4} autoFocus aria-label={t('console.playground.editMessageInput')} onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
              event.preventDefault()
              if (!running) void runTest(editingUserPrompt, message.attemptId)
            }
          }} />
          <div className="user-message-editor-footer">
            <span className="user-message-editor-hint">{t('console.playground.editMessageHint')}</span>
            <div className="user-message-editor-actions">
              <span className="message-icon-action" role="button" tabIndex={0} aria-label={t('console.playground.cancelEdit')} title={t('console.playground.cancelEdit')} onClick={cancelUserEdit} onKeyDown={(event) => activateAction(event, cancelUserEdit)}><IconClose aria-hidden="true" /></span>
              <span className={`message-icon-action${!editingUserPrompt.trim() || running ? ' is-disabled' : ''}`} role="button" tabIndex={!editingUserPrompt.trim() || running ? -1 : 0} aria-disabled={!editingUserPrompt.trim() || running} aria-label={t('console.playground.sendEditedMessage')} title={t('console.playground.sendEditedMessage')} onClick={() => { if (editingUserPrompt.trim() && !running) void runTest(editingUserPrompt, message.attemptId) }} onKeyDown={(event) => activateAction(event, () => { if (editingUserPrompt.trim() && !running) void runTest(editingUserPrompt, message.attemptId) })}><IconSend aria-hidden="true" /></span>
            </div>
          </div>
        </div> : <>
          {!isFailed || content ? <div className="message-bubble">
            {streaming && !hasStreamingResponse ? <span className="message-loading" role="status" aria-label={t('console.playground.messageLoading')} /> : isAssistant ? <MarkdownContent content={content || t('console.playground.responseEmpty')} /> : content}
            {streaming && running ? <span className="message-cursor" aria-hidden="true" /> : null}
          </div> : null}
          {isAssistant && !streaming && !isFailed ? <div className="message-footer"><div className="message-meta"><span>{t('console.playground.elapsed')} <strong>{message.latency === null ? '--' : `${message.latency}ms`}</strong></span><span>{t('console.common.input')} <strong>{formatTokenMetric(message.inputTokens, t)}</strong></span><span>{t('console.common.output')} <strong>{formatTokenMetric(message.outputTokens, t)}</strong></span><span>{t('console.playground.cost')} <strong>{formatSessionCost(message.cost, t)}</strong></span></div><div className="message-actions"><PlaygroundMessageIconButton label={t('console.playground.copyReply')} icon={<IconCopyStroked aria-hidden="true" />} onClick={() => copyMessage(message.content, t('console.playground.copiedReply'))} /><PlaygroundMessageIconButton label={t('console.playground.retry')} icon={<IconRedoStroked aria-hidden="true" />} disabled={running} onClick={() => retryAttempt(message.attemptId)} /><PlaygroundMessageIconButton label={t('console.playground.deleteAttempt')} icon={<IconDeleteStroked aria-hidden="true" />} disabled={running} onClick={() => deleteAttempt(message.attemptId)} /></div></div> : null}
          {!streaming && !isAssistant && message.content ? <div className="user-message-footer"><time dateTime={message.createdAt}>{formatMessageTime(message.createdAt)}</time><div className="user-message-actions"><span className="message-icon-action" role="button" tabIndex={0} aria-label={t('console.playground.copyUserMessage')} title={t('console.playground.copyUserMessage')} onClick={() => copyMessage(message.content, t('console.playground.copiedUserMessage'))} onKeyDown={(event) => activateAction(event, () => copyMessage(message.content, t('console.playground.copiedUserMessage')))}><IconCopy aria-hidden="true" /></span>{!isFailed ? <span className="message-icon-action" role="button" tabIndex={0} aria-label={t('console.playground.editMessage')} title={t('console.playground.editMessage')} onClick={() => editUserAttempt(message.attemptId)} onKeyDown={(event) => activateAction(event, () => editUserAttempt(message.attemptId))}><IconEdit aria-hidden="true" /></span> : null}</div></div> : null}
          {isFailed && isAssistant ? <div className="message-actions"><span className="message-icon-action" role="button" tabIndex={0} aria-label={t('console.playground.editFailed')} title={t('console.playground.editFailed')} onClick={() => editFailedAttempt(message.attemptId)} onKeyDown={(event) => activateAction(event, () => editFailedAttempt(message.attemptId))}><IconEdit aria-hidden="true" /></span><span className={`message-icon-action${running ? ' is-disabled' : ''}`} role="button" tabIndex={running ? -1 : 0} aria-disabled={running} aria-label={t('console.playground.retry')} title={t('console.playground.retry')} onClick={() => retryAttempt(message.attemptId)} onKeyDown={(event) => activateAction(event, () => retryAttempt(message.attemptId))}><IconRedo aria-hidden="true" /></span></div> : null}
        </>}
      </div>
    </div>
  }

  const centerMessageState = !selectedSession && !activePrompt

  return <div className={`page-stack playground-console-page${historyCollapsed ? ' is-history-collapsed' : ''}`}>
    <section className="playground-shell" aria-label={t('console.playground.title')}>
      <aside className="history-panel" aria-labelledby="history-title">
        <div className="history-heading">
          <h2 id="history-title" className="sr-only">{t('console.playground.history')}</h2>
          <Tooltip content={t('console.playground.createNewSession')} position="top"><div className="new-session-button" role="button" tabIndex={0} aria-label={t('console.playground.createNewSession')} onClick={startNewSession} onKeyDown={(event) => activateAction(event, startNewSession)}><IconPlus aria-hidden="true" /><span>{t('console.playground.newSession')}</span></div></Tooltip>
          <div className="history-collapse-button" role="button" tabIndex={0} aria-label={historyCollapsed ? t('console.playground.expandHistory') : t('console.playground.collapseHistory')} title={historyCollapsed ? t('console.playground.expandHistory') : t('console.playground.collapseHistory')} onClick={() => setHistoryCollapsed((value) => !value)} onKeyDown={(event) => activateAction(event, () => setHistoryCollapsed((value) => !value))}>{historyCollapsed ? <IconArrowRight aria-hidden="true" /> : <IconArrowLeft aria-hidden="true" />}</div>
        </div>
        <div className="history-list">{store.playgroundSessions.slice(0, 7).map((session) => { const model = findModelInList(models, session.modelId); const modelName = model?.name ?? t('console.playground.unnamedModel'); const displayModelAlias = model ? modelAlias(model) || t('console.common.modelAliasUnset') : t('console.common.modelAliasUnset'); return <div role="button" tabIndex={0} className={`history-item${selectedSessionId === session.id ? ' is-active' : ''}`} key={session.id} onClick={() => selectSession(session)} onKeyDown={(event) => activateAction(event, () => selectSession(session))}><strong>{lastUserMessage(session)}</strong><span>{modelName} · {session.updatedAt}</span><small>{displayModelAlias}</small></div> })}</div>
      </aside>
      <div className="workspace">
        <div className="playground-header">
          <div className="playground-actions">
            <label className="sr-only" htmlFor="playground-model">{t('console.playground.chooseModel')}</label>
            <div className="model-picker">
              <span className="model-picker-avatar" aria-hidden="true">{selectedModel?.company?.slice(0, 1) ?? 'N'}</span>
              <Select className="playground-model-select" dropdownClassName="playground-select-dropdown" id="playground-model" aria-label={t('console.playground.chooseModel')} value={selectedModel ? modelAlias(selectedModel) : ''} onChange={(value) => { const nextModelAlias = String(value); setModelId(nextModelAlias); store.setSelectedModelId(nextModelAlias); setSelectedSessionId(''); setEditingAttemptId(''); setEditingUserAttemptId(''); setEditingUserPrompt(''); setRetryingAttemptId('') }} disabled={selectableModels.length === 0}>{selectableModels.map((model) => <Select.Option key={model.id} value={modelAlias(model)}>{model.name} | {model.company}</Select.Option>)}</Select>
            </div>
            <Button className="icon-button" theme="borderless" icon={<IconSetting />} aria-label={t('console.playground.modelParams')} title={t('console.playground.modelParams')} onClick={() => setParamsVisible(true)} disabled={!selectedModel} />
          </div>
        </div>
        <div className={`message-list${centerMessageState ? ' is-centered' : ''}`} ref={messageListRef} onScroll={handleMessageScroll}>
            {modelsLoading && !selectedSession && !activePrompt ? <PlaygroundWorkspaceNotice tone="neutral" message={t('console.common.loadingModels')} description={t('console.common.readingModels')} /> : modelsError && !selectedSession && !activePrompt ? null : <>
            {selectedSession ? <PlaygroundMessageTimeline session={selectedSession} hiddenAttemptId={retryingAttemptId} dividerLabel={t('console.playground.newContextDivider')} renderMessage={renderMessage} /> : null}
            {activePrompt ? <><div className="message user"><span className="message-avatar">H</span><div className="message-body"><div className="message-bubble">{activePrompt}</div><div className="message-actions"><span className="message-icon-action" role="button" tabIndex={0} aria-label={t('console.playground.copyUserMessage')} title={t('console.playground.copyUserMessage')} onClick={() => copyMessage(activePrompt, t('console.playground.copiedUserMessage'))} onKeyDown={(event) => activateAction(event, () => copyMessage(activePrompt, t('console.playground.copiedUserMessage')))}><IconCopy aria-hidden="true" /></span></div></div></div>{renderMessage({ id: 'streaming-response', attemptId: 'streaming-attempt', role: 'assistant', status: 'complete', content: '', reasoning: '', requestId: null, error: null, createdAt: '', inputTokens: null, outputTokens: null, cost: null, latency: null }, true)}</> : null}
            {!selectedSession && !activePrompt ? selectableModels.length > 0 ? <div className="empty-state"><h3>{t('console.playground.startConversation')}</h3><p>{t('console.playground.startConversationHint')}</p></div> : <PlaygroundWorkspaceNotice tone="neutral" message={t('console.playground.noTextModels')} description={t('console.playground.noTextModelsHint')} /> : null}
          </>}
        </div>
        <div className={`composer${composerExpanded ? ' is-expanded' : ''}`}>
          <p className="playground-ephemeral-notice" role="note">{t('console.playground.ephemeralNotice')}</p>
          <div className="composer-box"><Tooltip content={composerExpanded ? t('console.playground.collapseComposer') : t('console.playground.expandComposer')} position="left"><div className="composer-expand-action" role="button" tabIndex={0} aria-label={composerExpanded ? t('console.playground.collapseComposer') : t('console.playground.expandComposer')} onClick={() => setComposerExpanded((value) => !value)} onKeyDown={(event) => activateAction(event, () => setComposerExpanded((value) => !value))}>{composerExpanded ? <IconShrink aria-hidden="true" /> : <IconExpand aria-hidden="true" />}</div></Tooltip><Input.TextArea className="composer-input" value={prompt} onChange={(value) => setPrompt(limitPlaygroundPrompt(value))} maxLength={PLAYGROUND_MAX_INPUT_CHARACTERS} rows={1} disabled={running || !canContinueConversation} placeholder={canContinueConversation ? t('console.playground.promptPlaceholder') : t('console.playground.newSessionLimit')} aria-label={t('console.playground.testPrompt')} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); if (!running) void runTest() } }} /><div className="composer-actions"><Popover trigger="click" position="topRight" showArrow visible={contextMenuVisible} onVisibleChange={setContextMenuVisible} content={<div className="context-settings-popover"><div className="context-settings-row context-settings-action" role="button" tabIndex={0} onClick={() => { setContextMenuVisible(false); setParamsVisible(true) }} onKeyDown={(event) => activateAction(event, () => { setContextMenuVisible(false); setParamsVisible(true) })}><strong>{t('console.playground.maxContextSettings')}</strong><IconSetting aria-hidden="true" /></div><div className={`context-settings-row context-settings-clear${!hasCurrentContextMessages || running ? ' is-disabled' : ''}`} role="button" tabIndex={!hasCurrentContextMessages || running ? -1 : 0} aria-disabled={!hasCurrentContextMessages || running} onClick={clearCurrentContext} onKeyDown={(event) => activateAction(event, clearCurrentContext)}><span>{t('console.playground.clearContext')}</span><IconClose aria-hidden="true" /></div></div>}><div className="composer-context-trigger" role="button" tabIndex={0} aria-label={t('console.playground.contextUsage', { count: currentRounds })}><IconCommentStroked aria-hidden="true" /><span>{currentRounds}/∞</span><IconChevronDown aria-hidden="true" /></div></Popover><Button className={`generation-send-button send-btn${running ? ' is-running' : ''}`} theme="solid" type="primary" icon={running ? <IconStop /> : <IconArrowUp />} aria-label={running ? t('console.playground.stop') : t('console.playground.send')} title={running ? t('console.playground.stop') : t('console.playground.send')} disabled={running ? false : !prompt.trim() || !selectedModel || !canContinueConversation} onClick={() => { if (running) stopGeneration(); else void runTest() }} /></div></div>
        </div>
      </div>
    </section>
    <Modal title={t('console.playground.parameters')} visible={paramsVisible} onCancel={() => setParamsVisible(false)} onOk={() => setParamsVisible(false)} okText={t('console.playground.done')} cancelText={t('console.common.cancel')}><div className="params-dialog"><label className="field-label" htmlFor="temperature">{t('console.playground.temperature')}</label><Input id="temperature" value={temperature} onChange={setTemperature} suffix={t('console.playground.randomness')} inputMode="decimal" /><span className="params-field-hint">{t('console.playground.parameterRange', { min: MIN_TEMPERATURE, max: MAX_TEMPERATURE })}</span><label className="field-label" htmlFor="max-tokens">{t('console.playground.maxTokens')}</label><Input id="max-tokens" value={maxTokens} onChange={(value) => setMaxTokens(value.replace(/\D/g, ''))} suffix="tokens" inputMode="numeric" /><span className="params-field-hint">{t('console.playground.tokenRange', { min: MIN_MAX_TOKENS, max: MAX_MAX_TOKENS })}</span></div></Modal>
  </div>
}



export { VideoPage } from './video-generation'

export function QuickstartPage() {
  return <QuickstartGuide />
}
