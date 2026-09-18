import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MODEL_API_BASE_URL } from './model-runtime'
import { VideoRuntimeError, cancelVideoTask, getVideoTask, submitVideoGeneration, videoTaskIsTerminal } from './video-runtime'
import type { VideoGenerationInput, VideoReference } from './video-runtime'
import type { UserModelParameterConfig, UserVideoOptions, UserVideoParameterConfig } from './user-models'

const DEFAULT_INPUT = {
  accessToken: 'user-access-token',
  model: 'cogvideo-public',
  prompt: '海边日落，镜头缓慢推进',
  duration: 5,
  size: '',
  ratio: '16:9',
  videoOptions: { family: 'cogvideo', ratios: ['16:9'], resolutions: ['720p'], min_duration: 2, max_duration: 10, default_duration: 5, default_resolution: '720p', max_images: 1 },
  inputReference: 'https://example.com/reference.png',
  idempotencyKey: 'video-submit-1',
}

const SEEDANCE_OPTIONS: UserVideoOptions = {
  family: 'seedance',
  ratios: ['adaptive', '16:9', '9:16'],
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
}

const SEEDANCE_CONFIG: UserVideoParameterConfig = {
  protocol: 'seedance',
  max_request_bytes: 64 * 1024 * 1024,
  modes: ['text_to_video', 'image_to_video', 'first_last_frame', 'reference_to_video', 'video_edit', 'video_extend'],
  ratios: ['adaptive', '16:9', '9:16'],
  resolutions: ['480p', '720p', '1080p'],
  sizes: null,
  durations: { min: 4, max: 30, step: 1, auto: true, omit_allowed: true },
  defaults: { mode: 'reference_to_video', resolution: '720p', ratio: 'adaptive' },
  media: {
    min_total: 0, max_total: 12,
    roles: {
      first_frame: { min: 0, max: 1 }, last_frame: { min: 0, max: 1 },
      reference_image: { min: 0, max: 9 }, reference_video: { min: 0, max: 3 }, reference_audio: { min: 0, max: 3 },
    },
    dependencies: [{ role: 'last_frame', requires: ['first_frame'] }],
    exclusive_groups: [['first_frame', 'reference_image'], ['first_frame', 'reference_video'], ['first_frame', 'reference_audio']],
  },
  rules: [
    { mode: 'first_last_frame', allowed_ratios: ['adaptive'], media: { min_total: 2, max_total: 2, roles: { first_frame: { min: 1, max: 1 }, last_frame: { min: 1, max: 1 } } } },
    { mode: 'video_edit', allowed_ratios: ['adaptive'], durations: { min: 4, max: 30, step: 1, auto: true, auto_only: true }, media: { min_total: 1, max_total: 1, roles: { reference_video: { min: 1, max: 1 } } } },
  ],
}

function parameterConfig(overrides: Partial<UserVideoParameterConfig> = {}): UserModelParameterConfig {
  return { schema_version: 1, video: { ...SEEDANCE_CONFIG, ...overrides } }
}

function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

