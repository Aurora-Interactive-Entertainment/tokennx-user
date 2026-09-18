import type { UserModelParameterConfig, UserVideoDurationConfig, UserVideoInputMedia, UserVideoMediaConfig, UserVideoMediaRole, UserVideoMode, UserVideoOptions, UserVideoParameterConfig, UserVideoRule, UserVideoSize } from '@/api/user-models'

export interface VideoSizeOption { value: string; aspect: string; resolution: string; width?: number; height?: number }
export interface VideoOptionSelection { mode?: string; ratio?: string; resolution?: string }
export interface VideoParameterReference { type: 'image' | 'video' | 'audio'; role?: UserVideoMediaRole; url?: string }

export interface NormalizedVideoOptions {
  hasVideoOptions: boolean
  hasParameterConfig: boolean
  family: string
  outputMeter: string
  modes: string[]
  defaultMode: string
  ratios: string[]
  resolutions: string[]
  sizes: VideoSizeOption[]
  defaultRatio: string
  defaultResolution: string
  defaultSize: string
  minDuration: number
  maxDuration: number
  defaultDuration: number
  durationValues?: number[]
  durationStep: number
  autoDuration: boolean
  autoOnly: boolean
  omitDuration: boolean
  maxImages: number
  maxVideos: number
  maxAudios: number
  requiresPrompt: boolean
  media?: UserVideoMediaConfig
  generateAudio?: UserVideoParameterConfig['generate_audio']
  controls?: UserVideoParameterConfig['controls']
  maxRequestBytes?: number
  inputMedia?: UserVideoInputMedia
  parameterConfig?: UserModelParameterConfig
  selection?: VideoOptionSelection
}

export interface VideoParameters {
  prompt: string
  duration?: number
  size?: string
  ratio?: string
  resolution?: string
  mode?: string
  references?: readonly VideoParameterReference[]
  generateAudio?: boolean
  imageCount?: number
  videoCount?: number
  audioCount?: number
}

export type VideoParameterError = 'capability' | 'prompt' | 'duration' | 'size' | 'ratio' | 'resolution' | 'mode' | 'role' | 'images' | 'videos' | 'audios' | 'mixed-media' | 'media-total' | 'media-dependency' | 'media-exclusive' | 'audio-generation'

const ROLE_TYPES: Record<UserVideoMediaRole, VideoParameterReference['type']> = { first_frame: 'image', last_frame: 'image', reference_image: 'image', reference_video: 'video', reference_audio: 'audio', source_video: 'video' }
const MODE_ROLES: Record<UserVideoMode, UserVideoMediaRole[]> = {
  text_to_video: [], image_to_video: ['first_frame'], first_last_frame: ['first_frame', 'last_frame'],
  reference_to_video: ['reference_image', 'reference_video', 'reference_audio'], video_edit: ['source_video', 'reference_video'], video_extend: ['source_video', 'reference_video'],
}

function readText(value: unknown): string { return typeof value === 'string' ? value.trim() : '' }
function readChoices(value: unknown): string[] { return Array.isArray(value) ? [...new Set(value.map(readText).filter(Boolean))] : [] }
function integer(value: unknown, minimum = 0): number | undefined { return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum ? value : undefined }
function matchesRule(rule: UserVideoRule, selection: VideoOptionSelection): boolean {
  return (!rule.mode || rule.mode === selection.mode) && (!rule.ratio || rule.ratio === selection.ratio) && (!rule.resolution || rule.resolution === selection.resolution)
}
function validSizes(sizes?: UserVideoSize[] | null): UserVideoSize[] {
  return Array.isArray(sizes) ? sizes.filter((size) => size && integer(size.width, 1) !== undefined && integer(size.height, 1) !== undefined) : []
}
function sameSize(left: UserVideoSize, right: UserVideoSize): boolean { return left.width === right.width && left.height === right.height }
function sizeValue(size?: UserVideoSize): string { return size ? `${size.width}x${size.height}` : '' }
function sizeOption(size: UserVideoSize): VideoSizeOption {
  // 精确像素与名义画幅并非数学等比关系，不用宽高反推接口未声明的比例或档位。
  return { ...size, value: sizeValue(size), aspect: '', resolution: '' }
}

