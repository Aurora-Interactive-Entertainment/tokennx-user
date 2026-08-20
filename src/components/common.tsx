import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { TFunction } from 'i18next'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import Avatar from '@douyinfe/semi-ui/lib/es/avatar'
import Badge from '@douyinfe/semi-ui/lib/es/badge'
import Button from '@douyinfe/semi-ui/lib/es/button'
import { Layout } from '@douyinfe/semi-ui/lib/es/layout'
import Toast from '@douyinfe/semi-ui/lib/es/toast'
import {
  IconApps,
  IconAlertTriangle,
  IconBarChartVStroked,
  IconBellStroked,
  IconBriefcaseStroked,
  IconChevronDown,
  IconChevronRight,
  IconClose,
  IconCommentStroked,
  IconCopyStroked,
  IconCreditCardStroked,
  IconCustomerSupport,
  IconEditStroked,
  IconExit,
  IconEyeClosedStroked,
  IconEyeOpenedStroked,
  IconFile,
  IconGiftStroked,
  IconIdCardStroked,
  IconImage,
  IconInfoCircle,
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
  IconTick,
  IconTickCircle,
  IconUserGroup,
  IconUserStroked,
  IconVideo,
} from '@douyinfe/semi-icons'
import { useAppStore, type AppStoreValue, type Workspace, type WorkspaceRole } from '@/data/app-state'
import { modelAlias, modelRouteKey, MODALITY_LABELS, type ModelRecord } from '@/data/models'
import { getProfileEnterprises, getProfileErrorMessage, getUserProfile, isValidDisplayName, limitDisplayNameLength, PROFILE_DISPLAY_NAME_MAX_LENGTH, updateProfileNickname, type ContactProvider, type EnterpriseMembership, type UserProfile } from '@/api/profile'
import { getAccountOverview, type AccountOverviewResponse, type BillingContext } from '@/api/billing'
import { completeBinding, completeWechatLogin, invalidateAuth, loginWithPhone, logoutAuth, pollWechatStatus, requestBindingCode, requestPhoneCode, requestWechatQr, updateAuthenticatedUser } from '@/store/auth-slice'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { clearAuthTokens, getAccessToken, getVerifiedPhone, saveVerifiedPhone } from '@/auth/token-storage'
import { isAuthenticationFailure } from '@/api/http'
import { useTranslation } from 'react-i18next'
import { cycleThemeModeWithTransition, themeModeLabel, useResolvedTheme, useThemeMode } from '@/theme'
import { getMockSupportReply, MOCK_SUPPORT_REPLY_DELAY_MS, type SupportChatMessage, type SupportLocale, type SupportMessageRole } from './support-chat'
import { MoneyText } from './money'
import { ModelAvailability } from './model-availability'
import { enterpriseMenuPermissionKeyForPath, hasEnterpriseMenuPermission, isEnterpriseOwner, type EnterpriseMenuAccess, type EnterpriseMenuPermissionKey, useEnterpriseMenuAccess } from './enterprise-menu-access'
import { ENTERPRISE_CREATE_PATH, NEW_ENTERPRISE_CREATE_PATH } from '@/api/enterprise-certification'
export { isEnterpriseOwner } from './enterprise-menu-access'
import tokenNxLogo from '@/token-nx-logo.png'
import headerLogo from '@/assets/figma-header/token-nx-header-logo.png'
import headerTrialPill from '@/assets/figma-header/trial-pill.png'
import headerTrialFreeTag from '@/assets/figma-header/trial-free-tag.svg'
import publicMobileNavStyles from '@/public-mobile-nav.css?inline'
import '@/public-footer.css'
import accountBadge from '@/assets/figma-account-badge.png'
import manuscriptFooterLogo from '@/assets/figma-home/footer-logo.png'
import './login-panel.css'
import './account-settings-modal.css'
import { appToast } from './app-toast'
import { publishProfileUpdate, subscribeProfileUpdates } from '@/profile/profile-sync'

const LazyProfileContactDialog = lazy(() => import('./profile-contact-dialog').then((module) => ({ default: module.ProfileContactDialog })))
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
}

export const PUBLIC_LINKS: PublicLink[] = [
  { labelKey: 'nav.models', path: '/models' },
  // 中文：私有化入口暂不对外展示，后续开放时再加入此列表。
  { labelKey: 'nav.ranking', path: '/rankings' },
  { labelKey: 'nav.apps', path: '/apps' },
  { labelKey: 'nav.docs', path: '/docs' },
  { labelKey: 'nav.news', path: '/news' },
]

const AUTHENTICATED_PUBLIC_LINK: PublicLink = { labelKey: 'nav.billing', path: '/console/billing' }
const BILLING_OVERVIEW_HOVER_DELAY_MS = 120
const BILLING_OVERVIEW_CACHE_MS = 8_000
const BILLING_BALANCE_VISIBILITY_STORAGE_KEY = 'token-nx:billing-balance-visible:v1'

type BillingOverviewCacheEntry = {
  data: AccountOverviewResponse
  loadedAt: number
}

function billingOverviewContext(workspace: Pick<Workspace, 'id' | 'type'>): BillingContext {
  return workspace.type === 'enterprise' ? { account_type: 'enterprise', enterprise_id: workspace.id } : { account_type: 'personal' }
}

function billingOverviewKey(context: BillingContext): string {
  return context.account_type === 'enterprise' ? `enterprise:${context.enterprise_id ?? ''}` : 'personal'
}

function initialBillingBalanceVisible(): boolean {
  if (typeof window === 'undefined') return true
  try {
    return window.localStorage.getItem(BILLING_BALANCE_VISIBILITY_STORAGE_KEY) !== 'hidden'
  } catch {
    return true
  }
}

function persistBillingBalanceVisible(visible: boolean): void {
  try {
    window.localStorage.setItem(BILLING_BALANCE_VISIBILITY_STORAGE_KEY, visible ? 'visible' : 'hidden')
  } catch {
    // Keep the in-memory preference when storage is unavailable.
  }
}

function formatBillingOverviewAmount(value: string | undefined): string {
  const match = value?.trim().match(/^([+-]?)(\d+)(?:\.(\d+))?$/)
  if (!match) return '--'
  const fraction = (match[3] ?? '').padEnd(3, '0')
  let cents = BigInt(match[2]) * 100n + BigInt(fraction.slice(0, 2))
  if (fraction[2] >= '5') cents += 1n
  const integer = (cents / 100n).toLocaleString()
  const decimal = String(cents % 100n).padStart(2, '0')
  return `${match[1] === '-' && cents !== 0n ? '-' : ''}${integer}.${decimal}`
}

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
      {model.iconUrl ? <img src={model.iconUrl} alt="" loading="lazy" /> : logoMarkup ? <span dangerouslySetInnerHTML={{ __html: logoMarkup }} /> : modalityIcon}
    </span>
  )
}

type ModelTagValue = { label: string; color?: string }

const MODEL_TAG_NAMED_COLORS: Record<string, string> = {
  amber: '#c08a3e', blue: '#5c7fd8', cyan: '#4197a8', green: '#4f9b70', grey: '#7d8492',
  indigo: '#7069c4', lime: '#7f9e46', orange: '#c17d3e', pink: '#c76c91', purple: '#9369bd',
  red: '#c9675a', teal: '#439487', violet: '#806bc5', yellow: '#ad9138', white: '#a6abb4',
  'light-blue': '#5792c3', 'light-green': '#65a36c',
}

function modelTagBaseColor(tag: ModelTagValue): string {
  const backendColor = tag.color?.trim()
  if (backendColor) {
    const namedColor = MODEL_TAG_NAMED_COLORS[backendColor.toLowerCase()]
    if (namedColor) return namedColor
    if (/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(backendColor)) return backendColor
  }

  const label = tag.label.trim().toLowerCase()
  if (/免费|free/.test(label)) return MODEL_TAG_NAMED_COLORS.green
  if (/折扣|特价|discount|sale/.test(label)) return MODEL_TAG_NAMED_COLORS.orange
  if (/推荐|recommend/.test(label)) return MODEL_TAG_NAMED_COLORS.blue
  if (/多模态|multimodal/.test(label)) return MODEL_TAG_NAMED_COLORS.violet
  if (/代码|code/.test(label)) return MODEL_TAG_NAMED_COLORS.indigo
  return MODEL_TAG_NAMED_COLORS.grey
}

