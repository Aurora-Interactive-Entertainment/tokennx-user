import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useTranslation } from 'react-i18next'
import i18n from '@/i18n'
import { CompatSelect } from './semi-compat'

function LanguageSelect() {
  const { t } = useTranslation()
  return <CompatSelect value="current" aria-label="language-select"><CompatSelect.Option value="current">{t('language.current')}</CompatSelect.Option></CompatSelect>
}

describe('CompatSelect', () => {
  afterEach(() => { void i18n.changeLanguage('zh-CN') })

  it('updates the selected option when the language changes', async () => {
    await i18n.changeLanguage('zh-CN')
    render(<LanguageSelect />)
    expect(screen.getByText('中文')).toBeInTheDocument()

    await i18n.changeLanguage('en-US')
    expect(await screen.findByText('English')).toBeInTheDocument()
  })
})
