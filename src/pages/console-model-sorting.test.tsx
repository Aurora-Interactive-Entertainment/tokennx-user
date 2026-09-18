import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { Provider } from 'react-redux'
import { afterEach, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { createAppStore } from '@/store'
import { AppStoreProvider } from '@/data/app-state'
import { clearAuthTokens, saveAuthTokens } from '@/auth/token-storage'
import { ConsoleModelsPage } from './console-core'

// 下拉浮层动画已在浏览器验证，此处用原生选择框覆盖真实数据请求和排序分页链路。
vi.mock('@/components/semi-compat', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/semi-compat')>()
  const Select = ({ value, onChange, children, 'aria-label': label }: { value: string; onChange: (value: string) => void; children: ReactNode; 'aria-label'?: string }) => <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>{children}</select>
  return { ...actual, CompatSelect: Object.assign(Select, { Option: ({ value, children }: { value: string; children: ReactNode }) => <option value={value}>{children}</option> }) }
})

afterEach(() => { vi.restoreAllMocks(); clearAuthTokens() })

it('价格排序覆盖接口全部分页，并保留活动筛选和恢复默认顺序', async () => {
  saveAuthTokens({ status: 'succeeded', binding_required: false, access_token: 'sort-test', refresh_token: 'sort-refresh', refresh_expires_at: Date.UTC(2099, 0, 1) })
  const items = Array.from({ length: 12 }, (_, index) => ({
    id: `sort-${index}`, name: `排序模型 ${index + 1}`, company: 'Example', modality: 'text', billing_mode: 'token', description: '', capabilities: ['chat'], provider_count: 1,
    prices: [{ meter_code: 'input_token', meter_kind: 'input_token', unit: 'token', currency: 'CNY', tier_no: 1,
      unit_quantity: index === 11 ? 1000 : 1_000_000, unit_price_yuan: index === 11 ? '0.0001' : String(index + 1) }],
  }))
  const requests: URL[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(String(input), 'http://localhost')
    requests.push(url)
    const page = Number(url.searchParams.get('page') || 1)
    // 每包最多 10 条，排序必须读取第二包才能发现最便宜的模型。
    const size = Math.min(Number(url.searchParams.get('page_size') || 10), 10)
    return new Response(JSON.stringify({ code: 0, msg: 'success', data: {
      items: items.slice((page - 1) * size, page * size), total: 12, page, page_size: size,
      activities: [{ id: 'discount', name: '折扣', model_count: 12, sort_order: 0 }],
    } }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  })
  render(<MemoryRouter><Provider store={createAppStore()}><AppStoreProvider><ConsoleModelsPage /></AppStoreProvider></Provider></MemoryRouter>)
  const names = () => Array.from(document.querySelectorAll('.model-card-name'), (node) => node.textContent)
  await screen.findByText('排序模型 1')
  fireEvent.click(screen.getByRole('button', { name: '折扣' }))
  await waitFor(() => expect(requests.some((url) => url.searchParams.get('activity_id') === 'discount')).toBe(true))
  fireEvent.change(screen.getByRole('combobox', { name: '模型排序' }), { target: { value: 'price-asc' } })
  await waitFor(() => expect(names()).toEqual(['排序模型 12', ...Array.from({ length: 9 }, (_, i) => `排序模型 ${i + 1}`)]))
  expect(requests.some((url) => url.searchParams.get('page') === '2' && url.searchParams.get('page_size') === '100' && url.searchParams.get('activity_id') === 'discount')).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: '下一页' }))
  await waitFor(() => expect(names()).toEqual(['排序模型 10', '排序模型 11']))
  fireEvent.change(screen.getByRole('combobox', { name: '模型排序' }), { target: { value: 'price-desc' } })
  await waitFor(() => expect(names()).toEqual(Array.from({ length: 10 }, (_, i) => `排序模型 ${11 - i}`)))
  expect(screen.getByRole('button', { name: '折扣' })).toHaveAttribute('aria-pressed', 'true')
  fireEvent.change(screen.getByRole('combobox', { name: '模型排序' }), { target: { value: 'default' } })
  await waitFor(() => expect(names()).toEqual(Array.from({ length: 10 }, (_, i) => `排序模型 ${i + 1}`)))
})