type DurationOptions = Pick<NormalizedVideoOptions, 'minDuration' | 'maxDuration' | 'durationStep' | 'durationValues' | 'autoDuration' | 'autoOnly' | 'omitDuration'>

function durationMatches(value: number, config: UserVideoDurationConfig): boolean {
  if (value === -1) return config.auto === true
  if (!Number.isSafeInteger(value) || value <= 0 || config.auto_only) return false
  if (config.values?.length) return config.values.includes(value)
  const min = integer(config.min, 1), max = integer(config.max, 1), step = integer(config.step, 1)
  return min !== undefined && max !== undefined && step !== undefined && value >= min && value <= max && (value - min) % step === 0
}

function extendedGcd(left: bigint, right: bigint): [bigint, bigint] {
  let a = left, b = right, x = 1n, nextX = 0n
  while (b) { const quotient = a / b; [a, b] = [b, a % b]; [x, nextX] = [nextX, x - quotient * nextX] }
  return [a, x]
}

function intersectDurations(configs: UserVideoDurationConfig[]): DurationOptions {
  const empty: DurationOptions = { minDuration: 0, maxDuration: 0, durationStep: 0, durationValues: [], autoDuration: configs.every((config) => config.auto === true), autoOnly: configs.some((config) => config.auto_only === true), omitDuration: configs.every((config) => config.omit_allowed === true) }
  if (!configs.length) return { ...empty, autoDuration: false, omitDuration: false }
  if (empty.autoOnly) return empty
  const enumeration = configs.find((config) => config.values?.length)?.values
  if (enumeration) {
    const values = [...new Set(enumeration)].filter((value) => configs.every((config) => durationMatches(value, config))).sort((left, right) => left - right)
    return { ...empty, durationValues: values, minDuration: values[0] ?? 0, maxDuration: values.at(-1) ?? 0, durationStep: 1 }
  }
  if (configs.some((config) => integer(config.min, 1) === undefined || integer(config.max, 1) === undefined || integer(config.step, 1) === undefined || config.min! > config.max!)) return empty
  const lower = Math.max(...configs.map((config) => config.min!)), upper = Math.min(...configs.map((config) => config.max!))
  if (lower > upper) return empty
  // 多条步长规则取交集，而非仅取更大 step；同余合并避免遍历超大秒数区间。
  let period = 1n, residue = 0n
  for (const config of configs) {
    const nextPeriod = BigInt(config.step!), nextResidue = BigInt(config.min!)
    const [divisor, inverse] = extendedGcd(period, nextPeriod)
    const difference = nextResidue - residue
    if (difference % divisor) return empty
    const reduced = nextPeriod / divisor
    const multiplier = ((difference / divisor * inverse) % reduced + reduced) % reduced
    residue += period * multiplier
    period *= reduced
    residue = (residue % period + period) % period
  }
  const minimum = BigInt(lower), maximum = BigInt(upper)
  const first = residue >= minimum ? residue : residue + ((minimum - residue + period - 1n) / period) * period
  if (first > maximum) return empty
  const last = first + ((maximum - first) / period) * period
  if (period > BigInt(Number.MAX_SAFE_INTEGER)) return { ...empty, durationValues: [Number(first)], minDuration: Number(first), maxDuration: Number(first), durationStep: 1 }
  return { ...empty, durationValues: undefined, minDuration: Number(first), maxDuration: Number(last), durationStep: Number(period) }
}

function intersectMedia(configs: UserVideoMediaConfig[]): UserVideoMediaConfig {
  const roles: NonNullable<UserVideoMediaConfig['roles']> = {}
  for (const role of Object.keys(ROLE_TYPES) as UserVideoMediaRole[]) {
    const limits = configs.map((config) => config.roles?.[role])
    if (limits.some((limit) => !limit) && !limits.some((limit) => (limit?.min ?? 0) > 0)) continue
    roles[role] = { min: Math.max(...limits.map((limit) => integer(limit?.min) ?? 0)), max: Math.min(...limits.map((limit) => integer(limit?.max) ?? 0)) }
  }
  const dependencies = configs.flatMap((config) => config.dependencies ?? [])
  const exclusiveGroups = configs.flatMap((config) => config.exclusive_groups ?? [])
  return { min_total: Math.max(...configs.map((config) => integer(config.min_total) ?? 0)), max_total: Math.min(...configs.map((config) => integer(config.max_total) ?? 0)), roles,
    ...(dependencies.length ? { dependencies } : {}), ...(exclusiveGroups.length ? { exclusive_groups: exclusiveGroups } : {}) }
}

