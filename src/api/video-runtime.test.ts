import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MODEL_API_BASE_URL } from './model-runtime'
import { VideoRuntimeError, cancelVideoTask, getVideoTask, submitVideoGeneration, videoTaskIsTerminal } from './video-runtime'

const DEFAULT_INPUT = {
  apiKey: 'nx_live_video_key',
  model: 'cogvideo-public',
  prompt: '海边日落，镜头缓慢推进',
  duration: 5,
  size: '1280x720',
  inputReference: 'https://example.com/reference.png',
  idempotencyKey: 'video-submit-1',
}

function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

describe('视频任务运行时请求', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('提交时发送 API Key、幂等键和媒体参数，并使用后端任务头兜底任务 ID', async () => {
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
    expect(headers.get('Authorization')).toBe('Bearer nx_live_video_key')
    expect(headers.get('Idempotency-Key')).toBe('video-submit-1')
    expect(headers.get('X-Request-ID')).toBeTruthy()
    expect(headers.get('X-App-Lang')).toBe('zh-CN')
    expect(JSON.parse(String(options?.body))).toEqual({
      model: 'cogvideo-public',
      prompt: '海边日落，镜头缓慢推进',
      duration: 5,
      seconds: '5',
      size: '1280x720',
      input_reference: 'https://example.com/reference.png',
    })
  })

  it('查询时使用本地任务 ID，并归一化 OpenAI 视频状态和 metadata 结果地址', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      id: 'task_local_2',
      status: 'completed',
      progress: '100%',
      metadata: { url: 'https://cdn.example.com/video.mp4' },
    }, 200, { 'X-Request-ID': 'server-request-2' }))

    await expect(getVideoTask('nx_live_video_key', 'task/local 2')).resolves.toMatchObject({
      taskId: 'task_local_2',
      status: 'succeeded',
      progress: 100,
      resultUrl: 'https://cdn.example.com/video.mp4',
      requestId: 'server-request-2',
    })
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`${MODEL_API_BASE_URL}/videos/task%2Flocal%202`)
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('GET')
  })

  it('取消时使用 DELETE，并把取消请求保留为非终态以等待服务端确认', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ status: 'cancel_requested' }))

    await expect(cancelVideoTask('nx_live_video_key', 'task-3')).resolves.toMatchObject({ taskId: 'task-3', status: 'cancelling' })
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`${MODEL_API_BASE_URL}/videos/task-3`)
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('DELETE')
  })

  it('拒绝缺少关键字段，并保留服务端错误的状态、错误码和请求号', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    await expect(submitVideoGeneration({ ...DEFAULT_INPUT, apiKey: ' ' })).rejects.toMatchObject({ status: 401, code: 'api_key_required' })
    await expect(submitVideoGeneration({ ...DEFAULT_INPUT, prompt: ' ' })).rejects.toMatchObject({ status: 400, code: 'invalid_request' })
    await expect(getVideoTask(DEFAULT_INPUT.apiKey, ' ')).rejects.toMatchObject({ status: 400, code: 'task_id_required' })
    expect(fetchMock).not.toHaveBeenCalled()

    vi.mocked(globalThis.fetch).mockResolvedValue(jsonResponse({ error: { message: '余额不足', code: 'insufficient_balance' } }, 402, { 'X-Request-ID': 'billing-request-1' }))
    await expect(submitVideoGeneration(DEFAULT_INPUT)).rejects.toMatchObject({
      name: 'VideoRuntimeError',
      status: 402,
      code: 'insufficient_balance',
      message: '余额不足',
      requestId: 'billing-request-1',
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
})
