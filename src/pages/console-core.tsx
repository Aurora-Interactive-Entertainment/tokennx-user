import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Link, useSearchParams, useNavigate } from 'react-router'
import Button from '@douyinfe/semi-ui/lib/es/button'
import Modal from '@douyinfe/semi-ui/lib/es/modal'
import Toast from '@douyinfe/semi-ui/lib/es/toast'
import { IconArrowRight, IconCode, IconCopy, IconEdit, IconSearch, IconSend, IconSetting, IconStop } from '@douyinfe/semi-icons'
import { BannerNotice, EmptyPanel, ModelCard, ModelLogo, PageTitle } from '@/components/common'
import { ModelDetailDrawer } from '@/components/model-detail-drawer'
import { MarkdownContent } from '@/components/markdown-content'
import { MoneyText } from '@/components/money'
import { CompatCard as Card, CompatInput as Input, CompatSelect as Select } from '@/components/semi-compat'
import { useAppStore, type PlaygroundMessage } from '@/data/app-state'
import { findModelInList, modelAlias, type ModelRecord } from '@/data/models'
import { useUserModels } from '@/data/user-models'
import { getUserApiKeys, type UserApiKey, type UserApiKeyContext } from '@/api/user-api-keys'
import { ModelRuntimeError, streamChatCompletion, type ChatCompletionMessage } from '@/api/model-runtime'
import { normalizeQuickstartLanguage, normalizeQuickstartProtocol, quickstartCodeSample, QUICKSTART_API_BASE_URL, type QuickstartLanguage, type QuickstartProtocol } from '@/utils/quickstart'
import { formatNumber } from '@/utils/format'
import { canStartPlaygroundRound, limitPlaygroundPrompt, playgroundCharacterCount, PLAYGROUND_MAX_INPUT_CHARACTERS } from '@/utils/playground'
import { getAccessToken } from '@/auth/token-storage'
import { isAuthenticationFailure } from '@/api/http'
import { invalidateAuth } from '@/store/auth-slice'
import { useAppDispatch } from '@/store/hooks'
import { DEFAULT_MODEL_PAGE_SIZE, MODEL_CATEGORIES, MODEL_PAGE_SIZES, MODEL_PRICE_FILTERS, MODEL_SORTS, filterAndSortModels, modelCategoryCounts, paginateModels, type ModelCategory, type ModelPriceFilter, type ModelSort } from '@/utils/model-filters'
import { apiKeySupportsModel } from '@/utils/model-access'

const FIRST_MODEL_PAGE = 1

