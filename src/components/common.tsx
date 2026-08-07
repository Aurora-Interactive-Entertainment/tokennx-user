import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { TFunction } from 'i18next'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import Avatar from '@douyinfe/semi-ui/lib/es/avatar'
import Badge from '@douyinfe/semi-ui/lib/es/badge'
import Button from '@douyinfe/semi-ui/lib/es/button'
import { Layout } from '@douyinfe/semi-ui/lib/es/layout'
import Tag from '@douyinfe/semi-ui/lib/es/tag'
import Toast from '@douyinfe/semi-ui/lib/es/toast'
import {
  IconApps,
  IconBarChartVStroked,
  IconBellStroked,
  IconBriefcaseStroked,
  IconChevronDown,
  IconClose,
  IconCommentStroked,
  IconCopyStroked,
  IconCreditCardStroked,
  IconCustomerSupport,
  IconDesktop,
  IconExit,
  IconFile,
  IconIdCardStroked,
  IconImage,
  IconKeyStroked,
  IconLightningStroked,
  IconMenu,
  IconMoonStroked,
  IconPieChartStroked,
  IconPlayCircle,
  IconRefresh,
  IconSearch,
  IconShieldStroked,
  IconSettingStroked,
  IconSend,
  IconSunStroked,
  IconUserGroup,
  IconUserStroked,
  IconVideo,
} from '@douyinfe/semi-icons'
import { useAppStore, type AppStoreValue, type Workspace, type WorkspaceRole } from '@/data/app-state'
import { modelAlias, modelRouteKey, MODALITY_LABELS, type ModelRecord } from '@/data/models'
import { getProfileEnterprises, limitDisplayNameLength, type EnterpriseMembership } from '@/api/profile'
import { completeBinding, completeWechatLogin, invalidateAuth, loginWithPhone, logoutAuth, pollWechatStatus, requestBindingCode, requestPhoneCode, requestWechatQr } from '@/store/auth-slice'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { clearAuthTokens, getAccessToken } from '@/auth/token-storage'
import { isAuthenticationFailure } from '@/api/http'
import { useTranslation } from 'react-i18next'
import { cycleThemeMode, themeModeLabel, useResolvedTheme, useThemeMode } from '@/theme'
import { getMockSupportReply, MOCK_SUPPORT_REPLY_DELAY_MS, type SupportChatMessage, type SupportLocale, type SupportMessageRole } from './support-chat'
import { MoneyText } from './money'
import { enterpriseMenuPermissionKeyForPath, hasEnterpriseMenuPermission, isEnterpriseOwner, type EnterpriseMenuAccess, type EnterpriseMenuPermissionKey, useEnterpriseMenuAccess } from './enterprise-menu-access'
import { ENTERPRISE_CREATE_PATH, NEW_ENTERPRISE_CREATE_PATH } from '@/api/enterprise-certification'
export { isEnterpriseOwner } from './enterprise-menu-access'
import tokenNxLogo from '@/token-nx-logo.png'
import headerLogo from '@/assets/figma-header/token-nx-header-logo.png'
import headerTrialPill from '@/assets/figma-header/trial-pill.png'
import headerTrialFreeTag from '@/assets/figma-header/trial-free-tag.svg'
import headerNotificationIcon from '@/assets/figma-header/notification.svg'
import manuscriptFooterLogo from '@/assets/figma-home/footer-logo.png'
import manuscriptCustomerQr from '@/assets/figma-home/footer-qr-customer.png'
import manuscriptOfficialQr from '@/assets/figma-home/footer-qr-official.png'
import manuscriptFilingIcpIcon from '@/assets/figma-home/filing-icp.png'
import manuscriptFilingSecurityIcon from '@/assets/figma-home/filing-security.png'
import wechatIcon from '@/assets/figma-home/wechat.png'
import deepseekLogo from '@lobehub/icons-static-svg/icons/deepseek-color.svg?raw'
import anthropicLogo from '@lobehub/icons-static-svg/icons/claude-color.svg?raw'
import openaiLogo from '@lobehub/icons-static-svg/icons/openai.svg?raw'
import qwenLogo from '@lobehub/icons-static-svg/icons/qwen-color.svg?raw'
import zhipuLogo from '@lobehub/icons-static-svg/icons/zhipu-color.svg?raw'
import geminiLogo from '@lobehub/icons-static-svg/icons/gemini-color.svg?raw'
import metaLogo from '@lobehub/icons-static-svg/icons/meta-color.svg?raw'
import mistralLogo from '@lobehub/icons-static-svg/icons/mistral-color.svg?raw'
import moonshotLogo from '@lobehub/icons-static-svg/icons/moonshot.svg?raw'
import yiLogo from '@lobehub/icons-static-svg/icons/yi-color.svg?raw'
import baichuanLogo from '@lobehub/icons-static-svg/icons/baichuan-color.svg?raw'
import doubaoLogo from '@lobehub/icons-static-svg/icons/doubao-color.svg?raw'
import midjourneyLogo from '@lobehub/icons-static-svg/icons/midjourney.svg?raw'
import stabilityLogo from '@lobehub/icons-static-svg/icons/stability-color.svg?raw'

const COMPANY_LOGOS: Record<string, string> = {
  DeepSeek: deepseekLogo,
  Anthropic: anthropicLogo,
  OpenAI: openaiLogo,
  阿里云: qwenLogo,
  智谱AI: zhipuLogo,
  Google: geminiLogo,
  Meta: metaLogo,
  'Mistral AI': mistralLogo,
  月之暗面: moonshotLogo,
  零一万物: yiLogo,
  百川智能: baichuanLogo,
  字节跳动: doubaoLogo,
  Midjourney: midjourneyLogo,
  'Stability AI': stabilityLogo,
}

const FALLBACK_MODEL_LOGO = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.7"></circle><path d="M5 12h14M12 5v14" fill="none" stroke="currentColor" stroke-width="1.7"></path></svg>'

type PublicLink = {
  labelKey: string
  path: string
  disabled?: boolean
  emphasized?: boolean
}

export const PUBLIC_LINKS: PublicLink[] = [
  { labelKey: 'nav.models', path: '/models' },
  { labelKey: 'nav.private', path: ENTERPRISE_CREATE_PATH, disabled: true, emphasized: true },
  { labelKey: 'nav.ranking', path: '/models', disabled: true },
  { labelKey: 'nav.apps', path: '/docs', disabled: true },
  { labelKey: 'nav.docs', path: '/docs', disabled: true },
]

// 中文：登录后的默认工作页改为快速接入，控制台根路径不再承载总览页面。
export const DEFAULT_CONSOLE_PATH = '/console/quickstart'

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return <span className={`brand-mark${compact ? ' brand-mark--compact' : ''}`} aria-hidden="true"><i /><i /><b>NX</b></span>
}

export function BrandLogo({ className = '', size = 'default' }: { className?: string; size?: 'default' | 'compact' | 'panel' }) {
  return <img className={`brand-logo-image brand-logo-image--${size}${className ? ` ${className}` : ''}`} src={tokenNxLogo} alt="" aria-hidden="true" />
}

export function AppLoadingScreen({ label }: { label?: string }) {
  const { t } = useTranslation()
  const loadingLabel = label ?? t('login.brand')
  return <div className="app-loading-screen" role="status" aria-label={loadingLabel}><div className="app-loading-screen__content"><span className="app-loading-screen__logo-shell" aria-hidden="true"><BrandLogo size="panel" /></span><span className="public-sr-only">{loadingLabel}</span></div></div>
}

