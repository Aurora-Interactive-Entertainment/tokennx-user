import '@/i18n'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { userModelToRecord } from '@/data/models'
import type { UserModelItem } from '@/api/user-models'
import { ModelCard } from './common'

const videoModel: UserModelItem = {
  id: 'seedance-test', alias: 'seedance2.0', name: 'Seedance 2.0', company: '字节跳动',
  modality: 'video', billing_mode: 'request', description: '视频生成', capabilities: ['视频生成'], provider_count: 1, prices: [],
}

describe('模型卡片可用规格', () => {
  it('隐藏接口未提供的视频时长和输出限制', () => {
    const { container } = render(<MemoryRouter><ModelCard model={userModelToRecord(videoModel)} /></MemoryRouter>)
    expect(screen.getByText('Seedance 2.0')).toBeInTheDocument()
    expect(container.querySelector('.model-card-spec-grid')).toBeNull()
  })

  it('按真实参数显示时长，继续隐藏缺失的输出限制', () => {
    const { container } = render(<MemoryRouter><ModelCard model={userModelToRecord({ ...videoModel, params: { durations: [5, 10] } })} /></MemoryRouter>)
    expect(container.querySelectorAll('.model-card-spec-cell')).toHaveLength(1)
    expect(container.querySelector('.model-card-spec-grid')).toHaveTextContent(/5s.*10s/)
    expect(container.querySelector('.model-card-spec-grid')).not.toHaveTextContent('输出限制')
  })

  it('有输出上限时保留接口返回的限制', () => {
    const { container } = render(<MemoryRouter><ModelCard model={userModelToRecord({ ...videoModel, max_tokens: 2048 })} /></MemoryRouter>)
    expect(container.querySelectorAll('.model-card-spec-cell')).toHaveLength(1)
    expect(container.querySelector('.model-card-spec-grid')).toHaveTextContent('输出限制:2K')
  })

  it('卡片不渲染峰谷价示例区块', () => {
    const { container } = render(<MemoryRouter><ModelCard model={userModelToRecord({ ...videoModel, company: 'DeepSeek' })} /></MemoryRouter>)
    expect(container.querySelector('.model-time-pricing')).toBeNull()
    expect(screen.queryByText(/峰谷价/)).toBeNull()
  })
})
