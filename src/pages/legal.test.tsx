import '@/i18n'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { Provider } from 'react-redux'
import { describe, expect, it } from 'vitest'
import { AppStoreProvider } from '@/data/app-state'
import { createAppStore } from '@/store'
import { LegalPage, type LegalPageKind } from './legal'

function renderLegalPage(kind: LegalPageKind): void {
  render(
    <MemoryRouter>
      <Provider store={createAppStore()}>
        <AppStoreProvider>
          <LegalPage kind={kind} />
        </AppStoreProvider>
      </Provider>
    </MemoryRouter>,
  )
}

describe('法律协议页', () => {
  it.each([
    ['terms', 'Token NX 用户协议', '第一条 定义及协议范围'],
    ['privacy', 'Token NX 隐私政策', '第二条 个人信息的收集及使用'],
    ['recharge', 'Token NX 充值协议', '第六条 退款'],
  ] satisfies Array<[LegalPageKind, string, string]>)('%s 使用对应的静态 Markdown 正文', (kind, title, section) => {
    renderLegalPage(kind)

    expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: section })).toBeInTheDocument()
    expect(document.querySelector('.legal-page-article > .markdown-content')).toHaveClass('docs-markdown')
  })
})