function modelTagStyle(tag: ModelTagValue): CSSProperties {
  const baseColor = modelTagBaseColor(tag)
  const compactHex = baseColor.slice(1)
  const hex = compactHex.length === 3 ? [...compactHex].map((value) => value.repeat(2)).join('') : compactHex
  const red = Number.parseInt(hex.slice(0, 2), 16) / 255
  const green = Number.parseInt(hex.slice(2, 4), 16) / 255
  const blue = Number.parseInt(hex.slice(4, 6), 16) / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const delta = max - min
  const lightness = (max + min) / 2
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1))
  const hue = delta === 0
    ? 0
    : max === red
      ? 60 * (((green - blue) / delta) % 6)
      : max === green
        ? 60 * ((blue - red) / delta + 2)
        : 60 * ((red - green) / delta + 4)
  const normalizedHue = Math.round((hue + 360) % 360)
  const normalizedSaturation = Math.round(Math.min(64, Math.max(38, saturation * 72)))

  // Keep the backend hue while constraining saturation/lightness to readable theme-specific ramps.
  return {
    '--model-tag-color': baseColor,
    '--model-tag-dark-text': `hsl(${normalizedHue} ${normalizedSaturation}% 72%)`,
    '--model-tag-dark-border': `hsl(${normalizedHue} ${normalizedSaturation}% 62% / .42)`,
    '--model-tag-dark-bg': `hsl(${normalizedHue} ${normalizedSaturation}% 52% / .14)`,
    '--model-tag-light-text': `hsl(${normalizedHue} ${normalizedSaturation}% 31%)`,
    '--model-tag-light-border': `hsl(${normalizedHue} ${normalizedSaturation}% 42% / .38)`,
    '--model-tag-light-bg': `hsl(${normalizedHue} ${normalizedSaturation}% 46% / .1)`,
  } as CSSProperties
}

function ModelColorTag({ tag, className = '' }: { tag: ModelTagValue; className?: string }) {
  const { t } = useTranslation()
  return <span className={`model-color-tag${className ? ` ${className}` : ''}`} style={modelTagStyle(tag)}>{localizeConsoleLabel(t, tag.label)}</span>
}

export function ModelTags({ model }: { model: ModelRecord }) {
  return (
    <div className="tag-row">
      {(model.tags?.length ? model.tags : model.labels.map((label) => ({ label }))).slice(0, 4).map((tag) => (
        <ModelColorTag key={tag.label} tag={tag} />
      ))}
    </div>
  )
}

const MODEL_UNAVAILABLE_LABEL = '暂无数据'
const MODEL_IO_TYPES: Record<ModelRecord['modality'], [string, string]> = {
  multimodal: ['多模态', '多模态'],
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
  '暂无数据': 'console.common.unavailable',
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
  const inputMark = MODEL_TYPE_MARKS[inputTypeValue] ?? (model.modality === 'multimodal' ? 'M' : '?')
  const outputMark = MODEL_TYPE_MARKS[outputTypeValue] ?? (model.modality === 'multimodal' ? 'M' : '?')
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
          <span className="model-card-throughput"><strong>{model.throughput.unit === MODEL_UNAVAILABLE_LABEL ? t('console.common.unavailable') : `${model.throughput.value}${model.throughput.unit === 'B tokens' ? 'B token' : ` ${model.throughput.unit}`}`}</strong></span>
          <div className="model-card-tags">
            {(model.tags?.length ? model.tags : model.labels.slice(0, 4).map((label) => ({ label }))).slice(0, 4).map((tag) => (
              <ModelColorTag key={tag.label} tag={tag} className="model-card-tag" />
            ))}
          </div>
        </div>
        <p className="model-card-description">{model.description}</p>
        <div className="model-card-metrics" aria-label={t('console.modelDetail.informationTitle')}>
          <div><span>{t('console.common.providers', { count: model.providerCount })}</span><strong>{model.providerCount}</strong></div>
          <div><span>{t('console.modelDetail.platformTokens')}</span><strong>{model.throughput.unit === MODEL_UNAVAILABLE_LABEL ? t('console.common.unavailable') : `${model.throughput.value}${model.throughput.unit === 'B tokens' ? 'B' : ` ${model.throughput.unit}`}`}</strong></div>
          <div><span>{t('home.rebuild.availability')}</span><strong>{model.availability.rate > 0 ? `${model.availability.rate}%` : t('console.common.unavailable')}</strong></div>
        </div>
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
        <ModelAvailability
          className="model-card-availability"
          hourly={model.availability.hourly}
          summaryRate={model.availability.rate}
          label={t('home.rebuild.availability')}
        />
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
  labelKey: string
  minLength: number
  maxLength: number
  pattern?: RegExp
}

const LOGIN_CODE_RETRY_SECONDS = 60
const PHONE_CODE_COOLDOWN_KEY = 'token-nx:auth:phone-code-cooldown:v1'
const LOGIN_DIAL_CODES: readonly LoginDialCode[] = [
  { code: '+86', labelKey: 'login.countryMainland', minLength: 11, maxLength: 11, pattern: /^1[3-9]\d{9}$/ },
  { code: '+852', labelKey: 'login.countryHongKong', minLength: 8, maxLength: 8 },
  { code: '+853', labelKey: 'login.countryMacau', minLength: 8, maxLength: 8 },
  { code: '+886', labelKey: 'login.countryTaiwan', minLength: 9, maxLength: 10 },
  { code: '+1', labelKey: 'login.countryUsCanada', minLength: 10, maxLength: 10 },
  { code: '+44', labelKey: 'login.countryUnitedKingdom', minLength: 10, maxLength: 10 },
  { code: '+81', labelKey: 'login.countryJapan', minLength: 10, maxLength: 11 },
  { code: '+82', labelKey: 'login.countrySouthKorea', minLength: 9, maxLength: 11 },
  { code: '+65', labelKey: 'login.countrySingapore', minLength: 8, maxLength: 8 },
  { code: '+60', labelKey: 'login.countryMalaysia', minLength: 9, maxLength: 10 },
  { code: '+61', labelKey: 'login.countryAustralia', minLength: 9, maxLength: 9 },
  { code: '+49', labelKey: 'login.countryGermany', minLength: 10, maxLength: 11 },
  { code: '+33', labelKey: 'login.countryFrance', minLength: 9, maxLength: 9 },
] as const

function loginDialCode(value: string): LoginDialCode {
  return LOGIN_DIAL_CODES.find((entry) => entry.code === value) ?? LOGIN_DIAL_CODES[0]
}

function normalizeLoginPhone(value: string): string {
  return value.replace(/\D/g, '')
}

function maskLoginPhone(value: string): string {
  return value.length >= 7 ? `${value.slice(0, 3)}****${value.slice(-4)}` : value
}

function internationalLoginPhone(dialCode: string, value: string): string {
  return `${dialCode}${normalizeLoginPhone(value)}`
}

type PhoneCodeCooldown = {
  destination: string
  countryCode: string
  expiresAt: number
}

function readPhoneCodeCooldown(): PhoneCodeCooldown | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(PHONE_CODE_COOLDOWN_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PhoneCodeCooldown>
    if (typeof parsed.destination !== 'string' || typeof parsed.countryCode !== 'string' || typeof parsed.expiresAt !== 'number' || !Number.isFinite(parsed.expiresAt)) return null
    if (parsed.expiresAt <= Date.now()) {
      window.localStorage.removeItem(PHONE_CODE_COOLDOWN_KEY)
      return null
    }
    return { destination: parsed.destination, countryCode: parsed.countryCode, expiresAt: parsed.expiresAt }
  } catch {
    return null
  }
}

function savePhoneCodeCooldown(destination: string, countryCode: string): void {
  try {
    window.localStorage.setItem(PHONE_CODE_COOLDOWN_KEY, JSON.stringify({ destination, countryCode, expiresAt: Date.now() + LOGIN_CODE_RETRY_SECONDS * 1000 }))
  } catch {
    // Ignore storage failures; the in-memory countdown still protects this session.
  }
}

function remainingPhoneCodeCooldown(destination: string, countryCode: string): number {
  const cooldown = readPhoneCodeCooldown()
  if (!cooldown || cooldown.destination !== destination || cooldown.countryCode !== countryCode) return 0
  return Math.max(1, Math.ceil((cooldown.expiresAt - Date.now()) / 1000))
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
  inputRef?: RefObject<HTMLInputElement | null>
}

