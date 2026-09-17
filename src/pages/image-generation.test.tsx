import { act, fireEvent, render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createAppStore } from '@/store'
import { ImagePage } from './image-generation'

beforeEach(() => {
  window.localStorage.clear()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

it('图片编辑器不把输入法确认当成发送，普通 Enter 保持现有生成流程', () => {
  render(<Provider store={createAppStore()}><ImagePage /></Provider>)
  const input = screen.getByLabelText('图片提示词')
  fireEvent.change(input, { target: { value: '水墨山川' } })
  fireEvent.compositionStart(input)
  fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
  fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 })
  expect(input).toBeEnabled()
  fireEvent.compositionEnd(input)
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(input).toBeDisabled()
  act(() => { vi.advanceTimersByTime(900) })
  expect(input).toBeEnabled()
})