function intersectInputMedia(configs: (UserVideoInputMedia | undefined)[]): UserVideoInputMedia | undefined {
  const result: UserVideoInputMedia = {}
  for (const type of ['image', 'video', 'audio'] as const) {
    const specs = configs.map((config) => config?.[type]).filter((spec) => spec !== undefined)
    if (!specs.length) continue
    const maxBytes = Math.min(...specs.map((spec) => spec.max_bytes))
    const effective = { ...specs[0], formats: specs[0].formats.filter((format) => specs.every((spec) => spec.formats.includes(format))), max_bytes: maxBytes }
    if (specs.some((spec) => spec.max_bytes === maxBytes && spec.max_bytes_exclusive)) effective.max_bytes_exclusive = true
    else delete effective.max_bytes_exclusive
    for (const name of ['min_width', 'min_height', 'min_ratio', 'min_pixels', 'min_duration', 'min_fps'] as const) {
      const limits = specs.map((spec) => spec[name]).filter((value) => value !== undefined)
      if (limits.length) effective[name] = Math.max(...limits)
    }
    for (const name of ['max_width', 'max_height', 'max_ratio', 'max_pixels', 'max_duration', 'max_total_duration', 'max_fps'] as const) {
      const limits = specs.map((spec) => spec[name]).filter((value) => value !== undefined)
      if (limits.length) effective[name] = Math.min(...limits)
    }
    result[type] = effective
  }
  return Object.keys(result).length ? result : undefined
}

function matchingRules(video: UserVideoParameterConfig, selection: VideoOptionSelection): UserVideoRule[] { return (video.rules ?? []).filter((rule) => matchesRule(rule, selection)) }
function allowedRatios(video: UserVideoParameterConfig, rules: UserVideoRule[]): string[] {
  return readChoices(video.ratios).filter((ratio) => rules.every((rule) => !rule.allowed_ratios?.length || rule.allowed_ratios.includes(ratio)))
}
function declaredDefault<T extends string | number>(original: T | undefined, rules: Array<T | undefined>): T | undefined {
  const overrides = [...new Set(rules.filter((value) => value !== undefined))]
  return overrides.length ? (overrides.length === 1 ? overrides[0] : undefined) : original
}