function LoginPhoneField(props: LoginPhoneFieldProps) {
  const { t } = useTranslation()
  const dial = loginDialCode(props.dialCode)
  const [dialCodeOpen, setDialCodeOpen] = useState(false)
  return (
    <div className="form-field phone-field">
      {props.label ? <label className="field-label" htmlFor={props.id}>{props.label}</label> : null}
      <div className="phone-input-wrapper">
        <div className={`phone-prefix-control${dialCodeOpen ? ' is-open' : ''}`}>
          <span className="phone-prefix-value" aria-hidden="true">{dial.code}</span>
          <select
            className="phone-prefix-select"
            value={props.dialCode}
            onChange={(event) => {
              props.onDialCodeChange(event.target.value)
              setDialCodeOpen(false)
            }}
            onMouseDown={() => setDialCodeOpen((open) => !open)}
            onFocus={() => setDialCodeOpen(true)}
            onBlur={() => setDialCodeOpen(false)}
            aria-label={t('login.countryCode')}
          >
            {LOGIN_DIAL_CODES.map((entry) => <option key={entry.code} value={entry.code}>{entry.code} {t(entry.labelKey)}</option>)}
          </select>
        </div>
        <input
          ref={props.inputRef}
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

export function LoginPanel({ onSuccess, onAuthFailure, inviteCode }: { onSuccess: () => void; onAuthFailure?: () => void; inviteCode?: string }) {
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
  const phoneInputRef = useRef<HTMLInputElement>(null)
  const dispatch = useAppDispatch()
  const navigate = useNavigate()

  useEffect(() => {
    if (phoneRetryAfter <= 0) return undefined
    const timer = window.setInterval(() => setPhoneRetryAfter((value) => Math.max(0, value - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [phoneRetryAfter])

  useEffect(() => {
    const destination = normalizeLoginPhone(phone)
    const retryAfter = destination ? remainingPhoneCodeCooldown(destination, dialCode) : 0
    setPhoneRetryAfter(retryAfter)
    setPhoneCodeSent(retryAfter > 0)
  }, [dialCode, phone])

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
    const currentPhone = normalizeLoginPhone(phoneInputRef.current?.value ?? phone)
    if (currentPhone !== phone) setPhone(currentPhone)
    if (phoneRetryAfter > 0 || phoneCodeLoading || !validatePhone(currentPhone, dialCode)) return
    setPhoneCodeLoading(true)
    setFeedback('')
    try {
      const destination = currentPhone
      const result = await dispatch(requestPhoneCode({ destination, countryCode: dialCode })).unwrap()
      setPhoneCodeSent(true)
      setPhoneRetryAfter(LOGIN_CODE_RETRY_SECONDS)
      savePhoneCodeCooldown(destination, dialCode)
      setFeedback(t('login.sentTo', { destination: result.destination_masked || maskLoginPhone(destination) }))
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
    const destination = normalizeLoginPhone(phoneInputRef.current?.value ?? phone)
    if (destination !== phone) setPhone(destination)
    if (!validatePhone(destination, dialCode)) return
    if (!/^\d{6}$/.test(code)) {
      setFeedback(t('login.validationCode'))
      return
    }
    setPhoneLoginLoading(true)
    setFeedback('')
    try {
      const user = await dispatch(loginWithPhone({ destination, code, inviteCode })).unwrap()
      saveVerifiedPhone(user.id, destination)
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
      const user = await dispatch(completeBinding({ bindingTicket, phone: internationalLoginPhone(bindingDialCode, bindingPhone), code: bindingCode })).unwrap()
      saveVerifiedPhone(user.id, bindingPhone)
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
            <LoginPhoneField id="login-phone" dialCode={dialCode} phone={phone} invalid={feedback === t('login.validationPhone')} onDialCodeChange={setDialCode} onPhoneChange={setPhone} inputRef={phoneInputRef} />
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
  inviteCode?: string
}

export function LoginDialog({ open, onClose, onSuccess, dialogId = 'login-popover', inviteCode }: LoginDialogProps) {
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
        <button className="login-popover-close" type="button" aria-label={t('login.close')} title={t('login.close')} onClick={onClose}>
          <IconClose aria-hidden="true" />
        </button>
        <LoginPanel inviteCode={inviteCode} onSuccess={handleSuccess} onAuthFailure={onClose} />
      </div>
    </>,
    document.body,
  )
}

export function LoginPopover({ onSuccess, inviteCode }: { onSuccess: () => void; inviteCode?: string }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  return (
    <div className="login-trigger-wrap">
      <button className="btn btn-primary" type="button" aria-label={t('login.trigger')} aria-haspopup="dialog" aria-controls="login-popover" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span className="header-login-label header-login-label--desktop">{t('login.trigger')}</span>
        <span className="header-login-label header-login-label--mobile">{t('login.loginRegister')}</span>
      </button>
      <LoginDialog open={open} onClose={() => setOpen(false)} onSuccess={onSuccess} inviteCode={inviteCode} />
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
  const authStatus = useAppSelector((state) => state.auth.status)
  const requiresLogin = authStatus !== 'authenticated'
  const safeReturnPath = normalizeLoginReturnPath(returnPath)
  const fallbackPath = `/login?return=${encodeURIComponent(safeReturnPath)}`

  return (
    <>
      <Link
        className={className}
        to={requiresLogin ? fallbackPath : safeReturnPath}
        aria-haspopup={requiresLogin ? 'dialog' : undefined}
        aria-controls={requiresLogin ? 'login-popover' : undefined}
        aria-expanded={requiresLogin ? open : undefined}
        onClick={requiresLogin ? (event) => { event.preventDefault(); setOpen(true) } : undefined}
      >
        {children}
      </Link>
      {/* 中文：已登录用户直接进入目标页面，仅未登录时挂载登录弹窗。 */}
      {requiresLogin ? <LoginDialog open={open} onClose={() => setOpen(false)} onSuccess={() => navigate(safeReturnPath)} /> : null}
    </>
  )
}

export function ThemeToggleButton() {
  const { t } = useTranslation()
  const mode = useThemeMode()
  const resolvedTheme = useResolvedTheme()
  const icon = resolvedTheme === 'dark'
    ? <IconMoonStroked className="icon-svg tool-icon" />
    : <IconSunStroked className="icon-svg tool-icon" />
  const label = t(themeModeLabel(mode))

  return <button className="header-tool theme-switcher" type="button" title={`${t('theme.switch')} · ${label}`} aria-label={`${t('theme.switch')} · ${label}`} onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); cycleThemeModeWithTransition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }) }}>{icon}</button>
}

function LanguageToggleButton({ mobile = false }: { mobile?: boolean }) {
  const { t, i18n: translationI18n } = useTranslation()
  const isEnglish = translationI18n.resolvedLanguage?.startsWith('en') ?? false
  const nextLanguage = isEnglish ? 'zh-CN' : 'en-US'

  return (
    <button className={`header-tool language-switcher${isEnglish ? ' is-english' : ''}${mobile ? ' language-switcher--mobile' : ''}`} type="button" title={t('language.label')} aria-label={t('language.toggle')} aria-pressed={isEnglish} onClick={() => { void translationI18n.changeLanguage(nextLanguage) }}>
      <span className="language-switcher-track" aria-hidden="true">
        <span className="language-switcher-thumb" />
        <span className="language-switcher-option language-switcher-option--en">EN</span>
        <span className="language-switcher-option language-switcher-option--zh">中</span>
      </span>
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
  const [scrolled, setScrolled] = useState(false)
  const [billingMenuOpen, setBillingMenuOpen] = useState(false)
  const [billingBalanceVisible, setBillingBalanceVisible] = useState(initialBillingBalanceVisible)
  const [billingOverview, setBillingOverview] = useState<AccountOverviewResponse | null>(null)
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false)
  const headerRef = useRef<HTMLElement | null>(null)
  const billingOverviewCacheRef = useRef(new Map<string, BillingOverviewCacheEntry>())
  const billingOverviewRequestsRef = useRef(new Map<string, Promise<AccountOverviewResponse>>())
  const billingHoverRequestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inviteCode = new URLSearchParams(location.search).get('invite_code')?.trim() || undefined
  const billingContext = billingOverviewContext(store.activeWorkspace)
  const billingContextCacheKey = billingOverviewKey(billingContext)
  const billingContextCacheKeyRef = useRef(billingContextCacheKey)
  billingContextCacheKeyRef.current = billingContextCacheKey
  const billingBalance = formatBillingOverviewAmount(billingOverview?.account_balance_yuan)
  const billingInvitationReward = formatBillingOverviewAmount(billingOverview?.invitation_reward_yuan)
  const billingInvoiceableAmount = formatBillingOverviewAmount(billingOverview?.invoiceable_amount_yuan)
  const maskedBillingBalance = billingBalance === '--' ? '--' : billingBalance.replace(/\D/g, '').replace(/\d/g, '*')
  const billingHoverCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentPath = location.pathname
  const publicLinks = auth.status === 'authenticated' ? [...PUBLIC_LINKS, AUTHENTICATED_PUBLIC_LINK] : PUBLIC_LINKS
  function go(path: string): void {
    if (path === currentPath) {
      setMobileOpen(false)
      return
    }
    navigate(path)
  }

  useLayoutEffect(() => {
    clearBillingHoverRequestTimer()
    setMobileOpen(false)
    setBillingMenuOpen(false)
  }, [currentPath])

  useEffect(() => {
    let animationFrame = 0
    const syncScrollState = (): void => {
      cancelAnimationFrame(animationFrame)
      animationFrame = requestAnimationFrame(() => setScrolled(window.scrollY > 8))
    }
    syncScrollState()
    window.addEventListener('scroll', syncScrollState, { passive: true })
    return () => {
      cancelAnimationFrame(animationFrame)
      window.removeEventListener('scroll', syncScrollState)
    }
  }, [])

  function clearBillingHoverCloseTimer(): void {
    if (billingHoverCloseTimerRef.current === null) return
    clearTimeout(billingHoverCloseTimerRef.current)
    billingHoverCloseTimerRef.current = null
  }

  function clearBillingHoverRequestTimer(): void {
    if (billingHoverRequestTimerRef.current === null) return
    clearTimeout(billingHoverRequestTimerRef.current)
    billingHoverRequestTimerRef.current = null
  }

  function loadBillingOverview(context: BillingContext, contextKey: string): void {
    const cached = billingOverviewCacheRef.current.get(contextKey)
    if (cached && Date.now() - cached.loadedAt < BILLING_OVERVIEW_CACHE_MS) {
      setBillingOverview(cached.data)
      return
    }
    const pending = billingOverviewRequestsRef.current.get(contextKey)
    const request = pending ?? getAccountOverview(context)
    if (!pending) billingOverviewRequestsRef.current.set(contextKey, request)
    void request.then((data) => {
      billingOverviewCacheRef.current.set(contextKey, { data, loadedAt: Date.now() })
      if (billingContextCacheKeyRef.current === contextKey) setBillingOverview(data)
    }).catch((error: unknown) => {
      if (isAuthenticationFailure(error)) dispatch(invalidateAuth())
    }).finally(() => {
      if (billingOverviewRequestsRef.current.get(contextKey) === request) billingOverviewRequestsRef.current.delete(contextKey)
    })
  }

  function openBillingMenu(): void {
    clearBillingHoverCloseTimer()
    setBillingMenuOpen(true)
    clearBillingHoverRequestTimer()
    billingHoverRequestTimerRef.current = setTimeout(() => {
      billingHoverRequestTimerRef.current = null
      loadBillingOverview(billingContext, billingContextCacheKey)
    }, BILLING_OVERVIEW_HOVER_DELAY_MS)
  }

  function toggleBillingBalanceVisibility(): void {
    setBillingBalanceVisible((visible) => {
      const nextVisible = !visible
      persistBillingBalanceVisible(nextVisible)
      return nextVisible
    })
  }

  function scheduleBillingMenuClose(): void {
    clearBillingHoverCloseTimer()
    clearBillingHoverRequestTimer()
    billingHoverCloseTimerRef.current = setTimeout(() => {
      billingHoverCloseTimerRef.current = null
      setBillingMenuOpen(false)
    }, 160)
  }

  useEffect(() => {
    setBillingOverview(billingOverviewCacheRef.current.get(billingContextCacheKey)?.data ?? null)
  }, [billingContextCacheKey])

  useEffect(() => () => {
    clearBillingHoverCloseTimer()
    clearBillingHoverRequestTimer()
  }, [])

  useEffect(() => {
    if (!mobileOpen) return undefined
    const handlePointerDown = (event: PointerEvent): void => {
      if (accountSettingsOpen && event.target instanceof Element && event.target.closest('.account-settings-overlay, .profile-contact-modal')) return
      if (!headerRef.current?.contains(event.target as Node)) setMobileOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (accountSettingsOpen) return
      if (event.key === 'Escape') setMobileOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [accountSettingsOpen, mobileOpen])

  function renderPublicLink(link: PublicLink, mobile = false): ReactNode {
    const isActive = !link.disabled && currentPath.startsWith(link.path)
    const showEmphasis = isActive
    const className = `public-nav-link${isActive ? ' active' : ''}${link.disabled ? ' public-nav-link--disabled' : ''}${showEmphasis ? ' public-nav-link--emphasized' : ''}`
    const linkContent = <>{t(link.labelKey)}{mobile ? <IconChevronRight className="public-mobile-nav-chevron" aria-hidden="true" /> : null}</>
    if (link.disabled) {
      return <span key={`${link.path}-${link.labelKey}`} className={className} aria-disabled="true">{linkContent}</span>
    }
    const linkNode = <Link key={`${link.path}-${link.labelKey}`} className={className} to={link.path} onClick={mobile ? (event) => { event.preventDefault(); go(link.path) } : undefined} onFocus={!mobile && link.labelKey === 'nav.billing' ? openBillingMenu : undefined} aria-haspopup={!mobile && link.labelKey === 'nav.billing' ? 'dialog' : undefined}>{linkContent}</Link>
    if (mobile || link.labelKey !== 'nav.billing') return linkNode
    return <div className="public-billing-menu-shell" key={`${link.path}-${link.labelKey}`} onMouseEnter={openBillingMenu} onMouseLeave={scheduleBillingMenuClose}>
      {linkNode}
      {billingMenuOpen ? <div className="billing-hover-card" role="dialog" aria-label={t('console.billing.balance')}>
        <div className="billing-hover-card-top">
          <div className="billing-hover-balance">
            <div className="billing-hover-label">
              <span>{t('console.billing.balance')}</span><span>{t('console.billing.currency')}</span>
              <button className="billing-hover-eye" type="button" aria-label={t(billingBalanceVisible ? 'console.billing.hideBalance' : 'console.billing.showBalance')} title={t(billingBalanceVisible ? 'console.billing.hideBalance' : 'console.billing.showBalance')} onClick={toggleBillingBalanceVisibility}>
                {billingBalanceVisible ? <IconEyeOpenedStroked aria-hidden="true" /> : <IconEyeClosedStroked aria-hidden="true" />}
              </button>
            </div>
            <strong className={billingBalanceVisible ? '' : 'is-hidden'} title={billingBalanceVisible ? billingOverview?.account_balance_yuan : undefined}>{billingBalanceVisible ? billingBalance : maskedBillingBalance}</strong>
          </div>
          <Link className="billing-hover-recharge" to="/console/billing" onClick={() => setBillingMenuOpen(false)}><span>{t('console.billing.rechargeNow')}</span></Link>
        </div>
        <div className="billing-hover-facts">
          <div><span>{t('console.billing.promotionBalance')}</span><strong title={billingOverview?.invitation_reward_yuan}>{billingInvitationReward}</strong></div>
          <div><span>{t('console.billing.invoiceAvailable')}</span><strong title={billingOverview?.invoiceable_amount_yuan}>{billingInvoiceableAmount}</strong></div>
        </div>
        <div className="billing-hover-divider" aria-hidden="true" />
        <Link className="billing-hover-center" to="/console/billing" onClick={() => setBillingMenuOpen(false)}>{t('console.billing.billingCenter')}</Link>
      </div> : null}
    </div>
  }

  return (
    <>
      <style>{publicMobileNavStyles}</style>
      <header className={`app-header public-header public-header--home${scrolled ? ' is-scrolled' : ''}${mobileOpen ? ' mobile-nav-open' : ''}`} ref={headerRef}>
      <div className="app-header-inner app-header-full public-header-inner">
        <button className="mobile-menu-button" type="button" aria-controls="public-mobile-nav" aria-expanded={mobileOpen} aria-label={mobileOpen ? t('nav.close') : t('nav.open')} onClick={() => setMobileOpen((open) => !open)}>
          <span className="mobile-menu-icon" aria-hidden="true">
            <IconMenu className="icon-svg mobile-menu-icon-menu" />
            <IconClose className="icon-svg mobile-menu-icon-close" />
          </span>
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
          {publicLinks.map((link) => renderPublicLink(link))}
        </nav>
        <div className="header-actions public-header-actions">
          <div className="header-tools">
            <ThemeToggleButton />
            <button className="header-tool header-tool-badge" type="button" title={t('nav.notifications')} aria-label={t('nav.notifications')} onClick={() => requestSupportWidget('notifications')}>
              <IconBellStroked className="header-notification-icon" aria-hidden="true" />
              {unreadNotificationCount > 0 ? <i className="header-notification-dot" aria-hidden="true" /> : null}
            </button>
            <LanguageToggleButton />
          </div>
          {auth.status === 'authenticated' ? (
            <>
              <UserMenu
                store={store}
                userId={auth.user?.id || ''}
                userName={auth.user?.display_name || store.nickname}
                phone={auth.user?.phone_masked || store.phone}
                enterpriseAccess={enterpriseAccess}
                accountSettingsOpen={accountSettingsOpen}
                onNavigate={go}
                onOpenSettings={() => setAccountSettingsOpen(true)}
                onLogout={() => { void dispatch(logoutAuth()).finally(() => go('/')) }}
              />
              <button className="public-mobile-logout" type="button" onClick={() => { void dispatch(logoutAuth()).finally(() => go('/')) }}>
                <span>{t('nav.logout')}</span>
              </button>
            </>
          ) : (
            <LoginPopover inviteCode={inviteCode} onSuccess={() => {
              setMobileOpen(false)
              if (inviteCode) navigate('/', { replace: true })
            }} />
          )}
        </div>
      </div>
      <nav className="public-mobile-nav" id="public-mobile-nav" aria-label={t('console.common.publicNav')} hidden={!mobileOpen}>
        {publicLinks.map((link) => renderPublicLink(link, true))}
        <div className="public-mobile-tools">
          <ThemeToggleButton />
          <button className="header-tool header-tool-badge" type="button" title={t('nav.notifications')} aria-label={t('nav.notifications')} onClick={() => { setMobileOpen(false); requestSupportWidget('notifications') }}>
            <IconBellStroked className="header-notification-icon" aria-hidden="true" />
            {unreadNotificationCount > 0 ? <i className="header-notification-dot" aria-hidden="true" /> : null}
          </button>
          <LanguageToggleButton mobile />
        </div>
      </nav>
      </header>
      {accountSettingsOpen ? <AccountSettingsModal onClose={() => setAccountSettingsOpen(false)} /> : null}
    </>
  )
}

type ConsoleNavIconName = 'quickstart' | 'models' | 'model-test' | 'video' | 'api-keys' | 'usage' | 'records' | 'billing' | 'real-name' | 'settings' | 'account' | 'members' | 'governance' | 'bell' | 'pie' | 'logout' | 'workspace' | 'gift'

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
  gift: (props) => <IconGiftStroked {...props} />,
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
      { key: '/console/api-keys', label: '密钥管理', icon: 'api-keys' },
    ],
  },
  {
    key: 'activity',
    label: '活动中心',
    items: [
      { key: '/console/invitations', label: '邀请返现', icon: 'gift' },
      { key: '/console/real-name-reward', label: '认证返现', icon: 'gift', actionOnly: true, soon: true },
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
      { key: '/console/api-keys', label: '密钥管理', icon: 'api-keys' },
    ],
  },
]

const CONSOLE_NAV_LABEL_KEYS: Record<string, string> = {
  '模型使用': 'console.nav.modelUse', '快速接入': 'console.nav.quickstart', '模型广场': 'console.nav.models', '体验中心': 'console.nav.experience',
  '智能对话': 'console.nav.playground', '视频生成': 'console.nav.video', '数据分析': 'console.nav.analytics', '用量统计': 'console.nav.usage', '调用记录': 'console.nav.records',
  '账户管理': 'console.nav.account', '实名认证': 'console.nav.realName', '个人中心': 'console.nav.profile', '费用管理': 'console.nav.billing',
  'API 密钥管理': 'console.nav.apiKeys', '密钥管理': 'console.nav.apiKeys', '企业中心': 'console.nav.enterpriseCenter', '企业入驻': 'console.nav.enterpriseCreate', '企业管理': 'console.nav.enterpriseManagement',
  '人员管理': 'console.nav.members', '用量管理': 'console.nav.enterpriseUsage', '操作日志': 'console.nav.audit', '我的数据': 'console.nav.myData',
  '企业设置': 'console.nav.enterpriseSettings', '通用设置': 'console.nav.settings', '模型管理': 'console.nav.enterpriseModels', '权限与标签': 'console.nav.governance', '账号信息': 'console.nav.accountInfo',
  '活动中心': 'console.nav.activityCenter', '邀请返现': 'console.nav.invitationReward', '认证返现': 'console.nav.realNameReward',
}

function localizeConsoleNavLabel(t: TFunction, value: string): string {
  const key = CONSOLE_NAV_LABEL_KEYS[value]
  return key ? t(key) : value
}

// 中文：视频生成已开放；个人和企业空间共用同一组体验中心入口。
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
  accountSettingsOpen?: boolean
  onNavigate: (path: string) => void
  onOpenSettings: () => void
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
const WORKSPACE_MENU_GAP_PX = 1

// 中文：登录后的用户菜单与参考站保持同一层级，空间切换和控制台入口共用当前工作空间状态。
function UserMenu({ store, userId, userName, phone, enterpriseAccess, accountSettingsOpen = false, onNavigate, onOpenSettings, onLogout }: UserMenuProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const shellRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const workspaceTriggerRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const workspaceMenuRef = useRef<HTMLDivElement>(null)
  const hoverCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [workspaceMenuPosition, setWorkspaceMenuPosition] = useState<{ top: number; left: number } | null>(null)
  const displayName = limitDisplayNameLength(userName.trim()) || limitDisplayNameLength(store.nickname) || t('console.common.demoUser')
  const phoneLabel = phone.trim() || t('console.common.phoneUnavailable')
  const initial = (displayName || store.avatar || '用').slice(0, 1).toUpperCase()
  const activeWorkspace = store.activeWorkspace
  const groups = userMenuGroupsFor(activeWorkspace, enterpriseAccess?.permissions)
  const keepMenuOpenForSettings = accountSettingsOpen && typeof window !== 'undefined' && window.innerWidth <= 760

  function clearHoverCloseTimer(): void {
    if (hoverCloseTimerRef.current === null) return
    clearTimeout(hoverCloseTimerRef.current)
    hoverCloseTimerRef.current = null
  }

  function openMenuOnHover(): void {
    clearHoverCloseTimer()
    setOpen(true)
  }

  function scheduleHoverClose(): void {
    if (keepMenuOpenForSettings) return
    clearHoverCloseTimer()
    hoverCloseTimerRef.current = setTimeout(() => {
      hoverCloseTimerRef.current = null
      closeMenu()
    }, 160)
  }

  useEffect(() => () => clearHoverCloseTimer(), [])

  useEffect(() => {
    if (!keepMenuOpenForSettings) return
    clearHoverCloseTimer()
    setOpen(true)
  }, [keepMenuOpenForSettings])

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
    const trigger = workspaceTriggerRef.current?.getBoundingClientRect()
    const compactViewport = window.innerWidth <= 760
    const anchor = compactViewport ? trigger : (dropdownRef.current?.getBoundingClientRect() ?? trigger)
    const menu = workspaceMenuRef.current
    if (!anchor || !menu) return
    const menuWidth = menu.offsetWidth
    const menuHeight = menu.offsetHeight
    const maxLeft = Math.max(WORKSPACE_MENU_VIEWPORT_GAP_PX, window.innerWidth - menuWidth - WORKSPACE_MENU_VIEWPORT_GAP_PX)
    const maxTop = Math.max(WORKSPACE_MENU_VIEWPORT_GAP_PX, window.innerHeight - menuHeight - WORKSPACE_MENU_VIEWPORT_GAP_PX)
    const left = compactViewport
      ? Math.min(Math.max(WORKSPACE_MENU_VIEWPORT_GAP_PX, anchor.left), maxLeft)
      : Math.min(Math.max(WORKSPACE_MENU_VIEWPORT_GAP_PX, anchor.left - menuWidth - WORKSPACE_MENU_GAP_PX), maxLeft)
    const top = compactViewport
      ? Math.min(Math.max(WORKSPACE_MENU_VIEWPORT_GAP_PX, anchor.bottom + 8), maxTop)
      : Math.min(Math.max(WORKSPACE_MENU_VIEWPORT_GAP_PX, anchor.top), maxTop)
    setWorkspaceMenuPosition({ top, left })
  }

  useEffect(() => {
    if (!workspaceOpen) {
      setWorkspaceMenuPosition(null)
      return undefined
    }
    updateWorkspaceMenuPosition()
    let frame = 0
    const handleViewportChange = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        updateWorkspaceMenuPosition()
      })
    }
    window.addEventListener('resize', handleViewportChange)
    document.addEventListener('scroll', handleViewportChange, { capture: true, passive: true })
    return () => {
      window.cancelAnimationFrame(frame)
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
      if (keepMenuOpenForSettings) return
      if (event.target instanceof Node && !shellRef.current?.contains(event.target) && !workspaceMenuRef.current?.contains(event.target)) closeMenu()
    }
    function handleKeyDown(event: KeyboardEvent): void {
      if (keepMenuOpenForSettings) return
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
  }, [keepMenuOpenForSettings, open, workspaceOpen])

  function navigateFromMenu(path: string): void {
    closeMenu()
    onNavigate(path)
  }

  function openAccountSettings(): void {
    if (window.innerWidth > 760) closeMenu()
    onOpenSettings()
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
        onMouseEnter={clearHoverCloseTimer}
        onMouseLeave={scheduleHoverClose}
        style={workspaceMenuPosition ? { top: workspaceMenuPosition.top, left: workspaceMenuPosition.left } : { visibility: 'hidden' }}
      >
        {store.workspaces.map((workspace) => {
          const workspaceName = workspace.type === 'personal' ? displayName : workspace.name
          const workspaceInitial = workspaceName.slice(0, 1).toUpperCase()
          const active = workspace.id === activeWorkspace.id
          return <button className={`workspace-menu-item${active ? ' active' : ''}`} type="button" role="menuitem" key={workspace.id} aria-current={active ? 'true' : undefined} aria-pressed={active} title={workspaceName} onClick={() => switchWorkspace(workspace)}>
            <span className="workspace-avatar">{workspaceInitial}</span>
            <span className="workspace-info"><span className="workspace-name">{workspaceName}</span><span className="workspace-type">{workspace.type === 'personal' ? t('console.common.personalWorkspace') : `${workspace.name} · ${workspace.role}`}</span></span>
            {workspace.type === 'enterprise' ? <IconChevronDown className="icon-svg workspace-menu-chevron" aria-hidden="true" /> : null}
          </button>
        })}
        {store.workspaces.length === 1 ? <button className="workspace-menu-item workspace-menu-create" type="button" role="menuitem" onClick={() => navigateFromMenu(NEW_ENTERPRISE_CREATE_PATH)}>
          <span className="workspace-avatar">+</span>
          <span className="workspace-info"><span className="workspace-name">{t('console.common.createWorkspace')}</span><span className="workspace-type">{t('console.common.startEnterpriseVerification')}</span></span>
        </button> : null}
      </div>,
      document.body,
    )
  }

  function renderMenuItem(item: ConsoleNavItem): ReactNode {
    const icon = <ConsoleNavIcon name={item.icon} className="dropdown-icon" />
    if (!item.actionOnly) {
      const path = item.path ?? item.key
      return <Link className="dropdown-link" role="menuitem" key={item.key} to={path} onClick={(event) => { event.preventDefault(); navigateFromMenu(path) }}>{icon}<span>{localizeConsoleNavLabel(t, item.label)}</span></Link>
    }
    return <button className="dropdown-link dropdown-link-soon" role="menuitem" key={item.key} type="button" onClick={() => { closeMenu(); Toast.info(item.soon ? t('console.common.comingSoon', { name: localizeConsoleNavLabel(t, item.label) }) : t('console.common.actionReceived')) }}>{icon}<span>{localizeConsoleNavLabel(t, item.label)}</span>{item.soon ? <span className="nav-soon-badge">{t('console.common.comingSoonShort')}</span> : null}</button>
  }

  return (
    <div className="user-menu-shell" ref={shellRef} onMouseEnter={openMenuOnHover} onMouseLeave={scheduleHoverClose}>
      <button ref={triggerRef} className="user-menu-trigger user-menu-trigger--avatar-only" type="button" aria-haspopup="menu" aria-controls="user-dropdown" aria-expanded={open} aria-label={open ? t('console.common.closeUserMenu') : t('console.common.openUserMenu')} onClick={() => setOpen(true)}>
        <span className="user-avatar">{initial}</span>
        <span className="user-name">{displayName}</span>
        <IconChevronDown className="icon-svg user-menu-chevron" />
      </button>
      <div ref={dropdownRef} className={`user-dropdown${open ? ' open' : ''}`} id="user-dropdown" role="menu" aria-label={t('console.common.userMenu')} aria-hidden={!open} onMouseEnter={clearHoverCloseTimer} onMouseLeave={scheduleHoverClose}>
        <div className="user-dropdown-header">
          <button ref={workspaceTriggerRef} className="user-dropdown-identity" type="button" role="menuitem" aria-label={t('console.common.switchWorkspace')} aria-controls="workspace-menu" aria-expanded={workspaceOpen} onClick={() => setWorkspaceOpen((value) => !value)}>
            <span className="user-dropdown-identity-avatar">{initial}</span>
            <span className="user-dropdown-identity-copy"><strong>{displayName}</strong><span className="user-dropdown-workspace-line"><span>{activeWorkspace.type === 'personal' ? t('console.common.personalWorkspace') : activeWorkspace.name}</span><span className={`user-dropdown-identity-chevron${workspaceOpen ? ' is-open' : ''}`} aria-hidden="true"><IconChevronDown className="user-dropdown-identity-chevron-icon" /></span></span><span className="public-sr-only">{phoneLabel}</span><span className="public-sr-only">{t('console.common.currentWorkspace')} · {activeWorkspace.type === 'personal' ? displayName : activeWorkspace.name}</span><span className="public-sr-only">{t('console.common.switchWorkspace')}</span></span>
          </button>
          <button className="user-dropdown-settings" type="button" aria-label={t('nav.settings')} onClick={openAccountSettings}><IconSettingStroked aria-hidden="true" /></button>
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

function AccountSettingsModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const store = useAppStore()
  const dispatch = useAppDispatch()
  const auth = useAppSelector((state) => state.auth)
  const navigate = useNavigate()
  const fallbackDisplayName = limitDisplayNameLength(auth.user?.display_name || store.nickname) || t('console.common.demoUser')
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [displayName, setDisplayName] = useState(fallbackDisplayName)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [editingValue, setEditingValue] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [contactProvider, setContactProvider] = useState<ContactProvider | null>(null)
  const nicknameRequestPending = useRef(false)
  const initial = displayName.slice(0, 1).toUpperCase()
  const accountLabel = t('console.nav.account').replace(/管理$/, '')
  const phone = profile?.phone.masked_identifier || auth.user?.phone_masked || store.phone || t('profile.overview.notSet')
  const email = profile?.email.masked_identifier || auth.user?.email_masked || t('profile.overview.notSet')
  const userId = profile?.id || auth.user?.id || t('profile.overview.notSet')

  function profileAuthUser(nextProfile: UserProfile) {
    return {
      id: nextProfile.id,
      display_name: limitDisplayNameLength(nextProfile.display_name),
      avatar_url: nextProfile.avatar_url,
      locale: nextProfile.locale,
      timezone: nextProfile.timezone,
      status: nextProfile.status,
      phone_masked: nextProfile.phone.masked_identifier,
      email_masked: nextProfile.email.masked_identifier,
    }
  }

  function applyProfile(nextProfile: UserProfile, publish = true): void {
    const normalizedProfile = { ...nextProfile, display_name: limitDisplayNameLength(nextProfile.display_name) }
    setProfile(normalizedProfile)
    setDisplayName(normalizedProfile.display_name)
    dispatch(updateAuthenticatedUser(profileAuthUser(normalizedProfile)))
    store.updateProfile({ nickname: normalizedProfile.display_name, phone: normalizedProfile.phone.masked_identifier, avatar: normalizedProfile.avatar_url || store.avatar })
    if (publish) publishProfileUpdate(normalizedProfile)
  }

  function invalidateProfileSession(): void {
    clearAuthTokens()
    dispatch(invalidateAuth())
    onClose()
    navigate('/', { replace: true })
  }

  useEffect(() => {
    let active = true
    const accessToken = getAccessToken()
    if (!accessToken) {
      invalidateProfileSession()
      return
    }
    setLoading(true)
    setLoadError('')
    void getUserProfile(accessToken).then((nextProfile) => {
      if (active) applyProfile(nextProfile)
    }).catch((error) => {
      if (!active) return
      if (isAuthenticationFailure(error)) invalidateProfileSession()
      else setLoadError(getProfileErrorMessage(error))
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [])

  useEffect(() => subscribeProfileUpdates((nextProfile) => applyProfile(nextProfile, false)), [])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [onClose])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !contactProvider && !editingName) onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [contactProvider, editingName, onClose])

  async function copyUserId(): Promise<void> {
    if (!userId || userId === t('profile.overview.notSet')) return
    try {
      await navigator.clipboard.writeText(userId)
      Toast.success(t('profile.overview.copied'))
    } catch {
      Toast.error(t('console.common.copyFailed'))
    }
  }

  function beginNameEdit(): void {
    if (loading || !profile) return
    setEditingName(true)
    setEditingValue(displayName)
  }

  async function commitName(): Promise<void> {
    if (nicknameRequestPending.current || !profile) return
    const value = editingValue.trim()
    if (!value) {
      appToast.warning(t('profile.personal.emptyName'))
      return
    }
    if (!isValidDisplayName(value)) {
      appToast.warning(t('profile.personal.nameTooLong', { count: PROFILE_DISPLAY_NAME_MAX_LENGTH }))
      return
    }
    if (value === profile.display_name) {
      setEditingName(false)
      return
    }
    const accessToken = getAccessToken()
    if (!accessToken) {
      invalidateProfileSession()
      return
    }
    nicknameRequestPending.current = true
    setSavingName(true)
    try {
      const nextProfile = await updateProfileNickname(accessToken, value)
      applyProfile(nextProfile)
      setEditingName(false)
      appToast.success(t('profile.personal.saved'))
    } catch (error) {
      if (isAuthenticationFailure(error)) invalidateProfileSession()
      else appToast.error(getProfileErrorMessage(error))
    } finally {
      nicknameRequestPending.current = false
      setSavingName(false)
    }
  }

  function handleNameKeyDown(event: ReactKeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter') {
      event.preventDefault()
      void commitName()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      setEditingName(false)
      setEditingValue(displayName)
    }
  }

  function renderNickname(): ReactNode {
    if (editingName) {
      return <span className="account-settings-value account-settings-value--editing">
        <input className="account-settings-input" autoFocus value={editingValue} aria-label={t('profile.personal.nickname')} maxLength={PROFILE_DISPLAY_NAME_MAX_LENGTH} disabled={savingName} onChange={(event) => setEditingValue(limitDisplayNameLength(event.target.value))} onBlur={() => { void commitName() }} onKeyDown={handleNameKeyDown} />
        <button type="button" className="account-settings-icon-button account-settings-confirm" aria-label={t('profile.personal.save')} disabled={savingName} onMouseDown={(event) => event.preventDefault()} onClick={() => { void commitName() }}><IconTick aria-hidden="true" /></button>
      </span>
    }
    return <span className="account-settings-value">{displayName}<button type="button" className="account-settings-icon-button" aria-label={t('profile.personal.nickname')} disabled={loading || !profile} onClick={beginNameEdit}><IconEditStroked aria-hidden="true" /></button></span>
  }

  return createPortal(
    <>
      <div className="account-settings-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !contactProvider) onClose() }}>
        <section className="account-settings-modal" role="dialog" aria-modal="true" aria-label={t('profile.title')}>
        <aside className="account-settings-sidebar">
          <h2>{t('profile.personal.title')}</h2>
          <button className="account-settings-tab active" type="button"><IconUserStroked aria-hidden="true" /><span>{accountLabel}</span></button>
        </aside>
        <main className="account-settings-main">
          <header className="account-settings-main-header">
            <h3>{accountLabel}</h3>
            <button className="account-settings-close" type="button" aria-label={t('nav.close')} onClick={onClose}><IconClose aria-hidden="true" /></button>
          </header>
          <div className="account-settings-fields">
            <div className="account-settings-row account-settings-row--name">
              <span className="account-settings-label">{t('profile.personal.nickname')}</span>
              {renderNickname()}
            </div>
            <div className="account-settings-row account-settings-row--avatar">
              <span className="account-settings-label">{t('profile.personal.avatar')}</span>
              <span className="account-settings-avatar">{initial}</span>
            </div>
            <div className="account-settings-row">
              <span className="account-settings-label">{t('profile.contact.email')}</span>
              <button type="button" className="account-settings-contact-trigger" disabled={loading || !profile} onClick={() => setContactProvider('email')}><span>{email}</span><span className="account-settings-inline-action">{profile?.email.bound ? t('profile.contact.changeEmail') : t('profile.contact.dialogEmailBind')}</span></button>
            </div>
            <div className="account-settings-row">
              <span className="account-settings-label">{t('profile.overview.id')}</span>
              <span className="account-settings-value">{userId}<button type="button" className="account-settings-icon-button" aria-label={t('profile.overview.copyId')} onClick={() => { void copyUserId() }}><IconCopyStroked aria-hidden="true" /></button></span>
            </div>
            <div className="account-settings-row">
              <span className="account-settings-label">{t('login.phone')}</span>
              <button type="button" className="account-settings-contact-trigger" aria-label={t('login.phone')} disabled={loading || !profile} onClick={() => setContactProvider('phone')}><span>{phone}</span><IconEditStroked aria-hidden="true" /></button>
            </div>
            <div className="account-settings-row account-settings-row--badges">
              <span className="account-settings-label">{t('profile.badge')}</span>
              <span className="account-settings-badges"><img src={accountBadge} alt="" /><img src={accountBadge} alt="" /><img src={accountBadge} alt="" /></span>
            </div>
            <div className="account-settings-row account-settings-row--delete">
              <span className="account-settings-label">{t('profile.deleteAccount')}</span>
              <button type="button" className="account-settings-delete">{t('profile.deleteAccount')}</button>
            </div>
            {loadError ? <p className="account-settings-load-error" role="alert">{loadError}</p> : null}
          </div>
        </main>
        </section>
      </div>
      {contactProvider && profile ? <Suspense fallback={null}><LazyProfileContactDialog
          visible
          provider={contactProvider}
          currentContact={profile[contactProvider]}
          currentDestination={contactProvider === 'phone' ? getVerifiedPhone(profile.id) ?? undefined : undefined}
          accessToken={getAccessToken()}
          onAuthFailure={invalidateProfileSession}
          onCancel={() => setContactProvider(null)}
          onSaved={(nextProfile) => { applyProfile(nextProfile); setContactProvider(null) }}
        /></Suspense> : null}
    </>,
    document.body,
  )
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
  useEffect(() => {
    let modalVisible = false
    let pendingScrollPosition: { left: number; top: number } | null = null
    let lastScrollPosition = { left: window.scrollX, top: window.scrollY }

    const recordScrollPosition = () => {
      if (!modalVisible && !pendingScrollPosition) lastScrollPosition = { left: window.scrollX, top: window.scrollY }
    }
    const recordInteractionPosition = () => {
      if (!modalVisible) pendingScrollPosition = { left: window.scrollX, top: window.scrollY }
    }
    const clearInteractionPosition = () => {
      if (!modalVisible) pendingScrollPosition = null
    }
    const restoreScrollPosition = (position: { left: number; top: number }) => {
      if (document.documentElement.scrollHeight <= document.documentElement.clientHeight) return
      const root = document.documentElement
      const previousScrollBehavior = root.style.scrollBehavior
      root.style.scrollBehavior = 'auto'
      window.scrollTo({ left: position.left, top: position.top, behavior: 'instant' as ScrollBehavior })
      window.requestAnimationFrame(() => { root.style.scrollBehavior = previousScrollBehavior })
    }
    const hasVisibleModal = () => Boolean(document.querySelector('.semi-portal .semi-modal-wrap:not(.semi-modal-displayNone)'))
    const observer = new MutationObserver(() => {
      const nextModalVisible = hasVisibleModal()
      if (nextModalVisible && !modalVisible) restoreScrollPosition(pendingScrollPosition ?? lastScrollPosition)
      if (!nextModalVisible) pendingScrollPosition = null
      modalVisible = nextModalVisible
    })

    window.addEventListener('scroll', recordScrollPosition, { passive: true })
    document.addEventListener('pointerdown', recordInteractionPosition, true)
    document.addEventListener('pointerup', clearInteractionPosition, true)
    document.addEventListener('keyup', clearInteractionPosition, true)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', recordScrollPosition)
      document.removeEventListener('pointerdown', recordInteractionPosition, true)
      document.removeEventListener('pointerup', clearInteractionPosition, true)
      document.removeEventListener('keyup', clearInteractionPosition, true)
    }
  }, [])

  if (activeWorkspace.type === 'enterprise' && permissionScope !== null && enterpriseAccess.loading) {
    return <AppLoadingScreen label={t('console.enterprise.contextLoading')} />
  }
  if (activeWorkspace.type === 'enterprise' && permissionScope !== null && !hasRoutePermission) {
    return <Navigate replace to={DEFAULT_CONSOLE_PATH} />
  }

  return (
    <div className={`console-frame public-header-host${sidebarOpen ? ' console-frame--sidebar-open' : ''}${location.pathname === '/console/quickstart' ? ' console-frame--quickstart' : ''}`}>
      <PublicHeader enterpriseAccess={enterpriseAccess} />
      <Layout className="console-layout">
        <Layout.Sider className="console-sider">
          <aside className="console-sidebar" aria-label={t('console.common.consoleNav')}>
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

const PUBLIC_COMPANY_INFO = {
  name: '安顺佳云灵犀智能科技有限公司',
  filing: '京ICP备20011824号-24',
  securityFiling: '北京公安备 11010802041394号',
} as const

const PUBLIC_FOOTER_DOC_HREFS = {
  platformIntro: '/docs/01M074Z9VZXG1V0T6KYRW7AE34/platform-overview',
  apiDocs: '/docs/01M0765G0JDT3JCZ6QQXNM40TX/token-nx-api-documentation',
  faq: '/docs/01M0765G0JADMQ2Y49DHV3MX70/frequently-asked-questions',
} as const

const MANUSCRIPT_FOOTER_GROUPS = [
  { titleKey: 'footer.product', mobileTitleKey: 'footer.product', links: [{ labelKey: 'footer.chat', path: '/console/playground', requiresLogin: true }, { labelKey: 'footer.video', path: '/console/video', requiresLogin: true }, { labelKey: 'footer.ranking', path: '/rankings' }, { labelKey: 'footer.agentRanking', path: '/apps' }] },
  { titleKey: 'footer.docs', mobileTitleKey: 'footer.docs', links: [{ labelKey: 'footer.platformIntro', path: PUBLIC_FOOTER_DOC_HREFS.platformIntro }, { labelKey: 'footer.userGuide', path: '/docs' }, { labelKey: 'footer.apiDocs', path: PUBLIC_FOOTER_DOC_HREFS.apiDocs }, { labelKey: 'footer.faq', path: PUBLIC_FOOTER_DOC_HREFS.faq }] },
  { titleKey: 'footer.pricing', mobileTitleKey: 'footer.pricing', links: [{ labelKey: 'footer.apiPrice', path: '/models' }, { labelKey: 'footer.subscriptionPrice', path: '/console/billing?tab=subscription', requiresLogin: true }] },
  { titleKey: 'footer.legal', mobileTitleKey: 'footer.legal', links: [{ labelKey: 'footer.userAgreement', path: '/terms' }, { labelKey: 'footer.privacyAgreement', path: '/privacy' }, { labelKey: 'footer.rechargeAgreement', path: '/recharge-agreement' }] },
] as const

const MANUSCRIPT_SUPPORT_TRANSITION_MS = 360
const MANUSCRIPT_SUPPORT_MESSAGE_MAX_LENGTH = 1000
type SupportTab = 'contact' | 'notifications'
const SUPPORT_OPEN_EVENT = 'token-nx:open-support'

// 中文：统一由页面头部和客服按钮发送打开请求，保证客服浮层只维护一份交互状态。
export function requestSupportWidget(tab: SupportTab = 'contact'): void {
  window.dispatchEvent(new CustomEvent(SUPPORT_OPEN_EVENT, { detail: { tab } }))
}

export function PublicFooter() {
  const { t } = useTranslation()
  const [openManuscriptGroup, setOpenManuscriptGroup] = useState<string | null>(null)

  return (
    <footer className="public-footer public-footer--manuscript">
        <div className="public-footer-inner">
          <div className="public-footer-brand manuscript-footer-brand"><span className="manuscript-footer-logo"><img src={manuscriptFooterLogo} alt="Token NX" decoding="async" /></span><span>© {new Date().getFullYear()} Token NX,Inc</span><small>{PUBLIC_COMPANY_INFO.name}</small></div>
          <nav className="public-footer-nav manuscript-footer-nav" aria-label={t('public.footer.navigation')}>{MANUSCRIPT_FOOTER_GROUPS.map((group) => {
          const isOpen = openManuscriptGroup === group.titleKey
          const panelId = `manuscript-footer-panel-${group.titleKey.replace(/[^a-z0-9]+/gi, '-')}`
          return <div className={`public-footer-nav-group${isOpen ? ' is-open' : ''}`} key={group.titleKey}>
            <strong className="manuscript-footer-group-title">{t(group.titleKey)}</strong>
            <button className="manuscript-footer-group-toggle" type="button" aria-expanded={isOpen} aria-controls={panelId} onClick={() => setOpenManuscriptGroup((current) => current === group.titleKey ? null : group.titleKey)}>
              <span className="manuscript-footer-group-label" data-mobile-label={t(group.mobileTitleKey)}>{t(group.titleKey)}</span><span className="manuscript-footer-group-symbol" aria-hidden="true">{isOpen ? '-' : '+'}</span>
            </button>
            <div className="manuscript-footer-group-links" id={panelId}>{group.links.map((link) => 'requiresLogin' in link && link.requiresLogin
              ? <LoginRequiredAction key={`${link.path}-${link.labelKey}`} returnPath={link.path}>{t(link.labelKey)}</LoginRequiredAction>
              : <Link key={`${link.path}-${link.labelKey}`} to={link.path}>{t(link.labelKey)}</Link>)}</div>
          </div>
          })}</nav>
          <div className="public-footer-contact manuscript-footer-contact"><strong>{t('footer.contact')}</strong><button type="button" onClick={() => requestSupportWidget('contact')}>{t('footer.salesPrefix')}</button><a href="mailto:wub@tokennx.com">wub@tokennx.com</a><div className="manuscript-footer-qr-row"><div className="public-footer-qr"><img src={manuscriptCustomerQr} alt={t('footer.qrAlt')} loading="lazy" decoding="async" /><span>{t('footer.customerQr')}</span></div><div className="public-footer-qr"><img src={manuscriptOfficialQr} alt={t('footer.officialQr')} loading="lazy" decoding="async" /><span>{t('footer.officialQr')}</span></div></div></div>
        </div>
        <div className="public-footer-bottom manuscript-footer-filing" aria-label={t('footer.filing')}><span className="manuscript-footer-filing-copy">Copyright @ 2025-{new Date().getFullYear()} {PUBLIC_COMPANY_INFO.name}</span><span className="manuscript-footer-filing-item"><img src={manuscriptFilingIcpIcon} alt="" aria-hidden="true" />{PUBLIC_COMPANY_INFO.filing}</span><span className="manuscript-footer-filing-item"><img src={manuscriptFilingSecurityIcon} alt="" aria-hidden="true" />{PUBLIC_COMPANY_INFO.securityFiling}</span><Link className="manuscript-footer-filing-item" to="/about">{t('footer.businessLicense')}</Link><Link className="manuscript-footer-filing-item" to="/terms">{t('footer.license')}</Link></div>
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
  const triggerExpanded = hovered && !mounted

  useEffect(() => {
    const handleOpenRequest = (event: Event) => {
      const detail = (event as CustomEvent<{ tab?: SupportTab }>).detail
      if (detail?.tab === 'contact' || detail?.tab === 'notifications') setTab(detail.tab)
      if (closeTimerRef.current !== undefined) window.clearTimeout(closeTimerRef.current)
      setHovered(false)
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
    setHovered(false)
    setOpen(true)
    setMounted(true)
  }

  function closePanel(): void {
    setHovered(false)
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
    <div ref={rootRef} className={`manuscript-support-widget${triggerExpanded ? ' is-hovered' : ''}`} onMouseEnter={() => { if (!mounted) setHovered(true) }} onMouseLeave={() => setHovered(false)}>
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
        <button className="manuscript-support-label-button" type="button" aria-label={t('support.trigger')} aria-hidden={!triggerExpanded} tabIndex={triggerExpanded ? 0 : -1} onClick={togglePanel}><IconCustomerSupport /><span>{t('support.trigger')}</span></button>
      </div>
    </div>
  )
}

export function PublicLayout({ children, mainClassName = '' }: { children: ReactNode; mainClassName?: string }) {
  const store = useAppStore()
  const enterpriseAccess = useEnterpriseMenuAccess(store.activeWorkspace)
  const manuscript = mainClassName.includes('home-page--manuscript') || mainClassName.includes('docs-page--manuscript') || mainClassName.includes('apps-page--manuscript') || mainClassName.includes('rankings-page--manuscript') || mainClassName.includes('news-page--manuscript')
  const layoutClassName = manuscript ? ' public-layout--manuscript-home' : ''
  return <div className={`public-layout public-header-host${layoutClassName}`}><PublicHeader enterpriseAccess={enterpriseAccess} /><main className={`public-main${mainClassName ? ` ${mainClassName}` : ''}`}>{children}</main><PublicFooter /></div>
}

export function BannerNotice({ children, tone = 'info', compact = false }: { children: ReactNode; tone?: 'info' | 'warning' | 'success'; compact?: boolean }) {
  if (!compact) return <div className={`banner-notice banner-notice--${tone}`}><span className="banner-notice-dot" />{children}</div>
  const icon = tone === 'warning' ? <IconAlertTriangle /> : tone === 'success' ? <IconTickCircle /> : <IconInfoCircle />
  return <div className={`banner-notice banner-notice--${tone} banner-notice--compact`} role={tone === 'warning' ? 'alert' : 'status'}><span className="banner-notice-icon" aria-hidden="true">{icon}</span><div className="banner-notice-compact-content">{children}</div></div>
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