export function PageTitle({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="page-title-row">
      <div>
        <h1 className="page-title">{title}</h1>
        {description ? <p className="page-description">{description}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </div>
  )
}

export function SectionHeading({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  )
}

export function ModelLogo({ model, size = 'default', className = '' }: { model: ModelRecord; size?: 'small' | 'default' | 'large'; className?: string }) {
  const companyClass = model.company.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const logoMarkup = COMPANY_LOGOS[model.company]
  const modalityIcon = model.modality === 'image' ? <IconImage /> : model.modality === 'video' ? <IconVideo /> : model.modality === 'audio' ? <IconPlayCircle /> : <span dangerouslySetInnerHTML={{ __html: FALLBACK_MODEL_LOGO }} />
  return (
    <span className={`model-logo model-logo--${size} model-logo--${model.modality} model-logo--${companyClass}${className ? ` ${className}` : ''}`} aria-hidden="true">
      {logoMarkup ? <span dangerouslySetInnerHTML={{ __html: logoMarkup }} /> : modalityIcon}
    </span>
  )
}

export function ModelTags({ model }: { model: ModelRecord }) {
  const { t } = useTranslation()
  return (
    <div className="tag-row">
      {model.labels.slice(0, 4).map((label) => <Tag key={label} color={label === '折扣' ? 'orange' : label === '多模态' ? 'violet' : 'grey'}>{localizeConsoleLabel(t, label)}</Tag>)}
    </div>
  )
}

const MODEL_UNAVAILABLE_LABEL = '后端未提供'
const MODEL_AVAILABILITY_BAR_COUNT = 24
const MODEL_AVAILABILITY_MAX_WARN_BARS = 4
const MODEL_AVAILABILITY_WARN_SCALE = 2
const MODEL_IO_TYPES: Record<ModelRecord['modality'], [string, string]> = {
  text: ['文本', '文本'],
  image: ['文本', '图片'],
  video: ['文本', '视频'],
  audio: ['文本', '音频'],
  embedding: ['文本', '向量'],
  rerank: ['文本', '排序分数'],
  speech: ['文本', '音频'],
  transcription: ['音频', '文本'],
  other: [MODEL_UNAVAILABLE_LABEL, MODEL_UNAVAILABLE_LABEL],
}
const MODEL_TYPE_MARKS: Record<string, string> = { 文本: 'T', 图片: 'I', 视频: 'V', 音频: 'A', 向量: 'E', 排序分数: 'R', [MODEL_UNAVAILABLE_LABEL]: '?' }

const CONSOLE_LABEL_KEYS: Record<string, string> = {
  '后端未提供': 'console.common.unavailable',
  '上下文': 'console.common.context',
  '最大输出': 'console.common.maxOutput',
  '图像尺寸': 'console.common.imageSize',
  '视频时长': 'console.common.videoDuration',
  '音频音色': 'console.common.audioVoice',
  '音频格式': 'console.common.audioFormat',
  '向量维度': 'console.common.embeddingDimension',
  '模型规格': 'console.common.modelSpec',
  '输出限制': 'console.common.outputLimit',
  '文本': 'console.common.text',
  '图片': 'console.common.image',
  '视频': 'console.common.video',
  '音频': 'console.common.audio',
  '向量': 'console.common.embedding',
  '排序分数': 'console.common.rerank',
  '代码': 'console.common.code',
  '高清': 'console.common.hd',
  '近 24 小时': 'console.common.recent24h',
  '折扣': 'console.models.discount',
  '多模态': 'console.enterprise.model.multimodal',
}

export function localizeConsoleLabel(t: TFunction, value: string): string {
  const key = CONSOLE_LABEL_KEYS[value]
  return key ? t(key) : value
}

function modelParameterValue(model: ModelRecord, keys: readonly string[], suffix = ''): string {
  const value = keys.map((key) => model.params?.[key]).find((item) => Array.isArray(item) && item.length > 0)
  if (!value) return MODEL_UNAVAILABLE_LABEL
  return value.slice(0, 2).map((item) => `${item}${suffix}`).join(' / ')
}

function modelCardSpecs(model: ModelRecord): { contextLabel: string; contextValue: string; outputLabel: string; outputValue: string } {
  if (model.modality === 'text') {
    return { contextLabel: '上下文', contextValue: model.context ?? MODEL_UNAVAILABLE_LABEL, outputLabel: '最大输出', outputValue: model.maxOutput ?? MODEL_UNAVAILABLE_LABEL }
  }
  if (model.modality === 'image') {
    return { contextLabel: '图像尺寸', contextValue: modelParameterValue(model, ['尺寸', 'sizes', 'size']), outputLabel: '输出限制', outputValue: model.maxOutput ?? MODEL_UNAVAILABLE_LABEL }
  }
  if (model.modality === 'video') {
    return { contextLabel: '视频时长', contextValue: modelParameterValue(model, ['时长', 'durations', 'duration'], 's'), outputLabel: '输出限制', outputValue: model.maxOutput ?? MODEL_UNAVAILABLE_LABEL }
  }
  if (model.modality === 'audio' || model.modality === 'speech') {
    return { contextLabel: '音频音色', contextValue: modelParameterValue(model, ['音色', 'voices', 'voice']), outputLabel: '输出限制', outputValue: model.maxOutput ?? MODEL_UNAVAILABLE_LABEL }
  }
  if (model.modality === 'transcription') {
    return { contextLabel: '音频格式', contextValue: modelParameterValue(model, ['音频格式', 'formats', 'format']), outputLabel: '输出限制', outputValue: model.maxOutput ?? MODEL_UNAVAILABLE_LABEL }
  }
  if (model.modality === 'embedding') {
    return { contextLabel: '向量维度', contextValue: modelParameterValue(model, ['向量维度', 'dimension', 'dimensions']), outputLabel: '输出限制', outputValue: model.maxOutput ?? MODEL_UNAVAILABLE_LABEL }
  }
  return { contextLabel: '模型规格', contextValue: model.context ?? MODEL_UNAVAILABLE_LABEL, outputLabel: '输出限制', outputValue: model.maxOutput ?? MODEL_UNAVAILABLE_LABEL }
}

function availabilityBars(rate: number): ReactNode {
  if (!Number.isFinite(rate) || rate <= 0 || rate > 100) return null
  const warnBars = Math.min(MODEL_AVAILABILITY_MAX_WARN_BARS, Math.max(0, Math.round((100 - rate) * MODEL_AVAILABILITY_WARN_SCALE)))
  const warnInterval = warnBars > 0 ? Math.ceil(MODEL_AVAILABILITY_BAR_COUNT / warnBars) : MODEL_AVAILABILITY_BAR_COUNT
  return <span className="availability-bars">{Array.from({ length: MODEL_AVAILABILITY_BAR_COUNT }, (_, index) => <i className={`availability-bar ${warnBars > 0 && index % warnInterval === 0 ? 'is-warn' : 'is-up'}`} key={index} />)}</span>
}

export function ModelCard({ model, compact = false, onSelect }: { model: ModelRecord; compact?: boolean; onSelect?: (model: ModelRecord) => void }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const publicAlias = modelAlias(model)
  const displayAlias = modelAlias(model) || t('console.common.modelAliasUnset')
  const routeKey = modelRouteKey(model)

  async function copyAlias(): Promise<void> {
    if (!publicAlias) return
    try {
      await navigator.clipboard.writeText(publicAlias)
      setCopied(true)
      Toast.success(t('console.models.aliasCopied'))
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      Toast.error(t('console.common.copyFailed'))
    }
  }

  const [inputTypeValue, outputTypeValue] = MODEL_IO_TYPES[model.modality]
  const inputType = localizeConsoleLabel(t, inputTypeValue)
  const outputType = localizeConsoleLabel(t, outputTypeValue)
  const priceUnit = model.tokenNxPrice.unit
  const inputPrice = model.tokenNxPrice.input ?? model.tokenNxPrice.standard
  const inputRaw = model.tokenNxPrice.input !== undefined ? model.tokenNxPrice.inputRaw : model.tokenNxPrice.standardRaw
  const outputPrice = model.tokenNxPrice.output ?? model.tokenNxPrice.hd
  const outputRaw = model.tokenNxPrice.output !== undefined ? model.tokenNxPrice.outputRaw : model.tokenNxPrice.hdRaw
  const specs = modelCardSpecs(model)
  const inputMark = MODEL_TYPE_MARKS[inputTypeValue] ?? '?'
  const outputMark = MODEL_TYPE_MARKS[outputTypeValue] ?? '?'
  const hasAvailability = Number.isFinite(model.availability.rate) && model.availability.rate > 0 && model.availability.rate <= 100

  const cardBody = (
      <>
        <div className="model-card-topline">
          <ModelLogo model={model} />
          <div className="model-card-heading">
            <span className="model-card-name">{model.name}</span>
            <span className="model-card-company">{model.company}</span>
          </div>
        </div>
        <div className="model-id-row"><code>{displayAlias}</code>{copied ? <span className="copy-hint">{t('console.common.copied')}</span> : null}</div>
        <div className="model-card-highlight-row">
          <span className="model-card-throughput"><strong>{model.throughput.unit === '后端未提供' ? t('console.common.unavailable') : `${model.throughput.value}${model.throughput.unit === 'B tokens' ? 'B token' : ` ${model.throughput.unit}`}`}</strong></span>
          <div className="model-card-tags">{model.labels.slice(0, 4).map((label) => <span className={`model-card-tag model-card-tag--${label === '折扣' ? 'warning' : label === '多模态' ? 'accent' : label === '代码' ? 'info' : 'neutral'}`} key={label}>{localizeConsoleLabel(t, label)}</span>)}</div>
        </div>
        <p className="model-card-description">{model.description}</p>
        <div className="model-card-io">
          <div><span className="model-card-io-label">{t('console.common.inputType')} <span className="model-card-type-mark" aria-hidden="true">{inputMark}</span></span><strong>{inputType}</strong></div>
          <div><span className="model-card-io-label">{t('console.common.outputType')} <span className="model-card-type-mark" aria-hidden="true">{outputMark}</span></span><strong>{outputType}</strong></div>
        </div>
        <div className="model-card-pricing" aria-label={t('console.common.tokenNxPrice')}>
          <span className="model-card-price-caption">{t('console.common.tokenNxPriceHint')}</span>
          <div className="model-card-price-grid">
            {inputPrice !== undefined ? <div className="model-card-price-cell"><span>{t('console.common.input')}:</span><strong><MoneyText value={inputPrice} rawValue={inputRaw} withCurrency={false} /><small>{priceUnit}</small></strong></div> : null}
            {outputPrice !== undefined ? <div className="model-card-price-cell"><span>{t('console.common.output')}:</span><strong><MoneyText value={outputPrice} rawValue={outputRaw} withCurrency={false} /><small>{priceUnit}</small></strong></div> : null}
            {inputPrice === undefined && outputPrice === undefined ? <div className="model-card-price-cell model-card-price-cell--single"><span>{t('console.common.tokenNxPrice')}:</span><strong><MoneyText value={model.tokenNxPrice.base} rawValue={model.tokenNxPrice.baseRaw} withCurrency={false} /><small>{priceUnit}</small></strong></div> : null}
          </div>
        </div>
        <div className="model-card-spec-grid" aria-label={`${localizeConsoleLabel(t, specs.contextLabel)} / ${localizeConsoleLabel(t, specs.outputLabel)}`}>
          <div className="model-card-spec-cell"><span>{localizeConsoleLabel(t, specs.contextLabel)}:</span><strong>{specs.contextValue === MODEL_UNAVAILABLE_LABEL ? t('console.common.unavailable') : specs.contextValue}</strong></div>
          <div className="model-card-spec-cell"><span>{localizeConsoleLabel(t, specs.outputLabel)}:</span><strong>{specs.outputValue === MODEL_UNAVAILABLE_LABEL ? t('console.common.unavailable') : specs.outputValue}</strong></div>
        </div>
        <div className="model-card-foot">
          <span className="model-card-providers">{t('console.common.providers', { count: model.providerCount })}</span>
          <span className={`model-card-availability${hasAvailability ? '' : ' is-unavailable'}`}><span>{hasAvailability ? `${localizeConsoleLabel(t, model.availability.window)} ${model.availability.rate}%` : t('console.common.unavailable')}</span>{availabilityBars(model.availability.rate)}</span>
        </div>
      </>
  )

  return (
    <article className={`model-card${compact ? ' model-card--compact' : ''}`}>
      <Button className="model-card-copy" theme="borderless" icon={<IconCopyStroked />} aria-label={t('console.models.modelAlias', { name: model.name })} title={t('console.common.copyAlias')} onClick={copyAlias} disabled={!publicAlias} />
      {onSelect ? (
        <button type="button" className="model-card-link model-card-link--button" aria-label={`${t('console.common.viewDetails')}: ${model.name}`} onClick={() => onSelect(model)}>
          {cardBody}
        </button>
      ) : (
        <Link className={`model-card-link${routeKey ? '' : ' model-card-link--disabled'}`} to={routeKey ? `/console/models/${encodeURIComponent(routeKey)}` : '/console/models'} aria-disabled={!routeKey} onClick={(event) => { if (!routeKey) event.preventDefault() }} aria-label={`${t('console.common.viewDetails')}: ${model.name}`}>
          {cardBody}
        </Link>
      )}
    </article>
  )
}

export function MetricCard({ label, value, note, tone = 'default', icon }: { label: string; value: ReactNode; note?: string; tone?: 'default' | 'brand' | 'success' | 'warning'; icon?: ReactNode }) {
  return (
    <div className={`metric-card metric-card--${tone}`}>
      <div className="metric-card-label"><span>{label}</span>{icon ? <span className="metric-card-icon">{icon}</span> : null}</div>
      <strong className="metric-card-value">{value}</strong>
      {note ? <span className="metric-card-note">{note}</span> : null}
    </div>
  )
}

export function Sparkline({ values, tone = 'brand' }: { values: number[]; tone?: 'brand' | 'success' | 'warning' }) {
  const { t } = useTranslation()
  const max = Math.max(...values)
  const min = Math.min(...values)
  const width = 320
  const height = 92
  const points = values.map((value, index) => {
    const x = (index / Math.max(1, values.length - 1)) * width
    const y = height - ((value - min) / Math.max(1, max - min)) * (height - 16) - 8
    return `${x},${y}`
  }).join(' ')
  return (
    <svg className={`sparkline sparkline--${tone}`} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t('console.common.trend')}>
      <path d={`M 0 ${height - 8} H ${width}`} className="sparkline-baseline" />
      <polyline points={points} fill="none" className="sparkline-line" vectorEffect="non-scaling-stroke" />
      {values.map((value, index) => {
        const [x, y] = points.split(' ')[index].split(',')
        return <circle key={`${value}-${index}`} cx={x} cy={y} r="2.5" className="sparkline-point" />
      })}
    </svg>
  )
}