describe('视频任务运行时请求', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('提交时发送登录态令牌、会话标记、幂等键和媒体参数，并使用后端任务头兜底任务 ID', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ status: 'queued' }, 202, {
      'X-Request-ID': 'server-request-1',
      'X-ThinkGo-Task-ID': 'task_local_1',
    }))

    await expect(submitVideoGeneration(DEFAULT_INPUT)).resolves.toMatchObject({
      taskId: 'task_local_1',
      status: 'pending',
      requestId: 'server-request-1',
    })

    const [url, options] = fetchMock.mock.calls[0]
    expect(String(url)).toBe(`${MODEL_API_BASE_URL}/videos`)
    expect(options?.method).toBe('POST')
    expect(options?.credentials).toBe('omit')
    const headers = new Headers(options?.headers)
    expect(headers.get('Authorization')).toBe('Bearer user-access-token')
    expect(headers.get('X-ThinkGo-User-Session')).toBe('1')
    expect(headers.get('Idempotency-Key')).toBe('video-submit-1')
    expect(headers.get('X-Request-ID')).toBeTruthy()
    expect(headers.get('X-App-Lang')).toBe('zh-CN')
    expect(JSON.parse(String(options?.body))).toEqual({
      model: 'cogvideo-public',
      prompt: '海边日落，镜头缓慢推进',
      duration: 5,
      seconds: '5',
      resolution: '720p',
      ratio: '16:9',
      input_reference: 'https://example.com/reference.png',
    })
  })

  it('查询时使用本地任务 ID，并归一化 OpenAI 视频状态和 metadata 结果地址', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      id: 'task_local_2',
      status: 'completed',
      msg: 'success',
      progress: '100%',
      metadata: { url: 'https://cdn.example.com/video.mp4' },
    }, 200, { 'X-Request-ID': 'server-request-2' }))

    await expect(getVideoTask('user-access-token', 'task/local 2')).resolves.toMatchObject({
      taskId: 'task_local_2',
      status: 'succeeded',
      progress: 100,
      resultUrl: 'https://cdn.example.com/video.mp4',
      errorMessage: null,
      requestId: 'server-request-2',
    })
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`${MODEL_API_BASE_URL}/videos/task%2Flocal%202`)
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('GET')
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('X-ThinkGo-User-Session')).toBe('1')
  })

  it('取消时使用 DELETE，并把取消请求保留为非终态以等待服务端确认', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ status: 'cancel_requested' }))

    await expect(cancelVideoTask('user-access-token', 'task-3')).resolves.toMatchObject({ taskId: 'task-3', status: 'cancelling' })
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`${MODEL_API_BASE_URL}/videos/task-3`)
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('DELETE')
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('X-ThinkGo-User-Session')).toBe('1')
  })

  it('把文档里的 cancelling 字面值也归一化为取消中，而不是兜底成状态未知', async () => {
    // 取消视频任务.md 的响应示例就是 {"status":"cancelling"}；漏掉这个值会被当成 unknown，
    // 前端会立刻渲染成失败卡并停止轮询。
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ task_id: 'task-4', status: 'cancelling' }))

    await expect(cancelVideoTask('user-access-token', 'task-4')).resolves.toMatchObject({ taskId: 'task-4', status: 'cancelling' })
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('DELETE')
  })

  it('拒绝缺少关键字段，并保留服务端错误的状态、错误码和请求号', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    await expect(submitVideoGeneration({ ...DEFAULT_INPUT, accessToken: ' ' })).rejects.toMatchObject({ status: 401, code: 'invalid_user_session' })
    await expect(submitVideoGeneration({ ...DEFAULT_INPUT, prompt: ' ' })).rejects.toMatchObject({ status: 400, code: 'invalid_request' })
    await expect(getVideoTask(DEFAULT_INPUT.accessToken, ' ')).rejects.toMatchObject({ status: 400, code: 'task_id_required' })
    expect(fetchMock).not.toHaveBeenCalled()

    vi.mocked(globalThis.fetch).mockResolvedValue(jsonResponse({ error: { message: '余额不足', code: 'insufficient_balance' } }, 402, { 'X-Request-ID': 'billing-request-1' }))
    await expect(submitVideoGeneration(DEFAULT_INPUT)).rejects.toMatchObject({
      name: 'VideoRuntimeError',
      status: 402,
      code: 'insufficient_balance',
      message: '余额不足',
      requestId: 'billing-request-1',
    })

    vi.mocked(globalThis.fetch).mockResolvedValue(jsonResponse({
      msg: '完成实名认证后才能生成视频',
      error: { message: 'fallback message', code: 'real_name_required' },
    }, 403))
    await expect(submitVideoGeneration(DEFAULT_INPUT)).rejects.toMatchObject({
      name: 'VideoRuntimeError',
      status: 403,
      code: 'real_name_required',
      message: '完成实名认证后才能生成视频',
    })

    vi.mocked(globalThis.fetch).mockResolvedValue(jsonResponse({
      code: 170008,
      msg: '完成实名认证后才能生成视频',
      data: {},
    }, 200))
    await expect(submitVideoGeneration(DEFAULT_INPUT)).rejects.toMatchObject({
      name: 'VideoRuntimeError',
      status: 200,
      code: '170008',
      message: '完成实名认证后才能生成视频',
    })
  })

  it('只把明确的终态作为轮询结束条件，并保留错误实例类型', () => {
    expect(videoTaskIsTerminal('pending')).toBe(false)
    expect(videoTaskIsTerminal('processing')).toBe(false)
    expect(videoTaskIsTerminal('cancelling')).toBe(false)
    expect(videoTaskIsTerminal('succeeded')).toBe(true)
    expect(videoTaskIsTerminal('failed')).toBe(true)
    expect(videoTaskIsTerminal('cancelled')).toBe(true)
    expect(new VideoRuntimeError('test', 500, 'test_error', 'request-1')).toBeInstanceOf(Error)
  })

  it.each([
    { type: 'image', extension: 'png', role: 'reference_image' },
    { type: 'video', extension: 'mp4', role: 'reference_video' },
    { type: 'audio', extension: 'mp3', role: 'reference_audio' },
  ] as const)('按目录规格提交比例、分辨率及自动时长，并映射单类 $type 素材', async ({ type, extension, role }) => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ id: 'seedance-task', status: 'queued' }))
    const firstUrl = `https://example.com/reference.${extension}`
    const secondUrl = `https://example.com/reference-2.${extension}`
    await submitVideoGeneration({
      ...DEFAULT_INPUT,
      inputReference: undefined,
      model: 'seedance-public',
      prompt: `  ${DEFAULT_INPUT.prompt}\n`,
      duration: -1,
      resolution: '1080p',
      ratio: '9:16',
      videoOptions: SEEDANCE_OPTIONS,
      references: [
        { type, url: ` ${firstUrl} ` },
        { type, url: secondUrl, role },
        { type, url: firstUrl, role },
      ],
    })
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      model: 'seedance-public',
      prompt: DEFAULT_INPUT.prompt,
      duration: -1,
      seconds: '-1',
      resolution: '1080p',
      ratio: '9:16',
      metadata: { content: [
        { type: 'text', text: DEFAULT_INPUT.prompt },
        { type: `${type}_url`, [`${type}_url`]: { url: firstUrl }, role },
        { type: `${type}_url`, [`${type}_url`]: { url: secondUrl }, role },
      ] },
    })
  })

  it.each([
    ['image', 'video'], ['image', 'audio'], ['video', 'audio'], ['image', 'video', 'audio'],
  ] satisfies VideoReference['type'][][])('在请求前拒绝混合素材 %s / %s', async (...types) => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    const references = types.map((type) => ({ type, url: `https://example.com/${type}` }))
    await expect(submitVideoGeneration({ ...DEFAULT_INPUT, inputReference: undefined, videoOptions: SEEDANCE_OPTIONS, references })).rejects.toMatchObject({ code: 'invalid_request', status: 400 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('旧单图字段与新音视频参考并存时也拒绝请求', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    await expect(submitVideoGeneration({ ...DEFAULT_INPUT, videoOptions: SEEDANCE_OPTIONS, references: [{ type: 'video', url: 'https://example.com/reference.mp4' }] })).rejects.toMatchObject({ code: 'invalid_request', status: 400 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('历史本地图片仍可沿用 Data URL，且与相同旧单图字段去重', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ id: 'historical-image-task' }))
    const url = 'data:image/png;base64,aGVsbG8='
    await submitVideoGeneration({ ...DEFAULT_INPUT, inputReference: url, videoOptions: SEEDANCE_OPTIONS, references: [{ type: 'image', url }] })
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      metadata: { content: [
        { type: 'text', text: DEFAULT_INPUT.prompt },
        { type: 'image_url', image_url: { url }, role: 'reference_image' },
      ] },
    })
  })

  it('首尾帧保留各自角色，旧单图字段不重复加入参考素材', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ id: 'frames-task' }))
    await submitVideoGeneration({
      ...DEFAULT_INPUT,
      size: undefined,
      ratio: undefined,
      parameterConfig: parameterConfig(),
      generationMode: 'first_last_frame',
      videoOptions: { ...SEEDANCE_OPTIONS, max_images: 2 },
      references: [
        { type: 'image', url: DEFAULT_INPUT.inputReference, role: 'first_frame' },
        { type: 'image', url: 'https://example.com/last.png', role: 'last_frame' },
      ],
    })
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      resolution: '720p',
      ratio: 'adaptive',
      metadata: { content: [
        { type: 'text', text: DEFAULT_INPUT.prompt },
        { type: 'image_url', image_url: { url: DEFAULT_INPUT.inputReference }, role: 'first_frame' },
        { type: 'image_url', image_url: { url: 'https://example.com/last.png' }, role: 'last_frame' },
      ] },
    })
  })

  it('requires_prompt:false 允许以参考素材生成，缺失提示词能力字段时仍要求提示词', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ id: 'optional-prompt-task' }))
    await expect(submitVideoGeneration({ ...DEFAULT_INPUT, prompt: ' ', videoOptions: { ...SEEDANCE_OPTIONS, requires_prompt: false } })).resolves.toMatchObject({ taskId: 'optional-prompt-task' })
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      prompt: '',
      metadata: { content: [{ type: 'image_url', image_url: { url: DEFAULT_INPUT.inputReference }, role: 'reference_image' }] },
    })
    await expect(submitVideoGeneration({ ...DEFAULT_INPUT, prompt: ' ', videoOptions: { ...SEEDANCE_OPTIONS, requires_prompt: undefined } })).rejects.toMatchObject({ code: 'invalid_request' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['低于最小时长', { duration: 3 }],
    ['超过最大时长', { duration: 16 }],
    ['非整数时长', { duration: 4.5 }],
    ['关闭自动时长后传 -1', { duration: -1, videoOptions: { ...SEEDANCE_OPTIONS, auto_duration: false } }],
    ['不支持的分辨率', { resolution: '4k' }],
    ['不支持的比例', { ratio: '2:1' }],
    ['兼容选项未声明的模式', { generationMode: 'reference_to_video' }],
    ['图片数量超过上限', { videoOptions: { ...SEEDANCE_OPTIONS, max_images: 0 } }],
    ['视频数量超过上限', { inputReference: undefined, references: [{ type: 'video', url: 'https://example.com/reference.mp4' }], videoOptions: { ...SEEDANCE_OPTIONS, max_videos: 0 } }],
    ['音频数量超过上限', { inputReference: undefined, references: [{ type: 'audio', url: 'https://example.com/reference.mp3' }], videoOptions: { ...SEEDANCE_OPTIONS, max_audios: 0 } }],
  ] satisfies Array<[string, Partial<VideoGenerationInput>]>)('在请求前拒绝%s', async (_name, overrides) => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    await expect(submitVideoGeneration({ ...DEFAULT_INPUT, videoOptions: SEEDANCE_OPTIONS, ...overrides })).rejects.toMatchObject({ code: 'invalid_request', status: 400 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    { type: 'image', url: 'javascript:alert(1)' },
    { type: 'image', url: 'blob:https://example.com/local-object' },
    { type: 'image', url: 'https://user:password@example.com/reference.png' },
    { type: 'image', url: 'data:text/html;base64,PGgxPmhlbGxvPC9oMT4=' },
    { type: 'video', url: 'data:video/mp4;base64,aGVsbG8=' },
    { type: 'audio', url: 'https://example.com/audio.mp3', role: 'first_frame' },
  ] satisfies VideoReference[])('拒绝无效素材地址或角色 $type $role', async (reference) => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    await expect(submitVideoGeneration({ ...DEFAULT_INPUT, videoOptions: SEEDANCE_OPTIONS, references: [reference] })).rejects.toMatchObject({ code: 'invalid_request' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('拒绝重复首帧角色及未知协议的多素材，避免静默丢失已选素材', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    const references: VideoReference[] = [
      { type: 'image', url: 'https://example.com/first.png', role: 'first_frame' },
      { type: 'image', url: 'https://example.com/another-first.png', role: 'first_frame' },
    ]
    await expect(submitVideoGeneration({ ...DEFAULT_INPUT, inputReference: undefined, videoOptions: SEEDANCE_OPTIONS, references })).rejects.toMatchObject({ code: 'invalid_request' })
    await expect(submitVideoGeneration({ ...DEFAULT_INPUT, inputReference: undefined, videoOptions: { ...SEEDANCE_OPTIONS, family: 'unknown' }, references: [{ type: 'video', url: 'https://example.com/video.mp4' }] })).rejects.toMatchObject({ code: 'invalid_request' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('首尾帧与全模态参考不能混用，尾帧必须搭配首帧', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    const firstFrame: VideoReference = { type: 'image', url: 'https://example.com/first.png', role: 'first_frame' }
    const lastFrame: VideoReference = { type: 'image', url: 'https://example.com/last.png', role: 'last_frame' }
    await expect(submitVideoGeneration({ ...DEFAULT_INPUT, inputReference: undefined, videoOptions: SEEDANCE_OPTIONS, references: [lastFrame] })).rejects.toMatchObject({ code: 'invalid_request' })
    await expect(submitVideoGeneration({ ...DEFAULT_INPUT, inputReference: undefined, videoOptions: SEEDANCE_OPTIONS, references: [firstFrame, { type: 'audio', url: 'https://example.com/audio.mp3' }] })).rejects.toMatchObject({ code: 'invalid_request' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('读取 Seedance 原生 content 内的成片地址和尾帧缩略图', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      data: { id: 'seedance-result', status: 'succeeded', content: { video_url: 'https://example.com/result.mp4', last_frame_url: 'https://example.com/last-frame.png' } },
    }))
    await expect(getVideoTask(DEFAULT_INPUT.accessToken, 'seedance-result')).resolves.toMatchObject({
      taskId: 'seedance-result',
      status: 'succeeded',
      resultUrl: 'https://example.com/result.mp4',
      thumbnailUrl: 'https://example.com/last-frame.png',
    })
  })

  it('完整配置优先于旧选项，传递明确模式以及可控参数的 false/0 默认值', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ id: 'configured-task' }))
    await submitVideoGeneration({
      ...DEFAULT_INPUT, size: undefined, ratio: undefined, inputReference: undefined,
      videoOptions: { ...SEEDANCE_OPTIONS, resolutions: ['480p'], max_duration: 2 },
      parameterConfig: parameterConfig({
        defaults: { mode: 'text_to_video', ratio: '16:9', resolution: '1080p', duration: 10 },
        generate_audio: { supported: true, default: false },
        controls: {
          watermark: { supported: true, default: false }, return_last_frame: { supported: true, default: false },
          web_search: { supported: true, default: true }, priority: { supported: true, min: 0, max: 9, default: 0 },
          output_format: { supported: true, values: ['mp4', 'mov'], default: 'mp4' },
          service_tier: { supported: false, default: 'invalid' }, callback_url: { supported: true },
        },
      }),
      duration: undefined,
    })
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      model: DEFAULT_INPUT.model, prompt: DEFAULT_INPUT.prompt, duration: 10, seconds: '10',
      generation_mode: 'text_to_video', resolution: '1080p', ratio: '16:9', generate_audio: false,
      watermark: false, return_last_frame: false, priority: 0, output_format: 'mp4', tools: [{ type: 'web_search' }],
    })
  })

  it('仅允许省略时长时不补默认秒数，关闭检索时保留空 tools', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ id: 'omitted-duration' }))
    await submitVideoGeneration({
      ...DEFAULT_INPUT, size: undefined, ratio: undefined, inputReference: undefined, duration: undefined, generationMode: 'text_to_video',
      parameterConfig: parameterConfig({ controls: { web_search: { supported: true, default: false } } }),
    })
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      model: DEFAULT_INPUT.model, prompt: DEFAULT_INPUT.prompt, generation_mode: 'text_to_video', resolution: '720p', ratio: 'adaptive', tools: [],
    })
  })

  it('默认模式命中的规则先收敛比例与时长，再构造实际请求', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ id: 'conditional-default-task' }))
    await submitVideoGeneration({
      ...DEFAULT_INPUT, size: undefined, ratio: undefined, duration: undefined,
      parameterConfig: parameterConfig({
        defaults: { mode: 'first_last_frame', resolution: '720p', ratio: '16:9', duration: 5 },
        rules: [{ mode: 'first_last_frame', allowed_ratios: ['adaptive'], default_ratio: 'adaptive', default_duration: 10 }],
      }),
      references: [{ type: 'image', url: DEFAULT_INPUT.inputReference, role: 'first_frame' }, { type: 'image', url: 'https://example.com/end.png', role: 'last_frame' }],
    })
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({ generation_mode: 'first_last_frame', resolution: '720p', ratio: 'adaptive', duration: 10, seconds: '10' })
  })

  it('精确尺寸由完整允许列表选择，不同时提交可能冲突的分辨率和比例', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ id: 'size-task' }))
    await submitVideoGeneration({
      ...DEFAULT_INPUT, inputReference: undefined, ratio: undefined, size: '720x1280',
      parameterConfig: parameterConfig({ resolutions: null, ratios: null, sizes: [{ width: 720, height: 1280 }], defaults: { mode: 'text_to_video' }, rules: [] }),
    })
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      model: DEFAULT_INPUT.model, prompt: DEFAULT_INPUT.prompt, duration: 5, seconds: '5', generation_mode: 'text_to_video', size: '720x1280',
    })
  })

  it('选择分辨率后不补入精确尺寸默认值，也不从旧选项借用供应商协议', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ id: 'generic-image-task' }))
    await submitVideoGeneration({
      ...DEFAULT_INPUT, size: '', resolution: '720p', videoOptions: SEEDANCE_OPTIONS, generationMode: 'image_to_video',
      parameterConfig: parameterConfig({
        protocol: undefined,
        sizes: [{ width: 1280, height: 720 }],
        defaults: { mode: 'image_to_video', resolution: '720p', ratio: '16:9', size: { width: 1280, height: 720 } },
        media: { min_total: 1, max_total: 1, roles: { first_frame: { min: 1, max: 1 } } },
      }),
    })
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(body).toMatchObject({ generation_mode: 'image_to_video', resolution: '720p', ratio: '16:9', input_reference: DEFAULT_INPUT.inputReference })
    expect(body).not.toHaveProperty('size')
    expect(body).not.toHaveProperty('metadata')
  })

  it('完整合同声明的 source_video 角色原样交给平台，不猜测供应商角色转换', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ id: 'source-video-task' }))
    await submitVideoGeneration({
      ...DEFAULT_INPUT, size: undefined, ratio: undefined, inputReference: undefined, generationMode: 'video_extend',
      parameterConfig: parameterConfig({ media: { min_total: 1, max_total: 1, roles: { source_video: { min: 1, max: 1 } } } }),
      references: [{ type: 'video', url: 'https://example.com/source.mp4', role: 'source_video' }],
    })
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      generation_mode: 'video_extend',
      metadata: { content: [{ type: 'text', text: DEFAULT_INPUT.prompt }, { type: 'video_url', video_url: { url: 'https://example.com/source.mp4' }, role: 'source_video' }] },
    })
  })

  it('历史图片只校验 Data URL 语法，不将 MIME 标签当作已验证的真实格式', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ id: 'tiff-reference-task' }))
    const input: VideoGenerationInput = {
      ...DEFAULT_INPUT, size: undefined, ratio: undefined, inputReference: 'data:image/tiff;base64,aGVsbG8=',
      parameterConfig: parameterConfig({ input_media: { image: { validation: 'provider', formats: ['tiff', 'png'], max_bytes: 30 * 1024 * 1024 } } }),
    }
    await submitVideoGeneration(input)
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({ metadata: { content: [{ type: 'text', text: DEFAULT_INPUT.prompt }, { type: 'image_url', image_url: { url: input.inputReference }, role: 'reference_image' }] } })
    fetchMock.mockResolvedValue(jsonResponse({ id: 'provider-validates-format' }))
    await expect(submitVideoGeneration({ ...input, inputReference: 'data:image/gif;base64,aGVsbG8=' })).resolves.toMatchObject({ taskId: 'provider-validates-format' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('编辑模式执行时长和素材条件，且不发送与模式冲突的原生 auto 默认', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ id: 'edit-task' }))
    const input: VideoGenerationInput = {
      ...DEFAULT_INPUT, size: undefined, ratio: undefined, inputReference: undefined, generationMode: 'video_edit',
      parameterConfig: parameterConfig({ controls: { omni_reference_task_type: { supported: true, values: ['auto', 'reference', 'edit', 'extend'], default: 'auto' } } }),
      references: [{ type: 'video', url: 'https://example.com/source.mp4', role: 'reference_video' }],
    }
    await expect(submitVideoGeneration(input)).rejects.toMatchObject({ code: 'invalid_request' })
    expect(fetchMock).not.toHaveBeenCalled()
    await submitVideoGeneration({ ...input, duration: -1 })
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(body).toMatchObject({ generation_mode: 'video_edit', duration: -1, ratio: 'adaptive' })
    expect(body).not.toHaveProperty('omni_reference_task_type')
  })

  it('最终请求上限使用 UTF-8 JSON 字节数，边界可提交而不是按字符数误放行', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse({ id: 'body-limit-task' }))
    const input = { ...DEFAULT_INPUT, size: undefined, ratio: undefined, prompt: '中文提示词'.repeat(40), parameterConfig: parameterConfig() }
    await submitVideoGeneration(input)
    const serialized = String(fetchMock.mock.calls[0]?.[1]?.body)
    const bytes = new TextEncoder().encode(serialized).byteLength
    expect(bytes).toBeGreaterThan(serialized.length)
    await expect(submitVideoGeneration({ ...input, parameterConfig: parameterConfig({ max_request_bytes: bytes - 1 }) })).rejects.toMatchObject({ code: 'invalid_request' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await submitVideoGeneration({ ...input, parameterConfig: parameterConfig({ max_request_bytes: bytes }) })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['未知模型能力', { videoOptions: undefined, parameterConfig: undefined }],
    ['没有声明音频生成能力', { generateAudio: false }],
    ['不支持音频生成', { generateAudio: true, parameterConfig: parameterConfig({ generate_audio: { supported: false } }) }],
    ['没有声明的模式', { generationMode: 'unknown_mode' }],
    ['未允许的素材角色', { inputReference: undefined, references: [{ type: 'video', url: 'https://example.com/source.mp4', role: 'source_video' }] }],
    ['未允许省略时长', { duration: undefined, parameterConfig: parameterConfig({ durations: { values: [5, 10], auto: false } }) }],
    ['时长不在枚举内', { duration: 6, parameterConfig: parameterConfig({ durations: { values: [5, 10], auto: false } }) }],
    ['时长不符合步长', { duration: 5, parameterConfig: parameterConfig({ durations: { min: 4, max: 10, step: 2, auto: false } }) }],
    ['素材总数上限为零', { inputReference: DEFAULT_INPUT.inputReference, parameterConfig: parameterConfig({ media: { min_total: 0, max_total: 0, roles: null } }) }],
    ['控制默认值超过 UTF-8 长度限制', { parameterConfig: parameterConfig({ controls: { safety_identifier: { supported: true, default: '中文', max_length: 5 } } }) }],
    ['控制默认值不符合格式', { parameterConfig: parameterConfig({ controls: { callback_url: { supported: true, default: 'https://name:password@example.com', format: 'http_url' } } }) }],
    ['控制默认值超过整数范围', { parameterConfig: parameterConfig({ controls: { priority: { supported: true, min: 0, max: 9, default: 10 } } }) }],
  ] satisfies Array<[string, Partial<VideoGenerationInput>]>)('完整合同在请求前拒绝%s', async (_name, overrides) => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    await expect(submitVideoGeneration({ ...DEFAULT_INPUT, size: undefined, ratio: undefined, parameterConfig: parameterConfig(), ...overrides })).rejects.toMatchObject({ code: 'invalid_request', status: 400 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('完整解析超过 4096 字符的提交和查询响应，不丢失任务状态与结果', async () => {
    const payload = { prompt: '提示'.repeat(5000), id: 'long-response-task', status: 'completed', result_url: 'https://cdn.example.com/long.mp4' }
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse(payload))

    const expected = { taskId: 'long-response-task', status: 'succeeded', resultUrl: 'https://cdn.example.com/long.mp4' }
    await expect(submitVideoGeneration(DEFAULT_INPUT)).resolves.toMatchObject(expected)
    await expect(getVideoTask(DEFAULT_INPUT.accessToken, 'long-response-task')).resolves.toMatchObject(expected)
  })

  it('损坏的成功响应不能使用请求任务 ID 兜底成仍在生成', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{broken', { status: 200, headers: { 'X-Request-ID': 'invalid-response-id' } }))
    await expect(getVideoTask(DEFAULT_INPUT.accessToken, 'known-task')).rejects.toMatchObject({ code: 'invalid_response', status: 502, requestId: 'invalid-response-id' })
  })

  it('继续兼容只有任务 ID 响应头的异步提交', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 202, headers: { 'X-ThinkGo-Task-ID': 'header-only-task' } }))
    await expect(submitVideoGeneration(DEFAULT_INPUT)).resolves.toMatchObject({ taskId: 'header-only-task', status: 'pending' })
  })

  it('长错误响应仍能解析错误码，并只限制展示文案长度', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ metadata: 'x'.repeat(5000), error: { code: 'upstream_error', message: '错'.repeat(5000) } }, 502))
    await expect(getVideoTask(DEFAULT_INPUT.accessToken, 'known-task')).rejects.toMatchObject({ code: 'upstream_error', status: 502, message: '错'.repeat(4096) })
  })
})
