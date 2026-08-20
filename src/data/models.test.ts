import { describe, expect, it } from 'vitest'
import type { UserModelItem } from '@/api/user-models'
import { filterModelRecords, filterModels, findModel, formatModelPrice, mapUserModels, MODEL_CATALOG, modelAlias, modelPermissionKey, priceSaving } from './models'

describe('模型目录业务规则', () => {
  it('按名称、公司、能力和模型别名搜索模型', () => {
    expect(filterModels('DeepSeek')).toHaveLength(1)
    expect(filterModels('代码').length).toBeGreaterThan(1)
    expect(filterModels('deepseek-public')[0]?.alias).toBe('deepseek-public')
    expect(filterModels('deepseek-chat')).toHaveLength(0)
    expect(filterModels('不存在的模型')).toHaveLength(0)
  })

  it('按模型类型过滤，全部类型保留完整目录', () => {
    expect(filterModels('', 'image').every((model) => model.modality === 'image')).toBe(true)
    expect(filterModels('', 'all')).toHaveLength(MODEL_CATALOG.length)
  })

  it('支持别名查找并对缺失模型保持未定义', () => {
    expect(findModel('gpt-4o')?.company).toBe('OpenAI')
    expect(findModel('gpt-public')?.id).toBe('gpt-4o')
    expect(findModel('missing-model')).toBeUndefined()
  })

  it('格式化文本、图片和生成类模型价格', () => {
    const textModel = findModel('deepseek-chat')!
    const imageModel = findModel('dall-e-3')!
    expect(formatModelPrice(textModel.tokenNxPrice)).toContain('¥/M tokens')
    expect(formatModelPrice(imageModel.tokenNxPrice)).toContain('标准')
    expect(priceSaving(textModel)).toBeGreaterThan(0)
    expect(priceSaving(findModel('gpt-4o')!)).toBe(0)
    expect(formatModelPrice({ base: 0.2, unit: '¥/张' })).toContain('0.200')
    expect(formatModelPrice({ unit: '¥/次' })).toBe('待核验')
    expect(priceSaving({ officialPrice: { input: 0, output: 0, unit: '¥/M' }, tokenNxPrice: { input: 0, output: 0, unit: '¥/M' } } as typeof textModel)).toBe(0)
  })

  it('将用户可见模型目录转换为控制台统一模型结构并保留当前价格', () => {
    const [model, unknownModel] = mapUserModels([
      {
        id: 'model-public-backend-chat', code: 'backend-chat', alias: 'backend-public', name: 'Backend Chat', company: '服务商', modality: 'text', billing_mode: 'token',
        context_window_tokens: 128000, description: '后端模型', capabilities: ['chat', 'streaming'], provider_count: 2, total_tokens: '1770000000',
        prices: [
          { meter_code: 'input', meter_kind: 'input_token', unit: 'token', currency: 'CNY', unit_quantity: 1000000, unit_price_yuan: '0.25', tier_no: 0 },
          { meter_code: 'output', meter_kind: 'output_token', unit: 'token', currency: 'CNY', unit_quantity: 1000000, unit_price_yuan: '0.50', tier_no: 0 },
        ],
      },
      {
        id: 'model-public-backend-other', code: 'backend-other', name: 'Backend Other', company: '服务商', modality: 'custom', billing_mode: 'request',
        description: '', capabilities: null, provider_count: 1, prices: null,
      },
    ])

    expect(model).toMatchObject({ id: 'model-public-backend-chat', code: 'backend-chat', alias: 'backend-public', modality: 'text', context: '128K', providerCount: 2 })
    expect(model.tokenNxPrice).toMatchObject({ input: 0.25, inputRaw: '0.25', output: 0.5, outputRaw: '0.50', unit: '¥/M tokens' })
    expect(model.throughput).toEqual({ value: 1.77, unit: 'B tokens' })
    expect(model.labels).toEqual(['文本', 'chat', 'streaming'])
    expect(filterModelRecords([model], 'backend-public')).toEqual([model])
    expect(unknownModel.modality).toBe('other')
    expect(unknownModel.alias).toBe('model-public-backend-other')
    expect(modelAlias(unknownModel)).toBe('model-public-backend-other')
    expect(modelPermissionKey(model)).toBe('backend-chat')
  })

  it('按累计 Token 数量换算模型卡片展示单位并拒绝非法统计值', () => {
    const item = (id: string, total_tokens: string): UserModelItem => ({
      id, name: id, company: '服务商', modality: 'text', billing_mode: 'token', description: '',
      capabilities: null, provider_count: 0, total_tokens, prices: null,
    })
    const [million, thousand, small, invalid] = mapUserModels([
      item('million', '1200000'), item('thousand', '1200'), item('small', '999'), item('invalid', 'not-a-number'),
    ])

    expect(million.throughput).toEqual({ value: 1.2, unit: 'M tokens' })
    expect(thousand.throughput).toEqual({ value: 1.2, unit: 'K tokens' })
    expect(small.throughput).toEqual({ value: 999, unit: 'token' })
    expect(invalid.throughput).toEqual({ value: 0, unit: '暂无数据' })
  })

  it('映射模型图标、标签、活动、输出上限和可用率统计', () => {
    const [model] = mapUserModels([{
      id: 'model-new-fields', name: 'New Fields', company: 'Provider', modality: 'multimodal', billing_mode: 'token', description: '', capabilities: ['chat'], provider_count: 2, prices: null,
      icon_url: 'https://example.com/model.png', max_tokens: 8192,
      tags: [{ label: '推荐', color: '#2563EB' }],
      activities: [{ id: 'activity-summer', name: '夏季活动', status: 'active', sort_order: 10 }],
      activity_ids: ['activity-summer'],
      availability: { rate: 99.5, sample_count: 200, success_count: 199, window_hours: 48 },
    }])

    expect(model).toMatchObject({ iconUrl: 'https://example.com/model.png', modality: 'multimodal', maxOutput: '8K', activityIds: ['activity-summer'] })
    expect(model.tags).toEqual([{ label: '推荐', color: '#2563EB' }])
    expect(model.availability).toMatchObject({ rate: 99.5, window: '48h', sampleCount: 200, successCount: 199 })
  })
})