type VerificationCodeButtonProps = {
  loading: boolean
  retryAfter: number
  sent: boolean
  onClick: () => void
}

type LoginDialCode = {
  code: string
  label: string
  minLength: number
  maxLength: number
  pattern?: RegExp
}

const LOGIN_CODE_RETRY_SECONDS = 60
const LOGIN_DIAL_CODES: readonly LoginDialCode[] = [
  { code: '+86', label: '中国大陆', minLength: 11, maxLength: 11, pattern: /^1[3-9]\d{9}$/ },
  { code: '+852', label: '中国香港', minLength: 8, maxLength: 8 },
  { code: '+853', label: '中国澳门', minLength: 8, maxLength: 8 },
  { code: '+886', label: '中国台湾', minLength: 9, maxLength: 10 },
  { code: '+1', label: '美国/加拿大', minLength: 10, maxLength: 10 },
  { code: '+44', label: '英国', minLength: 10, maxLength: 10 },
  { code: '+81', label: '日本', minLength: 10, maxLength: 11 },
  { code: '+82', label: '韩国', minLength: 9, maxLength: 11 },
  { code: '+65', label: '新加坡', minLength: 8, maxLength: 8 },
  { code: '+60', label: '马来西亚', minLength: 9, maxLength: 10 },
  { code: '+61', label: '澳大利亚', minLength: 9, maxLength: 9 },
  { code: '+49', label: '德国', minLength: 10, maxLength: 11 },
  { code: '+33', label: '法国', minLength: 9, maxLength: 9 },
] as const

function loginDialCode(value: string): LoginDialCode {
  return LOGIN_DIAL_CODES.find((entry) => entry.code === value) ?? LOGIN_DIAL_CODES[0]
}

function normalizeLoginPhone(value: string): string {
  return value.replace(/\D/g, '')
}

function internationalLoginPhone(dialCode: string, value: string): string {
  return `${dialCode}${normalizeLoginPhone(value)}`
}

function VerificationCodeButton(props: VerificationCodeButtonProps) {
  const { t } = useTranslation()
  let label = t('login.sendCode')
  if (props.loading) label = t('login.sendingCode')
  else if (props.retryAfter > 0) label = t('login.retryAfter', { seconds: props.retryAfter })
  else if (props.sent) label = t('login.resendCode')
  return (
    <button
      className={`btn btn-secondary get-code-btn${props.loading ? ' is-loading' : ''}`}
      type="button"
      onClick={props.onClick}
      disabled={props.loading || props.retryAfter > 0}
      aria-busy={props.loading}
    >
      {props.loading ? <span className="get-code-spinner" aria-hidden="true" /> : null}
      <span>{label}</span>
    </button>
  )
}

type LoginPhoneFieldProps = {
  id: string
  label?: string
  dialCode: string
  phone: string
  invalid?: boolean
  onDialCodeChange: (value: string) => void
  onPhoneChange: (value: string) => void
}

function LoginPhoneField(props: LoginPhoneFieldProps) {
  const { t } = useTranslation()
  const dial = loginDialCode(props.dialCode)
  return (
    <div className="form-field phone-field">
      {props.label ? <label className="field-label" htmlFor={props.id}>{props.label}</label> : null}
      <div className="phone-input-wrapper">
        <div className="phone-prefix-control">
          <span className="phone-prefix-value" aria-hidden="true">{dial.code}</span>
          <select
            className="phone-prefix-select"
            value={props.dialCode}
            onChange={(event) => props.onDialCodeChange(event.target.value)}
            aria-label={t('login.countryCode')}
          >
            {LOGIN_DIAL_CODES.map((entry) => <option key={entry.code} value={entry.code}>{entry.code} {entry.label}</option>)}
          </select>
        </div>
        <input
          className="phone-input"
          id={props.id}
          aria-label={t('login.phone')}
          type="tel"
          value={props.phone}
          onChange={(event) => props.onPhoneChange(normalizeLoginPhone(event.target.value).slice(0, dial.maxLength))}
          placeholder={t('login.phonePlaceholder')}
          maxLength={dial.maxLength}
          autoComplete="tel-national"
          inputMode="numeric"
          aria-invalid={props.invalid}
          required
        />
      </div>
    </div>
  )
}