export function normalizeVideoOptions(raw?: UserVideoOptions | null, config?: UserModelParameterConfig | null, selection: VideoOptionSelection = {}): NormalizedVideoOptions {
  const video = config?.schema_version === 1 ? config.video : undefined
  // 完整合同优先且独立；未知结构版本也不能通过兼容字段放宽能力。
  const source = !config?.video && raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : undefined
  const base: NormalizedVideoOptions = {
    hasVideoOptions: Boolean(video || source), hasParameterConfig: Boolean(video), family: video?.protocol ?? readText(source?.family), outputMeter: readText(source?.output_meter),
    modes: [], defaultMode: '', ratios: readChoices(source?.ratios), resolutions: readChoices(source?.resolutions), sizes: [], defaultRatio: '', defaultResolution: '', defaultSize: '',
    minDuration: 0, maxDuration: 0, defaultDuration: 0, durationStep: 0, autoDuration: false, autoOnly: false, omitDuration: false,
    maxImages: integer(source?.max_images) ?? 0, maxVideos: integer(source?.max_videos) ?? 0, maxAudios: integer(source?.max_audios) ?? 0,
    requiresPrompt: typeof source?.requires_prompt === 'boolean' ? source.requires_prompt : true, selection,
  }
  if (!video) {
    if (!source) return base
    Object.assign(base, intersectDurations([{ min: source.min_duration, max: source.max_duration, step: 1, auto: source.auto_duration === true }]))
    if (base.resolutions.includes(readText(source.default_resolution))) base.defaultResolution = readText(source.default_resolution)
    if (typeof source.default_duration === 'number' && isVideoDurationAllowed(source.default_duration, base)) base.defaultDuration = source.default_duration
    return base
  }
  const rules = matchingRules(video, selection)
  Object.assign(base, intersectDurations([video.durations, ...rules.flatMap((rule) => rule.durations ? [rule.durations] : [])]))
  base.modes = readChoices(video.modes)
  base.defaultMode = base.modes.includes(readText(video.defaults.mode)) ? readText(video.defaults.mode) : ''
  base.ratios = readChoices(video.ratios).filter((ratio) => allowedRatios(video, matchingRules(video, { ...selection, ratio })).includes(ratio))
  base.resolutions = readChoices(video.resolutions).filter((resolution) => !selection.ratio || allowedRatios(video, matchingRules(video, { ...selection, resolution })).includes(selection.ratio))
  base.sizes = validSizes(video.sizes).filter((size) => rules.every((rule) => !rule.sizes?.length || validSizes(rule.sizes).some((candidate) => sameSize(candidate, size)))).map(sizeOption)
  const defaultRatio = declaredDefault(video.defaults.ratio, rules.map((rule) => rule.default_ratio))
  base.defaultRatio = base.ratios.includes(readText(defaultRatio)) ? readText(defaultRatio) : ''
  base.defaultResolution = base.resolutions.includes(readText(video.defaults.resolution)) ? readText(video.defaults.resolution) : ''
  base.defaultSize = base.sizes.some((size) => size.value === sizeValue(video.defaults.size)) ? sizeValue(video.defaults.size) : ''
  const defaultDuration = declaredDefault(video.defaults.duration, rules.map((rule) => rule.default_duration))
  if (typeof defaultDuration === 'number' && isVideoDurationAllowed(defaultDuration, base)) base.defaultDuration = defaultDuration
  base.media = intersectMedia([video.media, ...rules.flatMap((rule) => rule.media ? [rule.media] : [])])
  const limitFor = (type: VideoParameterReference['type']): number => Math.min(base.media!.max_total, Object.entries(base.media!.roles ?? {}).reduce((sum, [role, limit]) => sum + (ROLE_TYPES[role as UserVideoMediaRole] === type ? limit.max : 0), 0))
  base.maxImages = limitFor('image'); base.maxVideos = limitFor('video'); base.maxAudios = limitFor('audio')
  base.generateAudio = video.generate_audio
  base.controls = video.controls
  base.maxRequestBytes = integer(video.max_request_bytes, 1)
  base.inputMedia = intersectInputMedia([video.input_media, ...rules.map((rule) => rule.input_media)])
  base.parameterConfig = config ?? undefined
  return base
}

export function isVideoDurationAllowed(duration: number | undefined, options: NormalizedVideoOptions): boolean {
  if (duration === undefined) return options.omitDuration || (options.defaultDuration !== 0 && isVideoDurationAllowed(options.defaultDuration, options))
  if (duration === -1) return options.autoDuration
  if (!Number.isSafeInteger(duration) || duration <= 0 || options.autoOnly) return false
  if (options.durationValues !== undefined) return options.durationValues.includes(duration)
  return options.durationStep > 0 && duration >= options.minDuration && duration <= options.maxDuration && (duration - options.minDuration) % options.durationStep === 0
}

export function nearestAllowedVideoDuration(value: number, options: NormalizedVideoOptions): number {
  if (options.autoOnly) return options.autoDuration ? -1 : 0
  if (value === -1 && options.autoDuration) return -1
  if (options.durationValues !== undefined) {
    if (!options.durationValues.length) return options.autoDuration ? -1 : 0
    const target = Number.isFinite(value) ? value : options.defaultDuration > 0 ? options.defaultDuration : options.durationValues[0]
    return options.durationValues.reduce((nearest, candidate) => Math.abs(candidate - target) < Math.abs(nearest - target) ? candidate : nearest)
  }
  if (!options.durationStep || !options.minDuration) return options.autoDuration ? -1 : 0
  const target = Number.isFinite(value) ? value : options.defaultDuration > 0 ? options.defaultDuration : options.minDuration
  const index = Math.max(0, Math.min(Math.floor((options.maxDuration - options.minDuration) / options.durationStep), Math.round((target - options.minDuration) / options.durationStep)))
  return options.minDuration + index * options.durationStep
}

