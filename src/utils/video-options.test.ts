import { describe, expect, it } from 'vitest'
import type { UserModelParameterConfig, UserVideoMediaConfig, UserVideoOptions, UserVideoParameterConfig } from '@/api/user-models'
import { getVideoReferenceRole, initialVideoDuration, isVideoDurationAllowed, nearestAllowedVideoDuration, normalizeVideoOptions, resolveVideoMode, resolveVideoReferenceMode, validateVideoParameters, validateVideoReferences, type VideoParameterReference } from './video-options'

const COMPAT_OPTIONS: UserVideoOptions = {
  family: 'wan3', ratios: ['adaptive', '16:9', '9:16'], resolutions: ['480p', '720p', '1080p'], min_duration: 2, max_duration: 30,
  default_duration: 5, default_resolution: '1080p', auto_duration: true, max_images: 10, max_videos: 5, max_audios: 5, requires_prompt: false, output_meter: 'video_seconds',
}

function contract(overrides: Partial<UserVideoParameterConfig> = {}): UserModelParameterConfig {
  return { schema_version: 1, video: {
    protocol: 'seedance', modes: ['text_to_video', 'image_to_video', 'first_last_frame', 'reference_to_video', 'video_edit', 'video_extend'],
    resolutions: ['480p', '720p', '1080p'], ratios: ['adaptive', '16:9', '9:16'], sizes: null,
    durations: { min: 4, max: 30, step: 1, auto: true }, defaults: { mode: 'text_to_video', duration: 5, resolution: '720p', ratio: '16:9' },
    media: { min_total: 0, max_total: 12, roles: { first_frame: { min: 0, max: 1 }, last_frame: { min: 0, max: 1 }, reference_image: { min: 0, max: 9 }, reference_video: { min: 0, max: 3 }, reference_audio: { min: 0, max: 3 }, source_video: { min: 0, max: 1 } }, dependencies: [{ role: 'last_frame', requires: ['first_frame'] }], exclusive_groups: [['first_frame', 'reference_image'], ['last_frame', 'reference_image']] },
    ...overrides,
  } }
}
const image = (role: VideoParameterReference['role'] = 'reference_image'): VideoParameterReference => ({ type: 'image', role, url: 'https://cdn.example.com/image.png' })
const video = (role: VideoParameterReference['role'] = 'reference_video'): VideoParameterReference => ({ type: 'video', role, url: 'https://cdn.example.com/video.mp4' })
const validParameters = { prompt: '海边日落', duration: 5, ratio: '16:9', resolution: '720p', mode: 'text_to_video' }

