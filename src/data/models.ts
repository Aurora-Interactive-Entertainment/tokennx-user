import type { UserModelItem, UserModelPrice } from '@/api/user-models'
import { formatDecimal } from '@/utils/format'

export type ModelModality = 'text' | 'image' | 'video' | 'audio' | 'embedding' | 'rerank' | 'speech' | 'transcription' | 'other'

export interface ModelPrice {
  input?: number
  inputRaw?: string
  output?: number
  outputRaw?: string
  base?: number
  baseRaw?: string
  standard?: number
  standardRaw?: string
  hd?: number
  hdRaw?: string
  unit: string
}

export interface ModelAvailability {
  rate: number
  window: string
}

export interface ModelThroughput {
  value: number
  unit: string
}

export interface ModelRecord {
  id: string
  code?: string
  alias?: string
  name: string
  company: string
  modality: ModelModality
  capabilities: string[]
  context?: string
  description: string
  officialPrice: ModelPrice
  tokenNxPrice: ModelPrice
  labels: string[]
  availability: ModelAvailability
  providerCount: number
  throughput: ModelThroughput
  maxOutput?: string
  params?: Record<string, string[] | number[]>
}

export const MODEL_ALIAS_UNSET_LABEL = '未设置别名'

export function modelAlias(model: Pick<ModelRecord, 'id' | 'alias'>): string {
  return model.alias?.trim() || model.id.trim()
}

export function modelDisplayAlias(model: Pick<ModelRecord, 'id' | 'alias'>): string {
  return modelAlias(model) || MODEL_ALIAS_UNSET_LABEL
}

export function modelRouteKey(model: Pick<ModelRecord, 'id' | 'alias'>): string | undefined {
  const alias = modelAlias(model)
  return alias || undefined
}

// 中文：权限接口仍兼容历史模型编码，但页面模型对象优先使用公开 ID。
export function modelPermissionKey(model: Pick<ModelRecord, 'id' | 'code'>): string {
  return model.code?.trim() || model.id.trim()
}

export const MODALITY_LABELS: Record<ModelModality, string> = {
  text: '文本',
  image: '图像',
  video: '视频',
  audio: '语音',
  embedding: '向量嵌入',
  rerank: '重排序',
  speech: '语音',
  transcription: '语音转写',
  other: '其他',
}

const USER_MODEL_DEFAULT_CURRENCY = 'CNY'
const USER_MODEL_TOKEN_QUANTITY = 1_000_000
const USER_MODEL_TOKEN_THOUSAND = 1_000
const USER_MODEL_TOKEN_BILLION = 1_000_000_000
const USER_MODEL_UNKNOWN_AVAILABILITY = 0
const USER_MODEL_UNKNOWN_THROUGHPUT = 0
const USER_MODEL_UNKNOWN_DATA_LABEL = '暂无数据'

const KNOWN_MODALITIES = new Set<ModelModality>(['text', 'image', 'video', 'audio', 'embedding', 'rerank', 'speech', 'transcription'])

function normalizeModelModality(value: string): ModelModality {
  const normalized = value.trim().toLowerCase() as ModelModality
  return KNOWN_MODALITIES.has(normalized) ? normalized : 'other'
}

