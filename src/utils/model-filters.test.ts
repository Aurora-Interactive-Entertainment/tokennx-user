import { describe, expect, it } from 'vitest'
import { userModelToRecord, type ModelRecord } from '@/data/models'
import type { UserModelPrice } from '@/api/user-models'
import { MODEL_CATEGORIES, MODEL_PRICE_FILTERS, MODEL_SORTS, filterAndSortModels, modelCategoryCounts, modelIsDiscounted, modelIsFree, modelMatchesCategory, paginateModels } from './model-filters'

const baseModel: ModelRecord = {
  id: 'model-base',
  alias: 'base-public',
  name: 'Base Model',
  company: 'Base Company',
  modality: 'text',
  capabilities: ['对话'],
  context: '32K',
  description: '基础模型',
  officialPrice: { input: 1, output: 2, unit: '¥/M tokens' },
  tokenNxPrice: { input: 1, output: 2, unit: '¥/M tokens' },
  labels: ['文本'],
  availability: { rate: 0, window: '后端未提供' },
  providerCount: 1,
  throughput: { value: 0, unit: '后端未提供' },
}

function model(overrides: Partial<ModelRecord>): ModelRecord {
  return { ...baseModel, ...overrides }
}

describe('模型广场筛选与分页规则', () => {
  it('筛选选项使用稳定值和翻译键，语言切换不依赖中文展示文案', () => {
    expect(MODEL_CATEGORIES[0]).toEqual({ value: 'all', labelKey: 'console.common.all' })
    expect(MODEL_CATEGORIES.map((item) => item.labelKey)).toContain('console.common.embedding')
    expect(MODEL_PRICE_FILTERS.map((item) => item.labelKey)).toEqual(['console.common.all', 'console.models.discount', 'console.models.free'])
    expect(MODEL_SORTS.map((item) => item.labelKey)).toEqual(['console.models.defaultOrder', 'console.models.priceAsc', 'console.models.priceDesc'])
  })

  it('按模态和能力匹配全部设计稿分类', () => {
    const embedding = model({ id: 'embedding', modality: 'other', capabilities: ['embedding'] })
    const rerank = model({ id: 'rerank', modality: 'rerank', capabilities: [] })
    const speech = model({ id: 'speech', modality: 'text', capabilities: ['语音合成'] })
    const transcription = model({ id: 'transcription', modality: 'audio', capabilities: ['语音转写'] })

    expect(modelMatchesCategory(embedding, 'embedding')).toBe(true)
    expect(modelMatchesCategory(rerank, 'rerank')).toBe(true)
    expect(modelMatchesCategory(speech, 'speech')).toBe(true)
    expect(modelMatchesCategory(transcription, 'transcription')).toBe(true)
    expect(modelMatchesCategory(transcription, 'speech')).toBe(false)
  })

  it('组合搜索、公司和价格状态筛选', () => {
    const discounted = model({ id: 'discounted', name: 'Vision Pro', company: 'Acme', officialPrice: { base: 2, unit: '¥/次' }, tokenNxPrice: { base: 1, unit: '¥/次' } })
    const free = model({ id: 'free', name: 'Free Chat', company: 'Acme', officialPrice: { input: 0, output: 0, unit: '¥/M tokens' }, tokenNxPrice: { input: 0, output: 0, unit: '¥/M tokens' } })
    const models = [discounted, free, model({ id: 'other-company', name: 'Vision Lite', company: 'Other' })]

    expect(filterAndSortModels(models, { query: 'vision', company: 'Acme' })).toEqual([discounted])
    expect(filterAndSortModels(models, { priceFilter: 'discount' })).toEqual([discounted])
    expect(filterAndSortModels(models, { priceFilter: 'free' })).toEqual([free])
    expect(modelIsDiscounted(discounted)).toBe(true)
    expect(modelIsFree(free)).toBe(true)
    expect(modelIsFree(model({ tokenNxPrice: { unit: '¥/次' } }))).toBe(false)
  })

  it('价格排序稳定，并将没有价格的模型放到末尾', () => {
    const models = [
      model({ id: 'same-first', tokenNxPrice: { input: 1, unit: '¥/M tokens' } }),
      model({ id: 'no-price', tokenNxPrice: { unit: '待核验' } }),
      model({ id: 'low', tokenNxPrice: { input: 0.5, unit: '¥/M tokens' } }),
      model({ id: 'same-second', tokenNxPrice: { input: 1, unit: '¥/M tokens' } }),
    ]

    expect(filterAndSortModels(models, { sort: 'price-asc' }).map((item) => item.id)).toEqual(['low', 'same-first', 'same-second', 'no-price'])
    expect(filterAndSortModels(models, { sort: 'price-desc' }).map((item) => item.id)).toEqual(['same-first', 'same-second', 'low', 'no-price'])
  })

  it('按相同计费单位比较接口价格，输入价相同时继续比较输出价', () => {
    const quoted = (id: string, input: string, output: string, quantity: number) => userModelToRecord({
      id, name: id, company: 'Example', modality: 'text', billing_mode: 'token', description: '', capabilities: [], provider_count: 1,
      prices: [
        { meter_code: 'input_token', meter_kind: 'input_token', unit: 'token', currency: 'CNY', unit_quantity: quantity, unit_price_yuan: input, tier_no: 1 },
        { meter_code: 'output_token', meter_kind: 'output_token', unit: 'token', currency: 'CNY', unit_quantity: quantity, unit_price_yuan: output, tier_no: 1 },
      ],
    })
    const models = [quoted('expensive', '0.02', '0.04', 1000), quoted('higher-output', '6.4', '30', 1_000_000), quoted('lower-output', '6.4', '22.4', 1_000_000)]
    expect(filterAndSortModels(models, { sort: 'price-asc' }).map(({ id }) => id)).toEqual(['lower-output', 'higher-output', 'expensive'])
    expect(filterAndSortModels(models, { sort: 'price-desc' }).map(({ id }) => id)).toEqual(['expensive', 'higher-output', 'lower-output'])
    expect(filterAndSortModels(models, { sort: 'default' })).toEqual(models)
    const samePrices = [quoted('glm5.2', '6.4', '22.4', 1_000_000), quoted('glm5.3', '6.4', '22.4', 1_000_000)]
    expect(filterAndSortModels(samePrices, { sort: 'price-asc' })).toEqual(samePrices)
    expect(filterAndSortModels(samePrices, { sort: 'price-desc' })).toEqual(samePrices)
  })

  it('不把缓存价当输入价；无效报价置后，零价仍参与排序', () => {
    const price = (meter: string, amount: string, quantity = 1_000_000): UserModelPrice => ({ meter_code: meter, meter_kind: meter, unit: 'token', currency: 'CNY', unit_quantity: quantity, unit_price_yuan: amount, tier_no: 1 })
    const models = [
      model({ id: 'cached', prices: [price('cache_read_input_token', '0.1'), price('input_token', '8')] }),
      model({ id: 'cheaper', prices: [price('input_token', '6.4')] }),
      model({ id: 'invalid', prices: [price('input_token', '', 0)] }),
      model({ id: 'free', prices: [price('input_token', '0')] }),
    ]
    expect(filterAndSortModels(models, { sort: 'price-asc' }).map(({ id }) => id)).toEqual(['free', 'cheaper', 'cached', 'invalid'])
    expect(filterAndSortModels(models, { sort: 'price-desc' }).map(({ id }) => id)).toEqual(['cached', 'cheaper', 'free', 'invalid'])
  })

  it('在当前搜索、公司和价格条件下计算分类数量', () => {
    const models = [
      model({ id: 'text-acme', company: 'Acme' }),
      model({ id: 'image-acme', name: 'Image', company: 'Acme', modality: 'image' }),
      model({ id: 'image-other', name: 'Image', company: 'Other', modality: 'image' }),
    ]

    expect(modelCategoryCounts(models, { query: 'image', company: 'Acme' })).toMatchObject({ all: 1, image: 1, text: 0 })
  })

  it('分页会修正非法页码、非法页大小并返回展示范围', () => {
    const items = Array.from({ length: 21 }, (_, index) => `model-${index + 1}`)

    expect(paginateModels(items, 2, 10)).toMatchObject({ page: 2, pageSize: 10, total: 21, totalPages: 3, start: 11, end: 20, items: items.slice(10, 20) })
    expect(paginateModels(items, 99, 10).page).toBe(3)
    expect(paginateModels(items, 0, 15).pageSize).toBe(10)
    expect(paginateModels([], 3, 10)).toMatchObject({ page: 1, totalPages: 0, start: 0, end: 0, items: [] })
  })
})
