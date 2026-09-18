import { describe, expect, it } from 'vitest'
import type { UserModelItem, UserModelParameterConfig, UserModelPricingPeriod } from '@/api/user-models'
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

  it('完整保留峰谷时段和全部规则，并以扁平价格作为当前生效价', () => {
    const periods: UserModelPricingPeriod[] = [
      {
        key: 'peak', name: '高峰', default: false, weekday_mask: 31, start_minute: 480, end_minute: 1200,
        rules: [
          { kind: 'token', meter_code: 'input_token', tier_no: 1, lower_bound: 0, upper_bound: 128000, unit_quantity: 1000000, unit_price_yuan: '1.234567890123456789', rounding_mode: 'half_even' },
          { kind: 'token', meter_code: 'input_token', tier_no: 2, lower_bound: 128000, unit_quantity: 1000000, unit_price_yuan: '2.000000', rounding_mode: 'up' },
          { kind: 'request', meter_code: 'image_generation', tier_no: 0, lower_bound: 0, unit_quantity: 1, unit_price_yuan: '0.00000001', rounding_mode: 'half_up', width: 1024, height: 768, quality_level: 'hd', conditions: { resolution: '1024x768' } },
          { kind: 'usage', meter_code: 'video_seconds', tier_no: 0, lower_bound: 0, unit_quantity: 1, unit_price_yuan: '0.80', rounding_mode: 'down', duration_seconds: 5, conditions: { resolution: '720p' } },
          { kind: 'tool', meter_code: 'web_search', tier_no: 0, lower_bound: 0, unit_quantity: 1000, unit_price_yuan: '0.00', rounding_mode: 'up', tool_code: 'web_search' },
        ],
      },
      {
        key: 'off-peak', name: '低谷', default: true, weekday_mask: 127, start_minute: 0, end_minute: 1440,
        rules: [{ kind: 'token', meter_code: 'input_token', tier_no: 1, lower_bound: 0, unit_quantity: 1000000, unit_price_yuan: '0.50', rounding_mode: 'up' }],
      },
    ]
    const prices = [{ meter_code: 'input_token', meter_kind: 'input_token', unit: 'token', currency: 'CNY', unit_quantity: 1000000, unit_price_yuan: '0.50', tier_no: 1, period_key: 'off-peak', rule_kind: 'token' as const }]
    const [model] = mapUserModels([{
      id: 'period-model', name: 'Period Model', company: 'Provider', modality: 'text', billing_mode: 'token',
      description: '', capabilities: null, provider_count: 1, prices,
      pricing_timezone: 'Asia/Shanghai', pricing_periods: periods, current_period_key: 'off-peak',
    }])

    expect(model.pricingTimezone).toBe('Asia/Shanghai')
    expect(model.currentPeriodKey).toBe('off-peak')
    expect(model.pricingPeriods).toEqual(periods)
    expect(model.prices).toEqual(prices)
    expect(model.tokenNxPrice).toMatchObject({ input: 0.5, inputRaw: '0.50', unit: '¥/M tokens' })
    expect(model.pricingPeriods?.[0].rules[0].unit_price_yuan).toBe('1.234567890123456789')
    expect(model.pricingPeriods?.[0].rules[1]).not.toHaveProperty('upper_bound')
  })

  it('兼容没有峰谷价字段的历史响应并保留新接口的空定价状态', () => {
    const legacy: UserModelItem = {
      id: 'legacy-model', name: 'Legacy Model', company: 'Provider', modality: 'text', billing_mode: 'token',
      description: '', capabilities: null, provider_count: 1, prices: null,
    }
    const [oldModel, emptyModel] = mapUserModels([
      legacy,
      { ...legacy, id: 'empty-pricing-model', pricing_timezone: '', pricing_periods: [], current_period_key: '' },
    ])

    expect(oldModel).not.toHaveProperty('pricingTimezone')
    expect(oldModel).not.toHaveProperty('pricingPeriods')
    expect(oldModel).not.toHaveProperty('currentPeriodKey')
    expect(emptyModel).toMatchObject({ pricingTimezone: '', pricingPeriods: [], currentPeriodKey: '' })
    expect(emptyModel.tokenNxPrice).toEqual(oldModel.tokenNxPrice)
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

  it('透传视频能力并保留禁止上传、可选提示词和空枚举', () => {
    const legacy: UserModelItem = {
      id: 'video-model', name: 'Video Model', company: 'Provider', modality: 'video', billing_mode: 'token',
      description: '', capabilities: null, provider_count: 1, prices: null,
    }
    const videoOptions = {
      family: 'seedance', ratios: [], resolutions: ['480p', '720p', '1080p'], min_duration: 4, max_duration: 30,
      default_duration: -1, default_resolution: '1080p', auto_duration: true, max_images: 0, max_videos: 10,
      max_audios: 0, requires_prompt: false, output_meter: 'output_token',
    }
    const [oldModel, configuredModel, emptyModel, nullModel] = mapUserModels([
      legacy,
      { ...legacy, video_options: videoOptions },
      { ...legacy, video_options: {} },
      { ...legacy, video_options: null },
    ])

    expect(oldModel).not.toHaveProperty('videoOptions')
    expect(configuredModel.videoOptions).toEqual(videoOptions)
    expect(emptyModel.videoOptions).toEqual({})
    expect(nullModel.videoOptions).toBeNull()
  })

  it('完整透传视频条件规则、素材规格和高级控制，不合并兼容选项', () => {
    const parameterConfig: UserModelParameterConfig = {
      schema_version: 1,
      video: {
        protocol: 'seedance', max_request_bytes: 64 * 1024 * 1024,
        modes: ['text_to_video', 'image_to_video', 'first_last_frame', 'reference_to_video', 'video_edit', 'video_extend'],
        resolutions: ['720p', '1080p'], ratios: ['adaptive', '16:9'], sizes: [{ width: 1280, height: 720 }],
        durations: { min: 4, max: 30, step: 2, auto: true, omit_allowed: true },
        defaults: { mode: 'text_to_video', resolution: '720p', ratio: 'adaptive', size: { width: 1280, height: 720 }, duration: -1 },
        media: {
          min_total: 0, max_total: 2,
          roles: { first_frame: { min: 0, max: 1 }, last_frame: { min: 0, max: 1 }, reference_image: { min: 0, max: 2 }, source_video: { min: 0, max: 0 } },
          dependencies: [{ role: 'last_frame', requires: ['first_frame'] }, { role: 'reference_audio', requires_any: ['reference_image', 'reference_video'] }],
          exclusive_groups: [['first_frame', 'reference_image']],
        },
        generate_audio: { supported: true, default: false },
        controls: {
          watermark: { supported: true, default: false }, return_last_frame: { supported: false }, web_search: { supported: false },
          output_format: { supported: true, values: ['mp4', 'mov'], default: 'mp4' },
          omni_reference_task_type: { supported: true, values: ['reference', 'edit', 'extend'] },
          service_tier: { supported: true, values: ['default'], default: 'default' },
          callback_url: { supported: true, format: 'http_url', max_length: 2048 },
          safety_identifier: { supported: true, max_length: 64, ascii: true },
          priority: { supported: true, min: 0, max: 9, default: 0 },
          execution_expires_after: { supported: true, min: 3600, max: 259200, default: 172800 },
        },
        input_media: {
          image: { validation: 'provider', formats: ['jpeg', 'png'], max_bytes: 30 * 1024 * 1024, max_bytes_exclusive: true, min_width: 300, max_width: 6000, min_height: 300, max_height: 6000, min_ratio: 0.4, max_ratio: 2.5, min_pixels: 90000, max_pixels: 36000000 },
          video: { validation: 'provider', formats: ['mp4'], max_bytes: 50 * 1024 * 1024, min_duration: 2, max_duration: 15, max_total_duration: 15, min_fps: 24, max_fps: 60 },
          audio: { validation: 'provider', formats: ['mp3'], max_bytes: 15 * 1024 * 1024, min_duration: 2, max_duration: 15, max_total_duration: 15 },
        },
        rules: [{ mode: 'video_edit', resolution: '720p', ratio: 'adaptive', sizes: [{ width: 1280, height: 720 }], durations: { min: 4, max: 30, step: 2, auto: true, auto_only: true }, media: { min_total: 1, max_total: 1, roles: { reference_video: { min: 1, max: 1 } } }, allowed_ratios: ['adaptive'], default_ratio: 'adaptive', default_duration: -1, input_media: { video: { validation: 'provider', formats: ['mp4'], max_bytes: 30 * 1024 * 1024, max_duration: 10 } } }],
      },
    }
    const [model] = mapUserModels([{
      id: 'configured-video', name: '配置视频', company: '厂商', modality: 'video', billing_mode: 'usage', description: '', capabilities: null, provider_count: 1, prices: null,
      parameter_config: parameterConfig, parameter_version: '9007199254740993001',
      video_options: { ratios: ['21:9'], default_duration: 5, max_images: 99 },
    }])

    expect(model.parameterConfig).toEqual(parameterConfig)
    expect(model.parameterVersion).toBe('9007199254740993001')
    expect(model.parameterConfig?.video?.ratios).toEqual(['adaptive', '16:9'])
    expect(model.parameterConfig?.video?.defaults.duration).toBe(-1)
    expect(model.parameterConfig?.video?.media.max_total).toBe(2)
    expect(model.parameterConfig?.video?.controls?.priority?.default).toBe(0)
    expect(model.parameterConfig?.video?.controls?.watermark?.default).toBe(false)
    expect(model.parameterConfig?.video?.controls?.return_last_frame).not.toHaveProperty('default')
  })

  it('参数映射区分缺失配置、可空集合和空默认值，并兼容旧版比例为null', () => {
    const legacy: UserModelItem = {
      id: 'legacy', name: 'Legacy', company: '厂商', modality: 'video', billing_mode: 'usage', description: '', capabilities: null, provider_count: 1, prices: null,
    }
    const parameterConfig: UserModelParameterConfig = {
      schema_version: 1,
      video: { modes: ['text_to_video'], resolutions: ['720p'], ratios: null, sizes: null, durations: { values: [5, 10], auto: false }, defaults: {}, media: { min_total: 0, max_total: 0, roles: null }, generate_audio: { supported: false } },
      text: { reasoning: { supported: true, default_enabled: false }, temperature: { supported: true, default: 0 } },
    }
    const [oldModel, configuredModel, compatibleModel] = mapUserModels([
      legacy,
      { ...legacy, parameter_config: parameterConfig, parameter_version: '1' },
      { ...legacy, parameter_version: '2', video_options: { ratios: null, auto_duration: false, max_images: 0, default_duration_source: 'provider' } },
    ])

    expect(oldModel).not.toHaveProperty('parameterConfig')
    expect(oldModel).not.toHaveProperty('parameterVersion')
    expect(configuredModel.parameterConfig).toEqual(parameterConfig)
    expect(configuredModel.parameterConfig?.video?.defaults).toEqual({})
    expect(configuredModel.parameterConfig?.video?.ratios).toBeNull()
    expect(configuredModel.parameterConfig?.video?.sizes).toBeNull()
    expect(configuredModel.parameterConfig?.video?.media).toEqual({ min_total: 0, max_total: 0, roles: null })
    expect(configuredModel).not.toHaveProperty('videoOptions')
    expect(compatibleModel).not.toHaveProperty('parameterConfig')
    expect(compatibleModel.parameterVersion).toBe('2')
    expect(compatibleModel.videoOptions).toEqual({ ratios: null, auto_duration: false, max_images: 0, default_duration_source: 'provider' })
  })
})