function acceptsCount(count: number | undefined, maximum: number): boolean { return count === undefined || (Number.isSafeInteger(count) && count >= 0 && count <= maximum) }
function countError(imageCount: number, videoCount: number, audioCount: number, options: NormalizedVideoOptions): VideoParameterError | null {
  if (!acceptsCount(imageCount, options.maxImages)) return 'images'
  if (!acceptsCount(videoCount, options.maxVideos)) return 'videos'
  if (!acceptsCount(audioCount, options.maxAudios)) return 'audios'
  // 产品仍限制单次只提交一种素材类型，后台放宽组合不会改变现有交互。
  return [imageCount, videoCount, audioCount].filter((count) => count > 0).length > 1 ? 'mixed-media' : null
}

export function validateVideoReferences(references: readonly VideoParameterReference[], options: NormalizedVideoOptions): VideoParameterError | null {
  if (!options.hasVideoOptions) return 'capability'
  const counts = { image: 0, video: 0, audio: 0 }
  for (const reference of references) { if (!(reference.type in counts)) return 'role'; counts[reference.type] += 1 }
  const error = countError(counts.image, counts.video, counts.audio, options)
  if (error) return error
  if (!options.hasParameterConfig) return references.some((reference) => reference.role === 'first_frame' || reference.role === 'last_frame' || reference.role === 'source_video') ? 'role' : null
  const media = options.media!
  if (references.length < media.min_total || references.length > media.max_total) return 'media-total'
  const roles: Partial<Record<UserVideoMediaRole, number>> = {}
  for (const reference of references) {
    if (!reference.role || ROLE_TYPES[reference.role] !== reference.type || !media.roles?.[reference.role]) return 'role'
    roles[reference.role] = (roles[reference.role] ?? 0) + 1
  }
  for (const [role, limit] of Object.entries(media.roles ?? {})) {
    const count = roles[role as UserVideoMediaRole] ?? 0
    if (count < limit.min || count > limit.max) return 'role'
  }
  for (const dependency of media.dependencies ?? []) {
    if (!roles[dependency.role]) continue
    if (dependency.requires?.some((role) => !roles[role]) || (dependency.requires_any?.length && !dependency.requires_any.some((role) => roles[role]))) return 'media-dependency'
  }
  if (media.exclusive_groups?.some((group) => group.filter((role) => (roles[role] ?? 0) > 0).length > 1)) return 'media-exclusive'
  return null
}

function modeMatchesIntent(mode: string, references: readonly VideoParameterReference[]): boolean {
  const roles = MODE_ROLES[mode as UserVideoMode]
  if (!roles || references.some((reference) => !reference.role || !roles.includes(reference.role))) return false
  if (mode === 'text_to_video') return references.length === 0
  return references.length > 0
}

export function resolveVideoMode(options: NormalizedVideoOptions, references: readonly VideoParameterReference[], firstLast: boolean): string {
  if (!options.hasParameterConfig) return ''
  // 模式语义只用于候选排序，实际准入必须由返回的角色、数量及依赖规则决定。
  const preferred = options.modes.filter((mode) => modeMatchesIntent(mode, references))
  const candidates = [...new Set(options.selection?.mode ? [options.selection.mode] : [modeMatchesIntent(options.defaultMode, references) ? options.defaultMode : '', ...(firstLast ? ['first_last_frame', 'image_to_video'] : []), ...preferred, ...options.modes])].filter((mode) => options.modes.includes(mode))
  for (const mode of candidates) {
    const effective = normalizeVideoOptions(undefined, options.parameterConfig, { ...options.selection, mode })
    if (!validateVideoReferences(references, effective)) return mode
  }
  return ''
}

