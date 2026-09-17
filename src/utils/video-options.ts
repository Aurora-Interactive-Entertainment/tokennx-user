import type { UserVideoOptions } from '@/api/user-models'

export interface VideoSizeOption {
  value: string
  aspect: string
  resolution: string
}

export interface NormalizedVideoOptions {
  hasVideoOptions: boolean
  family: string
  outputMeter: string
  ratios: string[]
  resolutions: string[]
  sizes: VideoSizeOption[]
  defaultRatio: string
  defaultResolution: string
  defaultSize: string
  minDuration: number
  maxDuration: number
  defaultDuration: number
  autoDuration: boolean
  maxImages: number
  maxVideos: number
  maxAudios: number
  requiresPrompt: boolean
}

export interface VideoParameters {
  prompt: string
  duration: number
  size?: string
  ratio?: string
  resolution?: string
  imageCount?: number
  videoCount?: number
  audioCount?: number
}

export type VideoParameterError = 'prompt' | 'duration' | 'size' | 'ratio' | 'resolution' | 'images' | 'videos' | 'audios' | 'mixed-media'

const LEGACY_VIDEO_SIZES: readonly VideoSizeOption[] = [
  { value: '1280x720', aspect: '16:9', resolution: '720P' },
  { value: '1920x1080', aspect: '16:9', resolution: '1080P' },
  { value: '720x1280', aspect: '9:16', resolution: '720P' },
  { value: '1024x1024', aspect: '1:1', resolution: '1024P' },
]

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readChoices(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map(readText).filter(Boolean))]
}

function readInteger(value: unknown, minimum: number, fallback: number): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum ? value : fallback
}

export function normalizeVideoOptions(raw?: UserVideoOptions | null): NormalizedVideoOptions {
  const hasVideoOptions = typeof raw === 'object' && raw !== null && !Array.isArray(raw)
  const source = hasVideoOptions ? raw : undefined
  const sizes = hasVideoOptions ? [] : LEGACY_VIDEO_SIZES.map((size) => ({ ...size }))
  const ratios = hasVideoOptions ? readChoices(source?.ratios) : [...new Set(sizes.map((size) => size.aspect))]
  const resolutions = hasVideoOptions ? readChoices(source?.resolutions) : [...new Set(sizes.map((size) => size.resolution))]
  const requestedResolution = readText(source?.default_resolution)
  const requestedMinDuration = readInteger(source?.min_duration, 1, 2)
  const maxDuration = readInteger(source?.max_duration, 1, Math.max(30, requestedMinDuration))
  // 矛盾的上下限以更严格的最大值收敛，避免生成超出后端上限的默认值。
  const minDuration = Math.min(requestedMinDuration, maxDuration)
  const autoDuration = source?.auto_duration === true
  const fallbackDuration = Math.max(minDuration, Math.min(maxDuration, 5))
  const requestedDuration = readInteger(source?.default_duration, 1, fallbackDuration)
  const defaultDuration = source?.default_duration === -1 && autoDuration
    ? -1
    : Math.max(minDuration, Math.min(maxDuration, requestedDuration))

  return {
    hasVideoOptions,
    family: readText(source?.family),
    outputMeter: readText(source?.output_meter),
    ratios,
    resolutions,
    sizes,
    defaultRatio: ratios[0] ?? '',
    defaultResolution: resolutions.includes(requestedResolution) ? requestedResolution : resolutions[0] ?? '',
    defaultSize: sizes[0]?.value ?? '',
    minDuration,
    maxDuration,
    defaultDuration,
    autoDuration,
    // 0 表示禁止上传此类素材，不能回退到默认上限。
    maxImages: readInteger(source?.max_images, 0, 1),
    maxVideos: readInteger(source?.max_videos, 0, 0),
    maxAudios: readInteger(source?.max_audios, 0, 0),
    requiresPrompt: typeof source?.requires_prompt === 'boolean' ? source.requires_prompt : true,
  }
}

export function isVideoDurationAllowed(duration: number, options: NormalizedVideoOptions): boolean {
  if (duration === -1) return options.autoDuration
  return Number.isSafeInteger(duration) && duration >= options.minDuration && duration <= options.maxDuration
}

function acceptsChoice(value: string | undefined, choices: readonly string[]): boolean {
  // 空列表没有声明可选能力，只允许省略该参数。
  return choices.length ? choices.includes(value ?? '') : !value
}

function acceptsCount(count: number | undefined, maximum: number): boolean {
  return count === undefined || (Number.isSafeInteger(count) && count >= 0 && count <= maximum)
}

export function validateVideoParameters(parameters: VideoParameters, options: NormalizedVideoOptions): VideoParameterError | null {
  if (options.requiresPrompt && !parameters.prompt.trim()) return 'prompt'
  if (!isVideoDurationAllowed(parameters.duration, options)) return 'duration'
  if (options.hasVideoOptions) {
    if (!acceptsChoice(parameters.ratio, options.ratios)) return 'ratio'
    if (!acceptsChoice(parameters.resolution, options.resolutions)) return 'resolution'
  } else if (!options.sizes.some((size) => size.value === parameters.size)) {
    return 'size'
  }
  if (!acceptsCount(parameters.imageCount, options.maxImages)) return 'images'
  if (!acceptsCount(parameters.videoCount, options.maxVideos)) return 'videos'
  if (!acceptsCount(parameters.audioCount, options.maxAudios)) return 'audios'
  // 当前编辑和历史重试共用此规则，单次生成只允许一种参考素材类型。
  if ([parameters.imageCount, parameters.videoCount, parameters.audioCount].filter((count) => (count ?? 0) > 0).length > 1) return 'mixed-media'
  return null
}
