import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import Button from '@douyinfe/semi-ui/lib/es/button'
import { IconSearch } from '@douyinfe/semi-icons'
import { MoneyText } from '@/components/money'
import { AppPagination } from '@/components/app-pagination'
import {
  getEnterpriseTags,
  getEnterpriseUsage,
  type EnterpriseContext,
  type EnterpriseDimensionUsage,
  type EnterpriseMemberUsage,
  type EnterpriseRoleOption,
  type EnterpriseTag,
  type EnterpriseUsageResponse,
  type EnterpriseUsageTrendPoint,
} from '@/api/enterprise-console'
import { apiTimeToDate, formatLocalDateInput, localDateToTimestamp, shiftLocalDate } from '@/utils/format'
import { analyticsDimensionLabel } from './enterprise-analytics-helpers'
import i18n from '@/i18n'
import {
  EnterpriseEmpty,
  EnterpriseError,
  EnterpriseLoading,
  EnterprisePageShell,
  EnterpriseValidationError,
  formatEnterpriseLatency,
  formatEnterpriseNumber,
  roleLabel,
  roleVisualClass,
  useEnterpriseErrorHandler,
  validateEnterpriseDateRange,
} from './enterprise-console-shared'

type UsageRange = 'today' | '7d' | '30d' | 'month' | 'custom'
type UsageTab = 'board' | 'detail'
type QuotaFilter = 'all' | 'ok' | 'near' | 'over' | 'none'
type UsageSort = 'cost' | 'requests' | 'tokens'

type UsageFilters = {
  range: UsageRange
  startDate: string
  endDate: string
  memberID: string
}

type BoardFilters = {
  search: string
  role: string
  quota: QuotaFilter
  tagID: string
  sort: UsageSort
}

const DEFAULT_USAGE_PAGE_SIZE = 20
const DEFAULT_CUSTOM_RANGE_DAYS = 6
const QUOTA_NEAR_THRESHOLD = 80
const QUOTA_OVER_THRESHOLD = 100
const DETAIL_USAGE_RANGES: ReadonlyArray<UsageRange> = ['today', '7d', '30d', 'custom']

function customRangeDefaults(): Pick<UsageFilters, 'startDate' | 'endDate'> {
  const today = new Date()
  return { startDate: formatLocalDateInput(shiftLocalDate(today, -DEFAULT_CUSTOM_RANGE_DAYS)), endDate: formatLocalDateInput(today) }
}

export function enterpriseUsageQuery(filters: UsageFilters, page = 1, pageSize = DEFAULT_USAGE_PAGE_SIZE): { range: string; start_at?: number; end_at?: number; member_id?: string; page: number; page_size: number } {
  return {
    range: filters.range,
    start_at: filters.range === 'custom' ? localDateToTimestamp(filters.startDate) : undefined,
    end_at: filters.range === 'custom' ? localDateToTimestamp(filters.endDate, true) : undefined,
    member_id: filters.memberID === 'all' ? undefined : filters.memberID,
    page: Math.max(1, page),
    page_size: pageSize,
  }
}

function defaultFilters(): UsageFilters {
  return { range: 'month', startDate: '', endDate: '', memberID: 'all' }
}

function usageRangeLabel(range: UsageRange): string {
  if (range === 'today') return i18n.t('console.enterprise.usage.today')
  if (range === '7d') return i18n.t('console.enterprise.usage.recent7Days')
  if (range === '30d') return i18n.t('console.enterprise.usage.recent30Days')
  if (range === 'custom') return i18n.t('console.enterprise.usage.custom')
  return i18n.t('console.enterprise.usage.month')
}

function defaultBoardFilters(): BoardFilters {
  return { search: '', role: 'all', quota: 'all', tagID: 'all', sort: 'cost' }
}

function numericMoney(value: string | null | undefined): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatUsageMoney(value: string | null | undefined): ReactNode {
  return <MoneyText value={value} />
}

