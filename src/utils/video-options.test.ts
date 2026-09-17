import { describe, expect, it } from 'vitest'
import type { UserVideoOptions } from '@/api/user-models'
import { isVideoDurationAllowed, normalizeVideoOptions, validateVideoParameters } from './video-options'

const SEEDANCE_OPTIONS: UserVideoOptions = {
  family: 'seedance',
  ratios: ['adaptive', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'],
  resolutions: ['480p', '720p', '1080p'],
  min_duration: 4,
  max_duration: 15,
  default_duration: 5,
  default_resolution: '720p',
  auto_duration: true,
  max_images: 9,
  max_videos: 3,
  max_audios: 3,
  requires_prompt: true,
  output_meter: 'output_token',
}

describe('视频模型能力与参数校验', () => {
  it('按目录原值提供比例、分辨率、时长与三类素材限制', () => {
    expect(normalizeVideoOptions(SEEDANCE_OPTIONS)).toEqual({
      hasVideoOptions: true,
      family: 'seedance',
      outputMeter: 'output_token',
      ratios: SEEDANCE_OPTIONS.ratios,
      resolutions: SEEDANCE_OPTIONS.resolutions,
      sizes: [],
      defaultRatio: 'adaptive',
      defaultResolution: '720p',
      defaultSize: '',
      minDuration: 4,
      maxDuration: 15,
      defaultDuration: 5,
      autoDuration: true,
      maxImages: 9,
      maxVideos: 3,
      maxAudios: 3,
      requiresPrompt: true,
    })
  })

  it('自动时长默认值及更大素材上限完全由接口控制', () => {
    const options = normalizeVideoOptions({
      ...SEEDANCE_OPTIONS, default_duration: -1, default_resolution: '1080p', max_duration: 30,
      max_images: 30, max_videos: 10, max_audios: 10,
    })
    expect(options).toMatchObject({ defaultDuration: -1, defaultResolution: '1080p', maxDuration: 30, maxImages: 30, maxVideos: 10, maxAudios: 10 })
    expect(isVideoDurationAllowed(-1, options)).toBe(true)
    expect(isVideoDurationAllowed(30, options)).toBe(true)
    expect(isVideoDurationAllowed(31, options)).toBe(false)
    expect(isVideoDurationAllowed(3, options)).toBe(false)
    expect(isVideoDurationAllowed(4.5, options)).toBe(false)
  })

  it('缺失新字段的旧模型保持时长、尺寸及单图行为', () => {
    const options = normalizeVideoOptions()
    expect(options).toMatchObject({ hasVideoOptions: false, minDuration: 2, maxDuration: 30, defaultDuration: 5, defaultSize: '1280x720', maxImages: 1, maxVideos: 0, maxAudios: 0, requiresPrompt: true, autoDuration: false })
    expect(options.sizes.map((size) => size.value)).toEqual(['1280x720', '1920x1080', '720x1280', '1024x1024'])
    expect(normalizeVideoOptions(null)).toEqual(options)
    expect(validateVideoParameters({ prompt: '海边', duration: 5, size: '1280x720', imageCount: 1 }, options)).toBeNull()
    expect(validateVideoParameters({ prompt: '海边', duration: 5, size: '480p' }, options)).toBe('size')
    expect(validateVideoParameters({ prompt: '海边', duration: -1, size: '1280x720' }, options)).toBe('duration')
  })

  it('显式零上限和 false 不会被默认值覆盖', () => {
    const options = normalizeVideoOptions({ ...SEEDANCE_OPTIONS, max_images: 0, max_videos: 0, max_audios: 0, requires_prompt: false, auto_duration: false, default_duration: -1 })
    expect(options).toMatchObject({ maxImages: 0, maxVideos: 0, maxAudios: 0, requiresPrompt: false, autoDuration: false, defaultDuration: 5 })
    const parameters = { prompt: '', duration: 5, ratio: 'adaptive', resolution: '720p' }
    expect(validateVideoParameters(parameters, options)).toBeNull()
    expect(validateVideoParameters({ ...parameters, imageCount: 1 }, options)).toBe('images')
    expect(validateVideoParameters({ ...parameters, videoCount: 1 }, options)).toBe('videos')
    expect(validateVideoParameters({ ...parameters, audioCount: 1 }, options)).toBe('audios')
    expect(validateVideoParameters({ ...parameters, duration: -1 }, options)).toBe('duration')
  })

  it('拒绝超出声明范围、未声明枚举及非法计数', () => {
    const options = normalizeVideoOptions(SEEDANCE_OPTIONS)
    const parameters = { prompt: '海边', duration: 5, ratio: '21:9', resolution: '480p', imageCount: 9, videoCount: 0, audioCount: 0 }
    expect(validateVideoParameters(parameters, options)).toBeNull()
    expect(validateVideoParameters({ ...parameters, prompt: '  ' }, options)).toBe('prompt')
    expect(validateVideoParameters({ ...parameters, duration: 16 }, options)).toBe('duration')
    expect(validateVideoParameters({ ...parameters, ratio: '2:1' }, options)).toBe('ratio')
    expect(validateVideoParameters({ ...parameters, ratio: undefined }, options)).toBe('ratio')
    expect(validateVideoParameters({ ...parameters, resolution: '4k' }, options)).toBe('resolution')
    expect(validateVideoParameters({ ...parameters, imageCount: 10 }, options)).toBe('images')
    expect(validateVideoParameters({ ...parameters, videoCount: 4 }, options)).toBe('videos')
    expect(validateVideoParameters({ ...parameters, audioCount: 4 }, options)).toBe('audios')
    expect(validateVideoParameters({ ...parameters, imageCount: -1 }, options)).toBe('images')
    expect(validateVideoParameters({ ...parameters, videoCount: 1.5 }, options)).toBe('videos')
    expect(validateVideoParameters({ ...parameters, audioCount: Number.NaN }, options)).toBe('audios')
  })

  it('每次只接受一种素材类型，三种类型都保留各自的数量上限', () => {
    const options = normalizeVideoOptions(SEEDANCE_OPTIONS)
    const parameters = { prompt: '海边', duration: 5, ratio: '21:9', resolution: '480p' }
    expect(validateVideoParameters({ ...parameters, imageCount: 9 }, options)).toBeNull()
    expect(validateVideoParameters({ ...parameters, videoCount: 3 }, options)).toBeNull()
    expect(validateVideoParameters({ ...parameters, audioCount: 3 }, options)).toBeNull()
    expect(validateVideoParameters({ ...parameters, imageCount: 1, videoCount: 1 }, options)).toBe('mixed-media')
    expect(validateVideoParameters({ ...parameters, imageCount: 1, audioCount: 1 }, options)).toBe('mixed-media')
    expect(validateVideoParameters({ ...parameters, videoCount: 1, audioCount: 1 }, options)).toBe('mixed-media')
    expect(validateVideoParameters({ ...parameters, imageCount: 1, videoCount: 1, audioCount: 1 }, options)).toBe('mixed-media')
  })

  it('清理损坏字段并生成始终位于允许范围内的默认值', () => {
    const raw = {
      family: 42, output_meter: {}, ratios: ['16:9', ' 16:9 ', '', null, 4], resolutions: ['720p', '720p'],
      default_resolution: '4k', min_duration: 10, max_duration: 8, default_duration: 20,
      max_images: -2, max_videos: Infinity, max_audios: '3', auto_duration: 'true', requires_prompt: 0,
    } as unknown as UserVideoOptions
    const options = normalizeVideoOptions(raw)
    expect(options).toMatchObject({ family: '', outputMeter: '', ratios: ['16:9'], resolutions: ['720p'], defaultResolution: '720p', minDuration: 8, maxDuration: 8, defaultDuration: 8, maxImages: 1, maxVideos: 0, maxAudios: 0, autoDuration: false, requiresPrompt: true })
    expect(isVideoDurationAllowed(options.defaultDuration, options)).toBe(true)
    expect(normalizeVideoOptions({ min_duration: 50 })).toMatchObject({ minDuration: 50, maxDuration: 50, defaultDuration: 50 })
    expect(normalizeVideoOptions({ max_duration: 1 })).toMatchObject({ minDuration: 1, maxDuration: 1, defaultDuration: 1 })
  })

  it('新协议的空枚举仅允许省略参数，不猜测未声明能力', () => {
    const options = normalizeVideoOptions({ ratios: [], resolutions: [] })
    expect(options).toMatchObject({ hasVideoOptions: true, ratios: [], resolutions: [], sizes: [], defaultRatio: '', defaultResolution: '', defaultSize: '' })
    expect(validateVideoParameters({ prompt: '海边', duration: 5 }, options)).toBeNull()
    expect(validateVideoParameters({ prompt: '海边', duration: 5, ratio: '16:9' }, options)).toBe('ratio')
    expect(validateVideoParameters({ prompt: '海边', duration: 5, resolution: '720p' }, options)).toBe('resolution')
    expect(normalizeVideoOptions({ ratios: null, resolutions: 42 } as unknown as UserVideoOptions).ratios).toEqual([])
  })
})
