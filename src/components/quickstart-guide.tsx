import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import Button from '@douyinfe/semi-ui/lib/es/button'
import Toast from '@douyinfe/semi-ui/lib/es/toast'
import { appToast } from '@/components/app-toast'
import { IconCopy, IconFile, IconSearch } from '@douyinfe/semi-icons'
import { CompatInput as Input } from '@/components/semi-compat'
import { useAppStore } from '@/data/app-state'
import { workspaceContextFor } from '@/utils/workspace'
import { findModelInList, modelAlias, type ModelRecord } from '@/data/models'
import { useUserModels } from '@/data/user-models'
import { getUserApiKeys, type UserApiKey, type UserApiKeyContext } from '@/api/user-api-keys'
import { normalizeQuickstartLanguage, QUICKSTART_API_BASE_URL, quickstartCodeSample, type QuickstartLanguage } from '@/utils/quickstart'

type QuickstartStep = 0 | 1 | 2 | 3
type QuickstartAgentTab = 'api' | 'tools'
type QuickstartApiMode = 'chat' | 'responses'

const AGENT_TOOLS = [
  { id: 'claude-code', name: 'Claude Code', accent: '#e8946b', glyph: '✦' },
  { id: 'workbuddy', name: 'WorkBuddy', accent: '#54c99b', glyph: '◆' },
  { id: 'openclaw', name: 'OpenClaw', accent: '#ef665a', glyph: '●' },
  { id: 'hermes', name: 'Hermes Agent', accent: '#1f2024', glyph: '♞' },
  { id: 'cline', name: 'Cline', accent: '#111318', glyph: '●' },
  { id: 'cursor', name: 'Cursor', accent: '#111318', glyph: '◇' },
] as const

function responseCodeSample(language: QuickstartLanguage, alias: string): string {
  const endpoint = QUICKSTART_API_BASE_URL.replace(/\/+$/, '')
  if (language === 'python') return [
    'from openai import OpenAI', '', 'client = OpenAI(',
    '    api_key="YOUR_TOKEN_NX_API_KEY",', `    base_url="${endpoint}"`, ')', '',
    'response = client.responses.create(', `    model="${alias}",`, '    input="你好"', ')',
    'print(response.output_text)',
  ].join('\n')
  if (language === 'node') return [
    'import OpenAI from "openai";', '', 'const client = new OpenAI({',
    '  apiKey: "YOUR_TOKEN_NX_API_KEY",', `  baseURL: "${endpoint}"`, '});', '',
    'const response = await client.responses.create({', `  model: "${alias}",`, '  input: "你好"', '});',
    'console.log(response.output_text);',
  ].join('\n')
  return [
    `curl -X POST '${endpoint}/responses' \\`,
    '  -H \'Authorization: Bearer YOUR_TOKEN_NX_API_KEY\' \\',
    '  -H \'Content-Type: application/json\' \\',
    `  -d '{"model":"${alias}","input":"你好"}'`,
  ].join('\n')
}

function modelPrice(model: ModelRecord, t: (key: string, options?: Record<string, unknown>) => string): string {
  const input = model.tokenNxPrice.inputRaw ?? (model.tokenNxPrice.input === undefined ? '--' : String(model.tokenNxPrice.input))
  const output = model.tokenNxPrice.outputRaw ?? (model.tokenNxPrice.output === undefined ? '--' : String(model.tokenNxPrice.output))
  return t('console.quickstart.modelPrice', { input, output })
}

function modelBadge(model: ModelRecord): string {
  const label = model.labels.find((item) => item !== '文本' && item !== 'text')
  return label ?? model.company
}