export function ConsoleModelsPage() {
  const { t } = useTranslation()
  const { models: userModels, loading, error, refresh } = useUserModels()
  const [query, setQuery] = useState('')
  const [company, setCompany] = useState('all')
  const [priceFilter, setPriceFilter] = useState<ModelPriceFilter>('all')
  const [category, setCategory] = useState<ModelCategory>('all')
  const [sort, setSort] = useState<ModelSort>('default')
  const [page, setPage] = useState(FIRST_MODEL_PAGE)
  const [pageSize, setPageSize] = useState<number>(DEFAULT_MODEL_PAGE_SIZE)
  const [detailModel, setDetailModel] = useState<ModelRecord | null>(null)
  const companies = useMemo(() => [...new Set(userModels.map((model) => model.company))].sort((left, right) => left.localeCompare(right, 'zh-CN')), [userModels])
  const filteredModels = useMemo(() => filterAndSortModels(userModels, { query, company, category, priceFilter, sort }), [category, company, priceFilter, query, sort, userModels])
  const categoryCounts = useMemo(() => modelCategoryCounts(userModels, { query, company, priceFilter }), [company, priceFilter, query, userModels])
  const pageResult = useMemo(() => paginateModels(filteredModels, page, pageSize), [filteredModels, page, pageSize])
  // 中文：单卡页面限制卡片宽度，多卡页面继续由网格平均分配可用空间。
  const modelGridClassName = pageResult.items.length === 1 ? 'model-card-grid model-card-grid--single' : 'model-card-grid'

  useEffect(() => {
    if (pageResult.page !== page) setPage(pageResult.page)
  }, [page, pageResult.page])

  function updateFilter(update: () => void): void {
    setPage(FIRST_MODEL_PAGE)
    update()
  }

  function clearFilters(): void {
    setQuery('')
    setCompany('all')
    setPriceFilter('all')
    setCategory('all')
    setSort('default')
    setPage(FIRST_MODEL_PAGE)
  }

  return <div className="page-stack models-console-page">
    <PageTitle title={t('console.models.title')} description={t('console.models.description')} />
    {loading ? <EmptyPanel title={t('console.common.loadingModels')} description={t('console.common.readingModels')} /> : error ? <EmptyPanel title={t('console.common.modelCatalogFailed')} description={error} action={<Button theme="outline" onClick={refresh}>{t('console.common.reload')}</Button>} /> : null}
    {!loading && !error ? <>
    <div className="models-toolbar">
      <div className="models-search-box"><IconSearch aria-hidden="true" /><Input value={query} onChange={(value) => updateFilter(() => setQuery(value))} placeholder={t('console.models.searchPlaceholder')} aria-label={t('console.models.searchPlaceholder').replace('...', '')} /></div>
      <Select className="models-company-select" value={company} onChange={(value) => updateFilter(() => setCompany(String(value)))} aria-label={t('console.common.allCompanies')}><Select.Option value="all">{t('console.common.allCompanies')}</Select.Option>{companies.map((item) => <Select.Option key={item} value={item}>{item}</Select.Option>)}</Select>
      <div className="models-controls">
        <div className="price-filters" role="group" aria-label={t('console.common.priceStatus')}>{MODEL_PRICE_FILTERS.map((filter) => <button className={`price-filter${priceFilter === filter.value ? ' active' : ''}`} type="button" aria-pressed={priceFilter === filter.value} key={filter.value} onClick={() => updateFilter(() => setPriceFilter(filter.value))}>{t(filter.labelKey)}</button>)}</div>
        <label className="sort-control"><span>{t('console.common.sort')}</span><Select value={sort} onChange={(value) => updateFilter(() => setSort(value as ModelSort))} aria-label={t('console.common.modelSort')}>{MODEL_SORTS.map((option) => <Select.Option key={option.value} value={option.value}>{t(option.labelKey)}</Select.Option>)}</Select></label>
      </div>
    </div>
    <div className="models-subbar"><div className="modality-tabs" role="group" aria-label={t('console.common.modelType')}>{MODEL_CATEGORIES.map((tab) => <button className={`modality-tab${category === tab.value ? ' active' : ''}`} type="button" aria-pressed={category === tab.value} key={tab.value} disabled={categoryCounts[tab.value] === 0} onClick={() => updateFilter(() => setCategory(tab.value))}>{t(tab.labelKey)} <span className="tab-count">{categoryCounts[tab.value]}</span></button>)}</div><span className="models-result-count">{t('console.common.modelCount', { count: filteredModels.length })}</span></div>
    {filteredModels.length ? <>
      <div className={modelGridClassName}>{pageResult.items.map((model) => <ModelCard key={model.id} model={model} onSelect={setDetailModel} />)}</div>
      <nav className="models-pagination" aria-label={t('console.models.modelPage')}>
        <span className="models-pagination-info">{t('console.common.showRange', { start: pageResult.start, end: pageResult.end, total: pageResult.total })}</span>
        <div className="models-pagination-controls">
          <button type="button" className="models-pagination-button" aria-label={t('console.common.previous')} disabled={pageResult.page <= FIRST_MODEL_PAGE} onClick={() => setPage((value) => Math.max(FIRST_MODEL_PAGE, value - 1))}>‹</button>
          <button type="button" className="models-pagination-button is-current" aria-current="page" disabled>{pageResult.page}</button>
          <button type="button" className="models-pagination-button" aria-label={t('console.common.next')} disabled={pageResult.page >= pageResult.totalPages} onClick={() => setPage((value) => Math.min(pageResult.totalPages, value + 1))}>›</button>
          <Select className="models-pagination-size" value={pageSize} onChange={(value) => { setPageSize(Number(value)); setPage(FIRST_MODEL_PAGE) }} aria-label={t('console.common.pageSize')}>{MODEL_PAGE_SIZES.map((size) => <Select.Option key={size} value={size}>{t('console.common.rowsPerPage', { size })}</Select.Option>)}</Select>
        </div>
      </nav>
    </> : <EmptyPanel title={t('console.models.modelNotFound')} description={t('console.common.adjustFilters')} action={<Button theme="outline" onClick={clearFilters}>{t('console.common.clearFilters')}</Button>} />}
    </> : null}
    <ModelDetailDrawer model={detailModel} visible={detailModel !== null} onClose={() => setDetailModel(null)} />
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
  if (error instanceof ModelRuntimeError) {
    if (error.status === 401) return t('console.playground.invalidApiKey')
    if (error.status === 402) return t('console.playground.insufficientBalance')
    const requestHint = error.requestId ? t('console.playground.requestIdHint', { label: t('console.common.requestId'), id: error.requestId }) : ''
    return `${error.message}${requestHint}`
  }
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

function sessionMessages(session: { messages: PlaygroundMessage[] }): PlaygroundMessage[] {
  return session.messages
}

// 中文：服务端以模型编码授权，页面同时兼容公开 ID 和别名，避免目录字段演进导致误过滤。
export { apiKeySupportsModel } from '@/utils/model-access'

export function PlaygroundPage() {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const store = useAppStore()
  const { models, loading: modelsLoading, error: modelsError, refresh: refreshModels } = useUserModels()
  const [searchParams] = useSearchParams()
  const initialModelId = searchParams.get('model') ?? store.selectedModelId
  const [modelId, setModelId] = useState(initialModelId)
  const [prompt, setPrompt] = useState('')
  const [running, setRunning] = useState(false)
  const [selectedSessionId, setSelectedSessionId] = useState('')
  const [paramsVisible, setParamsVisible] = useState(false)
  const [temperature, setTemperature] = useState(DEFAULT_TEMPERATURE)
  const [maxTokens, setMaxTokens] = useState(DEFAULT_MAX_TOKENS)
  const [apiKeys, setApiKeys] = useState<UserApiKey[]>([])
  const [selectedApiKeyId, setSelectedApiKeyId] = useState('')
  const [apiKeysLoading, setApiKeysLoading] = useState(true)
  const [apiKeyError, setApiKeyError] = useState('')
  const [activePrompt, setActivePrompt] = useState('')
  const [streamingResponse, setStreamingResponse] = useState('')
  const [streamingReasoning, setStreamingReasoning] = useState('')
  const [requestError, setRequestError] = useState('')
  const [editingAttemptId, setEditingAttemptId] = useState('')
  const [retryingAttemptId, setRetryingAttemptId] = useState('')
  const requestControllerRef = useRef<AbortController | null>(null)
  const streamingResponseRef = useRef('')
  const streamingReasoningRef = useRef('')
  const abortReasonRef = useRef<'user' | 'navigation' | null>(null)
  const workspaceContext = useMemo<UserApiKeyContext>(() => store.activeWorkspace.type === 'enterprise'
    ? { account_type: 'enterprise', enterprise_id: store.activeWorkspace.id }
    : { account_type: 'personal' }, [store.activeWorkspace.id, store.activeWorkspace.type])
  const workspaceKey = `${workspaceContext.account_type}:${workspaceContext.account_type === 'enterprise' ? workspaceContext.enterprise_id : 'personal'}`
  const selectedSession = store.playgroundSessions.find((session) => session.id === selectedSessionId)
  const currentRounds = selectedSession?.rounds ?? 0
  const canContinueConversation = canStartPlaygroundRound(currentRounds)
  const usableApiKeys = useMemo(() => apiKeys.filter((key) => key.status === 'active' && key.secret.trim()), [apiKeys])
  const selectedApiKey = usableApiKeys.find((key) => key.id === selectedApiKeyId)
  // 中文：未明确选择 API Key 时不推导模型，避免把工作区模型目录误当成密钥权限。
  const selectableModels = useMemo(() => {
    return models.filter((model) => model.modality === 'text' && Boolean(modelAlias(model)) && apiKeySupportsModel(selectedApiKey, model))
  }, [models, selectedApiKey])
  const selectedModel = findModelInList(selectableModels, modelId) ?? selectableModels[0]

  useEffect(() => {
    requestControllerRef.current?.abort()
    requestControllerRef.current = null
    abortReasonRef.current = 'navigation'
    setApiKeys([])
    setSelectedApiKeyId('')
    setApiKeysLoading(true)
    setApiKeyError('')
    setSelectedSessionId('')
    setEditingAttemptId('')
    setRetryingAttemptId('')
    setActivePrompt('')
    setStreamingResponse('')
    setStreamingReasoning('')
    setRequestError('')
  }, [workspaceKey])

  useEffect(() => {
    let active = true
    setApiKeysLoading(true)
    setApiKeyError('')
    void getUserApiKeys(workspaceContext, 'active').then((result) => {
      if (!active) return
      setApiKeys(result.items)
    }).catch((error: unknown) => {
      if (!active) return
      if (isAuthenticationFailure(error)) {
        dispatch(invalidateAuth())
        navigate('/', { replace: true })
        return
      }
      setApiKeyError(error instanceof Error ? error.message : t('console.models.reloadKeys'))
    }).finally(() => {
      if (active) setApiKeysLoading(false)
    })
    return () => { active = false }
  }, [dispatch, navigate, t, workspaceContext])

  useEffect(() => {
    if (!selectedApiKey) return
    if (selectableModels.some((model) => modelAlias(model) === modelId)) return
    const fallback = selectableModels[0]
    const fallbackAlias = fallback ? modelAlias(fallback) : ''
    if (modelId === fallbackAlias) return
    setModelId(fallbackAlias)
    store.setSelectedModelId(fallbackAlias)
  }, [modelId, selectableModels, selectedApiKey, store])

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

  function selectApiKey(apiKeyId: string): void {
    startNewSession()
    setModelId('')
    store.setSelectedModelId('')
    setSelectedApiKeyId(apiKeyId)
  }

  async function runTest(): Promise<void> {
    const trimmedPrompt = prompt.trim()
    if (running) return
    if (!trimmedPrompt) { Toast.warning(t('console.playground.promptRequired')); return }
    if (!selectedApiKey) { Toast.warning(t('console.playground.apiKeyRequired')); return }
    if (!selectedModel || !modelAlias(selectedModel)) { Toast.warning(t('console.playground.noTextModelAlias')); return }
    if (!apiKeySupportsModel(selectedApiKey, selectedModel)) { Toast.warning(t('console.playground.unsupportedModel')); return }
    if (!canContinueConversation) { Toast.warning(t('console.playground.newSessionLimit')); return }
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
    const replacingAttemptId = editingAttemptId || undefined
    setRunning(true)
    setRequestError('')
    setRetryingAttemptId(replacingAttemptId ?? '')
    setActivePrompt(trimmedPrompt)
    setStreamingResponse('')
    setStreamingReasoning('')
    streamingResponseRef.current = ''
    streamingReasoningRef.current = ''
    try {
      const messages: ChatCompletionMessage[] = [
        ...(selectedSession?.messages ?? [])
          .filter((message) => message.status !== 'failed')
          .map((message) => ({ role: message.role, content: message.content })),
        { role: 'user', content: trimmedPrompt },
      ]
      const result = await streamChatCompletion({
        apiKey: selectedApiKey.secret,
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
      setRetryingAttemptId('')
    } catch (error: unknown) {
      if (controller.signal.aborted && abortReasonRef.current === 'navigation') {
        setActivePrompt('')
        setStreamingResponse('')
        setStreamingReasoning('')
        streamingResponseRef.current = ''
        streamingReasoningRef.current = ''
        setRetryingAttemptId('')
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
      setRetryingAttemptId('')
      setRequestError(message)
      Toast.error(message)
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
    setRetryingAttemptId('')
    setActivePrompt('')
    setStreamingResponse('')
    setStreamingReasoning('')
    streamingResponseRef.current = ''
    streamingReasoningRef.current = ''
    setRequestError('')
    setPrompt('')
  }

  function selectSession(session: typeof store.playgroundSessions[number]): void {
    if (running) abortGeneration('navigation')
    setSelectedSessionId(session.id)
    const sessionModel = findModelInList(models, session.modelId)
    const sessionAlias = sessionModel ? modelAlias(sessionModel) : ''
    setModelId(sessionAlias)
    store.setSelectedModelId(sessionAlias)
    setEditingAttemptId('')
    setRetryingAttemptId('')
    setActivePrompt('')
    setStreamingResponse('')
    setStreamingReasoning('')
    streamingResponseRef.current = ''
    streamingReasoningRef.current = ''
    setRequestError('')
    setPrompt('')
  }

  function copyMessage(value: string, successMessage: string): void {
    if (!navigator.clipboard) { Toast.error(t('console.common.copyFailed')); return }
    void navigator.clipboard.writeText(value).then(() => Toast.success(successMessage)).catch(() => Toast.error(t('console.common.copyFailed')))
  }

  function editFailedAttempt(attemptId: string): void {
    const failedUserMessage = selectedSession?.messages.find((message) => message.attemptId === attemptId && message.role === 'user' && message.status === 'failed')
    if (!failedUserMessage) return
    setEditingAttemptId(attemptId)
    setRequestError('')
    setPrompt(failedUserMessage.content)
  }

  function renderMessage(message: PlaygroundMessage, streaming = false) {
    const hasStreamingResponse = streamingResponse.length > 0
    const content = streaming ? streamingResponse : message.content
    const reasoning = streaming ? streamingReasoning : message.reasoning
    const isAssistant = message.role === 'assistant'
    const isFailed = !streaming && message.status === 'failed'
    return <div className={`message ${isAssistant ? 'ai' : 'user'}`} key={message.id}>
      <span className="message-avatar">{isAssistant ? 'NX' : 'H'}</span>
      <div className="message-body">
        {isAssistant && reasoning ? <details className="message-reasoning" open><summary>{streaming && running ? t('console.playground.thinkingNow') : t('console.playground.thinking')}</summary><MarkdownContent content={reasoning} className="message-reasoning-content" /></details> : null}
        <div className="message-bubble">
          {streaming && !hasStreamingResponse ? <span className="message-loading" role="status" aria-label={t('console.playground.messageLoading')} /> : isAssistant ? <MarkdownContent content={content || t('console.playground.responseEmpty')} /> : content}
          {streaming && running ? <span className="message-cursor" aria-hidden="true" /> : null}
        </div>
        {isFailed && message.error ? <div className="message-failure">{message.error}</div> : null}
        {isAssistant && !streaming && !isFailed ? <div className="message-meta"><span>{t('console.playground.elapsed')} <strong>{message.latency === null ? '--' : `${message.latency}ms`}</strong></span><span>{t('console.common.input')} <strong>{formatTokenMetric(message.inputTokens, t)}</strong></span><span>{t('console.common.output')} <strong>{formatTokenMetric(message.outputTokens, t)}</strong></span><span>{t('console.playground.cost')} <strong>{formatSessionCost(message.cost, t)}</strong></span></div> : null}
        {!streaming && (message.content || !isAssistant) ? <div className="message-actions"><Button className="message-icon-action" theme="borderless" size="small" icon={<IconCopy />} aria-label={isAssistant ? t('console.playground.copyReply') : t('console.playground.copyUserMessage')} title={isAssistant ? t('console.playground.copyReply') : t('console.playground.copyUserMessage')} onClick={() => copyMessage(message.content, isAssistant ? t('console.playground.copiedReply') : t('console.playground.copiedUserMessage'))} /></div> : null}
        {isFailed && isAssistant ? <div className="message-actions"><Button className="message-icon-action" theme="borderless" size="small" icon={<IconEdit />} aria-label={t('console.playground.editFailed')} title={t('console.playground.editFailed')} onClick={() => editFailedAttempt(message.attemptId)} /></div> : null}
      </div>
    </div>
  }

  if (modelsLoading) return <div className="page-stack playground-console-page"><PageTitle title={t('console.playground.title')} description={t('console.playground.description')} /><EmptyPanel title={t('console.common.loadingModels')} description={t('console.common.readingModels')} /></div>
  if (modelsError) return <div className="page-stack playground-console-page"><PageTitle title={t('console.playground.title')} description={t('console.playground.description')} /><EmptyPanel title={t('console.common.modelCatalogFailed')} description={modelsError} action={<Button theme="outline" onClick={refreshModels}>{t('console.common.reload')}</Button>} /></div>
  if (!models.some((model) => model.modality === 'text' && modelAlias(model))) return <div className="page-stack playground-console-page"><PageTitle title={t('console.playground.title')} description={t('console.playground.description')} /><EmptyPanel title={t('console.playground.noTextModels')} description={t('console.playground.noTextModelsHint')} /></div>

  return <div className="page-stack playground-console-page">
    <PageTitle title={t('console.playground.title')} description={t('console.playground.detailedDescription')} />
    <section className="playground-connection-bar" aria-label={t('console.playground.connection')}>
      <div className="playground-connection-controls"><label htmlFor="playground-api-key">{t('console.playground.apiKey')}</label><Select className="playground-api-key-select" dropdownClassName="playground-select-dropdown" id="playground-api-key" aria-label={t('console.playground.apiKey')} value={selectedApiKey?.id ?? ''} onSelect={(value) => selectApiKey(String(value))} disabled={apiKeysLoading || usableApiKeys.length === 0}><Select.Option value="">{t('console.playground.selectApiKey')}</Select.Option>{usableApiKeys.map((key) => <Select.Option key={key.id} value={key.id}>{key.name} · {key.masked_key}</Select.Option>)}</Select><Link className="playground-key-link" to="/console/api-keys">{t('console.playground.manageApiKey')}</Link></div>
    </section>
    {apiKeyError ? <BannerNotice tone="warning">{apiKeyError}</BannerNotice> : null}
    {selectedApiKey && selectableModels.length === 0 ? <BannerNotice tone="warning">{t('console.playground.apiKeyNoModels')}</BannerNotice> : null}
    {requestError ? <BannerNotice tone="warning"><span>{requestError}</span>{requestError.includes(t('console.common.requestId')) ? null : <Button theme="borderless" size="small" onClick={() => setRequestError('')}>{t('console.playground.closeError')}</Button>}</BannerNotice> : null}
    <section className="playground-shell" aria-label={t('console.playground.title')}>
      <aside className="history-panel" aria-labelledby="history-title"><div className="history-heading"><h2 id="history-title">{t('console.playground.history')}</h2><Button theme="outline" size="small" onClick={startNewSession}>{t('console.playground.newSession')}</Button></div><div className="history-list">{store.playgroundSessions.slice(0, 7).map((session) => { const model = findModelInList(models, session.modelId); const modelName = model?.name ?? t('console.playground.unnamedModel'); const displayModelAlias = model ? modelAlias(model) || t('console.common.modelAliasUnset') : t('console.common.modelAliasUnset'); return <button type="button" className={`history-item${selectedSessionId === session.id ? ' is-active' : ''}`} key={session.id} onClick={() => selectSession(session)}><strong>{modelName}</strong><span>{displayModelAlias} · {session.createdAt}</span><small>{lastUserMessage(session)}</small></button> })}</div></aside>
      <div className="workspace"><div className="playground-header"><div className="playground-actions"><label className="sr-only" htmlFor="playground-model">{t('console.playground.chooseModel')}</label><Select className="playground-model-select" dropdownClassName="playground-select-dropdown" id="playground-model" aria-label={t('console.playground.chooseModel')} value={selectedModel ? modelAlias(selectedModel) : ''} onChange={(value) => { const nextModelAlias = String(value); setModelId(nextModelAlias); store.setSelectedModelId(nextModelAlias); setSelectedSessionId(''); setEditingAttemptId(''); setRetryingAttemptId(''); setRequestError('') }} disabled={selectableModels.length === 0}>{selectableModels.map((model) => <Select.Option key={model.id} value={modelAlias(model)}>{t('console.playground.modelWithProvider', { name: model.name, company: model.company, alias: modelAlias(model) })}</Select.Option>)}</Select><Button className="icon-button" theme="borderless" icon={<IconSetting />} aria-label={t('console.playground.modelParams')} title={t('console.playground.modelParams')} onClick={() => setParamsVisible(true)} disabled={!selectedModel} /></div></div><div className="message-list">{selectedSession ? sessionMessages(selectedSession).filter((message) => message.attemptId !== retryingAttemptId).map((message) => renderMessage(message)) : null}{activePrompt ? <><div className="message user"><span className="message-avatar">H</span><div className="message-body"><div className="message-bubble">{activePrompt}</div><div className="message-actions"><Button className="message-icon-action" theme="borderless" size="small" icon={<IconCopy />} aria-label={t('console.playground.copyUserMessage')} title={t('console.playground.copyUserMessage')} onClick={() => copyMessage(activePrompt, t('console.playground.copiedUserMessage'))} /></div></div></div>{renderMessage({ id: 'streaming-response', attemptId: 'streaming-attempt', role: 'assistant', status: 'complete', content: '', reasoning: '', requestId: null, error: null, createdAt: '', inputTokens: null, outputTokens: null, cost: null, latency: null }, true)}</> : null}{!selectedSession && !activePrompt ? <div className="empty-state">{!selectedApiKey ? <><h3>{t('console.playground.chooseKeyFirst')}</h3><p>{t('console.playground.chooseKeyHint')}</p></> : null}{selectedApiKey && selectableModels.length === 0 ? <><h3>{t('console.playground.noKeyModels')}</h3><p>{t('console.playground.noKeyModelsHint')}</p></> : null}{selectedApiKey && selectableModels.length > 0 ? <><h3>{t('console.playground.startConversation')}</h3><p>{t('console.playground.startConversationHint')}</p></> : null}</div> : null}</div><div className="composer"><div className="composer-box"><Input.TextArea className="composer-input" value={prompt} onChange={(value) => setPrompt(limitPlaygroundPrompt(value))} maxLength={PLAYGROUND_MAX_INPUT_CHARACTERS} rows={1} disabled={running || !canContinueConversation} placeholder={canContinueConversation ? t('console.playground.promptPlaceholder') : t('console.playground.newSessionLimit')} aria-label={t('console.playground.testPrompt')} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); if (!running) void runTest() } }} /><span className="composer-character-count" aria-live="polite">{playgroundCharacterCount(prompt)}/{PLAYGROUND_MAX_INPUT_CHARACTERS}</span><div className="composer-actions"><Button className="send-btn" theme="solid" type="primary" icon={running ? <IconStop /> : <IconSend />} aria-label={running ? t('console.playground.stop') : t('console.playground.send')} title={running ? t('console.playground.stop') : t('console.playground.send')} disabled={running ? false : !prompt.trim() || !selectedApiKey || !selectedModel || !canContinueConversation} onClick={() => { if (running) stopGeneration(); else void runTest() }} /></div></div><div className="composer-hint"><span>{t('console.playground.enterHint')}</span><span>{selectedModel ? `${selectedModel.name} · ${modelAlias(selectedModel) || t('console.common.modelAliasUnset')} · Temperature ${temperature} · Max Tokens ${maxTokens}` : selectedApiKey ? t('console.playground.noAvailableModels') : t('console.playground.selectApiKeyFirst')}</span></div></div></div>
    </section>
    <Modal title={t('console.playground.parameters')} visible={paramsVisible} onCancel={() => setParamsVisible(false)} onOk={() => setParamsVisible(false)} okText={t('console.playground.done')} cancelText={t('console.common.cancel')}><div className="params-dialog"><label className="field-label" htmlFor="temperature">{t('console.playground.temperature')}</label><Input id="temperature" value={temperature} onChange={setTemperature} suffix={t('console.playground.randomness')} inputMode="decimal" /><span className="params-field-hint">{t('console.playground.parameterRange', { min: MIN_TEMPERATURE, max: MAX_TEMPERATURE })}</span><label className="field-label" htmlFor="max-tokens">{t('console.playground.maxTokens')}</label><Input id="max-tokens" value={maxTokens} onChange={(value) => setMaxTokens(value.replace(/\D/g, ''))} suffix="tokens" inputMode="numeric" /><span className="params-field-hint">{t('console.playground.tokenRange', { min: MIN_MAX_TOKENS, max: MAX_MAX_TOKENS })}</span></div></Modal>
  </div>
}



export function QuickstartPage() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { models, loading: modelsLoading, error: modelsError, refresh: refreshModels } = useUserModels()
  const textModels = models.filter((item) => item.modality === 'text' && modelAlias(item))
  const resolvedRequestedModel = findModelInList(models, searchParams.get('model'))
  const requestedModel = resolvedRequestedModel && modelAlias(resolvedRequestedModel) ? resolvedRequestedModel : undefined
  const firstModel = requestedModel ?? textModels[0]
  const [protocol, setProtocol] = useState<QuickstartProtocol>(normalizeQuickstartProtocol(searchParams.get('protocol')))
  const [language, setLanguage] = useState<QuickstartLanguage>(normalizeQuickstartLanguage(searchParams.get('language')))
  const [modelId, setModelId] = useState(searchParams.get('model') ?? '')
  const resolvedModel = findModelInList(models, modelId)
  const model = resolvedModel && modelAlias(resolvedModel) ? resolvedModel : firstModel

  useEffect(() => {
    const alias = firstModel ? modelAlias(firstModel) : ''
    if (!alias || (modelId === alias && searchParams.get('model') === alias)) return
    setModelId(alias)
    setSearchParams({ model: alias, protocol, language }, { replace: true })
  }, [firstModel, language, modelId, protocol, searchParams, setSearchParams])

  function syncContext(nextModelAlias: string, nextProtocol = protocol, nextLanguage = language): void {
    setSearchParams({ model: nextModelAlias, protocol: nextProtocol, language: nextLanguage })
  }

  function copyText(value: string, successMessage: string): void {
    if (!navigator.clipboard) { Toast.error(t('console.common.copyFailed')); return }
    void navigator.clipboard.writeText(value).then(() => Toast.success(successMessage)).catch(() => Toast.error(t('console.common.copyFailed')))
  }

  function copyCode(): void { copyText(code, t('console.quickstart.copySuccess')) }

  function copyBaseUrl(): void { copyText(QUICKSTART_API_BASE_URL, t('console.quickstart.baseUrlCopied')) }

  if (modelsLoading) return <div className="quickstart-page"><PageTitle title={t('console.quickstart.title')} description={t('console.quickstart.description')} /><EmptyPanel title={t('console.common.loadingModels')} description={t('console.common.readingModels')} /></div>
  if (modelsError) return <div className="quickstart-page"><PageTitle title={t('console.quickstart.title')} description={t('console.quickstart.description')} /><EmptyPanel title={t('console.common.modelCatalogFailed')} description={modelsError} action={<Button theme="outline" onClick={refreshModels}>{t('console.common.reload')}</Button>} /></div>
  if (!model) return <div className="quickstart-page"><PageTitle title={t('console.quickstart.title')} description={t('console.quickstart.description')} /><EmptyPanel title={t('console.common.noModels')} description={t('console.quickstart.noModelsHint')} action={<Button theme="outline" onClick={refreshModels}>{t('console.common.reload')}</Button>} /></div>

  const selectableModels = requestedModel && requestedModel.modality !== 'text' ? [requestedModel, ...textModels.filter((item) => item.id !== requestedModel.id)] : textModels
  const supportsCodeSample = model.modality === 'text'
  const code = supportsCodeSample
    ? quickstartCodeSample({ protocol, language, modelAlias: modelAlias(model) })
    : [t('console.quickstart.noSampleCodeLine1', { model: model.name }), t('console.quickstart.noSampleCodeLine2', { alias: modelAlias(model) }), t('console.quickstart.noSampleCodeLine3')].join('\n')
  const contextQuery = 'model=' + encodeURIComponent(modelAlias(model)) + '&protocol=' + protocol + '&language=' + language

  return (
    <div className="quickstart-page">
      <PageTitle title={t('console.quickstart.title')} description={t('console.quickstart.styleCodeDescription', { model: model.name, style: protocol === 'openai' ? t('console.quickstart.openaiStyle') : t('console.quickstart.claudeStyle') })} />
      <div className="quickstart-connection-notice"><strong>{t('console.quickstart.connectionReady')}</strong><span>{t('console.quickstart.connectionHint')}</span></div>
      {!supportsCodeSample ? <div className="quickstart-context-notice"><strong>{t('console.quickstart.noSampleTitle', { model: model.name })}</strong><span>{t('console.quickstart.noSampleHint')}</span></div> : null}
      <nav className="quickstart-activation-path" aria-label={t('console.quickstart.activationSteps')}>
        <Link className="quickstart-activation-step" to="/console/models"><span className="quickstart-step-number">1</span><span><strong>{t('console.quickstart.chooseModel')}</strong><small>{t('console.quickstart.confirmCapability')}</small></span></Link>
        <Link className="quickstart-activation-step" to={'/console/api-keys?model=' + encodeURIComponent(modelAlias(model)) + '&return=' + encodeURIComponent('/console/quickstart?' + contextQuery)}><span className="quickstart-step-number">2</span><span><strong>{t('console.quickstart.createKey')}</strong><small>{t('console.quickstart.scopeAccess')}</small></span></Link>
        <span className="quickstart-activation-step"><span className="quickstart-step-number">3</span><span><strong>{t('console.quickstart.copyCode')}</strong><small>{t('console.quickstart.replaceKey')}</small></span></span>
      </nav>
      <div className="quickstart-code-workspace">
        <aside className="quickstart-code-controls" aria-label={t('console.quickstart.sampleOptions')}>
          <div className="quickstart-control-group"><label htmlFor="quickstart-model">{t('console.quickstart.model')}</label><Select id="quickstart-model" value={modelAlias(model)} onChange={(value) => { const nextModelAlias = String(value); setModelId(nextModelAlias); syncContext(nextModelAlias) }} block>{selectableModels.map((item) => <Select.Option key={item.id} value={modelAlias(item)}>{item.modality === 'text' ? t('console.playground.modelWithProvider', { name: item.name, company: item.company, alias: modelAlias(item) }) : t('console.playground.modelWithNoSample', { name: item.name, alias: modelAlias(item) })}</Select.Option>)}</Select></div>
          <div className="quickstart-control-group"><span className="quickstart-control-label">{t('console.quickstart.apiStyle')}</span><div className="quickstart-segmented" role="group" aria-label={t('console.quickstart.apiStyle')}><button className={protocol === 'openai' ? 'active' : ''} type="button" aria-pressed={protocol === 'openai'} disabled={!supportsCodeSample} onClick={() => { setProtocol('openai'); syncContext(modelAlias(model), 'openai') }}>{t('console.quickstart.openai')}</button><button className={protocol === 'anthropic' ? 'active' : ''} type="button" aria-pressed={protocol === 'anthropic'} disabled={!supportsCodeSample} onClick={() => { setProtocol('anthropic'); syncContext(modelAlias(model), 'anthropic') }}>{t('console.quickstart.claude')}</button></div></div>
          <div className="quickstart-control-group"><span className="quickstart-control-label">{t('console.quickstart.language')}</span><div className="quickstart-segmented quickstart-segmented--language" role="group" aria-label={t('console.quickstart.codeSampleLanguage')}><button className={language === 'python' ? 'active' : ''} type="button" aria-pressed={language === 'python'} disabled={!supportsCodeSample} onClick={() => { setLanguage('python'); syncContext(modelAlias(model), protocol, 'python') }}>{t('console.quickstart.python')}</button><button className={language === 'node' ? 'active' : ''} type="button" aria-pressed={language === 'node'} disabled={!supportsCodeSample} onClick={() => { setLanguage('node'); syncContext(modelAlias(model), protocol, 'node') }}>Node.js</button><button className={language === 'curl' ? 'active' : ''} type="button" aria-pressed={language === 'curl'} disabled={!supportsCodeSample} onClick={() => { setLanguage('curl'); syncContext(modelAlias(model), protocol, 'curl') }}>{t('console.quickstart.curl')}</button></div></div>
          <div className="quickstart-endpoint-list"><div className="quickstart-endpoint-item"><span>{t('console.quickstart.apiBaseUrl')}</span><div className="quickstart-endpoint-value"><code>{QUICKSTART_API_BASE_URL}</code><Button theme="borderless" size="small" icon={<IconCopy />} aria-label={t('console.quickstart.copyBaseUrl')} title={t('console.quickstart.copyBaseUrl')} onClick={copyBaseUrl} /></div></div><div className="quickstart-endpoint-item"><span>API Key</span><code>YOUR_TOKEN_NX_API_KEY</code></div></div>
          <div className="quickstart-actions"><Link className="btn btn-secondary" to={'/console/playground?model=' + encodeURIComponent(modelAlias(model))}>{t('console.quickstart.onlineTest')}</Link><Link className="btn btn-secondary" to={'/console/models/' + encodeURIComponent(modelAlias(model))}>{t('console.quickstart.modelDetails')}</Link></div>
        </aside>
        <section className="quickstart-code-panel" aria-labelledby="quickstart-code-title">
          <div className="quickstart-code-panel-head"><strong id="quickstart-code-title">{supportsCodeSample ? t('console.quickstart.executableSample') : t('console.quickstart.samplePending')}</strong><Button theme="outline" className="btn btn-secondary btn-sm" onClick={copyCode} disabled={!supportsCodeSample}>{t('console.quickstart.copySample')}</Button></div>
          <pre className="quickstart-code-block"><code>{code}</code></pre>
        </section>
      </div>
    </div>
  )
}

export { VideoPage } from './video-generation'