function formatContextWindow(tokens: number | undefined): string | undefined {
  if (!tokens || tokens <= 0) return undefined
  if (tokens >= USER_MODEL_TOKEN_QUANTITY) return `${Math.round(tokens / USER_MODEL_TOKEN_QUANTITY)}M`
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}K`
  return String(tokens)
}

function formatUserModelThroughput(totalTokens: string | number | undefined): ModelThroughput {
  const raw = typeof totalTokens === 'number'
    ? Number.isFinite(totalTokens) && totalTokens >= 0 ? Math.trunc(totalTokens).toString() : ''
    : totalTokens?.trim() ?? ''
  if (!/^\d+$/.test(raw)) return { value: USER_MODEL_UNKNOWN_THROUGHPUT, unit: USER_MODEL_UNKNOWN_DATA_LABEL }

  // 中文：累计值在接口中保持整数，页面仅在展示层换算单位，不改变服务端原始统计口径。
  const value = Number(raw)
  if (!Number.isFinite(value)) return { value: USER_MODEL_UNKNOWN_THROUGHPUT, unit: USER_MODEL_UNKNOWN_DATA_LABEL }
  if (value >= USER_MODEL_TOKEN_BILLION) return { value: Number((value / USER_MODEL_TOKEN_BILLION).toFixed(2)), unit: 'B tokens' }
  if (value >= USER_MODEL_TOKEN_QUANTITY) return { value: Number((value / USER_MODEL_TOKEN_QUANTITY).toFixed(2)), unit: 'M tokens' }
  if (value >= USER_MODEL_TOKEN_THOUSAND) return { value: Number((value / USER_MODEL_TOKEN_THOUSAND).toFixed(2)), unit: 'K tokens' }
  return { value, unit: 'token' }
}

function priceUnit(price: UserModelPrice | undefined): string {
  if (!price) return USER_MODEL_UNKNOWN_DATA_LABEL
  const currency = price.currency.trim() || USER_MODEL_DEFAULT_CURRENCY
  const currencyLabel = currency === USER_MODEL_DEFAULT_CURRENCY ? '¥' : currency
  const unit = price.unit.trim() || '单位'
  const denominator = price.unit_quantity === USER_MODEL_TOKEN_QUANTITY && unit === 'token'
    ? 'M tokens'
    : price.unit_quantity === 1 ? unit : `${price.unit_quantity} ${unit}`
  return `${currencyLabel}/${denominator}`
}

function numericPrice(price: UserModelPrice | undefined): number | undefined {
  if (!price) return undefined
  const value = Number(price.unit_price_yuan)
  return Number.isFinite(value) ? value : undefined
}

function rawPrice(price: UserModelPrice | undefined): string | undefined {
  const value = price?.unit_price_yuan.trim()
  return value && Number.isFinite(Number(value)) ? value : undefined
}

function isInputPrice(price: UserModelPrice): boolean {
  const identity = `${price.meter_kind} ${price.meter_code}`.toLowerCase()
  return identity.includes('input')
}

function isOutputPrice(price: UserModelPrice): boolean {
  const identity = `${price.meter_kind} ${price.meter_code}`.toLowerCase()
  return identity.includes('output')
}

function currentTierPrices(prices: UserModelPrice[]): UserModelPrice[] {
  if (!prices.length) return []
  const firstTier = Math.min(...prices.map((price) => price.tier_no))
  return prices.filter((price) => price.tier_no === firstTier)
}

function modelPrice(prices: UserModelPrice[]): ModelPrice {
  const currentPrices = currentTierPrices(prices)
  const input = currentPrices.find(isInputPrice)
  const output = currentPrices.find(isOutputPrice)
  const base = currentPrices.find((price) => price !== input && price !== output) ?? currentPrices[0]
  const unit = priceUnit(input ?? output ?? base)
  return {
    input: numericPrice(input),
    inputRaw: rawPrice(input),
    output: numericPrice(output),
    outputRaw: rawPrice(output),
    base: numericPrice(base),
    baseRaw: rawPrice(base),
    unit,
  }
}

export function userModelToRecord(model: UserModelItem): ModelRecord {
  const modality = normalizeModelModality(model.modality)
  const capabilities = (model.capabilities ?? []).map((capability) => capability.trim()).filter(Boolean)
  const labels = [...new Set([MODALITY_LABELS[modality], ...capabilities])]
  const currentPrice = modelPrice(model.prices ?? [])
  const id = model.id.trim()
  const alias = model.alias?.trim() || id
  return {
    id,
    code: model.code?.trim() || undefined,
    alias,
    name: model.name.trim(),
    company: model.company.trim(),
    modality,
    capabilities,
    context: formatContextWindow(model.context_window_tokens),
    description: model.description.trim(),
    officialPrice: { ...currentPrice },
    tokenNxPrice: currentPrice,
    labels,
    availability: { rate: USER_MODEL_UNKNOWN_AVAILABILITY, window: USER_MODEL_UNKNOWN_DATA_LABEL },
    providerCount: model.provider_count,
    throughput: formatUserModelThroughput(model.total_tokens),
  }
}

export function mapUserModels(items: UserModelItem[]): ModelRecord[] {
  return items.map(userModelToRecord).filter((model) => model.id && model.name && model.company)
}

export function findModelInList(models: readonly ModelRecord[], modelId: string | null | undefined): ModelRecord | undefined {
  const normalizedModelKey = modelId?.trim()
  if (!normalizedModelKey) return undefined
  return models.find((model) => model.id === normalizedModelKey || model.code === normalizedModelKey || modelAlias(model) === normalizedModelKey)
}

export function filterModelRecords(models: readonly ModelRecord[], query: string, modality: ModelModality | 'all' = 'all'): ModelRecord[] {
  const normalizedQuery = query.trim().toLowerCase()
  return models.filter((model) => {
    const matchesModality = modality === 'all' || model.modality === modality
    const searchable = [model.name, model.company, modelAlias(model), model.description, ...model.capabilities].filter(Boolean).join(' ').toLowerCase()
    return matchesModality && (!normalizedQuery || searchable.includes(normalizedQuery))
  })
}

export const MODEL_CATALOG: ModelRecord[] = [
  {
    id: 'deepseek-chat',
    alias: 'deepseek-public',
    name: 'DeepSeek V3',
    company: 'DeepSeek',
    modality: 'text',
    capabilities: ['对话', '代码', '推理'],
    context: '64K',
    maxOutput: '128K',
    description: '面向日常对话、代码生成与复杂推理的通用文本模型，适合快速验证高频开发任务。',
    officialPrice: { input: 0.14, output: 0.28, unit: '¥/M tokens' },
    tokenNxPrice: { input: 0.1, output: 0.2, unit: '¥/M tokens' },
    labels: ['文本', '折扣', '代码'],
    availability: { rate: 99.82, window: '近 24 小时' },
    providerCount: 2,
    throughput: { value: 1.77, unit: 'B tokens' },
  },
  {
    id: 'claude-sonnet-4',
    alias: 'claude-public',
    name: 'Claude Sonnet 4',
    company: 'Anthropic',
    modality: 'text',
    capabilities: ['对话', '分析', '视觉'],
    context: '200K',
    maxOutput: '128K',
    description: '偏向长上下文分析、视觉理解和结构化协作，适合需要稳定表达与多步推理的工作流。',
    officialPrice: { input: 3, output: 15, unit: '¥/M tokens' },
    tokenNxPrice: { input: 2.4, output: 12, unit: '¥/M tokens' },
    labels: ['文本', '多模态', '折扣'],
    availability: { rate: 99.97, window: '近 24 小时' },
    providerCount: 2,
    throughput: { value: 0.86, unit: 'B tokens' },
  },
  {
    id: 'gpt-4o',
    alias: 'gpt-public',
    name: 'GPT-4o',
    company: 'OpenAI',
    modality: 'text',
    capabilities: ['对话', '视觉', '音频'],
    context: '128K',
    maxOutput: '128K',
    description: '面向文本、视觉和音频的通用多模态模型，适合在同一条工作流中处理多种输入。',
    officialPrice: { input: 2.5, output: 10, unit: '¥/M tokens' },
    tokenNxPrice: { input: 2.5, output: 10, unit: '¥/M tokens' },
    labels: ['文本', '多模态', '代码'],
    availability: { rate: 99.91, window: '近 24 小时' },
    providerCount: 2,
    throughput: { value: 2.15, unit: 'B tokens' },
  },
  {
    id: 'qwen3-235b',
    alias: 'qwen-public',
    name: 'Qwen3 235B',
    company: '阿里云',
    modality: 'text',
    capabilities: ['对话', '代码'],
    context: '32K',
    maxOutput: '128K',
    description: '面向中文对话与代码任务的大参数模型，适合长文本理解和复杂问题分析。',
    officialPrice: { input: 0.4, output: 0.8, unit: '¥/M tokens' },
    tokenNxPrice: { input: 0.28, output: 0.56, unit: '¥/M tokens' },
    labels: ['文本', '折扣', '代码'],
    availability: { rate: 99.76, window: '近 24 小时' },
    providerCount: 2,
    throughput: { value: 1.12, unit: 'B tokens' },
  },
  {
    id: 'glm-4.5',
    alias: 'glm-public',
    name: 'GLM-4.5',
    company: '智谱AI',
    modality: 'text',
    capabilities: ['对话', '代码'],
    context: '128K',
    maxOutput: '128K',
    description: '强调对话、代码与推理能力的通用模型，适合中文开发场景和结构化任务。',
    officialPrice: { input: 0.5, output: 0.5, unit: '¥/M tokens' },
    tokenNxPrice: { input: 0.36, output: 0.36, unit: '¥/M tokens' },
    labels: ['文本', '折扣', '代码'],
    availability: { rate: 99.88, window: '近 24 小时' },
    providerCount: 2,
    throughput: { value: 0.74, unit: 'B tokens' },
  },
  {
    id: 'gemini-2.0-flash',
    alias: 'gemini-public',
    name: 'Gemini 2.0 Flash',
    company: 'Google',
    modality: 'text',
    capabilities: ['对话', '视觉', '音频'],
    context: '1M',
    maxOutput: '128K',
    description: '响应速度较快的多模态模型，适合轻量级对话、视觉理解和高频应用调用。',
    officialPrice: { input: 0.1, output: 0.4, unit: '¥/M tokens' },
    tokenNxPrice: { input: 0.1, output: 0.4, unit: '¥/M tokens' },
    labels: ['文本', '多模态'],
    availability: { rate: 99.94, window: '近 24 小时' },
    providerCount: 2,
    throughput: { value: 1.46, unit: 'B tokens' },
  },
  {
    id: 'llama-3.3-70b',
    alias: 'llama-public',
    name: 'Llama 3.3 70B',
    company: 'Meta',
    modality: 'text',
    capabilities: ['对话', '代码'],
    context: '128K',
    maxOutput: '128K',
    description: '适合对话与代码生成的开放模型，适用于需要灵活部署和通用文本能力的场景。',
    officialPrice: { input: 0.35, output: 0.4, unit: '¥/M tokens' },
    tokenNxPrice: { input: 0.27, output: 0.32, unit: '¥/M tokens' },
    labels: ['文本', '折扣', '代码'],
    availability: { rate: 99.72, window: '近 24 小时' },
    providerCount: 2,
    throughput: { value: 0.68, unit: 'B tokens' },
  },
  {
    id: 'mistral-large',
    alias: 'mistral-public',
    name: 'Mistral Large',
    company: 'Mistral AI',
    modality: 'text',
    capabilities: ['对话', '代码', '推理'],
    context: '128K',
    maxOutput: '128K',
    description: '面向复杂对话、代码和推理任务的通用模型，适合需要较高输出质量的工作流。',
    officialPrice: { input: 2, output: 6, unit: '¥/M tokens' },
    tokenNxPrice: { input: 1.6, output: 4.8, unit: '¥/M tokens' },
    labels: ['文本', '折扣', '代码'],
    availability: { rate: 99.84, window: '近 24 小时' },
    providerCount: 2,
    throughput: { value: 0.53, unit: 'B tokens' },
  },
  {
    id: 'moonshot-v1-128k',
    alias: 'moonshot-public',
    name: 'Moonshot v1 128K',
    company: '月之暗面',
    modality: 'text',
    capabilities: ['对话', '长文本'],
    context: '128K',
    maxOutput: '128K',
    description: '面向长文本理解与多轮对话的模型，适合文档分析、内容整理和知识问答。',
    officialPrice: { input: 1, output: 1, unit: '¥/M tokens' },
    tokenNxPrice: { input: 0.85, output: 0.85, unit: '¥/M tokens' },
    labels: ['文本', '折扣'],
    availability: { rate: 99.68, window: '近 24 小时' },
    providerCount: 2,
    throughput: { value: 0.61, unit: 'B tokens' },
  },
  {
    id: 'yi-lightning',
    alias: 'yi-public',
    name: 'Yi Lightning',
    company: '零一万物',
    modality: 'text',
    capabilities: ['对话', '代码'],
    context: '16K',
    maxOutput: '128K',
    description: '低延迟通用文本模型，适合代码辅助、快速问答和对响应速度敏感的应用。',
    officialPrice: { input: 0.12, output: 0.12, unit: '¥/M tokens' },
    tokenNxPrice: { input: 0.1, output: 0.1, unit: '¥/M tokens' },
    labels: ['文本', '折扣', '代码'],
    availability: { rate: 99.61, window: '近 24 小时' },
    providerCount: 2,
    throughput: { value: 0.32, unit: 'B tokens' },
  },
  {
    id: 'baichuan-4',
    alias: 'baichuan-public',
    name: 'Baichuan 4',
    company: '百川智能',
    modality: 'text',
    capabilities: ['对话', '代码'],
    context: '128K',
    maxOutput: '128K',
    description: '面向中文对话与代码任务的通用模型，适合企业知识问答和内容生成原型。',
    officialPrice: { input: 1, output: 1, unit: '¥/M tokens' },
    tokenNxPrice: { input: 0.8, output: 0.8, unit: '¥/M tokens' },
    labels: ['文本', '折扣', '代码'],
    availability: { rate: 99.55, window: '近 24 小时' },
    providerCount: 2,
    throughput: { value: 0.28, unit: 'B tokens' },
  },
  {
    id: 'doubao-pro',
    alias: 'doubao-public',
    name: '豆包 Pro',
    company: '字节跳动',
    modality: 'text',
    capabilities: ['对话', '创作'],
    context: '32K',
    maxOutput: '128K',
    description: '面向中文创作与日常对话的通用模型，适合内容生成和轻量级业务助手场景。',
    officialPrice: { input: 0.08, output: 0.08, unit: '¥/M tokens' },
    tokenNxPrice: { input: 0.08, output: 0.08, unit: '¥/M tokens' },
    labels: ['文本'],
    availability: { rate: 99.9, window: '近 24 小时' },
    providerCount: 2,
    throughput: { value: 1.02, unit: 'B tokens' },
  },
  {
    id: 'dall-e-3',
    alias: 'dall-e-public',
    name: 'DALL·E 3',
    company: 'OpenAI',
    modality: 'image',
    capabilities: ['图像生成'],
    description: '根据文本提示生成图像的模型，适合概念草图、营销素材和视觉方向探索。',
    officialPrice: { standard: 0.28, hd: 0.84, unit: '¥/张' },
    tokenNxPrice: { standard: 0.28, hd: 0.84, unit: '¥/张' },
    labels: ['图像'],
    availability: { rate: 99.86, window: '近 24 小时' },
    providerCount: 1,
    throughput: { value: 238, unit: 'K images' },
    params: { 尺寸: ['1024x1024', '1792x1024', '1024x1792'], 质量: ['standard', 'hd'] },
  },
  {
    id: 'midjourney-v6',
    alias: 'midjourney-public',
    name: 'Midjourney v6',
    company: 'Midjourney',
    modality: 'image',
    capabilities: ['图像生成', '风格化'],
    description: '面向风格化图像生成的模型，适合视觉创意、氛围稿和多风格方案比较。',
    officialPrice: { base: 0.6, unit: '¥/张' },
    tokenNxPrice: { base: 0.48, unit: '¥/张' },
    labels: ['图像', '折扣'],
    availability: { rate: 99.62, window: '近 24 小时' },
    providerCount: 1,
    throughput: { value: 94.2, unit: 'K images' },
    params: { 尺寸: ['1024x1024', '1024x1792', '1792x1024'], 风格: ['raw', 'anime', 'photographic'] },
  },
  {
    id: 'stable-diffusion-xl',
    alias: 'sdxl-public',
    name: 'Stable Diffusion XL',
    company: 'Stability AI',
    modality: 'image',
    capabilities: ['图像生成'],
    description: '支持多种尺寸和迭代参数的图像生成模型，适合可控的视觉原型和批量探索。',
    officialPrice: { base: 0.2, unit: '¥/张' },
    tokenNxPrice: { base: 0.16, unit: '¥/张' },
    labels: ['图像', '折扣'],
    availability: { rate: 99.73, window: '近 24 小时' },
    providerCount: 1,
    throughput: { value: 126.8, unit: 'K images' },
    params: { 尺寸: ['1024x1024', '1152x896', '896x1152'], 步数: [20, 30, 50] },
  },
  {
    id: 'cogvideo',
    alias: 'cogvideo-public',
    name: 'CogVideo',
    company: '智谱AI',
    modality: 'video',
    capabilities: ['视频生成'],
    description: '面向短视频生成的模型，适合快速验证分镜、动效和视频创意方向。',
    officialPrice: { base: 2, unit: '¥/秒' },
    tokenNxPrice: { base: 1.6, unit: '¥/秒' },
    labels: ['视频', '折扣'],
    availability: { rate: 99.48, window: '近 24 小时' },
    providerCount: 1,
    throughput: { value: 18.6, unit: 'K seconds' },
    params: { 时长: [5, 10], 分辨率: ['720p', '1080p'] },
  },
  {
    id: 'tts-1',
    alias: 'tts-public',
    name: 'TTS-1',
    company: 'OpenAI',
    modality: 'audio',
    capabilities: ['语音合成'],
    description: '将文本转换为自然语音的基础模型，适合语音提示、播报和交互原型。',
    officialPrice: { base: 0.105, unit: '¥/千字符' },
    tokenNxPrice: { base: 0.105, unit: '¥/千字符' },
    labels: ['语音'],
    availability: { rate: 99.87, window: '近 24 小时' },
    providerCount: 1,
    throughput: { value: 2.4, unit: 'M characters' },
    params: { 音色: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'], 语速: [0.5, 1, 1.5, 2] },
  },
  {
    id: 'tts-hd',
    alias: 'tts-hd-public',
    name: 'TTS-1 HD',
    company: 'OpenAI',
    modality: 'audio',
    capabilities: ['语音合成', '高清'],
    description: '强调音质表现的文本转语音模型，适合需要更清晰听感的播报和内容制作。',
    officialPrice: { base: 0.21, unit: '¥/千字符' },
    tokenNxPrice: { base: 0.21, unit: '¥/千字符' },
    labels: ['语音', '高清'],
    availability: { rate: 99.92, window: '近 24 小时' },
    providerCount: 1,
    throughput: { value: 1.1, unit: 'M characters' },
    params: { 音色: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'], 语速: [0.5, 1, 1.5, 2] },
  },
]

export function findModel(modelId: string | null | undefined): ModelRecord | undefined {
  const normalizedModelKey = modelId?.trim()
  if (!normalizedModelKey) return undefined
  return MODEL_CATALOG.find((model) => model.id === normalizedModelKey || modelAlias(model) === normalizedModelKey)
}

export function filterModels(query: string, modality: ModelModality | 'all' = 'all'): ModelRecord[] {
  return filterModelRecords(MODEL_CATALOG, query, modality)
}

export function formatModelPrice(price: ModelPrice): string {
  const input = formatDecimal(price.input)
  const output = formatDecimal(price.output)
  if (input !== null && output !== null) {
    return `${input} / ${output} ${price.unit}`
  }
  const standard = formatDecimal(price.standard)
  const hd = formatDecimal(price.hd)
  if (standard !== null && hd !== null) {
    return `标准 ${standard} / 高清 ${hd} ${price.unit}`
  }
  const base = formatDecimal(price.base)
  if (base !== null) {
    return `${base} ${price.unit}`
  }
  return '待核验'
}

export function priceSaving(model: ModelRecord): number {
  const official = model.officialPrice.input ?? model.officialPrice.base ?? model.officialPrice.standard ?? 0
  const current = model.tokenNxPrice.input ?? model.tokenNxPrice.base ?? model.tokenNxPrice.standard ?? 0
  if (!official || current >= official) return 0
  return Math.round((1 - current / official) * 100)
}