describe('视频模型参数合同', () => {
  it('表单预选优先默认时长，缺省时只选择合法档位，不改写合同默认值', () => {
    expect(initialVideoDuration(normalizeVideoOptions(COMPAT_OPTIONS))).toBe(5)
    const range = normalizeVideoOptions(undefined, contract({ defaults: {} }))
    expect(initialVideoDuration(range)).toBe(4)
    expect(range.defaultDuration).toBe(0)
    expect(initialVideoDuration(normalizeVideoOptions(undefined, contract({ durations: { values: [7, 12], auto: false }, defaults: {} })))).toBe(7)
    expect(initialVideoDuration(normalizeVideoOptions(undefined, contract({ durations: { auto: true, auto_only: true }, defaults: {} })))).toBe(-1)
    expect(initialVideoDuration(normalizeVideoOptions())).toBe(0)
    expect(initialVideoDuration(normalizeVideoOptions(undefined, contract({ durations: { values: [], auto: false }, defaults: {} })))).toBe(0)
  })

  it('没有合同不再填入旧2–30秒、像素尺寸或上传能力', () => {
    const options = normalizeVideoOptions()
    expect(options).toMatchObject({ hasVideoOptions: false, hasParameterConfig: false, ratios: [], resolutions: [], sizes: [], modes: [], defaultMode: '', defaultRatio: '', defaultResolution: '', defaultSize: '', defaultDuration: 0, minDuration: 0, maxDuration: 0, durationStep: 0, maxImages: 0, maxVideos: 0, maxAudios: 0 })
    expect(validateVideoParameters(validParameters, options)).toBe('capability')
    expect(normalizeVideoOptions(null)).toEqual(options)
    expect(nearestAllowedVideoDuration(5, options)).toBe(0)
  })

  it('兼容选项只开放返回的通用值，不能推断默认比例、尺寸、首尾帧或模式', () => {
    const options = normalizeVideoOptions(COMPAT_OPTIONS)
    expect(options).toMatchObject({ hasVideoOptions: true, hasParameterConfig: false, family: 'wan3', minDuration: 2, maxDuration: 30, defaultDuration: 5, durationStep: 1, defaultResolution: '1080p', defaultRatio: '', defaultSize: '', modes: [], sizes: [], maxImages: 10, maxVideos: 5, maxAudios: 5, requiresPrompt: false })
    expect(validateVideoParameters({ ...validParameters, prompt: '', imageCount: 10 }, options)).toBeNull()
    expect(validateVideoParameters({ ...validParameters, size: '1280x720' }, options)).toBe('size')
    expect(validateVideoReferences([image('first_frame')], options)).toBe('role')
    expect(getVideoReferenceRole(options, 'image')).toBe('reference_image')
    expect(resolveVideoMode(options, [image()], false)).toBe('')
    expect(normalizeVideoOptions({ ...COMPAT_OPTIONS, ratios: null }).ratios).toEqual([])
  })

  it('兼容字段的false/零值保留，无效或缺失默认值不补造', () => {
    const options = normalizeVideoOptions({ ...COMPAT_OPTIONS, max_images: 0, max_videos: 0, max_audios: 0, auto_duration: false, default_duration: -1, default_resolution: '4k' })
    expect(options).toMatchObject({ defaultDuration: 0, defaultResolution: '', maxImages: 0, maxVideos: 0, maxAudios: 0, autoDuration: false, requiresPrompt: false })
    expect(isVideoDurationAllowed(-1, options)).toBe(false)
    expect(validateVideoParameters({ ...validParameters, imageCount: 1 }, options)).toBe('images')
    expect(normalizeVideoOptions({ ratios: [], resolutions: [] })).toMatchObject({ minDuration: 0, maxDuration: 0, defaultDuration: 0 })
  })

  it('完整合同独立优先，未声明默认值和空集合原意保留', () => {
    const config = contract({ modes: ['text_to_video'], resolutions: ['720p'], ratios: null, sizes: null, durations: { values: [5, 10], auto: false }, defaults: {}, media: { min_total: 0, max_total: 0, roles: null }, protocol: undefined })
    const options = normalizeVideoOptions(COMPAT_OPTIONS, config)
    expect(options).toMatchObject({ hasVideoOptions: true, hasParameterConfig: true, family: '', requiresPrompt: true, ratios: [], sizes: [], defaultMode: '', defaultRatio: '', defaultResolution: '', defaultSize: '', defaultDuration: 0, durationValues: [5, 10], maxImages: 0, maxVideos: 0, maxAudios: 0 })
    expect(validateVideoParameters({ prompt: '海边', duration: 5, mode: 'text_to_video', resolution: '720p' }, options)).toBeNull()
    expect(validateVideoParameters({ ...validParameters, ratio: undefined, duration: 6 }, options)).toBe('duration')
    expect(normalizeVideoOptions(COMPAT_OPTIONS, { ...config, schema_version: 2 }).hasVideoOptions).toBe(false)
  })

  it('精确尺寸作为完整组合选择，与resolution二选一且不强求ratio', () => {
    const options = normalizeVideoOptions(undefined, contract({ resolutions: null, sizes: [{ width: 1280, height: 720 }, { width: 720, height: 1280 }], defaults: { size: { width: 1280, height: 720 } } }))
    expect(options.sizes).toEqual([{ value: '1280x720', width: 1280, height: 720, aspect: '', resolution: '' }, { value: '720x1280', width: 720, height: 1280, aspect: '', resolution: '' }])
    expect(options.defaultSize).toBe('1280x720')
    const parameters = { prompt: '海边', mode: 'text_to_video', duration: 5, size: '1280x720' }
    expect(validateVideoParameters(parameters, options)).toBeNull()
    expect(validateVideoParameters({ ...parameters, size: undefined }, options)).toBeNull()
    expect(validateVideoParameters({ ...parameters, size: '1280x1280' }, options)).toBe('size')
    expect(validateVideoParameters({ ...parameters, resolution: '720p' }, options)).toBe('size')
    const nominalRatio = normalizeVideoOptions(undefined, contract({ resolutions: null, ratios: ['16:9'], sizes: [{ width: 864, height: 480 }] }))
    expect(validateVideoParameters({ ...parameters, size: '864x480', ratio: '16:9' }, nominalRatio)).toBeNull()
  })

  it('枚举与步长取交集，输入值只能落在真正允许的秒数', () => {
    const options = normalizeVideoOptions(undefined, contract({ durations: { values: [4, 5, 8, 10, 12], auto: true }, rules: [{ mode: 'text_to_video', durations: { min: 4, max: 10, step: 2, auto: false } }] }), { mode: 'text_to_video' })
    expect(options).toMatchObject({ durationValues: [4, 8, 10], minDuration: 4, maxDuration: 10, defaultDuration: 0, autoDuration: false })
    expect(isVideoDurationAllowed(6, options)).toBe(false)
    expect(isVideoDurationAllowed(8, options)).toBe(true)
    expect(nearestAllowedVideoDuration(7, options)).toBe(8)
    expect(nearestAllowedVideoDuration(99, options)).toBe(10)
  })

  it('多个不同起点的范围步长按共同合法值合并，不通过取max(step)放宽', () => {
    const options = normalizeVideoOptions(undefined, contract({ durations: { min: 4, max: 30, step: 2, auto: false }, rules: [{ mode: 'text_to_video', durations: { min: 5, max: 25, step: 3, auto: false } }] }), { mode: 'text_to_video' })
    expect(options).toMatchObject({ minDuration: 8, maxDuration: 20, durationStep: 6, durationValues: undefined })
    for (const seconds of [8, 14, 20]) expect(isVideoDurationAllowed(seconds, options)).toBe(true)
    for (const seconds of [5, 6, 10, 12, 18, 24]) expect(isVideoDurationAllowed(seconds, options)).toBe(false)
    expect(nearestAllowedVideoDuration(13, options)).toBe(14)
    const empty = normalizeVideoOptions(undefined, contract({ durations: { min: 4, max: 30, step: 2, auto: false }, rules: [{ mode: 'text_to_video', durations: { min: 5, max: 25, step: 2, auto: false } }] }), { mode: 'text_to_video' })
    expect(empty.durationValues).toEqual([])
    expect(nearestAllowedVideoDuration(6, empty)).toBe(0)
  })

  it('自动、仅自动和允许省略是三项独立能力', () => {
    const options = normalizeVideoOptions(undefined, contract({ durations: { min: 4, max: 30, step: 1, auto: true, auto_only: true }, defaults: { duration: -1 } }))
    expect(options).toMatchObject({ autoOnly: true, durationValues: [], defaultDuration: -1, omitDuration: false })
    expect(isVideoDurationAllowed(-1, options)).toBe(true)
    expect(isVideoDurationAllowed(5, options)).toBe(false)
    expect(isVideoDurationAllowed(undefined, options)).toBe(true)
    expect(isVideoDurationAllowed(undefined, normalizeVideoOptions(undefined, contract({ durations: { min: 4, max: 30, step: 1, auto: true, auto_only: true }, defaults: {} })))).toBe(false)
    expect(nearestAllowedVideoDuration(5, options)).toBe(-1)
    const omitted = normalizeVideoOptions(undefined, contract({ durations: { values: [5], auto: false, omit_allowed: true }, defaults: {} }))
    expect(isVideoDurationAllowed(undefined, omitted)).toBe(true)
    expect(omitted.defaultDuration).toBe(0)
    expect(validateVideoParameters({ ...validParameters, duration: undefined }, omitted)).toBeNull()
  })

  it('规则全部条件共同匹配，并交集限制尺寸、比例、时长和默认值', () => {
    const config = contract({ sizes: [{ width: 1280, height: 720 }, { width: 720, height: 1280 }], rules: [
      { mode: 'reference_to_video', resolution: '1080p', allowed_ratios: ['16:9'], sizes: [{ width: 1280, height: 720 }], durations: { min: 4, max: 10, step: 1, auto: false }, default_duration: 8, default_ratio: '16:9' },
      { mode: 'reference_to_video', resolution: '1080p', durations: { values: [5, 8], auto: false } },
    ] })
    const full = normalizeVideoOptions(undefined, config, { mode: 'reference_to_video', resolution: '1080p' })
    expect(full).toMatchObject({ ratios: ['16:9'], durationValues: [5, 8], defaultDuration: 8, defaultRatio: '16:9' })
    expect(full.sizes.map((size) => size.value)).toEqual(['1280x720'])
    expect(normalizeVideoOptions(undefined, config, { mode: 'text_to_video', resolution: '1080p' }).maxDuration).toBe(30)
    expect(normalizeVideoOptions(undefined, config, { mode: 'reference_to_video', ratio: '9:16' }).resolutions).toEqual(['480p', '720p'])
    expect(validateVideoParameters({ ...validParameters, mode: 'reference_to_video', duration: 12, resolution: '1080p', references: [image()] }, normalizeVideoOptions(undefined, config))).toBe('duration')
  })

  it('素材总数、角色数量和角色类型都按完整合同校验', () => {
    const media: UserVideoMediaConfig = { min_total: 1, max_total: 2, roles: { reference_image: { min: 1, max: 2 } } }
    const options = normalizeVideoOptions(undefined, contract({ media }))
    expect(validateVideoReferences([], options)).toBe('media-total')
    expect(validateVideoReferences([image(), image()], options)).toBeNull()
    expect(validateVideoReferences([image(), image(), image()], options)).toBe('images')
    expect(validateVideoReferences([image('first_frame')], options)).toBe('role')
    expect(validateVideoReferences([{ type: 'image', role: 'reference_video' }], options)).toBe('role')
    expect(validateVideoReferences([{ type: 'image' }], options)).toBe('role')
  })

  it('角色依赖、任一依赖和互斥限制不因已选择模式而丢失', () => {
    const options = normalizeVideoOptions(undefined, contract())
    expect(validateVideoReferences([image('last_frame')], options)).toBe('media-dependency')
    expect(validateVideoReferences([image('first_frame'), image('last_frame')], options)).toBeNull()
    expect(validateVideoReferences([image('first_frame'), image()], options)).toBe('media-exclusive')
    const requiresAny = normalizeVideoOptions(undefined, contract({ media: { ...contract().video!.media, dependencies: [{ role: 'last_frame', requires_any: ['first_frame', 'reference_image'] }], exclusive_groups: [] } }))
    expect(validateVideoReferences([image('last_frame')], requiresAny)).toBe('media-dependency')
    expect(validateVideoReferences([image('last_frame'), image()], requiresAny)).toBeNull()
  })

  it('命中的素材规则只收紧全局限制，null角色不能被当成无限制', () => {
    const config = contract({ rules: [{ mode: 'reference_to_video', media: { min_total: 1, max_total: 2, roles: { reference_image: { min: 1, max: 2 } } } }] })
    const options = normalizeVideoOptions(undefined, config, { mode: 'reference_to_video' })
    expect(options).toMatchObject({ maxImages: 2, maxVideos: 0, maxAudios: 0 })
    expect(options.media!.roles).toEqual({ reference_image: { min: 1, max: 2 } })
    const noRoles = normalizeVideoOptions(undefined, contract({ media: { min_total: 0, max_total: 9, roles: null } }))
    expect(noRoles.maxImages).toBe(0)
    expect(validateVideoReferences([image()], noRoles)).toBe('images')
  })

  it('继续拒绝混传素材，视频与音频也分别执行返回的上限', () => {
    const options = normalizeVideoOptions(COMPAT_OPTIONS)
    expect(validateVideoParameters({ ...validParameters, imageCount: 1, videoCount: 1 }, options)).toBe('mixed-media')
    expect(validateVideoParameters({ ...validParameters, videoCount: 6 }, options)).toBe('videos')
    expect(validateVideoParameters({ ...validParameters, audioCount: -1 }, options)).toBe('audios')
    expect(validateVideoReferences([image(), video()], normalizeVideoOptions(undefined, contract()))).toBe('mixed-media')
  })

  it('模式由已声明角色解析，默认模式只在真正适配时优先', () => {
    const options = normalizeVideoOptions(undefined, contract())
    expect(resolveVideoMode(options, [], false)).toBe('text_to_video')
    expect(resolveVideoMode(options, [image()], false)).toBe('reference_to_video')
    // 末帧 min=0 时不根据模式名额外强制恰好两张图。
    expect(resolveVideoMode(options, [image('first_frame')], true)).toBe('first_last_frame')
    expect(resolveVideoMode(options, [image('first_frame'), image('last_frame')], true)).toBe('first_last_frame')
    expect(getVideoReferenceRole(options, 'image')).toBe('reference_image')
    const singleImage = normalizeVideoOptions(undefined, contract({ modes: ['image_to_video'], defaults: {}, media: { min_total: 1, max_total: 1, roles: { first_frame: { min: 1, max: 1 } } } }))
    expect(getVideoReferenceRole(singleImage, 'image')).toBe('first_frame')
    expect(resolveVideoMode(singleImage, [image()], false)).toBe('')
    expect(resolveVideoMode(singleImage, [image('first_frame')], false)).toBe('image_to_video')
  })

  it('显式编辑/延长选择优先于默认模式并尊重source_video及reference_video合同', () => {
    const config = contract({ defaults: { mode: 'reference_to_video' }, rules: [
      { mode: 'video_edit', media: { min_total: 1, max_total: 1, roles: { source_video: { min: 1, max: 1 } } } },
      { mode: 'video_extend', media: { min_total: 1, max_total: 1, roles: { reference_video: { min: 1, max: 1 } } } },
    ] })
    const edit = normalizeVideoOptions(undefined, config, { mode: 'video_edit' })
    expect(getVideoReferenceRole(edit, 'video')).toBe('source_video')
    expect(getVideoReferenceRole(edit, 'image')).toBeUndefined()
    expect(resolveVideoMode(edit, [video('source_video')], false)).toBe('video_edit')
    expect(resolveVideoMode(edit, [video()], false)).toBe('')
    const extend = normalizeVideoOptions(undefined, config, { mode: 'video_extend' })
    expect(getVideoReferenceRole(extend, 'video')).toBe('reference_video')
    expect(resolveVideoMode(extend, [video()], false)).toBe('video_extend')
  })

  it('素材编辑候选不要求立即满足最少数量，确认时才做完整校验', () => {
    const options = normalizeVideoOptions(undefined, contract({ modes: ['reference_to_video'], defaults: {}, media: { min_total: 2, max_total: 4, roles: { reference_image: { min: 2, max: 4 } } } }))
    expect(resolveVideoReferenceMode(options, 'image')).toBe('reference_to_video')
    expect(getVideoReferenceRole(options, 'image')).toBe('reference_image')
    expect(resolveVideoMode(options, [image()], false)).toBe('')
    expect(resolveVideoMode(options, [image(), image()], false)).toBe('reference_to_video')
    expect(resolveVideoReferenceMode(options, 'video')).toBe('')
  })

  it('省略值仅采用已声明默认，且重新计算条件后的默认和范围', () => {
    const config = contract({ rules: [{ mode: 'text_to_video', resolution: '720p', durations: { values: [8, 10], auto: false }, default_duration: 8, allowed_ratios: ['9:16'], default_ratio: '9:16' }] })
    const options = normalizeVideoOptions(undefined, config)
    expect(validateVideoParameters({ prompt: '海边' }, options)).toBeNull()
    expect(validateVideoParameters({ prompt: '海边', duration: 5 }, options)).toBe('duration')
    expect(validateVideoParameters({ prompt: '海边', ratio: '16:9' }, options)).not.toBeNull()
    const noDefaults = normalizeVideoOptions(undefined, contract({ defaults: {} }))
    expect(validateVideoParameters({ ...validParameters, duration: undefined }, noDefaults)).toBe('duration')
    expect(validateVideoParameters({ ...validParameters, resolution: undefined }, noDefaults)).toBe('resolution')
    expect(validateVideoParameters({ ...validParameters, ratio: undefined }, noDefaults)).toBe('ratio')
  })

  it('声音显式false/控制字段和请求体上限完整保留，未支持声音时禁止发送', () => {
    const options = normalizeVideoOptions(undefined, contract({ generate_audio: { supported: true, default: false }, controls: { watermark: { supported: true, default: false }, priority: { supported: true, min: 0, max: 10, default: 0 } }, max_request_bytes: 1024 }))
    expect(options.generateAudio).toEqual({ supported: true, default: false })
    expect(options.controls!.priority!.default).toBe(0)
    expect(options.maxRequestBytes).toBe(1024)
    expect(validateVideoParameters({ ...validParameters, generateAudio: false }, options)).toBeNull()
    expect(validateVideoParameters({ ...validParameters, generateAudio: false }, normalizeVideoOptions(undefined, contract()))).toBe('audio-generation')
  })

  it('真实素材规格仅合并为provider规格，前端不声称读取URL做了格式或时长验证', () => {
    const config = contract({ input_media: { video: { validation: 'provider', formats: ['mp4', 'mov'], max_bytes: 1000, min_duration: 2, max_duration: 15 } }, rules: [{ mode: 'video_edit', input_media: { video: { validation: 'provider', formats: ['mp4'], max_bytes: 500, max_bytes_exclusive: true, min_duration: 4, max_duration: 10 } } }] })
    const options = normalizeVideoOptions(undefined, config, { mode: 'video_edit' })
    expect(options.inputMedia!.video).toMatchObject({ validation: 'provider', formats: ['mp4'], max_bytes: 500, max_bytes_exclusive: true, min_duration: 4, max_duration: 10 })
    expect(config.video!.input_media!.video!.formats).toEqual(['mp4', 'mov'])
  })
})