function highlightCodeLine(line: string): ReactNode {
  const tokenPattern = /(https?:\/\/[^\s'"`]+|['"`][^'"`]*['"`]|--?[A-Za-z][\w-]*|\b(?:curl|POST|from|import|const|new|await|return|print|true|false|null)\b|\b\d+(?:\.\d+)?\b)/g
  const parts: ReactNode[] = []
  let cursor = 0
  let match: RegExpExecArray | null
  while ((match = tokenPattern.exec(line))) {
    if (match.index > cursor) parts.push(line.slice(cursor, match.index))
    const token = match[0]
    let className = 'quickstart-code-token'
    if (/^https?:/.test(token)) className += ' is-url'
    else if (/^['"`]/.test(token)) className += ' is-string'
    else if (/^-/.test(token)) className += ' is-flag'
    else if (/^\d/.test(token)) className += ' is-number'
    else className += ' is-keyword'
    parts.push(<span className={className} key={`${match.index}-${token}`}>{token}</span>)
    cursor = match.index + token.length
  }
  if (cursor < line.length) parts.push(line.slice(cursor))
  return parts
}

function highlightCode(code: string): ReactNode {
  return code.split('\n').map((line, index) => <span className="quickstart-code-line" key={`line-${index}`}>{highlightCodeLine(line)}</span>)
}

// Keep the ordinal label localized so the same step structure reads naturally in both locales.
function StepHeader({ label, title, status, open, onToggle, help }: { label: string; title: string; status?: ReactNode; open: boolean; onToggle: () => void; help?: ReactNode }) {
  return <div className={`quickstart-pdf-step-header${open ? ' is-open' : ''}`}>
    <button className="quickstart-pdf-step-toggle" type="button" aria-expanded={open} onClick={onToggle}>
      <span className="quickstart-pdf-step-title"><em>{label}</em><strong>{title}</strong>{status}</span>
    </button>
    {help ? <span className="quickstart-pdf-step-help">{help}</span> : null}
    <button className="quickstart-pdf-step-accordion-button" type="button" aria-expanded={open} aria-label={title} onClick={onToggle} />
  </div>
}

function StepPanel({ children, open }: { children: ReactNode; open: boolean }) {
  return <div className={`quickstart-pdf-step-panel${open ? ' is-open' : ''}`} aria-hidden={!open}><div>{children}</div></div>
}

function ApiKeyStep({ keys, loading, contextQuery, onCopy, onApply, appliedKeyID, t }: { keys: UserApiKey[]; loading: boolean; contextQuery: string; onCopy: (value: string) => void; onApply: (key: UserApiKey) => void; appliedKeyID: string; t: (key: string, options?: Record<string, unknown>) => string }) {
  const [query, setQuery] = useState('')
  const rows = keys.filter((key) => key.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  return <>
    <p className="quickstart-pdf-description">{t('console.quickstart.stepApiKeyHint')}</p>
    <Input className="quickstart-pdf-search" prefix={<IconSearch aria-hidden="true" />} value={query} onChange={setQuery} placeholder={t('console.quickstart.keySearch')} aria-label={t('console.quickstart.keySearch')} />
    <div className="quickstart-pdf-key-table-wrap">
      <table className="quickstart-pdf-key-table"><thead><tr><th>{t('console.quickstart.keyName')}</th><th>{t('console.quickstart.keyValue')}</th><th>{t('console.quickstart.keyScope')}</th><th>{t('console.quickstart.keyOperation')}</th></tr></thead><tbody>
        {loading ? <tr><td className="quickstart-pdf-table-state" colSpan={4}>{t('console.common.loadingModels')}</td></tr> : rows.length ? rows.map((key) => <tr key={key.id}><td><strong>{key.name}</strong></td><td><code>{key.masked_key}</code></td><td>{key.scope === 'all' ? t('console.quickstart.allModels') : key.models.length ? key.models.map((item) => item.name).join('、') : t('console.quickstart.pending')}</td><td><div className="quickstart-pdf-key-actions"><Button theme="borderless" size="small" disabled={!key.secret} onClick={() => onApply(key)}>{t('console.quickstart.applyKey')}{appliedKeyID === key.id ? ' ✓' : ''}</Button><Button theme="borderless" size="small" disabled={!key.secret} onClick={() => onCopy(key.secret || key.masked_key)}>{t('console.quickstart.copy')}</Button></div></td></tr>) : <tr><td className="quickstart-pdf-table-state" colSpan={4}><div className="quickstart-pdf-empty"><span className="quickstart-pdf-empty-icon"><IconFile aria-hidden="true" /></span><strong>{t('console.quickstart.noKeys')}</strong><span>{t('console.quickstart.keyHint')}</span><Link className="quickstart-pdf-outline-button" to={'/console/api-keys?return=' + encodeURIComponent('/console/quickstart?' + contextQuery)}>{t('console.quickstart.createNow')}</Link></div></td></tr>}
      </tbody></table>
    </div>
  </>
}

function ModelStep({ models, selected, onSelect, onNext, t }: { models: ModelRecord[]; selected: ModelRecord; onSelect: (alias: string) => void; onNext: () => void; t: (key: string, options?: Record<string, unknown>) => string }) {
  return <>
    <p className="quickstart-pdf-description">{t('console.quickstart.stepModelHint')}</p>
    <div className="quickstart-pdf-model-grid">{models.map((item, index) => { const isSelected = modelAlias(item) === modelAlias(selected); return <button className={`quickstart-pdf-model-card${isSelected ? ' is-selected' : ''}`} type="button" key={item.id} onClick={() => onSelect(modelAlias(item))}><span className="quickstart-pdf-model-copy"><span className="quickstart-pdf-model-heading"><span className={`quickstart-pdf-model-icon tone-${index % 4}`}>{item.name.slice(0, 1).toUpperCase()}</span><strong>{item.name}</strong></span><small>{item.description || `${item.company} · ${modelAlias(item)}`}</small><span>{item.context ? `${t('console.quickstart.modelContext', { value: item.context })} · ` : ''}{modelPrice(item, t)}</span></span><b>{modelBadge(item)}</b></button> })}</div>
    <div className="quickstart-pdf-selected-model"><span className="quickstart-pdf-selected-model-label">{t('console.quickstart.selectedModel')}</span><span className="quickstart-pdf-selected-model-value"><span className="quickstart-pdf-selected-model-icon">{selected.name.slice(0, 1).toUpperCase()}</span><strong>{selected.name}</strong><span>{modelAlias(selected)}</span></span></div>
    <button className="quickstart-pdf-primary-button" type="button" onClick={onNext}>{t('console.quickstart.nextStep')}</button>
  </>
}

function AgentStep({ model, language, appliedApiKey, setLanguage, t, onCopy }: { model: ModelRecord; language: QuickstartLanguage; appliedApiKey: string; setLanguage: (value: QuickstartLanguage) => void; t: (key: string) => string; onCopy: (value: string) => void }) {
  const [tab, setTab] = useState<QuickstartAgentTab>('api')
  const [apiMode, setApiMode] = useState<QuickstartApiMode>('chat')
  const [toolId, setToolId] = useState<(typeof AGENT_TOOLS)[number]['id']>('workbuddy')
  const alias = modelAlias(model)
  const selectedTool = AGENT_TOOLS.find((tool) => tool.id === toolId) ?? AGENT_TOOLS[1]
  const code = (apiMode === 'responses' ? responseCodeSample(language, alias) : quickstartCodeSample({ protocol: 'openai', language, modelAlias: alias })).replaceAll('YOUR_TOKEN_NX_API_KEY', appliedApiKey || 'YOUR_TOKEN_NX_API_KEY')
  return <div id="quickstart-agent" className="quickstart-pdf-agent">
    <div className="quickstart-pdf-tabs quickstart-pdf-agent-tabs" role="tablist">{(['api', 'tools'] as const).map((item) => <button type="button" role="tab" aria-selected={tab === item} className={tab === item ? 'is-active' : ''} key={item} onClick={() => setTab(item)}>{item === 'api' ? t('console.quickstart.apiIntegration') : t('console.quickstart.toolsIntegration')}</button>)}</div>
    {tab === 'api' ? <div className="quickstart-pdf-api-panel"><div className="quickstart-pdf-tabs quickstart-pdf-mode-tabs" role="tablist"><button type="button" className={apiMode === 'chat' ? 'is-active' : ''} onClick={() => setApiMode('chat')}>{t('console.quickstart.chatApi')}</button><button type="button" className={apiMode === 'responses' ? 'is-active' : ''} onClick={() => setApiMode('responses')}>{t('console.quickstart.responsesApi')}</button></div><p className="quickstart-pdf-code-hint">{t('console.quickstart.codeHint')} <code>{alias}</code></p><div className="quickstart-pdf-code-shell"><div className="quickstart-pdf-code-toolbar"><div className="quickstart-pdf-tabs quickstart-pdf-language-tabs" role="tablist">{(['curl', 'python', 'node'] as const).map((item) => <button type="button" className={language === item ? 'is-active' : ''} key={item} onClick={() => setLanguage(item)}>{item === 'curl' ? 'cURL' : item === 'python' ? t('console.quickstart.python') : 'Node.js'}</button>)}</div><Button theme="borderless" size="small" icon={<IconCopy />} onClick={() => onCopy(code)}>{t('console.quickstart.copy')}</Button></div><pre><code>{highlightCode(code)}</code></pre></div></div> : <div className="quickstart-pdf-tools-panel"><div className="quickstart-pdf-tool-list">{AGENT_TOOLS.map((tool) => <button type="button" key={tool.id} className={tool.id === selectedTool.id ? 'is-active' : ''} onClick={() => setToolId(tool.id)}><span style={{ backgroundColor: tool.accent }}>{tool.glyph}</span>{tool.name}</button>)}</div><div className="quickstart-pdf-tool-detail"><h3><span className="quickstart-pdf-tool-mark" style={{ color: selectedTool.accent }}>{selectedTool.glyph}</span>{selectedTool.name}</h3><p>{t('console.quickstart.workbuddyHint')}</p><Link to="/docs">{t('console.quickstart.viewDocs')} ↗</Link></div></div>}
  </div>
}

export function QuickstartGuide() {
  const { t } = useTranslation()
  const store = useAppStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const { models, loading: modelsLoading, error: modelsError } = useUserModels()
  const textModels = models.filter((item) => item.modality === 'text' && modelAlias(item))
  const requestedModelAlias = searchParams.get('model')
  const requestedModel = findModelInList(models, requestedModelAlias)
  const model = requestedModel && modelAlias(requestedModel) ? requestedModel : textModels[0]
  const [language, setLanguage] = useState<QuickstartLanguage>(searchParams.get('language') ? normalizeQuickstartLanguage(searchParams.get('language')) : 'curl')
  const [openStep, setOpenStep] = useState<QuickstartStep>(1)
  const [keys, setKeys] = useState<UserApiKey[]>([])
  const [keysLoading, setKeysLoading] = useState(true)
  const [appliedApiKey, setAppliedApiKey] = useState('')
  const [appliedKeyID, setAppliedKeyID] = useState('')
  const workspaceContext = useMemo<UserApiKeyContext>(() => workspaceContextFor(store.activeWorkspace), [store.activeWorkspace.id, store.activeWorkspace.type])

  useEffect(() => {
    if (modelsError) appToast.error(modelsError)
  }, [modelsError])

  useEffect(() => {
    const alias = model ? modelAlias(model) : ''
    if (!alias || (requestedModel && requestedModelAlias === alias)) return
    setSearchParams({ model: alias, language }, { replace: true })
  }, [language, model, requestedModel, requestedModelAlias, setSearchParams])

  useEffect(() => {
    let active = true
    setKeysLoading(true)
    void getUserApiKeys(workspaceContext, 'all').then((result) => { if (active) setKeys(result.items) }).catch(() => { if (active) setKeys([]) }).finally(() => { if (active) setKeysLoading(false) })
    return () => { active = false }
  }, [workspaceContext])

  function copy(value: string): void {
    if (!navigator.clipboard) return
    void navigator.clipboard.writeText(value).then(() => Toast.success(t('console.quickstart.copySuccess'))).catch(() => Toast.error(t('console.common.copyFailed')))
  }

  if (modelsLoading) return <div className="quickstart-page quickstart-pdf-page"><p>{t('console.common.readingModels')}</p></div>
  if (modelsError) return <div className="quickstart-page quickstart-pdf-page" />
  if (!model) return <div className="quickstart-page quickstart-pdf-page"><p>{t('console.quickstart.noModelsHint')}</p></div>
  const contextQuery = `model=${encodeURIComponent(modelAlias(model))}&language=${language}`
  const completed = keys.some((key) => key.status === 'active')
  const toggle = (step: QuickstartStep) => setOpenStep(openStep === step ? 0 : step)
  return <div className="quickstart-page quickstart-pdf-page">
    <div className="quickstart-pdf-intro"><div><strong>{t('console.quickstart.heroTitle')}</strong><p>{t('console.quickstart.heroHint')} <Link to="/console/billing">{t('console.quickstart.subscription')}</Link></p></div></div>
    <div className="quickstart-pdf-steps">
      <section className={`quickstart-pdf-step${openStep === 1 ? ' is-open' : ''}`}><StepHeader label={t('console.quickstart.stepOne')} title={t('console.quickstart.stepApiKey')} open={openStep === 1} onToggle={() => toggle(1)} help={<Link to="/docs">{t('console.quickstart.viewHelp')}</Link>} status={<span className="quickstart-pdf-status"><i className={completed ? 'is-complete' : ''} />{t('console.quickstart.completedCount', { count: completed ? 1 : 0 })}</span>} /><StepPanel open={openStep === 1}><ApiKeyStep keys={keys} loading={keysLoading} contextQuery={contextQuery} onCopy={copy} onApply={(key) => { setAppliedApiKey(key.secret || ''); setAppliedKeyID(key.id); Toast.success(t('console.quickstart.applySuccess')) }} appliedKeyID={appliedKeyID} t={t} /></StepPanel></section>
      <section className={`quickstart-pdf-step${openStep === 2 ? ' is-open' : ''}`}><StepHeader label={t('console.quickstart.stepTwo')} title={t('console.quickstart.stepModel')} open={openStep === 2} onToggle={() => toggle(2)} status={<span className="quickstart-pdf-status"><i />{model.name}</span>} /><StepPanel open={openStep === 2}><ModelStep models={textModels} selected={model} onSelect={(alias) => { setSearchParams({ model: alias, language }); setOpenStep(2) }} onNext={() => { setOpenStep(3); window.requestAnimationFrame(() => document.getElementById('quickstart-agent')?.scrollIntoView({ behavior: 'smooth', block: 'start' })) }} t={t} /></StepPanel></section>
      <section className={`quickstart-pdf-step${openStep === 3 ? ' is-open' : ''}`}><StepHeader label={t('console.quickstart.stepThree')} title={t('console.quickstart.stepAgent')} open={openStep === 3} onToggle={() => toggle(3)} /><StepPanel open={openStep === 3}><AgentStep model={model} language={language} appliedApiKey={appliedApiKey} setLanguage={(next) => { setLanguage(next); setSearchParams({ model: modelAlias(model), language: next }) }} t={t} onCopy={copy} /></StepPanel></section>
    </div>
  </div>
}