function usagePeriodMonth(value: EnterpriseUsageResponse['period']['start_at']): string {
  const date = apiTimeToDate(value)
  if (!date) return ''
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function usagePeriodChipLabel(period: EnterpriseUsageResponse['period']): string {
  return usagePeriodMonth(period.start_at) || period.label
}

function memberTags(member: EnterpriseMemberUsage): EnterpriseMemberUsage['tags'] {
  return Array.isArray(member.tags) ? member.tags : []
}

function memberInitial(name: string, fallback: string): string {
  return name.trim().slice(0, 1).toUpperCase() || fallback.trim().slice(0, 1).toUpperCase() || '?'
}

function quotaStatus(member: EnterpriseMemberUsage): QuotaFilter {
  const limit = member.budget?.cost_limit_yuan
  const percent = member.budget?.usage_percent
  if (limit === null || limit === undefined || limit === '' || percent === null || percent === undefined || !Number.isFinite(percent)) return 'none'
  if (percent >= QUOTA_OVER_THRESHOLD) return 'over'
  if (percent >= QUOTA_NEAR_THRESHOLD) return 'near'
  return 'ok'
}

function memberMatchesRole(memberRole: string, filterRole: string): boolean {
  return memberRole === filterRole
}

function UsageMetricCard({ label, value, unit, primary = false }: { label: string; value: ReactNode; unit: string; primary?: boolean }) {
  return <article className={`enterprise-usage-metric-card${primary ? ' is-primary' : ''}`}><span>{label}</span><strong>{value}</strong><small>{unit}</small></article>
}

function UsageMetrics({ data }: { data: EnterpriseUsageResponse }) {
  const { t } = useTranslation()
  const metrics = data.metrics
  return <div className="enterprise-usage-metrics enterprise-usage-metrics--board">
    <UsageMetricCard label={t('console.enterprise.usage.totalCost')} value={formatUsageMoney(metrics.total_cost_yuan)} unit={t('console.enterprise.analytics.rangeMonth')} primary />
    <UsageMetricCard label={t('console.enterprise.usage.requestCount')} value={formatEnterpriseNumber(metrics.request_count)} unit={t('console.enterprise.analytics.requestsUnit')} />
    <UsageMetricCard label={t('console.enterprise.usage.inputTokens')} value={formatEnterpriseNumber(metrics.input_tokens)} unit="tokens" />
    <UsageMetricCard label={t('console.enterprise.usage.outputTokens')} value={formatEnterpriseNumber(metrics.output_tokens)} unit="tokens" />
    <UsageMetricCard label={t('console.enterprise.usage.cachedTokens')} value={formatEnterpriseNumber(metrics.cached_tokens)} unit="tokens" />
    <UsageMetricCard label={t('console.enterprise.usage.quota')} value="--" unit={t('console.enterprise.usage.availableQuota')} />
  </div>
}

function UsagePeriodControls({ filters, onRangeChange, onStartDateChange, onEndDateChange }: { filters: UsageFilters; onRangeChange: (range: UsageRange) => void; onStartDateChange: (value: string) => void; onEndDateChange: (value: string) => void }) {
  const { t } = useTranslation()
  return <div className="enterprise-usage-detail-time-filter" aria-label={t('console.enterprise.usage.timeRange')}>
    <span>{t('console.enterprise.usage.timeRange')}</span>
    <div className="enterprise-range-tabs" role="group" aria-label={t('console.enterprise.usage.timeRange')}>
      {DETAIL_USAGE_RANGES.map((value) => <button className={filters.range === value ? 'active' : ''} type="button" aria-pressed={filters.range === value} onClick={() => onRangeChange(value)} key={value}>{usageRangeLabel(value)}</button>)}
    </div>
    {filters.range === 'custom' ? <div className="enterprise-date-range">
      <label htmlFor="enterprise-usage-start">{t('console.enterprise.usage.startDate')}<input id="enterprise-usage-start" type="date" value={filters.startDate} onChange={(event) => onStartDateChange(event.target.value)} /></label>
      <label htmlFor="enterprise-usage-end">{t('console.enterprise.usage.endDate')}<input id="enterprise-usage-end" type="date" value={filters.endDate} onChange={(event) => onEndDateChange(event.target.value)} /></label>
    </div> : null}
  </div>
}

function UsageQuotaCallout() {
  const { t } = useTranslation()
  return <section className="enterprise-usage-quota-callout" role="note">
    <strong>{t('console.enterprise.usage.workspaceQuota')}</strong>
    <span>{t('console.enterprise.usage.workspaceQuotaHint')}</span>
    <div className="enterprise-usage-callout-actions"><Link className="enterprise-usage-secondary-link" to="/console/enterprise-governance?view=tags">{t('console.enterprise.usage.manageTags')}</Link><Link className="enterprise-usage-secondary-link" to="/console/billing">{t('console.enterprise.usage.goBilling')}</Link></div>
  </section>
}

function UsageBoardToolbar({ tags, roleOptions, filters, onChange }: { tags: EnterpriseTag[]; roleOptions: EnterpriseRoleOption[]; filters: BoardFilters; onChange: (patch: Partial<BoardFilters>) => void }) {
  const { t } = useTranslation()
  return <div className="enterprise-usage-toolbar" aria-label={t('console.enterprise.usage.memberUsageList')}>
    <label className="enterprise-usage-search-field"><IconSearch aria-hidden="true" /><input type="search" value={filters.search} onChange={(event) => onChange({ search: event.target.value })} placeholder={t('console.enterprise.usage.memberSearch')} aria-label={t('console.enterprise.usage.memberSearchLabel')} /></label>
    <select className="source-input enterprise-usage-filter-input" value={filters.role} onChange={(event) => onChange({ role: event.target.value })} aria-label={t('console.enterprise.usage.roleFilter')}><option value="all">{t('console.enterprise.usage.allRoles')}</option>{roleOptions.map((option) => <option value={option.code} key={option.code}>{option.name}</option>)}</select>
    <select className="source-input enterprise-usage-filter-input" value={filters.quota} onChange={(event) => onChange({ quota: event.target.value as QuotaFilter })} aria-label={t('console.enterprise.usage.quotaFilter')}><option value="all">{t('console.enterprise.usage.allQuota')}</option><option value="near">{t('console.enterprise.usage.nearQuota')}</option><option value="over">{t('console.enterprise.usage.overQuota')}</option><option value="none">{t('console.enterprise.usage.noQuota')}</option></select>
    <select className="source-input enterprise-usage-filter-input" value={filters.tagID} onChange={(event) => onChange({ tagID: event.target.value })} aria-label={t('console.enterprise.usage.tagFilter')}><option value="all">{t('console.enterprise.usage.allTags')}</option>{tags.map((tag) => <option value={tag.id} key={tag.id}>{tag.name}</option>)}</select>
    <select className="source-input enterprise-usage-filter-input" value={filters.sort} onChange={(event) => onChange({ sort: event.target.value as UsageSort })} aria-label={t('console.enterprise.usage.sort')}><option value="cost">{t('console.enterprise.usage.byCost')}</option><option value="requests">{t('console.enterprise.usage.byRequests')}</option><option value="tokens">{t('console.enterprise.usage.byTokens')}</option></select>
  </div>
}

function TagPolicyCell({ member, tagsByID, unavailable }: { member: EnterpriseMemberUsage; tagsByID: Map<string, EnterpriseTag>; unavailable: boolean }) {
  const { t } = useTranslation()
  const refs = memberTags(member)
  const policies = refs.map((tag) => tagsByID.get(tag.id)).filter((tag): tag is EnterpriseTag => Boolean(tag))
  if (!policies.length) return <span className="enterprise-usage-muted">{unavailable && refs.length ? t('console.enterprise.usage.policyUnavailable') : t('console.enterprise.usage.noTagPolicy')}</span>
  return <div className="enterprise-usage-policy-cell">{policies.map((policy) => {
    const limits: ReactNode[] = [
      policy.daily_cost_limit_yuan ? <>{t('console.enterprise.usage.day')} <MoneyText value={policy.daily_cost_limit_yuan} /></> : null,
      policy.weekly_cost_limit_yuan ? <>{t('console.enterprise.usage.week')} <MoneyText value={policy.weekly_cost_limit_yuan} /></> : null,
      policy.monthly_cost_limit_yuan ? <>{t('console.enterprise.usage.monthShort')} <MoneyText value={policy.monthly_cost_limit_yuan} /></> : null,
      policy.concurrency_limit === null ? '' : `${t('console.enterprise.usage.concurrency')} ${formatEnterpriseNumber(policy.concurrency_limit)}`,
      policy.rpm_limit === null ? '' : `RPM ${formatEnterpriseNumber(policy.rpm_limit)}`,
      policy.tpm_limit === null ? '' : `TPM ${formatEnterpriseNumber(policy.tpm_limit)}`,
    ].filter((limit) => Boolean(limit))
    return <div key={policy.id}><strong>{policy.name}</strong><small>{limits.length ? limits.map((limit, index) => <span key={`${policy.id}-limit-${index}`}>{index > 0 ? ' · ' : null}{limit}</span>) : t('console.enterprise.usage.unlimited')}</small></div>
  })}</div>
}

function QuotaCell({ member }: { member: EnterpriseMemberUsage }) {
  const { t } = useTranslation()
  const budget = member.budget
  const limit = budget?.cost_limit_yuan
  const percent = budget?.usage_percent
  const state = quotaStatus(member)
  if (state === 'none' || !budget || limit === null || limit === undefined || limit === '') return <span className="enterprise-usage-muted">{t('console.enterprise.usage.unset')}</span>
  const safePercent = Number.isFinite(percent) ? Math.max(0, percent ?? 0) : 0
  const width = Math.min(100, Math.max(2, safePercent))
  return <div className={`enterprise-usage-quota-cell is-${state}`}><div><span><MoneyText value={member.cost_yuan} /> / <MoneyText value={limit} /></span><strong>{Number.isFinite(percent) ? `${Math.round(percent ?? 0)}%` : '--'}</strong></div><div className="enterprise-usage-progress" aria-hidden="true"><i style={{ width: `${width}%` }} /></div></div>
}

function MemberUsageTable({ members, visibleMembers, roleOptions, tagsByID, tagsUnavailable, selectedID, onSelect }: { members: EnterpriseMemberUsage[]; visibleMembers: EnterpriseMemberUsage[]; roleOptions: EnterpriseRoleOption[]; tagsByID: Map<string, EnterpriseTag>; tagsUnavailable: boolean; selectedID: string; onSelect: (memberID: string) => void }) {
  const { t } = useTranslation()
  if (!members.length) return <EnterpriseEmpty title={t('console.enterprise.usage.noEnterpriseUsage')} description={t('console.enterprise.usage.noEnterpriseUsageHint')} />
  if (!visibleMembers.length) return <EnterpriseEmpty title={t('console.common.noMatch')} description={t('console.common.adjustFilters')} />
  return <div className="source-table-scroll enterprise-usage-table-region" role="region" aria-label={t('console.enterprise.usage.memberUsageList')} tabIndex={0}><table className="enterprise-usage-table enterprise-usage-table--dense"><thead><tr><th>{t('console.enterprise.usage.member')}</th><th>{t('console.enterprise.usage.role')}</th><th>{t('console.enterprise.usage.employeeTags')}</th><th>{t('console.enterprise.usage.tagPolicy')}</th><th className="enterprise-usage-number-cell">{t('console.enterprise.usage.periodCost')}</th><th>{t('console.enterprise.usage.costQuota')}</th><th className="enterprise-usage-number-cell">{t('console.enterprise.usage.requests')}</th><th className="enterprise-usage-number-cell">{t('console.enterprise.usage.inputTokens')}</th><th className="enterprise-usage-number-cell">{t('console.enterprise.usage.outputTokens')}</th><th>{t('console.enterprise.usage.recentCall')}</th><th>{t('console.enterprise.usage.operation')}</th></tr></thead><tbody>{visibleMembers.map((member) => {
    const tags = memberTags(member)
    const selected = selectedID === member.member_id
    const roleClass = roleVisualClass(member.role, roleOptions)
    return <tr className={selected ? 'is-selected' : ''} key={member.member_id}>
      <td><div className="enterprise-usage-member-cell"><span className="enterprise-member-avatar" aria-hidden="true">{memberInitial(member.member_name, member.member_id)}</span><span><strong>{member.member_name || member.member_id}</strong><small>{member.member_id}</small></span></div></td>
      <td><span className={`enterprise-usage-role-tag ${roleClass}`}>{roleLabel(member.role, roleOptions)}</span></td>
      <td><div className="enterprise-table-tags">{tags.length ? tags.map((tag) => <span key={tag.id}>{tag.name}</span>) : <small>{t('console.enterprise.usage.unset')}</small>}</div></td>
      <td><TagPolicyCell member={member} tagsByID={tagsByID} unavailable={tagsUnavailable} /></td>
      <td className="enterprise-usage-number-cell amount-positive"><MoneyText value={member.cost_yuan} /></td>
      <td><QuotaCell member={member} /></td>
      <td className="enterprise-usage-number-cell">{formatEnterpriseNumber(member.request_count)}</td>
      <td className="enterprise-usage-number-cell">{formatEnterpriseNumber(member.input_tokens)}</td>
      <td className="enterprise-usage-number-cell">{formatEnterpriseNumber(member.output_tokens)}</td>
      <td><span className="enterprise-usage-recent-call">{member.request_count > 0 ? t('console.enterprise.usage.periodHasCall') : t('console.enterprise.usage.periodNoCall')}</span></td>
      <td><Button theme="borderless" size="small" aria-pressed={selected} onClick={() => onSelect(member.member_id)}>{t('console.enterprise.usage.viewDetail')}</Button></td>
    </tr>
  })}</tbody></table></div>
}

function UsagePagination({ page, pageSize, total, onChange, onPageSizeChange }: { page: number; pageSize: number; total: number; onChange: (page: number) => void; onPageSizeChange: (pageSize: number) => void }) {
  const { t } = useTranslation()
  const safePageSize = pageSize > 0 ? pageSize : DEFAULT_USAGE_PAGE_SIZE
  const pageCount = Math.max(1, Math.ceil(total / safePageSize))
  return <AppPagination ariaLabel={t('console.enterprise.usage.memberSummary', { total: formatEnterpriseNumber(total), page, pageCount })} currentPage={page} pageSize={safePageSize} total={total} summary={t('console.enterprise.usage.memberSummary', { total: formatEnterpriseNumber(total), page, pageCount })} onPageChange={onChange} onPageSizeChange={onPageSizeChange} />
}

function UsageTabs({ activeTab, onChange }: { activeTab: UsageTab; onChange: (tab: UsageTab) => void }) {
  const { t } = useTranslation()
  return <div className="enterprise-usage-tabs" role="tablist" aria-label={t('console.enterprise.usage.title')}>
    <button id="enterprise-usage-tab-board" type="button" role="tab" aria-controls="enterprise-usage-panel-board" aria-selected={activeTab === 'board'} tabIndex={activeTab === 'board' ? 0 : -1} className={activeTab === 'board' ? 'active' : ''} onClick={() => onChange('board')}>{t('console.enterprise.usage.board')}</button>
    <button id="enterprise-usage-tab-detail" type="button" role="tab" aria-controls="enterprise-usage-panel-detail" aria-selected={activeTab === 'detail'} tabIndex={activeTab === 'detail' ? 0 : -1} className={activeTab === 'detail' ? 'active' : ''} onClick={() => onChange('detail')}>{t('console.enterprise.usage.detail')}</button>
  </div>
}

function DailyBars({ data, metric, tone }: { data: EnterpriseUsageTrendPoint[]; metric: 'requests' | 'cost'; tone: 'requests' | 'cost' }) {
  const { t } = useTranslation()
  const values = data.map((point) => metric === 'requests' ? point.request_count : numericMoney(point.cost_yuan))
  const maxValue = Math.max(...values, 0)
  if (!data.length) return <div className="enterprise-usage-chart-empty">{t('console.enterprise.usage.noTrend')}</div>
  return <ol className="enterprise-usage-daily-bars">{data.map((point, index) => {
    const value = values[index] ?? 0
    const width = maxValue > 0 ? Math.max(2, value / maxValue * 100) : 2
    const displayValue = metric === 'requests' ? `${formatEnterpriseNumber(point.request_count)} ${t('console.enterprise.analytics.requestsUnit')}` : <MoneyText value={point.cost_yuan} />
    return <li key={point.date}><time dateTime={point.date}>{point.date}</time><span className="enterprise-usage-bar-track"><i className={`is-${tone}`} style={{ width: `${width}%` }} /></span><strong>{displayValue}</strong></li>
  })}</ol>
}

function dimensionLabel(item: EnterpriseDimensionUsage, kind: 'model' | 'api-key' | 'source'): string {
  return analyticsDimensionLabel(item, kind)
}

function recordRangeParams(filters: UsageFilters): URLSearchParams {
  const range = filters.range === 'month' ? '30d' : filters.range
  const params = new URLSearchParams({ range })
  if (filters.range === 'custom') {
    if (filters.startDate) params.set('startDate', filters.startDate)
    if (filters.endDate) params.set('endDate', filters.endDate)
  }
  return params
}

function dimensionRecordsHref(item: EnterpriseDimensionUsage, kind: 'model' | 'api-key' | 'source', memberID: string, filters: UsageFilters): string {
  const params = recordRangeParams(filters)
  params.set('member_id', memberID)
  if (kind === 'model') params.set('model', item.alias?.trim() || item.code?.trim() || item.name)
  if (kind === 'api-key' && item.id) params.set('keyId', item.id)
  if (kind === 'source') params.set('source', item.code === 'console' ? 'console-test' : 'api')
  return `/console/records?${params.toString()}`
}

function DimensionTable({ title, items, kind, memberID, filters }: { title: string; items: EnterpriseDimensionUsage[]; kind: 'model' | 'api-key' | 'source'; memberID: string; filters: UsageFilters }) {
  const { t } = useTranslation()
  return <section className="enterprise-usage-dimension-section"><h3 className="enterprise-usage-dimension-title">{title}</h3>{items.length === 0 ? <div className="enterprise-usage-chart-empty">{t('console.enterprise.usage.noDimension')}</div> : <div className="source-table-scroll"><table className="enterprise-usage-dimension-table"><thead><tr><th>{t('console.enterprise.usage.name')}</th><th>{t('console.enterprise.usage.requests')}</th><th>{t('console.enterprise.usage.cost')}</th><th>{t('console.enterprise.usage.operation')}</th></tr></thead><tbody>{items.map((item, index) => <tr key={`${kind}-${item.id || item.code || item.name}-${index}`}><td><strong>{dimensionLabel(item, kind)}</strong>{kind === 'model' && item.code ? <small>{item.code}</small> : null}</td><td>{formatEnterpriseNumber(item.requests)}</td><td><MoneyText value={item.cost_yuan} /></td><td><Link className="enterprise-usage-record-link" to={dimensionRecordsHref(item, kind, memberID, filters)}>{t('console.enterprise.usage.records')}</Link></td></tr>)}</tbody></table></div>}</section>
}

function UsageDetailControls({ members, roleOptions, filters, onSelect, onRangeChange, onStartDateChange, onEndDateChange }: { members: EnterpriseMemberUsage[]; roleOptions: EnterpriseRoleOption[]; filters: UsageFilters; onSelect: (memberID: string) => void; onRangeChange: (range: UsageRange) => void; onStartDateChange: (value: string) => void; onEndDateChange: (value: string) => void }) {
  const { t } = useTranslation()
  return <div className="enterprise-usage-detail-controls"><label htmlFor="enterprise-usage-detail-member">{t('console.enterprise.usage.chooseMember')}<select id="enterprise-usage-detail-member" className="source-input" value={filters.memberID} onChange={(event) => onSelect(event.target.value)}><option value="all">{t('console.enterprise.usage.chooseMember')}</option>{members.map((member) => <option value={member.member_id} key={member.member_id}>{member.member_name || member.member_id} · {roleLabel(member.role, roleOptions)}</option>)}</select></label><UsagePeriodControls filters={filters} onRangeChange={onRangeChange} onStartDateChange={onStartDateChange} onEndDateChange={onEndDateChange} /></div>
}

function MemberUsageDetail({ data, memberID, filters }: { data: NonNullable<EnterpriseUsageResponse['member_detail']>; memberID: string; filters: UsageFilters }) {
  const { t } = useTranslation()
  return <section className="enterprise-usage-detail-content"><div className="enterprise-usage-detail-heading"><strong>{data.member_name}</strong><span>{usageRangeLabel(filters.range)} · {t('console.enterprise.usage.recordSummary', { count: formatEnterpriseNumber(data.metrics.request_count) })}</span></div>
    <div className="enterprise-detail-metrics enterprise-detail-metrics--usage"><UsageMetricCard label={t('console.enterprise.usage.cost')} value={<MoneyText value={data.metrics.total_cost_yuan} />} unit={t('console.enterprise.usage.timeRange')} /><UsageMetricCard label={t('console.enterprise.usage.requests')} value={formatEnterpriseNumber(data.metrics.request_count)} unit={t('console.enterprise.analytics.requestsUnit')} /><UsageMetricCard label={t('console.enterprise.usage.inputTokens')} value={formatEnterpriseNumber(data.metrics.input_tokens)} unit="tokens" /><UsageMetricCard label={t('console.enterprise.usage.outputTokens')} value={formatEnterpriseNumber(data.metrics.output_tokens)} unit="tokens" /><UsageMetricCard label={t('console.enterprise.usage.cachedTokens')} value={formatEnterpriseNumber(data.metrics.cached_tokens)} unit="tokens" /><UsageMetricCard label={t('console.enterprise.usage.averageLatencyLabel')} value={formatEnterpriseLatency(data.metrics.average_latency_ms)} unit={t('console.enterprise.usage.detailRecords')} /></div>
    <div className="enterprise-usage-detail-actions"><Link className="enterprise-usage-secondary-link" to={`/console/records?${recordRangeParams(filters).toString()}&member_id=${encodeURIComponent(memberID)}`}>{t('console.enterprise.usage.detailRecords')}</Link></div>
    <div className="enterprise-usage-daily-grid"><section className="enterprise-usage-chart-section"><h3 className="enterprise-usage-detail-title">{t('console.enterprise.usage.dailyRequests')}</h3><DailyBars data={data.trend} metric="requests" tone="requests" /></section><section className="enterprise-usage-chart-section"><h3 className="enterprise-usage-detail-title">{t('console.enterprise.usage.dailyCost')}</h3><DailyBars data={data.trend} metric="cost" tone="cost" /></section></div>
    <div className="enterprise-usage-dimension-grid"><DimensionTable title={t('console.enterprise.usage.byModel')} items={data.models ?? []} kind="model" memberID={memberID} filters={filters} /><DimensionTable title={t('console.enterprise.usage.byApiKey')} items={data.api_keys ?? []} kind="api-key" memberID={memberID} filters={filters} /><DimensionTable title={t('console.enterprise.usage.bySource')} items={data.sources ?? []} kind="source" memberID={memberID} filters={filters} /></div>
    <p className="enterprise-data-note enterprise-usage-detail-note">{t('console.enterprise.usage.detailNote')}</p>
  </section>
}

function UsageContent({ context, onPeriodChange }: { context: EnterpriseContext; onPeriodChange: (label: string | null) => void }) {
  const { t } = useTranslation()
  const handleError = useEnterpriseErrorHandler()
  const [filters, setFilters] = useState<UsageFilters>(defaultFilters)
  const [boardFilters, setBoardFilters] = useState<BoardFilters>(defaultBoardFilters)
  const [activeTab, setActiveTab] = useState<UsageTab>('board')
  const [memberPage, setMemberPage] = useState(1)
  const [memberPageSize, setMemberPageSize] = useState(DEFAULT_USAGE_PAGE_SIZE)
  const [data, setData] = useState<EnterpriseUsageResponse | null>(null)
  const [memberOptions, setMemberOptions] = useState<EnterpriseMemberUsage[]>([])
  const [tags, setTags] = useState<EnterpriseTag[]>([])
  const [tagsUnavailable, setTagsUnavailable] = useState(false)
  const [loading, setLoading] = useState(true)
  const [tagsLoading, setTagsLoading] = useState(true)
  const [error, setError] = useState<{ message: string; requestId: string | null } | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const roleOptions = context.role_options ?? []
  const query = useMemo(() => enterpriseUsageQuery(filters, memberPage, memberPageSize), [filters, memberPage, memberPageSize])
  const dateRangeError = filters.range === 'custom' ? validateEnterpriseDateRange(filters.startDate, filters.endDate) : ''
  const tagsByID = useMemo(() => new Map(tags.map((tag) => [tag.id, tag])), [tags])
  const selectableMembers = memberOptions.length ? memberOptions : data?.members ?? []
  const visibleMembers = useMemo(() => {
    const keyword = boardFilters.search.trim().toLocaleLowerCase('zh-CN')
    const rows = (data?.members ?? []).filter((member) => {
      const memberTagRefs = memberTags(member)
      if (keyword && !`${member.member_name} ${member.member_id}`.toLocaleLowerCase('zh-CN').includes(keyword)) return false
      if (boardFilters.role !== 'all' && !memberMatchesRole(member.role, boardFilters.role)) return false
      if (boardFilters.quota !== 'all' && quotaStatus(member) !== boardFilters.quota) return false
      if (boardFilters.tagID !== 'all' && !memberTagRefs.some((tag) => tag.id === boardFilters.tagID)) return false
      return true
    })
    return [...rows].sort((left, right) => {
      const leftValue = boardFilters.sort === 'cost' ? numericMoney(left.cost_yuan) : boardFilters.sort === 'requests' ? left.request_count : left.input_tokens + left.output_tokens
      const rightValue = boardFilters.sort === 'cost' ? numericMoney(right.cost_yuan) : boardFilters.sort === 'requests' ? right.request_count : right.input_tokens + right.output_tokens
      return rightValue - leftValue || left.member_name.localeCompare(right.member_name, 'zh-CN')
    })
  }, [boardFilters, data?.members])

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setTagsLoading(true)
    setTagsUnavailable(false)
    getEnterpriseTags({ enterprise_id: context.id }, { signal: controller.signal }).then((result) => {
      if (active) setTags(result)
    }).catch(() => {
      // 中文：标签策略是表格增强信息，读取失败时保留用量主数据并显示降级文案。
      if (active) {
        setTags([])
        setTagsUnavailable(true)
      }
    }).finally(() => {
      if (active) setTagsLoading(false)
    })
    return () => {
      active = false
      controller.abort()
    }
  }, [context.id, reloadToken])

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setLoading(true)
    setError(null)
    if (dateRangeError) {
      setData(null)
      setLoading(false)
      return () => {
        active = false
        controller.abort()
      }
    }
    getEnterpriseUsage({ enterprise_id: context.id }, { ...query, signal: controller.signal }).then((result) => {
      if (!active) return
      setData(result)
      setMemberOptions((previous) => {
        if (!query.member_id) return result.members
        const merged = new Map(previous.map((member) => [member.member_id, member]))
        result.members.forEach((member) => merged.set(member.member_id, member))
        return [...merged.values()]
      })
    }).catch((reason: unknown) => {
      if (!active || controller.signal.aborted) return
      const result = handleError(reason)
      if (result) setError(result)
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => {
      active = false
      controller.abort()
    }
  }, [context.id, dateRangeError, handleError, query, reloadToken])

  useEffect(() => {
    onPeriodChange(data ? usagePeriodChipLabel(data.period) : null)
    return () => onPeriodChange(null)
  }, [data, onPeriodChange])

  function updateRange(range: UsageRange): void {
    setMemberPage(1)
    setFilters((previous) => ({ ...previous, range, ...(range === 'custom' ? customRangeDefaults() : { startDate: '', endDate: '' }) }))
  }

  function selectMember(memberID: string): void {
    setMemberPage(1)
    setFilters((previous) => ({ ...previous, memberID }))
  }

  function changeTab(tab: UsageTab): void {
    setMemberPage(1)
    setActiveTab(tab)
    if (tab === 'detail') {
      setFilters((previous) => previous.range === 'month' ? { ...previous, range: '30d', startDate: '', endDate: '' } : previous)
      return
    }
    setFilters((previous) => ({ ...previous, range: 'month', startDate: '', endDate: '', memberID: 'all' }))
  }

  function openMemberDetail(memberID: string): void {
    selectMember(memberID)
    changeTab('detail')
  }

  const showDetail = activeTab === 'detail'
  const detailData = data?.member_detail && data.member_detail.member_id === filters.memberID ? data.member_detail : null

  return <div className="enterprise-usage-content" aria-busy={loading || tagsLoading}>
    <UsageTabs activeTab={activeTab} onChange={changeTab} />
    {dateRangeError ? <EnterpriseValidationError message={dateRangeError} /> : null}
    {error ? <div className="enterprise-filter-error"><EnterpriseError message={error.message} requestId={error.requestId} onRetry={() => setReloadToken((value) => value + 1)} /></div> : null}
    {loading && !data && !dateRangeError ? <EnterpriseLoading label={t('console.enterprise.usage.loading')} /> : null}
    {data && !dateRangeError ? <>
      <section id="enterprise-usage-panel-board" className="enterprise-usage-tab-panel" role="tabpanel" aria-labelledby="enterprise-usage-tab-board" hidden={showDetail}><UsageMetrics data={data} /><p className="enterprise-data-note">{t('console.enterprise.usage.quotaCallout')}</p><UsageQuotaCallout /><UsageBoardToolbar tags={tags} roleOptions={roleOptions} filters={boardFilters} onChange={(patch) => { setMemberPage(1); setBoardFilters((previous) => ({ ...previous, ...patch })) }} /><MemberUsageTable members={data.members} visibleMembers={visibleMembers} roleOptions={roleOptions} tagsByID={tagsByID} tagsUnavailable={tagsUnavailable} selectedID={filters.memberID} onSelect={openMemberDetail} /><UsagePagination page={data.page} pageSize={data.page_size} total={data.total_members} onChange={setMemberPage} onPageSizeChange={(nextPageSize) => { setMemberPageSize(nextPageSize); setMemberPage(1) }} /></section>
      <section id="enterprise-usage-panel-detail" className="enterprise-usage-tab-panel" role="tabpanel" aria-labelledby="enterprise-usage-tab-detail" hidden={!showDetail}><UsageDetailControls members={selectableMembers} roleOptions={roleOptions} filters={filters} onSelect={selectMember} onRangeChange={updateRange} onStartDateChange={(value) => setFilters((previous) => ({ ...previous, startDate: value }))} onEndDateChange={(value) => setFilters((previous) => ({ ...previous, endDate: value }))} />{loading && !detailData ? <EnterpriseLoading label={t('console.enterprise.usage.loadingDetail')} /> : filters.memberID === 'all' ? <EnterpriseEmpty title={t('console.enterprise.usage.noMemberSelected')} description={t('console.enterprise.usage.noMemberSelectedHint')} /> : detailData ? <MemberUsageDetail data={detailData} memberID={filters.memberID} filters={filters} /> : <EnterpriseEmpty title={t('console.enterprise.usage.noMemberUsage')} description={t('console.enterprise.usage.noMemberUsageHint')} />}</section>
    </> : null}
    {!loading && !data && !dateRangeError && !error ? <EnterpriseEmpty title={t('console.enterprise.usage.noEnterpriseUsage')} description={t('console.enterprise.usage.noEnterpriseUsageHint')} /> : null}
  </div>
}

export function EnterpriseUsagePage() {
  const { t } = useTranslation()
  const [periodLabel, setPeriodLabel] = useState<string | null>(null)
  const actions = periodLabel ? <span className="enterprise-usage-period-chip"><span>{t('console.enterprise.usage.periodLabel')}</span><strong>{periodLabel}</strong></span> : undefined
  return <EnterprisePageShell title={t('console.enterprise.usage.title')} description={t('console.enterprise.usage.description')} capability="can_view_usage" actions={actions} className="enterprise-usage-page">{(context) => <UsageContent context={context} onPeriodChange={setPeriodLabel} />}</EnterprisePageShell>
}