export function LoginPanel({ onSuccess, onAuthFailure }: { onSuccess: () => void; onAuthFailure?: () => void }) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<'phone' | 'wechat'>('phone')
  const [dialCode, setDialCode] = useState('+86')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [rememberLogin, setRememberLogin] = useState(false)
  const [phoneCodeSent, setPhoneCodeSent] = useState(false)
  const [phoneRetryAfter, setPhoneRetryAfter] = useState(0)
  const [phoneCodeLoading, setPhoneCodeLoading] = useState(false)
  const [phoneLoginLoading, setPhoneLoginLoading] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [wechatView, setWechatView] = useState<'idle' | 'loading' | 'pending' | 'binding' | 'error'>('idle')
  const [wechatQr, setWechatQr] = useState<{ state: string; authorize_url: string } | null>(null)
  const [bindingTicket, setBindingTicket] = useState('')
  const [bindingDialCode, setBindingDialCode] = useState('+86')
  const [bindingPhone, setBindingPhone] = useState('')
  const [bindingCode, setBindingCode] = useState('')
  const [bindingCodeSent, setBindingCodeSent] = useState(false)
  const [bindingRetryAfter, setBindingRetryAfter] = useState(0)
  const [bindingCodeLoading, setBindingCodeLoading] = useState(false)
  const [bindingLoading, setBindingLoading] = useState(false)
  const dispatch = useAppDispatch()
  const navigate = useNavigate()

  useEffect(() => {
    if (phoneRetryAfter <= 0) return undefined
    const timer = window.setInterval(() => setPhoneRetryAfter((value) => Math.max(0, value - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [phoneRetryAfter])

  useEffect(() => {
    if (bindingRetryAfter <= 0) return undefined
    const timer = window.setInterval(() => setBindingRetryAfter((value) => Math.max(0, value - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [bindingRetryAfter])

  useEffect(() => {
    if (tab !== 'wechat' || wechatView !== 'pending' || !wechatQr) return undefined
    let active = true
    let timer: number | undefined
    const poll = async (): Promise<void> => {
      try {
        const result = await dispatch(pollWechatStatus({ state: wechatQr.state })).unwrap()
        if (!active) return
        if (result.status === 'pending') {
          timer = window.setTimeout(() => void poll(), 2000)
          return
        }
        if (!result.result) {
          setWechatView('error')
          setFeedback(t('login.emptyWechatResult'))
          return
        }
        if (result.result.status === 'pending_binding' || result.result.binding_required) {
          if (!result.result.binding_ticket) {
            setWechatView('error')
            setFeedback(t('login.missingBindingTicket'))
            return
          }
          setBindingTicket(result.result.binding_ticket)
          setWechatView('binding')
          setFeedback(t('login.bindingHint'))
          return
        }
        await dispatch(completeWechatLogin(result.result)).unwrap()
        onSuccess()
      } catch (error) {
        if (active) {
          setWechatView('error')
          handleLoginError(error)
        }
      }
    }
    void poll()
    return () => {
      active = false
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [dispatch, onSuccess, tab, wechatQr, wechatView])

  function readLoginError(error: unknown): string {
    if (typeof error === 'object' && error !== null && 'message' in error) return String(error.message)
    return t('login.loginFailed')
  }

  function handleLoginError(error: unknown): void {
    if (isAuthenticationFailure(error)) {
      clearAuthTokens()
      dispatch(invalidateAuth())
      onAuthFailure?.()
      navigate('/', { replace: true })
      return
    }
    setFeedback(readLoginError(error))
  }

  function validatePhone(value: string, selectedDialCode: string): boolean {
    const normalized = normalizeLoginPhone(value)
    const dial = loginDialCode(selectedDialCode)
    const validLength = normalized.length >= dial.minLength && normalized.length <= dial.maxLength
    if (!validLength || (dial.pattern && !dial.pattern.test(normalized))) {
      setFeedback(t('login.validationPhone'))
      return false
    }
    return true
  }

  async function requestCode(): Promise<void> {
    if (phoneRetryAfter > 0 || phoneCodeLoading || !validatePhone(phone, dialCode)) return
    setPhoneCodeLoading(true)
    setFeedback('')
    try {
      const result = await dispatch(requestPhoneCode({ destination: internationalLoginPhone(dialCode, phone) })).unwrap()
      setPhoneCodeSent(true)
      setPhoneRetryAfter(LOGIN_CODE_RETRY_SECONDS)
      setFeedback(t('login.sentTo', { destination: result.destination_masked }))
    } catch (error) {
      handleLoginError(error)
    } finally {
      setPhoneCodeLoading(false)
    }
  }

  async function submitPhone(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!termsAccepted) {
      setFeedback(t('login.acceptTermsRequired'))
      return
    }
    if (!validatePhone(phone, dialCode)) return
    if (!/^\d{6}$/.test(code)) {
      setFeedback(t('login.validationCode'))
      return
    }
    setPhoneLoginLoading(true)
    setFeedback('')
    try {
      await dispatch(loginWithPhone({ destination: internationalLoginPhone(dialCode, phone), code })).unwrap()
      onSuccess()
    } catch (error) {
      handleLoginError(error)
    } finally {
      setPhoneLoginLoading(false)
    }
  }

  async function startWechatLogin(): Promise<void> {
    setWechatView('loading')
    setWechatQr(null)
    setFeedback('')
    try {
      const result = await dispatch(requestWechatQr()).unwrap()
      setWechatQr({ state: result.state, authorize_url: result.authorize_url })
      setWechatView('pending')
    } catch (error) {
      setWechatView('error')
      handleLoginError(error)
    }
  }

  async function requestBindingCodeAction(): Promise<void> {
    if (!bindingTicket || bindingRetryAfter > 0 || bindingCodeLoading || !validatePhone(bindingPhone, bindingDialCode)) return
    setBindingCodeLoading(true)
    setFeedback('')
    try {
      const result = await dispatch(requestBindingCode({ bindingTicket, phone: internationalLoginPhone(bindingDialCode, bindingPhone) })).unwrap()
      setBindingCodeSent(true)
      setBindingRetryAfter(LOGIN_CODE_RETRY_SECONDS)
      setFeedback(t('login.sentTo', { destination: result.destination_masked }))
    } catch (error) {
      handleLoginError(error)
    } finally {
      setBindingCodeLoading(false)
    }
  }

  async function submitBinding(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!termsAccepted) {
      setFeedback(t('login.acceptTermsRequired'))
      return
    }
    if (!validatePhone(bindingPhone, bindingDialCode)) return
    if (!/^\d{6}$/.test(bindingCode)) {
      setFeedback(t('login.validationCode'))
      return
    }
    setBindingLoading(true)
    setFeedback('')
    try {
      await dispatch(completeBinding({ bindingTicket, phone: internationalLoginPhone(bindingDialCode, bindingPhone), code: bindingCode })).unwrap()
      onSuccess()
    } catch (error) {
      handleLoginError(error)
    } finally {
      setBindingLoading(false)
    }
  }

  return (
    <div className="login-panel" aria-labelledby="login-panel-heading">
      <div className="login-panel-header">
        <div className="login-panel-logo"><BrandLogo size="panel" /></div>
      </div>
      {tab === 'phone' ? (
        <div className="login-pane login-pane--phone">
          <form className="login-form" onSubmit={submitPhone} noValidate>
            <h2 className="login-panel-title" id="login-panel-heading"><label htmlFor="login-phone">{t('login.phoneLoginTitle')}</label></h2>
            <LoginPhoneField id="login-phone" dialCode={dialCode} phone={phone} invalid={feedback === t('login.validationPhone')} onDialCodeChange={setDialCode} onPhoneChange={setPhone} />
            <div className="form-field code-field">
              <label className="public-sr-only" htmlFor="login-code">{t('login.code')}</label>
              <div className="code-input-wrapper">
                <input className="input" id="login-code" type="text" value={code} onChange={(event) => setCode(normalizeLoginPhone(event.target.value).slice(0, 6))} placeholder={t('login.codePlaceholder')} maxLength={6} autoComplete="one-time-code" inputMode="numeric" required />
                <VerificationCodeButton loading={phoneCodeLoading} retryAfter={phoneRetryAfter} sent={phoneCodeSent} onClick={() => { void requestCode() }} />
              </div>
            </div>
            <div className="remember-checkbox"><input type="checkbox" id="login-remember" checked={rememberLogin} onChange={(event) => setRememberLogin(event.target.checked)} /><label htmlFor="login-remember">{t('login.rememberLogin')}</label></div>
            {feedback ? <p className="login-feedback" role="status" aria-live="polite">{feedback}</p> : null}
            <button className="btn btn-primary submit-btn" type="submit" disabled={phoneLoginLoading}><span>{phoneLoginLoading ? t('login.loggingIn') : t('login.loginRegister')}</span></button>
            <div className="terms-checkbox"><input type="checkbox" id="login-terms" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} /><label htmlFor="login-terms">{t('login.agreementPrefix')} <a href="/terms" target="_blank" rel="noopener noreferrer">{t('login.userAgreement')}</a> {t('login.agreementAnd')} <a href="/privacy" target="_blank" rel="noopener noreferrer">{t('login.privacyPolicy')}</a>{t('login.accountCreationHint')}</label></div>
          </form>
          <div className="login-separator"><span>{t('login.separatorOr')}</span></div>
          <button className="btn login-switch-btn" type="button" onClick={() => { setTab('wechat'); setFeedback(''); if (wechatView === 'idle' || wechatView === 'error') void startWechatLogin() }}>
            <img className="wechat-icon" src={wechatIcon} alt="" aria-hidden="true" />{t('login.wechatLoginAction')}
          </button>
        </div>
      ) : (
        <div className={`login-pane${wechatView === 'binding' ? ' login-pane--phone login-pane--binding' : ' login-pane--wechat'}`}>
          {wechatView === 'binding' ? (
            <form className="login-form" onSubmit={submitBinding} noValidate>
              <h2 className="login-panel-title" id="login-panel-heading"><label htmlFor="binding-phone">{t('login.bindPhoneTitle')}</label></h2>
              <LoginPhoneField id="binding-phone" dialCode={bindingDialCode} phone={bindingPhone} invalid={feedback === t('login.validationPhone')} onDialCodeChange={setBindingDialCode} onPhoneChange={setBindingPhone} />
              <div className="form-field code-field"><label className="public-sr-only" htmlFor="binding-code">{t('login.code')}</label><div className="code-input-wrapper"><input className="input" id="binding-code" type="text" value={bindingCode} onChange={(event) => setBindingCode(normalizeLoginPhone(event.target.value).slice(0, 6))} placeholder={t('login.codePlaceholder')} maxLength={6} autoComplete="one-time-code" inputMode="numeric" required /><VerificationCodeButton loading={bindingCodeLoading} retryAfter={bindingRetryAfter} sent={bindingCodeSent} onClick={() => { void requestBindingCodeAction() }} /></div></div>
              <div className="remember-checkbox"><input type="checkbox" id="binding-remember" checked={rememberLogin} onChange={(event) => setRememberLogin(event.target.checked)} /><label htmlFor="binding-remember">{t('login.rememberLogin')}</label></div>
              {feedback ? <p className="login-feedback" role="status" aria-live="polite">{feedback}</p> : null}
              <button className="btn btn-primary submit-btn" type="submit" disabled={bindingLoading}><span>{bindingLoading ? t('login.binding') : t('login.bindAndLogin')}</span></button>
              <div className="terms-checkbox"><input type="checkbox" id="binding-terms" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} /><label htmlFor="binding-terms">{t('login.agreementPrefix')} <a href="/terms" target="_blank" rel="noopener noreferrer">{t('login.userAgreement')}</a> {t('login.agreementAnd')} <a href="/privacy" target="_blank" rel="noopener noreferrer">{t('login.privacyPolicy')}</a>{t('login.accountCreationHint')}</label></div>
              <div className="login-separator"><span>{t('login.separatorOr')}</span></div>
              <button className="btn login-switch-btn" type="button" onClick={() => { setTab('phone'); setWechatView('idle'); setWechatQr(null); setFeedback('') }}>{t('login.backToPhone')}</button>
            </form>
          ) : (
            <>
              <h2 className="login-panel-title" id="login-panel-heading">{t('login.wechatLoginTitle')}</h2>
              <div className="wechat-qr-remote">{wechatQr ? <iframe title={t('login.wechatTab')} src={wechatQr.authorize_url} /> : <span>{wechatView === 'error' ? t('login.qrFailed') : t('login.qrLoading')}</span>}</div>
              <p className={`wechat-status${wechatView === 'error' ? ' is-error' : ' public-sr-only'}`} role="status" aria-live="polite">{feedback || (wechatView === 'pending' ? t('login.wechatScanHint') : t('login.wechatPreparing'))}</p>
              {wechatView === 'error' ? <button className="btn btn-primary submit-btn" type="button" onClick={() => void startWechatLogin()}><span>{t('login.refreshQr')}</span></button> : null}
              <button className="btn login-switch-btn" type="button" onClick={() => { setTab('phone'); setFeedback('') }}>{t('login.backToPhone')}</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

const LOGIN_DIALOG_TRANSITION_MS = 280

export function normalizeLoginReturnPath(value: string | null | undefined): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : DEFAULT_CONSOLE_PATH
}

type LoginDialogProps = {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  dialogId?: string
}

export function LoginDialog({ open, onClose, onSuccess, dialogId = 'login-popover' }: LoginDialogProps) {
  const { t } = useTranslation()
  const [mounted, setMounted] = useState(open)
  const closeTimerRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (open) {
      if (closeTimerRef.current !== undefined) window.clearTimeout(closeTimerRef.current)
      // 中文：打开时立即挂载弹层，避免入场动画前先渲染一帧退出状态。
      setMounted(true)
      return
    }
    if (!mounted) return
    if (closeTimerRef.current !== undefined) window.clearTimeout(closeTimerRef.current)
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = undefined
      setMounted(false)
    }, LOGIN_DIALOG_TRANSITION_MS)
  }, [mounted, open])

  useEffect(() => () => {
    if (closeTimerRef.current !== undefined) window.clearTimeout(closeTimerRef.current)
  }, [])

  useEffect(() => {
    if (!mounted) return undefined
    const previousBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousBodyOverflow
    }
  }, [mounted, onClose])

  function handleSuccess(): void {
    onSuccess()
    onClose()
  }

  if (!mounted) return null
  return createPortal(
    <>
      <button className={`login-drawer-backdrop${open ? '' : ' is-closing'}`} type="button" aria-label={t('login.close')} onClick={onClose} />
      <div className={`login-popover${open ? ' is-open' : ' is-closing'}`} id={dialogId} role="dialog" aria-modal="true" aria-label={t('login.dialogLabel')}>
        <LoginPanel onSuccess={handleSuccess} onAuthFailure={onClose} />
      </div>
    </>,
    document.body,
  )
}

export function LoginPopover({ onSuccess }: { onSuccess: () => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  return (
    <div className="login-trigger-wrap">
      <button className="btn btn-primary" type="button" aria-haspopup="dialog" aria-controls="login-popover" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{t('login.trigger')}</button>
      <LoginDialog open={open} onClose={() => setOpen(false)} onSuccess={onSuccess} />
    </div>
  )
}

type LoginRequiredActionProps = {
  returnPath: string
  children: ReactNode
  className?: string
}

export function LoginRequiredAction({ returnPath, children, className = '' }: LoginRequiredActionProps) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const safeReturnPath = normalizeLoginReturnPath(returnPath)
  const fallbackPath = `/login?return=${encodeURIComponent(safeReturnPath)}`

  return (
    <>
      <Link className={className} to={fallbackPath} aria-haspopup="dialog" aria-controls="login-popover" aria-expanded={open} onClick={(event) => { event.preventDefault(); setOpen(true) }}>{children}</Link>
      <LoginDialog open={open} onClose={() => setOpen(false)} onSuccess={() => navigate(safeReturnPath)} />
    </>
  )
}

export function ThemeToggleButton() {
  const { t } = useTranslation()
  const mode = useThemeMode()
  const resolvedTheme = useResolvedTheme()
  const icon = mode === 'system'
    ? <IconDesktop className="icon-svg tool-icon" />
    : resolvedTheme === 'dark'
      ? <IconMoonStroked className="icon-svg tool-icon" />
      : <IconSunStroked className="icon-svg tool-icon" />
  const label = t(themeModeLabel(mode))

  return <button className="header-tool theme-switcher" type="button" title={`${t('theme.switch')} · ${label}`} aria-label={`${t('theme.switch')} · ${label}`} onClick={cycleThemeMode}>{icon}</button>
}

function LanguageToggleButton({ mobile = false }: { mobile?: boolean }) {
  const { t, i18n: translationI18n } = useTranslation()
  const isEnglish = translationI18n.resolvedLanguage?.startsWith('en') ?? false
  const nextLanguage = isEnglish ? 'zh-CN' : 'en-US'
  const nextLanguageLabel = isEnglish ? '中' : 'EN'

  return (
    <button className={`header-tool language-switcher${isEnglish ? ' is-english' : ''}${mobile ? ' language-switcher--mobile' : ''}`} type="button" title={t('language.label')} aria-label={t('language.toggle')} aria-pressed={isEnglish} onClick={() => { void translationI18n.changeLanguage(nextLanguage) }}>
      <span className="language-current" aria-hidden="true">{nextLanguageLabel}</span>
    </button>
  )
}

type PublicHeaderProps = {
  enterpriseAccess?: EnterpriseMenuAccess
  unreadNotificationCount?: number
}

export function PublicHeader({ enterpriseAccess, unreadNotificationCount = 0 }: PublicHeaderProps = {}) {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const store = useAppStore()
  const dispatch = useAppDispatch()
  const auth = useAppSelector((state) => state.auth)
  const [mobileOpen, setMobileOpen] = useState(false)
  const currentPath = location.pathname
  function go(path: string): void {
    setMobileOpen(false)
    navigate(path)
  }

  function renderPublicLink(link: PublicLink, mobile = false): ReactNode {
    const isActive = !link.disabled && currentPath.startsWith(link.path)
    const isHome = currentPath === '/' || currentPath === '/home'
    const showEmphasis = (link.path === '/models' && isActive) || (link.emphasized && isHome)
    const className = `public-nav-link${isActive ? ' active' : ''}${link.disabled ? ' public-nav-link--disabled' : ''}${showEmphasis ? ' public-nav-link--emphasized' : ''}`
    if (link.disabled) {
      return <span key={`${link.path}-${link.labelKey}`} className={className} aria-disabled="true">{t(link.labelKey)}</span>
    }
    return <Link key={`${link.path}-${link.labelKey}`} className={className} to={link.path} onClick={mobile ? () => setMobileOpen(false) : undefined}>{t(link.labelKey)}</Link>
  }

  return (
    <header className="app-header public-header public-header--home">
      <div className="app-header-inner app-header-full public-header-inner">
        <button className="mobile-menu-button" type="button" aria-controls="public-mobile-nav" aria-expanded={mobileOpen} aria-label={mobileOpen ? t('nav.close') : t('nav.open')} onClick={() => setMobileOpen((open) => !open)}>
          {mobileOpen ? <IconClose className="icon-svg" /> : <IconMenu className="icon-svg" />}
        </button>
        <Link className="header-logo brand-link" to="/" aria-label={`${t('common.home')} Token NX`}><img className="header-brand-image" src={headerLogo} alt="" aria-hidden="true" /></Link>
        <span className="header-trial-badge">
          <img className="header-trial-pill" src={headerTrialPill} alt="" aria-hidden="true" />
          <span className="header-trial-glass" aria-hidden="true" />
          <strong>{t('console.common.trial')}</strong>
          <span className="header-trial-subscription" aria-hidden="true">{t('console.common.subscription')}</span>
          <span className="header-trial-free"><img src={headerTrialFreeTag} alt="" aria-hidden="true" /><em>{t('console.models.free')}</em></span>
        </span>
        <nav className="header-nav public-nav" aria-label={t('console.common.publicNav')}>
          {PUBLIC_LINKS.map((link) => renderPublicLink(link))}
        </nav>
        <div className="header-actions public-header-actions">
          <div className="header-tools">
            <ThemeToggleButton />
            <button className="header-tool header-tool-badge" type="button" title={t('nav.notifications')} aria-label={t('nav.notifications')} onClick={() => requestSupportWidget('notifications')}>
              <img className="header-notification-icon" src={headerNotificationIcon} alt="" aria-hidden="true" />
              {unreadNotificationCount > 0 ? <i className="header-notification-dot" aria-hidden="true" /> : null}
            </button>
            <LanguageToggleButton />
          </div>
          {auth.status === 'authenticated' ? (
            <UserMenu
              store={store}
              userId={auth.user?.id || ''}
              userName={auth.user?.display_name || store.nickname}
              phone={auth.user?.phone_masked || store.phone}
              enterpriseAccess={enterpriseAccess}
              onNavigate={go}
              onLogout={() => { void dispatch(logoutAuth()).finally(() => go('/')) }}
            />
          ) : (
            <LoginPopover onSuccess={() => go(DEFAULT_CONSOLE_PATH)} />
          )}
        </div>
      </div>
      <nav className="public-mobile-nav" id="public-mobile-nav" aria-label={t('console.common.publicNav')} hidden={!mobileOpen}>
        {PUBLIC_LINKS.map((link) => renderPublicLink(link, true))}
        <div className="public-mobile-tools"><ThemeToggleButton /><LanguageToggleButton mobile /></div>
      </nav>
    </header>
  )
}

type ConsoleNavIconName = 'quickstart' | 'models' | 'model-test' | 'video' | 'api-keys' | 'usage' | 'records' | 'billing' | 'real-name' | 'settings' | 'account' | 'members' | 'governance' | 'bell' | 'pie' | 'logout' | 'workspace'

type ConsoleNavItem = {
  key: string
  path?: string
  label: string
  icon: ConsoleNavIconName
  actionOnly?: boolean
  soon?: boolean
  permissionScope?: EnterpriseMenuPermissionKey
}

type ConsoleNavGroup = {
  key: string
  label: string
  items: ConsoleNavItem[]
}

// 中文：侧栏图标统一使用 Semi Icons，图标语义与菜单名称保持一致。
const CONSOLE_NAV_ICONS: Record<ConsoleNavIconName, (props: { className?: string; 'aria-hidden'?: boolean }) => ReactNode> = {
  quickstart: (props) => <IconLightningStroked {...props} />,
  models: (props) => <IconApps {...props} />,
  'model-test': (props) => <IconCommentStroked {...props} />,
  video: (props) => <IconVideo {...props} />,
  'api-keys': (props) => <IconKeyStroked {...props} />,
  usage: (props) => <IconBarChartVStroked {...props} />,
  records: (props) => <IconFile {...props} />,
  billing: (props) => <IconCreditCardStroked {...props} />,
  'real-name': (props) => <IconIdCardStroked {...props} />,
  settings: (props) => <IconSettingStroked {...props} />,
  account: (props) => <IconUserStroked {...props} />,
  members: (props) => <IconUserGroup {...props} />,
  governance: (props) => <IconShieldStroked {...props} />,
  bell: (props) => <IconBellStroked {...props} />,
  pie: (props) => <IconPieChartStroked {...props} />,
  logout: (props) => <IconExit {...props} />,
  workspace: (props) => <IconBriefcaseStroked {...props} />,
}

function ConsoleNavIcon({ name, className = '' }: { name: ConsoleNavIconName; className?: string }) {
  const Icon = CONSOLE_NAV_ICONS[name]
  return <Icon className={`console-nav-icon${className ? ` ${className}` : ''}`} aria-hidden />
}

const personalNavGroups: ConsoleNavGroup[] = [
  {
    key: 'model-use',
    label: '模型使用',
    items: [
      { key: '/console/quickstart', label: '快速接入', icon: 'quickstart' },
      { key: '/console/models', label: '模型广场', icon: 'models' },
    ],
  },
  {
    key: 'experience',
    label: '体验中心',
    items: [
      { key: '/console/playground', label: '智能对话', icon: 'model-test' },
      { key: '/console/video', label: '视频生成', icon: 'video' },
    ],
  },
  {
    key: 'analytics',
    label: '数据分析',
    items: [
      { key: '/console/usage', label: '用量统计', icon: 'usage' },
      { key: '/console/records', label: '调用记录', icon: 'records' },
    ],
  },
  {
    key: 'account',
    label: '账户管理',
    items: [
      { key: '/console/real-name', label: '实名认证', icon: 'real-name' },
      { key: '/console/settings', label: '个人中心', icon: 'account' },
      { key: '/console/billing', label: '费用管理', icon: 'billing' },
      { key: '/console/api-keys', label: 'API 密钥管理', icon: 'api-keys' },
    ],
  },
  {
    key: 'enterprise-center',
    label: '企业中心',
    items: [
      { key: ENTERPRISE_CREATE_PATH, path: NEW_ENTERPRISE_CREATE_PATH, label: '企业入驻', icon: 'workspace' },
    ],
  },
]

const enterpriseNavGroups: ConsoleNavGroup[] = [
  {
    key: 'model-use',
    label: '模型使用',
    items: [
      { key: '/console/quickstart', label: '快速接入', icon: 'quickstart' },
      { key: '/console/models', label: '模型广场', icon: 'models' },
    ],
  },
  {
    key: 'experience',
    label: '体验中心',
    items: [
      { key: '/console/playground', label: '智能对话', icon: 'model-test' },
      { key: '/console/video', label: '视频生成', icon: 'video' },
    ],
  },
  {
    key: 'enterprise-management',
    label: '企业管理',
    items: [
      { key: '/console/members', label: '人员管理', icon: 'members', permissionScope: 'members' },
      { key: '/console/enterprise-usage', label: '用量管理', icon: 'usage', permissionScope: 'usage' },
      { key: '/console/enterprise-audit-log', label: '操作日志', icon: 'records', permissionScope: 'audit' },
      { key: '/console/enterprise-analytics', label: '数据分析', icon: 'pie', permissionScope: 'analytics' },
      { key: '/console/billing', label: '费用管理', icon: 'billing', permissionScope: 'billing' },
    ],
  },
  {
    key: 'my-data',
    label: '我的数据',
    items: [
      { key: '/console/usage', label: '用量统计', icon: 'usage' },
      { key: '/console/records', label: '调用记录', icon: 'records' },
    ],
  },
  {
    key: 'enterprise-settings',
    label: '企业设置',
    items: [
      { key: '/console/enterprise-settings', label: '通用设置', icon: 'settings', permissionScope: 'settings' },
      { key: '/console/enterprise-models', label: '模型管理', icon: 'models', permissionScope: 'models' },
      { key: '/console/enterprise-governance', label: '权限与标签', icon: 'governance', permissionScope: 'governance' },
    ],
  },
  {
    key: 'account',
    label: '账户管理',
    items: [
      { key: '/console/settings', label: '账号信息', icon: 'account' },
      { key: '/console/api-keys', label: 'API 密钥管理', icon: 'api-keys' },
    ],
  },
]

const CONSOLE_NAV_LABEL_KEYS: Record<string, string> = {
  '模型使用': 'console.nav.modelUse', '快速接入': 'console.nav.quickstart', '模型广场': 'console.nav.models', '体验中心': 'console.nav.experience',
  '智能对话': 'console.nav.playground', '视频生成': 'console.nav.video', '数据分析': 'console.nav.analytics', '用量统计': 'console.nav.usage', '调用记录': 'console.nav.records',
  '账户管理': 'console.nav.account', '实名认证': 'console.nav.realName', '个人中心': 'console.nav.profile', '费用管理': 'console.nav.billing',
  'API 密钥管理': 'console.nav.apiKeys', '企业中心': 'console.nav.enterpriseCenter', '企业入驻': 'console.nav.enterpriseCreate', '企业管理': 'console.nav.enterpriseManagement',
  '人员管理': 'console.nav.members', '用量管理': 'console.nav.enterpriseUsage', '操作日志': 'console.nav.audit', '我的数据': 'console.nav.myData',
  '企业设置': 'console.nav.enterpriseSettings', '通用设置': 'console.nav.settings', '模型管理': 'console.nav.enterpriseModels', '权限与标签': 'console.nav.governance', '账号信息': 'console.nav.accountInfo',
}

function localizeConsoleNavLabel(t: TFunction, value: string): string {
  const key = CONSOLE_NAV_LABEL_KEYS[value]
  return key ? t(key) : value
}

// 中文：企业所有者入口同时驱动侧栏和用户菜单，避免两个导航面板出现权限差异。
export function consoleNavGroupsFor(workspace: Pick<Workspace, 'type' | 'role'>, permissions: readonly string[] = []): ConsoleNavGroup[] {
  const source = workspace.type === 'enterprise' ? enterpriseNavGroups : personalNavGroups
  const owner = isEnterpriseOwner(workspace)
  return source.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.permissionScope || owner || hasEnterpriseMenuPermission(permissions, item.permissionScope)),
  })).filter((group) => group.items.length > 0)
}

function userMenuGroupsFor(workspace: Workspace, permissions: readonly string[] = []): ConsoleNavGroup[] {
  return consoleNavGroupsFor(workspace, permissions)
}

type UserMenuProps = {
  store: AppStoreValue
  userId: string
  userName: string
  phone: string
  enterpriseAccess?: EnterpriseMenuAccess
  onNavigate: (path: string) => void
  onLogout: () => void
}

function workspaceRoleFromMembership(membership: EnterpriseMembership): WorkspaceRole {
  if (membership.owner) return 'owner'
  return membership.roles.map((role) => role.trim()).find(Boolean) || 'member'
}

export function workspacesFromMemberships(memberships: EnterpriseMembership[]): Workspace[] {
  const seenEnterpriseIds = new Set<string>()
  return memberships.reduce<Workspace[]>((workspaces, membership) => {
    const id = membership.enterprise_id.trim()
    const name = membership.enterprise_name.trim()
    if (!id || !name || seenEnterpriseIds.has(id)) return workspaces
    seenEnterpriseIds.add(id)
    workspaces.push({ id, name, type: 'enterprise', role: workspaceRoleFromMembership(membership) })
    return workspaces
  }, [])
}

const WORKSPACE_MENU_VIEWPORT_GAP_PX = 12
const WORKSPACE_MENU_GAP_PX = 12

// 中文：登录后的用户菜单与参考站保持同一层级，空间切换和控制台入口共用当前工作空间状态。
function UserMenu({ store, userId, userName, phone, enterpriseAccess, onNavigate, onLogout }: UserMenuProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const shellRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const workspaceTriggerRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const workspaceMenuRef = useRef<HTMLDivElement>(null)
  const [workspaceMenuPosition, setWorkspaceMenuPosition] = useState<{ top: number; left: number } | null>(null)
  const displayName = limitDisplayNameLength(userName.trim()) || limitDisplayNameLength(store.nickname) || t('console.common.demoUser')
  const phoneLabel = phone.trim() || t('console.common.phoneUnavailable')
  const initial = (displayName || store.avatar || '用').slice(0, 1).toUpperCase()
  const activeWorkspace = store.activeWorkspace
  const groups = userMenuGroupsFor(activeWorkspace, enterpriseAccess?.permissions)

  useEffect(() => {
    let mounted = true
    // 中文：先保留本地快照，服务端成功返回后再同步企业列表，避免刷新时丢失当前空间。
    const accessToken = getAccessToken()
    if (!accessToken || !userId) {
      return () => { mounted = false }
    }
    void getProfileEnterprises(accessToken).then((memberships) => {
      if (mounted) store.replaceEnterpriseWorkspaces(workspacesFromMemberships(memberships))
    }).catch(() => {
      // 中文：同步失败时保留已有空间和激活状态，避免网络波动导致页面回到个人空间。
    })
    return () => { mounted = false }
  }, [store.replaceEnterpriseWorkspaces, userId])

  function updateWorkspaceMenuPosition(): void {
    const anchor = dropdownRef.current?.getBoundingClientRect() ?? workspaceTriggerRef.current?.getBoundingClientRect()
    const menu = workspaceMenuRef.current
    if (!anchor || !menu) return
    const menuWidth = menu.offsetWidth
    const menuHeight = menu.offsetHeight
    const left = Math.min(
      Math.max(WORKSPACE_MENU_VIEWPORT_GAP_PX, anchor.left - menuWidth - WORKSPACE_MENU_GAP_PX),
      Math.max(WORKSPACE_MENU_VIEWPORT_GAP_PX, window.innerWidth - menuWidth - WORKSPACE_MENU_VIEWPORT_GAP_PX),
    )
    const top = Math.min(
      Math.max(WORKSPACE_MENU_VIEWPORT_GAP_PX, anchor.top),
      Math.max(WORKSPACE_MENU_VIEWPORT_GAP_PX, window.innerHeight - menuHeight - WORKSPACE_MENU_VIEWPORT_GAP_PX),
    )
    setWorkspaceMenuPosition({ top, left })
  }

  useEffect(() => {
    if (!workspaceOpen) {
      setWorkspaceMenuPosition(null)
      return undefined
    }
    updateWorkspaceMenuPosition()
    const handleViewportChange = () => updateWorkspaceMenuPosition()
    window.addEventListener('resize', handleViewportChange)
    document.addEventListener('scroll', handleViewportChange, true)
    return () => {
      window.removeEventListener('resize', handleViewportChange)
      document.removeEventListener('scroll', handleViewportChange, true)
    }
  }, [workspaceOpen])

  function closeMenu(restoreFocus = false): void {
    setOpen(false)
    setWorkspaceOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }

  useEffect(() => {
    if (!open) return undefined
    function handlePointerDown(event: PointerEvent): void {
      if (event.target instanceof Node && !shellRef.current?.contains(event.target) && !workspaceMenuRef.current?.contains(event.target)) closeMenu()
    }
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Escape') return
      event.preventDefault()
      if (workspaceOpen) {
        setWorkspaceOpen(false)
        workspaceTriggerRef.current?.focus()
        return
      }
      closeMenu(true)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, workspaceOpen])

  function navigateFromMenu(path: string): void {
    closeMenu()
    onNavigate(path)
  }

  function switchWorkspace(workspace: Workspace): void {
    const workspaceName = workspace.type === 'personal' ? displayName : workspace.name
    if (workspace.id === activeWorkspace.id) {
      Toast.info(t('console.common.alreadyHere', { name: workspaceName }))
    } else {
      store.switchWorkspace(workspace.id)
    }
    setWorkspaceOpen(false)
  }

  function renderWorkspaceMenu(): ReactNode {
    if (!workspaceOpen) return null
    return createPortal(
      <div
        ref={workspaceMenuRef}
        className="workspace-menu workspace-menu--portal"
        id="workspace-menu"
        role="menu"
        aria-label={t('console.common.switchWorkspace')}
        style={workspaceMenuPosition ? { top: workspaceMenuPosition.top, left: workspaceMenuPosition.left } : { visibility: 'hidden' }}
      >
        <div className="workspace-menu-heading">{t('console.common.switchWorkspace')}</div>
        {store.workspaces.map((workspace) => {
          const workspaceName = workspace.type === 'personal' ? displayName : workspace.name
          const workspaceInitial = workspaceName.slice(0, 1).toUpperCase()
          const active = workspace.id === activeWorkspace.id
          return <button className={`workspace-menu-item${active ? ' active' : ''}`} type="button" role="menuitem" key={workspace.id} aria-current={active ? 'true' : undefined} aria-pressed={active} title={workspaceName} onClick={() => switchWorkspace(workspace)}>
            <span className={`workspace-avatar${workspace.type === 'personal' ? '' : ' workspace-avatar-muted'}`}>{workspaceInitial}</span>
            <span className="workspace-info"><span className="workspace-name">{workspaceName}</span><span className="workspace-type">{workspaceTypeLabel(workspace, t)}</span></span>
            {active ? <span className="workspace-current-label">{t('console.common.current')}</span> : null}
          </button>
        })}
        <button className="workspace-menu-item workspace-menu-create" type="button" role="menuitem" onClick={() => navigateFromMenu(NEW_ENTERPRISE_CREATE_PATH)}>
          <span className="workspace-avatar workspace-avatar-muted">+</span>
          <span className="workspace-info"><span className="workspace-name">{t('console.common.createWorkspace')}</span><span className="workspace-type">{t('console.common.startEnterpriseVerification')}</span></span>
        </button>
      </div>,
      document.body,
    )
  }

  function renderMenuItem(item: ConsoleNavItem): ReactNode {
    const icon = <ConsoleNavIcon name={item.icon} className="dropdown-icon" />
    if (!item.actionOnly) {
      return <Link className="dropdown-link" role="menuitem" key={item.key} to={item.path ?? item.key} onClick={() => closeMenu()}>{icon}<span>{localizeConsoleNavLabel(t, item.label)}</span></Link>
    }
    return <button className="dropdown-link dropdown-link-soon" role="menuitem" key={item.key} type="button" onClick={() => { closeMenu(); Toast.info(item.soon ? t('console.common.comingSoon', { name: localizeConsoleNavLabel(t, item.label) }) : t('console.common.actionReceived')) }}>{icon}<span>{localizeConsoleNavLabel(t, item.label)}</span>{item.soon ? <span className="nav-soon-badge">{t('console.common.comingSoonShort')}</span> : null}</button>
  }

  return (
    <div className="user-menu-shell" ref={shellRef}>
      <button ref={triggerRef} className="user-menu-trigger" type="button" aria-haspopup="menu" aria-controls="user-dropdown" aria-expanded={open} aria-label={open ? t('console.common.closeUserMenu') : t('console.common.openUserMenu')} onClick={() => { if (open) closeMenu(); else setOpen(true) }}>
        <span className="user-avatar">{initial}</span>
        <span className="user-name">{displayName}</span>
        <IconChevronDown className="icon-svg user-menu-chevron" />
      </button>
      <div ref={dropdownRef} className={`user-dropdown${open ? ' open' : ''}`} id="user-dropdown" role="menu" aria-label={t('console.common.userMenu')} aria-hidden={!open}>
        <div className="user-dropdown-header">
          <div className="dropdown-user-name">{displayName}</div>
          <div className="dropdown-user-email">{phoneLabel}</div>
          <div className="dropdown-workspace">{t('console.common.currentWorkspace')} · {activeWorkspace.type === 'personal' ? displayName : activeWorkspace.name}</div>
        </div>
        <div className="user-dropdown-section">
          <button ref={workspaceTriggerRef} className="dropdown-link dropdown-link-switch" type="button" role="menuitem" aria-label={t('console.common.switchWorkspace')} aria-controls="workspace-menu" aria-expanded={workspaceOpen} onClick={() => setWorkspaceOpen((value) => !value)}>
            <ConsoleNavIcon name="workspace" className="dropdown-icon" />
            <span>{t('console.common.switchWorkspace')}</span>
            <IconChevronDown className="icon-svg dropdown-link-chevron" />
          </button>
        </div>
        {groups.map((group) => <div className="user-dropdown-section" key={group.key}>{group.items.map(renderMenuItem)}</div>)}
        <div className="user-dropdown-section">
          <button className="dropdown-link" role="menuitem" type="button" onClick={() => { closeMenu(); onLogout() }}>
            <ConsoleNavIcon name="logout" className="dropdown-icon" />
            <span>{t('nav.logout')}</span>
          </button>
        </div>
      </div>
      {renderWorkspaceMenu()}
    </div>
  )
}

function workspaceTypeLabel(workspace: Workspace, t: TFunction): string {
  return workspace.type === 'enterprise'
    ? `${t('console.common.enterpriseWorkspace')} · ${workspace.role}`
    : t('console.common.personalWorkspace')
}

export function activeNavKey(pathname: string): string {
  // 旧企业日志路径继续参与高亮匹配，但不作为新的侧栏入口展示。
  const legacyItems: ConsoleNavItem[] = [{ key: '/console/enterprise-records', label: '操作日志', icon: 'records' }]
  const items = [...personalNavGroups, ...enterpriseNavGroups]
    .flatMap((group) => group.items)
    .concat(legacyItems)
    .filter((item) => !item.actionOnly)
    .sort((left, right) => right.key.length - left.key.length)
  return items.find((item) => pathname === item.key || pathname.startsWith(`${item.key}/`))?.key ?? ''
}

export function isEnterprisePermissionPath(pathname: string): boolean {
  return enterpriseMenuPermissionKeyForPath(pathname) !== null
}

export function ConsoleLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const location = useLocation()
  const store = useAppStore()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const activeWorkspace = store.activeWorkspace
  const enterpriseAccess = useEnterpriseMenuAccess(activeWorkspace)
  const groups = consoleNavGroupsFor(activeWorkspace, enterpriseAccess.permissions)
  const navKey = activeNavKey(location.pathname)
  const permissionScope = enterpriseMenuPermissionKeyForPath(location.pathname)
  const hasRoutePermission = permissionScope === null
    || isEnterpriseOwner(activeWorkspace)
    || hasEnterpriseMenuPermission(enterpriseAccess.permissions, permissionScope)

  // 中文：受控企业页面先等待权限上下文，再决定渲染页面或回到基础工作页。
  if (activeWorkspace.type === 'enterprise' && permissionScope !== null && enterpriseAccess.loading) {
    return <AppLoadingScreen label={t('console.enterprise.contextLoading')} />
  }
  if (activeWorkspace.type === 'enterprise' && permissionScope !== null && !hasRoutePermission) {
    return <Navigate replace to={DEFAULT_CONSOLE_PATH} />
  }

  return (
    <div className={`console-frame${sidebarOpen ? ' console-frame--sidebar-open' : ''}${location.pathname === '/console/quickstart' ? ' console-frame--quickstart' : ''}`}>
      <PublicHeader enterpriseAccess={enterpriseAccess} />
      <Layout className="console-layout">
        <Layout.Sider className="console-sider">
          <aside className="console-sidebar" aria-label={t('console.common.consoleNav')}>
            <div className="workspace-switcher-wrap">
              <div className="workspace-switcher" role="status" aria-label={t('console.common.currentWorkspace')} title={activeWorkspace.name}>
                <Avatar size="small" color="grey">{activeWorkspace.name.slice(0, 1).toUpperCase()}</Avatar>
                <span className="workspace-switcher-copy"><strong title={activeWorkspace.name}>{activeWorkspace.name}</strong></span>
              </div>
            </div>
            <nav className="console-nav-custom" aria-label={t('console.common.consoleNav')}>
              {groups.map((group) => (
                <section className="console-nav-section" key={group.key}>
                  <h2 className="console-nav-section-title">{localizeConsoleNavLabel(t, group.label)}</h2>
                  <div className="console-nav-section-items">
                    {group.items.map((item) => item.actionOnly ? (
                      <button className="console-nav-link console-nav-link--action" key={item.key} type="button" onClick={() => { setSidebarOpen(false); Toast.info(item.soon ? t('console.common.comingSoon', { name: localizeConsoleNavLabel(t, item.label) }) : t('console.common.actionReceived')) }}>
                        <ConsoleNavIcon name={item.icon} />
                        <span className="console-nav-link-label">{localizeConsoleNavLabel(t, item.label)}</span>
                        {item.soon ? <span className="nav-soon-badge">{t('console.common.comingSoonShort')}</span> : null}
                      </button>
                    ) : (
                      <Link className={`console-nav-link${item.key === navKey ? ' console-nav-link--active' : ''}`} key={item.key} to={item.path ?? item.key} aria-current={item.key === navKey ? 'page' : undefined} onClick={() => setSidebarOpen(false)}>
                        <ConsoleNavIcon name={item.icon} />
                        <span className="console-nav-link-label">{localizeConsoleNavLabel(t, item.label)}</span>
                      </Link>
                    ))}
                  </div>
                </section>
              ))}
            </nav>
          </aside>
        </Layout.Sider>
        <Layout className="console-main-layout">
          <Layout.Content className="console-content">
            <div className="console-mobile-toolbar">
              <Button theme="borderless" icon={<IconMenu />} aria-label={t('console.common.openConsoleNav')} onClick={() => setSidebarOpen(true)} />
              <span>{localizeConsoleNavLabel(t, groups.flatMap((group) => group.items).find((item) => item.key === navKey)?.label ?? t('nav.console'))}</span>
            </div>
            <main className="console-page">{children}</main>
          </Layout.Content>
        </Layout>
      </Layout>
      {sidebarOpen ? <button className="console-sidebar-backdrop" type="button" aria-label={t('console.common.closeConsoleNav')} onClick={() => setSidebarOpen(false)} /> : null}
      <ManuscriptSupportWidget />
    </div>
  )
}

