import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { fetchJson } from './http'

const leases = new Set<object>()

beforeEach(() => {
  leases.clear()
  window.__TOKEN_NX_UPDATE_GUARD__ = {
    pendingVersion: '', check: vi.fn(), routeChanged: vi.fn(),
    blockReload: () => {
      const lease = {}
      leases.add(lease)
      return () => { leases.delete(lease) }
    },
  }
})

afterEach(() => {
  delete window.__TOKEN_NX_UPDATE_GUARD__
  vi.restoreAllMocks()
})

it('写请求在正文结束前持续保护更新，并行请求分别释放', async () => {
  let body!: ReadableStreamDefaultController<Uint8Array>
  const stream = new ReadableStream<Uint8Array>({ start: controller => { body = controller } })
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(stream))
    .mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, data: 'second' })))
  const first = fetchJson('/api/save-first', { method: 'POST', body: {} })
  const second = fetchJson('/api/save-second', { method: 'PATCH', body: {} })
  expect(leases.size).toBe(2)
  await expect(second).resolves.toBe('second')
  expect(leases.size).toBe(1)
  body.enqueue(new TextEncoder().encode(JSON.stringify({ code: 0, data: 'first' })))
  expect(leases.size).toBe(1)
  body.close()
  await expect(first).resolves.toBe('first')
  expect(leases.size).toBe(0)
})

it('网络失败与异常响应也释放写请求保护，不改变原错误语义', async () => {
  vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('offline'))
    .mockResolvedValueOnce(new Response(JSON.stringify({ code: 190001, msg: '保存失败' }), { status: 503 }))
    .mockResolvedValueOnce(new Response('<html>'))
  await expect(fetchJson('/api/save', { method: 'POST' })).rejects.toMatchObject({ status: 0 })
  expect(leases.size).toBe(0)
  await expect(fetchJson('/api/save', { method: 'POST' })).rejects.toMatchObject({ status: 503, message: '保存失败' })
  expect(leases.size).toBe(0)
  await expect(fetchJson('/api/save', { method: 'POST' })).rejects.toMatchObject({ status: 200 })
  expect(leases.size).toBe(0)
})

it('取消正文消费释放写请求保护，普通读取不会阻止更新', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(new ReadableStream()))
    .mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, data: 'read' })))
  const controller = new AbortController()
  const request = fetchJson('/api/save', { method: 'POST', signal: controller.signal })
  const rejection = expect(request).rejects.toMatchObject({ name: 'AbortError' })
  await Promise.resolve()
  controller.abort()
  await rejection
  expect(leases.size).toBe(0)
  const read = fetchJson('/api/list')
  expect(leases.size).toBe(0)
  await expect(read).resolves.toBe('read')
})
