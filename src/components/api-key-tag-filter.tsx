import { useTranslation } from 'react-i18next'
import { useId } from 'react'
import { CompatSelect as Select } from '@/components/semi-compat'
import './api-key-tag-filter.css'

export function ApiKeyTagFilter({ tags, value, onChange }: { tags: string[]; value: string; onChange: (tag: string) => void }) {
  const { t } = useTranslation()
  const labelID = useId()
  return <div className="api-key-tag-filter-control"><span id={labelID}>{t('console.account.filterTags')}</span><Select<string> className="api-key-tag-filter" aria-labelledby={labelID} value={value} filter onChange={(next) => onChange(typeof next === 'string' ? next : '')}>
    <Select.Option value="">{t('console.account.allTags')}</Select.Option>
    {tags.map((tag) => <Select.Option key={tag} value={tag}>{tag}</Select.Option>)}
  </Select></div>
}