export function resolveVideoReferenceMode(options: NormalizedVideoOptions, type: VideoParameterReference['type']): string {
  if (!options.hasParameterConfig) return ''
  const preferred = type === 'image' ? ['reference_to_video', 'image_to_video', 'first_last_frame'] : type === 'video' ? ['reference_to_video', 'video_edit', 'video_extend'] : ['reference_to_video']
  const modes = [...new Set(options.selection?.mode ? [options.selection.mode] : [preferred.includes(options.defaultMode) ? options.defaultMode : '', ...preferred, ...options.modes])].filter((mode) => options.modes.includes(mode))
  for (const mode of modes) {
    const effective = normalizeVideoOptions(undefined, options.parameterConfig, { ...options.selection, mode })
    if (effective.media!.max_total > 0 && Object.entries(effective.media!.roles ?? {}).some(([role, limit]) => ROLE_TYPES[role as UserVideoMediaRole] === type && limit.max > 0)) return mode
  }
  return ''
}

export function getVideoReferenceRole(options: NormalizedVideoOptions, type: VideoParameterReference['type']): UserVideoMediaRole | undefined {
  if (!options.hasParameterConfig) return options.hasVideoOptions ? ({ image: 'reference_image', video: 'reference_video', audio: 'reference_audio' } as const)[type] : undefined
  const mode = resolveVideoReferenceMode(options, type)
  if (!mode) return undefined
  const effective = normalizeVideoOptions(undefined, options.parameterConfig, { ...options.selection, mode })
  const candidates = [...new Set([...(MODE_ROLES[mode as UserVideoMode] ?? []), ...Object.keys(ROLE_TYPES) as UserVideoMediaRole[]])]
  return candidates.find((role) => ROLE_TYPES[role] === type && (effective.media?.roles?.[role]?.max ?? 0) > 0)
}

export function validateVideoParameters(parameters: VideoParameters, options: NormalizedVideoOptions): VideoParameterError | null {
  if (!options.hasVideoOptions) return 'capability'
  // 仅填充服务端明确声明的默认值；省略参数不能被当成默认选择列表首项。
  parameters = { ...parameters, size: parameters.size ?? (!parameters.resolution && !parameters.ratio ? options.defaultSize || undefined : undefined) }
  const first = options.hasParameterConfig ? normalizeVideoOptions(undefined, options.parameterConfig, { mode: parameters.mode ?? (options.defaultMode || undefined), ratio: parameters.ratio, resolution: parameters.resolution ?? (!parameters.size ? options.defaultResolution || undefined : undefined) }) : options
  parameters = { ...parameters, mode: parameters.mode ?? (first.defaultMode || undefined), ratio: parameters.ratio ?? (!parameters.size ? first.defaultRatio || undefined : undefined), resolution: parameters.resolution ?? (!parameters.size ? first.defaultResolution || undefined : undefined) }
  const effective = options.hasParameterConfig ? normalizeVideoOptions(undefined, options.parameterConfig, { mode: parameters.mode, ratio: parameters.ratio, resolution: parameters.resolution }) : options
  if (effective.requiresPrompt && !parameters.prompt.trim()) return 'prompt'
  if (effective.hasParameterConfig && (!parameters.mode || !effective.modes.includes(parameters.mode))) return 'mode'
  if (!isVideoDurationAllowed(parameters.duration, effective)) return 'duration'
  if (parameters.size) {
    if (!effective.sizes.some((size) => size.value === parameters.size) || parameters.resolution) return 'size'
  } else if (effective.resolutions.length ? !effective.resolutions.includes(parameters.resolution ?? '') : Boolean(parameters.resolution) || effective.sizes.length > 0) return 'resolution'
  if ((!parameters.size || parameters.ratio) && (effective.ratios.length ? !effective.ratios.includes(parameters.ratio ?? '') : Boolean(parameters.ratio))) return 'ratio'
  if (parameters.generateAudio !== undefined && (!effective.generateAudio?.supported || typeof parameters.generateAudio !== 'boolean')) return 'audio-generation'
  const references = parameters.references ?? []
  const imageCount = parameters.imageCount ?? references.filter((reference) => reference.type === 'image').length
  const videoCount = parameters.videoCount ?? references.filter((reference) => reference.type === 'video').length
  const audioCount = parameters.audioCount ?? references.filter((reference) => reference.type === 'audio').length
  const error = countError(imageCount, videoCount, audioCount, effective)
  if (error) return error
  if (effective.hasParameterConfig && imageCount + videoCount + audioCount !== references.length) return 'role'
  const referenceError = validateVideoReferences(references, effective)
  if (referenceError) return referenceError
  return null
}