type FooterLink = { label: string; path: string }

const DEFAULT_FOOTER_LINKS: FooterLink[] = [
  { label: 'footer.status', path: '/status' },
  { label: 'footer.terms', path: '/terms' },
  { label: 'footer.privacy', path: '/privacy' },
]

const PUBLIC_COMPANY_INFO = {
  name: '安顺佳云灵犀智能科技有限公司',
  phone: '1892000000',
  email: 'tokennx@120.com',
  address: '贵州省安顺市平坝区',
  filing: '京ICP备20011824号-24',
  securityFiling: '北京公安备 11010802041394号',
} as const

const PUBLIC_FOOTER_GROUPS = [
  { title: '产品', links: [{ label: '模型目录', path: '/models' }, { label: '模型价格', path: '/pricing' }, { label: '接入文档', path: '/docs' }] },
  { title: '服务', links: [{ label: '服务状态', path: '/status' }, { label: '关于我们', path: '/about' }] },
  { title: '法律', links: [{ label: '服务条款', path: '/terms' }, { label: '隐私政策', path: '/privacy' }] },
] as const

const MANUSCRIPT_FOOTER_GROUPS = [
  { titleKey: 'footer.product', links: [{ labelKey: 'footer.chat', path: '/docs' }, { labelKey: 'footer.video', path: '/docs' }, { labelKey: 'footer.ranking', path: '/models' }, { labelKey: 'footer.modelPrice', path: '/pricing' }] },
  { titleKey: 'footer.docs', links: [{ labelKey: 'footer.chat', path: '/docs' }, { labelKey: 'footer.video', path: '/docs' }, { labelKey: 'footer.ranking', path: '/models' }, { labelKey: 'footer.modelPrice', path: '/pricing' }] },
  { titleKey: 'footer.pricing', links: [{ labelKey: 'footer.apiPrice', path: '/pricing' }, { labelKey: 'footer.subscriptionPrice', path: '/pricing' }, { labelKey: 'footer.specialOffers', path: '/pricing' }] },
  { titleKey: 'footer.about', links: [{ labelKey: 'footer.companyIntro', path: '/about' }, { labelKey: 'footer.officialQr', path: '/docs' }] },
] as const

