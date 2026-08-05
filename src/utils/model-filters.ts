import type { ModelPrice, ModelRecord } from '@/data/models'

export const MODEL_CATEGORIES = [
  { value: 'all', labelKey: 'console.common.all' },
  { value: 'text', labelKey: 'console.common.text' },
  { value: 'image', labelKey: 'console.common.image' },
  { value: 'audio', labelKey: 'console.common.audio' },
  { value: 'video', labelKey: 'console.common.video' },
  { value: 'embedding', labelKey: 'console.common.embedding' },
  { value: 'rerank', labelKey: 'console.common.rerank' },
  { value: 'speech', labelKey: 'console.common.speech' },
  { value: 'transcription', labelKey: 'console.common.transcription' },
] as const

export type ModelCategory = typeof MODEL_CATEGORIES[number]['value']

export const MODEL_PRICE_FILTERS = [
  { value: 'all', labelKey: 'console.common.all' },
  { value: 'discount', labelKey: 'console.models.discount' },
  { value: 'free', labelKey: 'console.models.free' },
] as const

export type ModelPriceFilter = typeof MODEL_PRICE_FILTERS[number]['value']

export const MODEL_SORTS = [
  { value: 'default', labelKey: 'console.models.defaultOrder' },
  { value: 'price-asc', labelKey: 'console.models.priceAsc' },
  { value: 'price-desc', labelKey: 'console.models.priceDesc' },
] as const

export type ModelSort = typeof MODEL_SORTS[number]['value']

export const MODEL_PAGE_SIZES = [10, 20, 50, 100] as const
export const DEFAULT_MODEL_PAGE_SIZE = MODEL_PAGE_SIZES[0]
const FIRST_MODEL_PAGE = 1
const PRICE_KEYS: Array<keyof ModelPrice> = ['input', 'base', 'standard', 'output', 'hd']

export interface ModelFilterOptions {
  query?: string
  company?: string
  category?: ModelCategory
  priceFilter?: ModelPriceFilter
  sort?: ModelSort
}

export interface ModelPage<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
  start: number
  end: number
}

function normalizedValue(value: string): string {
  return value.trim().toLowerCase()
}

function capabilityMatches(capability: string, aliases: readonly string[]): boolean {
  const normalizedCapability = normalizedValue(capability)
  return aliases.some((alias) => normalizedCapability === normalizedValue(alias))
}

function hasCapability(model: ModelRecord, aliases: readonly string[]): boolean {
  return model.capabilities.some((capability) => capabilityMatches(capability, aliases))
}

export function modelMatchesCategory(model: ModelRecord, category: ModelCategory = 'all'): boolean {
  switch (category) {
    case 'all':
      return true
    case 'text':
    case 'image':
    case 'audio':
    case 'video':
      return model.modality === category
    case 'embedding':
      return model.modality === category || hasCapability(model, ['向量嵌入', 'embedding', 'embeddings'])
    case 'rerank':
      return model.modality === category || hasCapability(model, ['重排序', 'rerank'])
    case 'speech':
      return model.modality === category || hasCapability(model, ['语音', '语音合成', 'speech', 'tts'])
    case 'transcription':
      return model.modality === category || hasCapability(model, ['语音转写', '转写', 'transcription', 'stt'])
  }
}

function finitePriceValues(price: ModelPrice): number[] {
  return PRICE_KEYS
    .map((key) => price[key])
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0)
}

function comparablePricePairs(model: ModelRecord): Array<[number, number]> {
  return PRICE_KEYS.flatMap((key) => {
    const official = model.officialPrice[key]
    const current = model.tokenNxPrice[key]
    if (typeof official !== 'number' || !Number.isFinite(official) || official < 0) return []
    if (typeof current !== 'number' || !Number.isFinite(current) || current < 0) return []
    return [[official, current]]
  })
}

export function modelIsDiscounted(model: ModelRecord): boolean {
  return comparablePricePairs(model).some(([official, current]) => official > 0 && current < official)
}

export function modelIsFree(model: ModelRecord): boolean {
  const values = finitePriceValues(model.tokenNxPrice)
  return values.length > 0 && values.every((value) => value === 0)
}

export function modelPriceForSort(model: ModelRecord): number | null {
  for (const key of PRICE_KEYS) {
    const value = model.tokenNxPrice[key]
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value
  }
  return null
}

export function filterAndSortModels(models: readonly ModelRecord[], options: ModelFilterOptions = {}): ModelRecord[] {
  const query = normalizedValue(options.query ?? '')
  const company = options.company && options.company !== 'all' ? options.company : ''
  const category = options.category ?? 'all'
  const priceFilter = options.priceFilter ?? 'all'
  const sort = options.sort ?? 'default'
  const filtered = models.filter((model) => {
    const searchable = [model.name, model.company, model.id, model.alias ?? ''].map(normalizedValue).join(' ')
    if (query && !searchable.includes(query)) return false
    if (company && model.company !== company) return false
    if (!modelMatchesCategory(model, category)) return false
    if (priceFilter === 'discount' && !modelIsDiscounted(model)) return false
    if (priceFilter === 'free' && !modelIsFree(model)) return false
    return true
  })

  if (sort === 'default') return filtered

  const direction = sort === 'price-asc' ? 1 : -1
  return filtered
    .map((model, index) => ({ model, index, price: modelPriceForSort(model) }))
    .sort((left, right) => {
      if (left.price === null && right.price === null) return left.index - right.index
      if (left.price === null) return 1
      if (right.price === null) return -1
      return (left.price - right.price) * direction || left.index - right.index
    })
    .map(({ model }) => model)
}

export function modelCategoryCounts(models: readonly ModelRecord[], options: Omit<ModelFilterOptions, 'category' | 'sort'> = {}): Record<ModelCategory, number> {
  return MODEL_CATEGORIES.reduce((counts, category) => {
    counts[category.value] = filterAndSortModels(models, { ...options, category: category.value, sort: 'default' }).length
    return counts
  }, {} as Record<ModelCategory, number>)
}

export function paginateModels<T>(items: readonly T[], requestedPage: number, requestedPageSize: number): ModelPage<T> {
  const pageSize = MODEL_PAGE_SIZES.includes(requestedPageSize as typeof MODEL_PAGE_SIZES[number])
    ? requestedPageSize
    : DEFAULT_MODEL_PAGE_SIZE
  const total = items.length
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize)
  const page = Math.min(Math.max(Number.isFinite(requestedPage) ? Math.trunc(requestedPage) : FIRST_MODEL_PAGE, FIRST_MODEL_PAGE), Math.max(totalPages, FIRST_MODEL_PAGE))
  const startIndex = (page - FIRST_MODEL_PAGE) * pageSize
  const start = total === 0 ? 0 : startIndex + FIRST_MODEL_PAGE
  const end = Math.min(startIndex + pageSize, total)

  return {
    items: items.slice(startIndex, end),
    page,
    pageSize,
    total,
    totalPages,
    start,
    end,
  }
}
