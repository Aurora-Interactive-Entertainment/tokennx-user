import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import Button from '@douyinfe/semi-ui/lib/es/button'
import Switch from '@douyinfe/semi-ui/lib/es/switch'
import {
  getNotificationPreferences,
  getProfileEnterprises,
  getProfileErrorMessage,
  getUserProfile,
  isNotificationPreferenceCode,
  limitDisplayNameLength,
  updateNotificationPreferences,
  type EnterpriseMembership,
  type NotificationPreferenceCode,
  type NotificationPreferences,
  type UserProfile,
} from '@/api/profile'
import { getAccessToken } from '@/auth/token-storage'
import { isAuthenticationFailure } from '@/api/http'
import { AccountSettingsModal, PageTitle } from '@/components/common'
import { SettingsAnchorLayout, type SettingsAnchorItem } from '@/components/settings-anchor-layout'
import { NEW_ENTERPRISE_CREATE_PATH } from '@/api/enterprise-certification'
import { useAppStore } from '@/data/app-state'
import { getEnterpriseContext, type EnterpriseContext, type EnterpriseRoleOption } from '@/api/enterprise-console'
import { invalidateAuth, updateAuthenticatedUser } from '@/store/auth-slice'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import type { AuthUser } from '@/api/auth'
import { useTranslation } from 'react-i18next'
import { appToast as Toast } from '@/components/app-toast'
import { publishProfileUpdate, subscribeProfileUpdates } from '@/profile/profile-sync'
import { AccountDeletionFlow } from '@/components/account-deletion-flow'
import './console-profile.css'

const PREFERENCE_DEFINITIONS: Record<NotificationPreferenceCode, { labelKey: string; descriptionKey: string }> = {
  onboarding: { labelKey: 'profile.notifications.onboarding', descriptionKey: 'profile.notifications.onboardingDescription' },
  security_alerts: { labelKey: 'profile.notifications.securityAlerts', descriptionKey: 'profile.notifications.securityAlertsDescription' },
  billing_updates: { labelKey: 'profile.notifications.billingUpdates', descriptionKey: 'profile.notifications.billingUpdatesDescription' },
  low_balance: { labelKey: 'profile.notifications.lowBalance', descriptionKey: 'profile.notifications.lowBalanceDescription' },
  usage_alerts: { labelKey: 'profile.notifications.usageAlerts', descriptionKey: 'profile.notifications.usageAlertsDescription' },
  workflow_results: { labelKey: 'profile.notifications.workflowResults', descriptionKey: 'profile.notifications.workflowResultsDescription' },
  invitations: { labelKey: 'profile.notifications.invitations', descriptionKey: 'profile.notifications.invitationsDescription' },
  service_updates: { labelKey: 'profile.notifications.serviceUpdates', descriptionKey: 'profile.notifications.serviceUpdatesDescription' },
  product_updates: { labelKey: 'profile.notifications.productUpdates', descriptionKey: 'profile.notifications.productUpdatesDescription' },
}

function profileToAuthUser(profile: UserProfile, fallback?: AuthUser | null): AuthUser {
  return {
    id: profile.id,
    display_name: limitDisplayNameLength(profile.display_name),
    // 中文：新版资料接口省略这些认证字段，更新昵称或联系方式时不得清空现有值。
    avatar_url: profile.avatar_url ?? fallback?.avatar_url ?? '',
    locale: profile.locale ?? fallback?.locale ?? 'zh-CN',
    timezone: profile.timezone ?? fallback?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    status: profile.status,
    phone_masked: profile.phone.masked_identifier,
    email_masked: profile.email.masked_identifier,
  }
}

// 中文：兼容历史资料接口返回的超长昵称，个人中心及工作空间展示统一使用前端上限。
function normalizeProfile(profile: UserProfile): UserProfile {
  return { ...profile, display_name: limitDisplayNameLength(profile.display_name) }
}

function roleLabels(roles: string[], locale: string, roleOptions: EnterpriseRoleOption[] = []): string {
  if (locale === 'en-US') return roles.join(', ')
  return roles.map((role) => roleOptions.find((option) => option.code === role)?.name || role).join('、')
}