const PUBLIC_WECHAT_QR_TARGET = 'https://example.com/token-nx-official-account'
const PUBLIC_WECHAT_QR_IMAGE = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=8&data=${encodeURIComponent(PUBLIC_WECHAT_QR_TARGET)}`

const MANUSCRIPT_SUPPORT_TRANSITION_MS = 300
const MANUSCRIPT_SUPPORT_MESSAGE_MAX_LENGTH = 1000
type SupportTab = 'contact' | 'notifications'
const SUPPORT_OPEN_EVENT = 'token-nx:open-support'

// 中文：统一由页面头部和客服按钮发送打开请求，保证客服浮层只维护一份交互状态。
export function requestSupportWidget(tab: SupportTab = 'contact'): void {
  window.dispatchEvent(new CustomEvent(SUPPORT_OPEN_EVENT, { detail: { tab } }))
}

const FOOTER_LABEL_KEYS: Record<string, string> = {
  '模型目录': 'footer.models',
  '模型价格': 'footer.pricing',
  '接入文档': 'footer.docs',
  '服务状态': 'footer.status',
  '关于我们': 'footer.about',
  '服务条款': 'footer.terms',
  '隐私政策': 'footer.privacy',
  文档: 'footer.docs',
}

export function PublicFooter({ label = 'Token NX', links = DEFAULT_FOOTER_LINKS, manuscript = false }: { label?: string; links?: FooterLink[]; manuscript?: boolean }) {
  const { t } = useTranslation()

  function localizeFooterLabel(value: string): string {
    const key = FOOTER_LABEL_KEYS[value]
    if (key) return t(key)
    return value.startsWith('footer.') || value.startsWith('public.') ? t(value) : value
  }

  return (
    <footer className={`public-footer${manuscript ? ' public-footer--manuscript' : ''}`}>
      <div className="public-footer-inner">
        {manuscript ? <div className="public-footer-brand manuscript-footer-brand"><span className="manuscript-footer-logo"><img src={manuscriptFooterLogo} alt="Token NX" /></span><span>© {new Date().getFullYear()} Token NX,Inc</span><small>{PUBLIC_COMPANY_INFO.name}</small></div> : <div className="public-footer-brand"><span className="footer-brand-lockup"><BrandLogo size="compact" /></span><span>{localizeFooterLabel(label)}</span><small>{PUBLIC_COMPANY_INFO.name}</small></div>}
        {manuscript ? <nav className="public-footer-nav manuscript-footer-nav" aria-label={t('public.footer.navigation')}>{MANUSCRIPT_FOOTER_GROUPS.map((group) => <div className="public-footer-nav-group" key={group.titleKey}><strong>{t(group.titleKey)}</strong>{group.links.map((link) => <Link key={`${link.path}-${link.labelKey}`} to={link.path}>{t(link.labelKey)}</Link>)}</div>)}</nav> : <nav className="public-footer-nav" aria-label={t('public.footer.navigation')}>
          {PUBLIC_FOOTER_GROUPS.map((group) => <div className="public-footer-nav-group" key={group.title}><strong>{group.title === '产品' ? t('footer.product') : group.title === '服务' ? t('footer.service') : t('footer.legal')}</strong>{group.links.map((link) => <Link key={`${link.path}-${link.label}`} to={link.path}>{localizeFooterLabel(link.label)}</Link>)}</div>)}
          {links.length ? <div className="public-footer-nav-group public-footer-nav-group--extra"><strong>{t('footer.related')}</strong>{links.map((link) => <Link key={`${link.path}-${link.label}`} to={link.path}>{localizeFooterLabel(link.label)}</Link>)}</div> : null}
        </nav>}
        {manuscript ? <div className="public-footer-contact manuscript-footer-contact"><strong>{t('footer.contact')}</strong><a href={`tel:${PUBLIC_COMPANY_INFO.phone}`}>售前咨询：{PUBLIC_COMPANY_INFO.phone}</a><a href={`mailto:${PUBLIC_COMPANY_INFO.email}`}>商务合作：{PUBLIC_COMPANY_INFO.email}</a><div className="manuscript-footer-qr-row"><div className="public-footer-qr"><img src={manuscriptCustomerQr} alt={t('footer.qrAlt')} loading="eager" /><span>{t('footer.customerQr')}</span></div><div className="public-footer-qr"><img src={manuscriptOfficialQr} alt={t('footer.officialQr')} loading="eager" /><span>{t('footer.officialQr')}</span></div></div></div> : <div className="public-footer-contact"><div className="public-footer-qr"><img src={PUBLIC_WECHAT_QR_IMAGE} alt={t('footer.qrAlt')} loading="eager" /><span>{t('footer.qrTitle').split('\n').map((line) => <span key={line}>{line}<br /></span>)}</span></div><div className="public-footer-contact-copy"><strong>{t('footer.contact')}</strong><a href={`tel:${PUBLIC_COMPANY_INFO.phone}`}>{PUBLIC_COMPANY_INFO.phone}</a><span>{PUBLIC_COMPANY_INFO.address}</span></div></div>}
      </div>
      <div className="public-footer-bottom manuscript-footer-filing" aria-label={t('footer.filing')}><span className="manuscript-footer-filing-copy">Copyright @ 2025-{new Date().getFullYear()} {PUBLIC_COMPANY_INFO.name}</span><span className="manuscript-footer-filing-item"><img src={manuscriptFilingIcpIcon} alt="" aria-hidden="true" />{PUBLIC_COMPANY_INFO.filing}</span><span className="manuscript-footer-filing-item"><img src={manuscriptFilingSecurityIcon} alt="" aria-hidden="true" />{PUBLIC_COMPANY_INFO.securityFiling}</span><Link className="manuscript-footer-filing-item" to="/about">营业执照</Link><Link className="manuscript-footer-filing-item" to="/terms">许可证</Link></div>
      <ManuscriptSupportWidget />
    </footer>
  )
}

export function ManuscriptSupportWidget() {
  const { t, i18n: translationI18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [tab, setTab] = useState<SupportTab>('contact')
  const [draft, setDraft] = useState('')
  const [replying, setReplying] = useState(false)
  const [messages, setMessages] = useState<SupportChatMessage[]>(() => [{ id: 'support-welcome', role: 'support', text: t('support.welcome') }])
  const rootRef = useRef<HTMLDivElement | null>(null)
  const closeTimerRef = useRef<number | undefined>(undefined)
  const replyTimerRef = useRef<number | undefined>(undefined)
  const messageSequenceRef = useRef(0)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const supportLocale: SupportLocale = translationI18n.language.startsWith('en') ? 'en-US' : 'zh-CN'

  useEffect(() => {
    const handleOpenRequest = (event: Event) => {
      const detail = (event as CustomEvent<{ tab?: SupportTab }>).detail
      if (detail?.tab === 'contact' || detail?.tab === 'notifications') setTab(detail.tab)
      if (closeTimerRef.current !== undefined) window.clearTimeout(closeTimerRef.current)
      setOpen(true)
      setMounted(true)
    }
    window.addEventListener(SUPPORT_OPEN_EVENT, handleOpenRequest)
    return () => window.removeEventListener(SUPPORT_OPEN_EVENT, handleOpenRequest)
  }, [])

  useEffect(() => {
    if (!mounted) return undefined
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) closePanel()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePanel()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [mounted])

  useEffect(() => () => {
    if (closeTimerRef.current !== undefined) window.clearTimeout(closeTimerRef.current)
    if (replyTimerRef.current !== undefined) window.clearTimeout(replyTimerRef.current)
  }, [])

  useEffect(() => {
    if (!mounted || tab !== 'contact') return
    const messagesEnd = messagesEndRef.current
    if (!messagesEnd || typeof messagesEnd.scrollIntoView !== 'function') return
    // 中文：尊重用户的减弱动效偏好，客服消息定位不强制平滑滚动。
    const prefersReducedMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    messagesEnd.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'nearest' })
  }, [messages, mounted, replying, tab])

  function openPanel(): void {
    if (closeTimerRef.current !== undefined) window.clearTimeout(closeTimerRef.current)
    setTab('contact')
    setOpen(true)
    setMounted(true)
  }

  function closePanel(): void {
    setOpen(false)
    if (closeTimerRef.current !== undefined) window.clearTimeout(closeTimerRef.current)
    closeTimerRef.current = window.setTimeout(() => setMounted(false), MANUSCRIPT_SUPPORT_TRANSITION_MS)
  }

  function togglePanel(): void {
    if (open || mounted) closePanel()
    else openPanel()
  }

  function nextMessageId(role: SupportMessageRole): string {
    messageSequenceRef.current += 1
    return `support-${role}-${messageSequenceRef.current}`
  }

  function sendMessage(): void {
    const text = draft.trim()
    if (!text || replying) return

    setMessages((current) => [...current, { id: nextMessageId('user'), role: 'user', text }])
    setDraft('')
    setReplying(true)
    if (replyTimerRef.current !== undefined) window.clearTimeout(replyTimerRef.current)
    // 中文：先展示客服输入状态，再追加 mock 回复，模拟真实客服响应节奏。
    replyTimerRef.current = window.setTimeout(() => {
      setMessages((current) => [...current, { id: nextMessageId('support'), role: 'support', text: getMockSupportReply(text, supportLocale) }])
      setReplying(false)
      replyTimerRef.current = undefined
    }, MOCK_SUPPORT_REPLY_DELAY_MS)
  }

  function handleComposerSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    sendMessage()
  }

  function handleComposerKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key !== 'Enter' || event.shiftKey) return
    event.preventDefault()
    sendMessage()
  }

  return (
    <div ref={rootRef} className={`manuscript-support-widget${hovered ? ' is-hovered' : ''}`} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      {mounted ? <section className={`manuscript-support-panel${open ? ' is-open' : ' is-closing'}`} role="dialog" aria-modal="false" aria-label={t('support.dialogLabel')}>
        <div className="manuscript-support-tabs" role="tablist" aria-label={t('support.panel')}>
          <span className={`manuscript-support-tab-thumb${tab === 'notifications' ? ' is-right' : ''}`} aria-hidden="true" />
          <button className={`manuscript-support-tab${tab === 'contact' ? ' is-active' : ''}`} type="button" role="tab" aria-selected={tab === 'contact'} onClick={() => setTab('contact')}><IconCommentStroked />{t('support.contactTab')}</button>
          <button className={`manuscript-support-tab${tab === 'notifications' ? ' is-active' : ''}`} type="button" role="tab" aria-selected={tab === 'notifications'} onClick={() => setTab('notifications')}><IconBellStroked />{t('support.notificationsTab')}</button>
        </div>
        {tab === 'contact' ? <div className="manuscript-support-chat" role="tabpanel" aria-label={t('support.contactTab')}>
          <header className="manuscript-support-chat-header">
            <span className="manuscript-support-agent-avatar" aria-hidden="true"><IconCustomerSupport /></span>
            <span className="manuscript-support-agent-meta"><strong>{t('support.agentName')}</strong><span><i aria-hidden="true" />{t('support.onlineStatus')}</span></span>
            <button className="manuscript-support-close" type="button" aria-label={t('support.closePanel')} title={t('support.closePanel')} onClick={closePanel}><IconClose /></button>
          </header>
          <div className="manuscript-support-messages" role="log" aria-live="polite" aria-label={t('support.messageHistory')}>
            <p className="manuscript-support-chat-hint"><IconCommentStroked aria-hidden="true" />{t('support.welcomeHint')}</p>
            {messages.map((message) => <div className={`manuscript-support-message${message.role === 'user' ? ' is-user' : ' is-support'}`} key={message.id}>
              {message.role === 'support' ? <span className="manuscript-support-message-avatar" aria-hidden="true"><IconCustomerSupport /></span> : null}
              <p className="manuscript-support-message-bubble">{message.text}</p>
            </div>)}
            {replying ? <div className="manuscript-support-message is-support" role="status" aria-label={t('support.typing')}>
              <span className="manuscript-support-message-avatar" aria-hidden="true"><IconCustomerSupport /></span>
              <span className="manuscript-support-typing" aria-hidden="true"><i /><i /><i /></span>
            </div> : null}
            <div ref={messagesEndRef} />
          </div>
          <form className="manuscript-support-composer" onSubmit={handleComposerSubmit}>
            <label className="public-sr-only" htmlFor="manuscript-support-input">{t('support.inputLabel')}</label>
            <textarea id="manuscript-support-input" value={draft} maxLength={MANUSCRIPT_SUPPORT_MESSAGE_MAX_LENGTH} rows={2} placeholder={t('support.inputPlaceholder')} aria-label={t('support.inputLabel')} onChange={(event) => setDraft(event.target.value)} onKeyDown={handleComposerKeyDown} />
            <button className="manuscript-support-send" type="submit" aria-label={t('support.send')} title={t('support.send')} disabled={!draft.trim() || replying}><IconSend /></button>
          </form>
        </div> : <div className="manuscript-support-notifications" role="tabpanel" aria-label={t('support.notificationsTab')}><IconBellStroked /><strong>{t('support.noNotifications')}</strong><span>{t('support.noNotificationsHint')}</span></div>}
      </section> : null}
      <div className="manuscript-support-trigger">
        <button className="manuscript-support-icon-button" type="button" aria-label={open ? t('support.close') : t('support.open')} title={open ? t('support.close') : t('support.open')} aria-expanded={open} onClick={togglePanel}><IconCustomerSupport /></button>
        <button className="manuscript-support-label-button" type="button" aria-label={t('support.trigger')} aria-hidden={!hovered} tabIndex={hovered ? 0 : -1} onClick={togglePanel}><IconCustomerSupport /><span>{t('support.trigger')}</span></button>
      </div>
    </div>
  )
}

export function PublicLayout({ children, mainClassName = '', footerLabel, footerLinks }: { children: ReactNode; mainClassName?: string; footerLabel?: string; footerLinks?: FooterLink[] }) {
  const layoutClassName = mainClassName.includes('home-page--manuscript') ? ' public-layout--manuscript-home' : ''
  const manuscript = mainClassName.includes('home-page--manuscript')
  return <div className={`public-layout${layoutClassName}`}><PublicHeader /><main className={`public-main${mainClassName ? ` ${mainClassName}` : ''}`}>{children}</main><PublicFooter label={footerLabel} links={footerLinks} manuscript={manuscript} /></div>
}

export function BannerNotice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warning' | 'success' }) {
  return <div className={`banner-notice banner-notice--${tone}`}><span className="banner-notice-dot" />{children}</div>
}

export function EmptyPanel({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="empty-panel"><IconFile size="extra-large" /><h3>{title}</h3><p>{description}</p>{action}</div>
}

export function WorkspaceBadge({ workspace }: { workspace: Workspace }) {
  return <span className="workspace-badge"><Avatar size="extra-small" color={workspace.type === 'enterprise' ? 'blue' : 'green'}>{workspace.name.slice(0, 1)}</Avatar>{workspace.name}</span>
}

export function SearchField({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  const { t } = useTranslation()
  const resolvedPlaceholder = placeholder ?? t('console.common.searchModelPlaceholder')
  return <div className="search-field"><IconSearch /><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={resolvedPlaceholder} aria-label={resolvedPlaceholder} /></div>
}

export function RefreshButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation()
  return <Button theme="borderless" icon={<IconRefresh />} aria-label={t('console.common.refreshData')} onClick={onClick} />
}

export function StatusBadge({ status }: { status: 'success' | 'failed' | 'active' | 'disabled' | 'pending' }) {
  const { t } = useTranslation()
  const labels = { success: t('console.common.success'), failed: t('console.common.failed'), active: t('console.common.enable'), disabled: t('console.common.disabled'), pending: t('console.common.pending') }
  return <Badge className={`status-badge status-badge--${status}`} count={labels[status]} overflowCount={999} />
}

export function modalityLabel(model: ModelRecord): string {
  return MODALITY_LABELS[model.modality]
}