export function SettingsPage() {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const authUser = useAppSelector((state) => state.auth.user)
  const authUserRef = useRef(authUser)
  authUserRef.current = authUser
  const navigate = useNavigate()
  const store = useAppStore()
  const activeEnterpriseID = store.activeWorkspace.type === 'enterprise' ? store.activeWorkspace.id : ''
  const enterpriseWorkspace = Boolean(activeEnterpriseID)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [enterprises, setEnterprises] = useState<EnterpriseMembership[]>([])
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null)
  const [enterpriseContext, setEnterpriseContext] = useState<EnterpriseContext | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingPreference, setSavingPreference] = useState<NotificationPreferenceCode | null>(null)
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false)
  const [deactivateVisible, setDeactivateVisible] = useState(false)

  const invalidateSession = useCallback((): void => {
    dispatch(invalidateAuth())
    navigate('/', { replace: true })
  }, [dispatch, navigate])

  const handleProfileError = useCallback((requestError: unknown): boolean => {
    if (!isAuthenticationFailure(requestError)) return false
    invalidateSession()
    return true
  }, [invalidateSession])

  const loadProfile = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError('')
    setProfile(null)
    setEnterprises([])
    setPreferences(null)
    setEnterpriseContext(null)
    const accessToken = getAccessToken()
    if (!accessToken) {
      invalidateSession()
      setLoading(false)
      return
    }
    try {
      const [nextProfile, nextEnterprises, nextPreferences, nextEnterpriseContext] = await Promise.all([
        getUserProfile(accessToken),
        getProfileEnterprises(accessToken),
        enterpriseWorkspace ? Promise.resolve<NotificationPreferences | null>(null) : getNotificationPreferences(accessToken),
        enterpriseWorkspace ? getEnterpriseContext({ enterprise_id: activeEnterpriseID }, { accessToken }) : Promise.resolve<EnterpriseContext | null>(null),
      ])
      const normalizedProfile = normalizeProfile(nextProfile)
      setProfile(normalizedProfile)
      setEnterprises(nextEnterprises)
      setPreferences(nextPreferences)
      setEnterpriseContext(nextEnterpriseContext)
      // 中文：首次加载也同步认证状态，确保 Header 与个人中心展示一致。
      dispatch(updateAuthenticatedUser(profileToAuthUser(normalizedProfile, authUserRef.current)))
    } catch (requestError) {
      if (!handleProfileError(requestError)) setError(getProfileErrorMessage(requestError))
    } finally {
      setLoading(false)
    }
  }, [activeEnterpriseID, enterpriseWorkspace, handleProfileError, invalidateSession, t])

  useEffect(() => {
    void loadProfile()
  }, [loadProfile])

  useEffect(() => {
    if (error) Toast.error(error)
  }, [error])

  const preferenceItems = useMemo(() => {
    if (!preferences) return []
    // 中文：按接口返回顺序展示固定白名单中的全部通知分类，兼容后端新增字段。
    return preferences.items.flatMap((item) => (
      isNotificationPreferenceCode(item.code) ? [{ code: item.code, item }] : []
    ))
  }, [preferences])

  const workspaceItems = useMemo(() => {
    if (!profile) return []
    const activeWorkspaceId = store.activeWorkspace.type === 'personal' ? 'personal' : store.activeWorkspace.id
    // 中文：个人空间始终保留，企业空间使用个人中心接口返回的成员关系。
    return [
      {
        id: 'personal',
        name: t('profile.workspace.personalName', { name: profile.display_name }),
        type: t('profile.workspace.personalType'),
        role: t('profile.workspace.owner'),
        current: activeWorkspaceId === 'personal',
      },
      ...enterprises.map((membership) => ({
        id: membership.enterprise_id,
        name: membership.enterprise_name,
        type: t('profile.workspace.enterpriseType'),
        role: roleLabels(membership.roles.length ? membership.roles : ['owner'], profile.locale ?? authUser?.locale ?? 'zh-CN', membership.enterprise_id === enterpriseContext?.id ? enterpriseContext.role_options : []),
        current: activeWorkspaceId === membership.enterprise_id || activeWorkspaceId === membership.id,
      })),
    ]
  }, [authUser?.locale, enterprises, enterpriseContext, profile, store.activeWorkspace.id, store.activeWorkspace.type, t])

  const anchorItems = useMemo<SettingsAnchorItem[]>(() => [
    { id: 'settings-account', label: t('profile.account.title') },
    ...(!enterpriseWorkspace ? [{ id: 'settings-notifications', label: t('profile.notifications.title') }] : []),
    { id: 'settings-workspaces', label: t('profile.workspace.title') },
    ...(!enterpriseWorkspace ? [{ id: 'settings-security', label: t('profile.security.title') }] : []),
  ], [enterpriseWorkspace, t])

  const applyProfile = useCallback((nextProfile: UserProfile, publish = true): void => {
    const normalizedProfile = normalizeProfile(nextProfile)
    setProfile(normalizedProfile)
    dispatch(updateAuthenticatedUser(profileToAuthUser(normalizedProfile, authUserRef.current)))
    if (publish) publishProfileUpdate(normalizedProfile)
  }, [dispatch])

  useEffect(() => subscribeProfileUpdates((nextProfile) => applyProfile(nextProfile, false)), [applyProfile])

  async function savePreference(code: NotificationPreferenceCode, enabled: boolean): Promise<void> {
    const accessToken = getAccessToken()
    if (!accessToken || savingPreference) {
      if (!accessToken) invalidateSession()
      return
    }
    setSavingPreference(code)
    try {
      const nextPreferences = await updateNotificationPreferences(accessToken, { [code]: enabled })
      setPreferences(nextPreferences)
      Toast.success(t('profile.notifications.saved'))
    } catch (requestError) {
      if (!handleProfileError(requestError)) Toast.error(getProfileErrorMessage(requestError))
    } finally {
      setSavingPreference(null)
    }
  }

  if (loading && !profile) {
    return (
      <div className="page-stack settings-console-page settings-redesign-page settings-redesign-page--loading">
        <PageTitle title={t('profile.title')} description={t('profile.description')} />
        <div className="settings-page-inner"><div className="profile-state-panel" role="status">{t('profile.loading')}</div></div>
      </div>
    )
  }

  if (!profile || (!enterpriseWorkspace && !preferences) || (enterpriseWorkspace && !enterpriseContext)) return null

  return (
    <div className={`page-stack settings-console-page settings-redesign-page ${enterpriseWorkspace ? 'settings-redesign-page--enterprise' : 'settings-redesign-page--personal'}`}>
      {/* 中文：个人设置按空间保留对应的账户、通知与工作空间内容。 */}
      <PageTitle title={t('profile.title')} description={t('profile.description')} />
      <div className="settings-page-inner">
        <SettingsAnchorLayout items={anchorItems} navigationLabel={t('profile.navigation.label')}>
          <section id="settings-account" className="settings-section settings-anchor-section" aria-labelledby="profile-account-title">
            <header className="settings-section-head">
              <h2 id="profile-account-title">{t('profile.account.title')}</h2>
              <p>{t('profile.account.description')}</p>
            </header>
            <div className="settings-card settings-card--account">
              <div className="settings-account-row">
                <div><strong>{t('profile.account.user')}</strong><p>{t('profile.account.userDescription')}</p></div>
                <Button className="settings-primary-button" theme="solid" type="primary" onClick={() => setAccountSettingsOpen(true)}>{t('profile.account.manage')}</Button>
              </div>
            </div>
          </section>

          {!enterpriseWorkspace ? <section id="settings-notifications" className="settings-section settings-anchor-section" aria-labelledby="profile-notification-title">
            <header className="settings-section-head">
              <h2 id="profile-notification-title">{t('profile.notifications.title')}</h2>
              <p>{t('profile.notifications.description')}</p>
            </header>
            <div className="settings-card settings-card--notifications">
              <div className="notification-list">
                {preferenceItems.map(({ code, item }) => {
                  const definition = isNotificationPreferenceCode(code) ? PREFERENCE_DEFINITIONS[code] : null
                  if (!definition) return null
                  return (
                    <label className="notification-row" htmlFor={`profile-notification-${code}`} key={code}>
                      <span><strong>{t(definition.labelKey)}</strong><small>{t(definition.descriptionKey)}</small></span>
                      <Switch id={`profile-notification-${code}`} aria-label={t(definition.labelKey)} checked={item.enabled} disabled={Boolean(savingPreference) || item.mandatory === true} loading={savingPreference === code} onChange={(enabled) => { void savePreference(code, enabled) }} />
                    </label>
                  )
                })}
              </div>
            </div>
          </section> : null}

          <section id="settings-workspaces" className="settings-section settings-anchor-section" aria-labelledby="profile-workspace-title">
            <header className="settings-section-head">
              <h2 id="profile-workspace-title">{t('profile.workspace.title')}</h2>
              <p>{t('profile.workspace.description')}</p>
            </header>
            <div className="settings-card settings-card--workspace">
              <div className="workspace-list">
                {workspaceItems.map((workspace) => (
                  <div className="workspace-item" key={workspace.id}>
                    <div><strong>{workspace.name}</strong><small>{workspace.type}</small></div>
                    <span>{workspace.current ? t('profile.workspace.current') : workspace.role}</span>
                  </div>
                ))}
              </div>
              <Button className="settings-secondary-button" theme="outline" onClick={() => navigate(NEW_ENTERPRISE_CREATE_PATH)}>{t('profile.workspace.create')}</Button>
              <p className="settings-hint">{t('profile.workspace.createHint')}</p>
            </div>
          </section>

          {!enterpriseWorkspace ? <section id="settings-security" className="settings-section settings-anchor-section" aria-labelledby="profile-security-title">
            <header className="settings-section-head">
              <h2 className="danger-copy" id="profile-security-title">{t('profile.security.title')}</h2>
              <p>{t('profile.security.description')}</p>
            </header>
            <div className="settings-card settings-card--security">
              <div className="settings-actions">
                <Button className="settings-danger-button" theme="outline" type="danger" onClick={() => setDeactivateVisible(true)}>{t('profile.security.deactivate')}</Button>
                <span className="settings-hint">{t('profile.security.deactivateHint')}</span>
              </div>
            </div>
          </section> : null}
        </SettingsAnchorLayout>
      </div>

      <AccountSettingsModal
        visible={accountSettingsOpen}
        onClose={() => setAccountSettingsOpen(false)}
      />
      <AccountDeletionFlow
        visible={deactivateVisible}
        profile={profile}
        enterprises={enterprises}
        onClose={() => setDeactivateVisible(false)}
        onAuthFailure={invalidateSession}
        onHandleEnterprise={(enterpriseID) => {
          if (enterpriseID) store.switchWorkspace(enterpriseID)
          // 中文：跳转处理企业前，注销流程弹窗与外层账户设置弹窗一并关闭。
          setDeactivateVisible(false)
          setAccountSettingsOpen(false)
          navigate('/console/enterprise-settings')
        }}
        onSuccess={() => {
          setDeactivateVisible(false)
          invalidateSession()
        }}
        t={t}
      />
    </div>
  )
}
