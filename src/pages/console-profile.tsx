import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Button, Input, Modal, Switch, Toast } from '@douyinfe/semi-ui'
import {
  getNotificationPreferences,
  getProfileEnterprises,
  getProfileErrorMessage,
  getUserProfile,
  isNotificationPreferenceCode,
  isValidDisplayName,
  limitDisplayNameLength,
  PROFILE_DISPLAY_NAME_MAX_LENGTH,
  PROFILE_NOTIFICATION_CODES,
  updateNotificationPreferences,
  updateProfileNickname,
  type ContactProvider,
  type EnterpriseMembership,
  type NotificationPreferenceCode,
  type NotificationPreferences,
  type UserProfile,
} from '@/api/profile'
import { getAccessToken } from '@/auth/token-storage'
import { isAuthenticationFailure } from '@/api/http'
import { ProfileContactDialog } from '@/components/profile-contact-dialog'
import { BannerNotice, PageTitle } from '@/components/common'
import { NEW_ENTERPRISE_CREATE_PATH } from '@/api/enterprise-certification'
import { useAppStore } from '@/data/app-state'
import { getEnterpriseContext, type EnterpriseContext, type EnterpriseRoleOption } from '@/api/enterprise-console'
import { invalidateAuth, updateAuthenticatedUser } from '@/store/auth-slice'
import { useAppDispatch } from '@/store/hooks'
import { useTranslation } from 'react-i18next'

const PREFERENCE_DEFINITIONS: Record<NotificationPreferenceCode, { labelKey: string; descriptionKey: string }> = {
  low_balance: { labelKey: 'profile.notifications.lowBalance', descriptionKey: 'profile.notifications.lowBalanceDescription' },
  invitations: { labelKey: 'profile.notifications.invitations', descriptionKey: 'profile.notifications.invitationsDescription' },
  product_updates: { labelKey: 'profile.notifications.productUpdates', descriptionKey: 'profile.notifications.productUpdatesDescription' },
}

const ENTERPRISE_CAPABILITY_DEFINITIONS: Array<{ key: keyof EnterpriseContext['capabilities']; labelKey: string }> = [
  { key: 'can_manage_members', labelKey: 'profile.enterprise.permissions.manageMembers' },
  { key: 'can_manage_roles', labelKey: 'profile.enterprise.permissions.manageRoles' },
  { key: 'can_manage_tags', labelKey: 'profile.enterprise.permissions.manageTags' },
  { key: 'can_manage_usage', labelKey: 'profile.enterprise.permissions.manageUsage' },
  { key: 'can_view_usage', labelKey: 'profile.enterprise.permissions.viewUsage' },
  { key: 'can_view_audit', labelKey: 'profile.enterprise.permissions.viewAudit' },
  { key: 'can_view_analytics', labelKey: 'profile.enterprise.permissions.viewAnalytics' },
]

function profileToAuthUser(profile: UserProfile) {
  return {
    id: profile.id,
    display_name: limitDisplayNameLength(profile.display_name),
    avatar_url: profile.avatar_url,
    locale: profile.locale,
    timezone: profile.timezone,
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
  const navigate = useNavigate()
  const store = useAppStore()
  const activeEnterpriseID = store.activeWorkspace.type === 'enterprise' ? store.activeWorkspace.id : ''
  const enterpriseWorkspace = Boolean(activeEnterpriseID)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [enterprises, setEnterprises] = useState<EnterpriseMembership[]>([])
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null)
  const [enterpriseContext, setEnterpriseContext] = useState<EnterpriseContext | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingNickname, setSavingNickname] = useState(false)
  const [savingPreference, setSavingPreference] = useState<NotificationPreferenceCode | null>(null)
  const [contactProvider, setContactProvider] = useState<ContactProvider | null>(null)
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
    setDisplayName('')
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
      setDisplayName(normalizedProfile.display_name)
      setEnterprises(nextEnterprises)
      setPreferences(nextPreferences)
      setEnterpriseContext(nextEnterpriseContext)
      // 中文：首次加载也同步认证状态，确保 Header 与个人中心展示一致。
      dispatch(updateAuthenticatedUser(profileToAuthUser(normalizedProfile)))
    } catch (requestError) {
      if (!handleProfileError(requestError)) setError(getProfileErrorMessage(requestError))
    } finally {
      setLoading(false)
    }
  }, [activeEnterpriseID, enterpriseWorkspace, handleProfileError, invalidateSession, t])

  useEffect(() => {
    void loadProfile()
  }, [loadProfile])

  const preferenceItems = useMemo(() => {
    if (!preferences) return []
    return PROFILE_NOTIFICATION_CODES.flatMap((code) => {
      const item = preferences.items.find((preference) => preference.code === code)
      return item ? [{ code, item }] : []
    })
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
        role: roleLabels(membership.roles.length ? membership.roles : ['owner'], profile.locale, membership.enterprise_id === enterpriseContext?.id ? enterpriseContext.role_options : []),
        current: activeWorkspaceId === membership.enterprise_id || activeWorkspaceId === membership.id,
      })),
    ]
  }, [enterprises, enterpriseContext, profile, store.activeWorkspace.id, store.activeWorkspace.type, t])

  function applyProfile(nextProfile: UserProfile): void {
    const normalizedProfile = normalizeProfile(nextProfile)
    setProfile(normalizedProfile)
    setDisplayName(normalizedProfile.display_name)
    dispatch(updateAuthenticatedUser(profileToAuthUser(normalizedProfile)))
  }

  async function saveNickname(): Promise<void> {
    const normalizedName = displayName.trim()
    if (!normalizedName) {
      Toast.warning(t('profile.personal.emptyName'))
      return
    }
    if (!isValidDisplayName(normalizedName)) {
      Toast.warning(t('profile.personal.nameTooLong', { count: PROFILE_DISPLAY_NAME_MAX_LENGTH }))
      return
    }
    const accessToken = getAccessToken()
    if (!accessToken || !profile) {
      if (!accessToken) invalidateSession()
      else Toast.error(t('profile.messages.loginExpired'))
      return
    }
    if (normalizedName === profile.display_name) return
    setSavingNickname(true)
    try {
      const nextProfile = await updateProfileNickname(accessToken, normalizedName)
      applyProfile(nextProfile)
      Toast.success(t('profile.personal.saved'))
    } catch (requestError) {
      if (!handleProfileError(requestError)) Toast.error(getProfileErrorMessage(requestError))
    } finally {
      setSavingNickname(false)
    }
  }

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

  async function copyUserId(): Promise<void> {
    if (!profile) return
    try {
      await navigator.clipboard.writeText(profile.id)
      Toast.success(t('profile.messages.copied'))
    } catch {
      Toast.error(t('profile.messages.copyFailed'))
    }
  }

  function renderProfileAvatar(): React.ReactNode {
    if (profile?.avatar_url) return <img className="settings-avatar-image" src={profile.avatar_url} alt="" />
    return <span>{(profile?.display_name || '?').slice(0, 1).toUpperCase()}</span>
  }

  // 中文：企业空间和个人空间共用个人资料编辑区，保证账号展示与更新规则一致。
  function renderPersonalProfileSection(currentProfile: UserProfile): React.ReactNode {
    return <section className="settings-section" aria-labelledby="profile-personal-title">
      <div className="settings-section-head">
        <h2 id="profile-personal-title">{t('profile.personal.title')}</h2>
        <p>{t('profile.personal.description')}</p>
        <p className="settings-hint">{t('profile.personal.dataHint')}</p>
      </div>
      <form className="settings-form" noValidate onSubmit={(event) => { event.preventDefault(); void saveNickname() }}>
        <div className="settings-row">
          <span className="settings-label">{t('profile.personal.avatar')}</span>
          <div className="settings-control">
            <div className="settings-avatar" aria-label={t('profile.personal.avatar')}>{renderProfileAvatar()}</div>
            <p className="settings-hint">{t('profile.personal.avatarHint')}</p>
          </div>
        </div>
        <div className="settings-row">
          <label className="settings-label" htmlFor="profile-display-name">{t('profile.personal.nickname')}</label>
          <div className="settings-control">
            <Input id="profile-display-name" value={displayName} onChange={(value) => setDisplayName(limitDisplayNameLength(value))} maxLength={PROFILE_DISPLAY_NAME_MAX_LENGTH} autoComplete="nickname" aria-describedby="profile-display-name-hint" />
            <p className="settings-hint" id="profile-display-name-hint">{t('profile.personal.nicknameHint', { count: PROFILE_DISPLAY_NAME_MAX_LENGTH })}</p>
          </div>
        </div>
        <div className="settings-row">
          <span className="settings-label" id="profile-phone-label">{t('profile.contact.phone')}</span>
          <div className="settings-control">
            <div className="settings-inline" aria-labelledby="profile-phone-label">
              <span className="settings-readonly">{currentProfile.phone.bound ? currentProfile.phone.masked_identifier : t('profile.contact.unbound')}</span>
              <Button className="settings-secondary-button" theme="outline" size="small" onClick={() => setContactProvider('phone')}>{currentProfile.phone.bound ? t('profile.contact.changePhone') : t('profile.contact.bindPhone')}</Button>
            </div>
            <p className="settings-hint">{t('profile.personal.phoneHint')}</p>
          </div>
        </div>
        <div className="settings-row">
          <span className="settings-label" id="profile-email-label">{t('profile.contact.email')}</span>
          <div className="settings-control">
            <div className="settings-inline" aria-labelledby="profile-email-label">
              <span className="settings-readonly">{currentProfile.email.bound ? currentProfile.email.masked_identifier : t('profile.contact.unboundEmail')}</span>
              <Button className="settings-secondary-button" theme="outline" size="small" onClick={() => setContactProvider('email')}>{currentProfile.email.bound ? t('profile.contact.changeEmail') : t('profile.contact.bindEmail')}</Button>
            </div>
            <p className="settings-hint">{t('profile.personal.emailHint')}</p>
          </div>
        </div>
        <div className="settings-row">
          <span className="settings-label" id="profile-user-id-label">{t('profile.overview.id')}</span>
          <div className="settings-control">
            <div className="settings-inline" aria-labelledby="profile-user-id-label">
              <code className="settings-readonly">{currentProfile.id}</code>
              <Button className="settings-secondary-button" theme="outline" size="small" onClick={() => { void copyUserId() }}>{t('profile.overview.copyShort')}</Button>
            </div>
            <p className="settings-hint">{t('profile.personal.userIdHint')}</p>
          </div>
        </div>
        <div className="settings-row">
          <span className="settings-label" aria-hidden="true" />
          <div className="settings-actions">
            <Button className="settings-primary-button" theme="solid" type="primary" htmlType="submit" loading={savingNickname} disabled={savingNickname || !displayName.trim()}>{savingNickname ? t('profile.personal.saving') : t('profile.personal.save')}</Button>
          </div>
        </div>
      </form>
    </section>
  }

  if (loading && !profile) {
    return (
      <div className="page-stack settings-console-page">
        <PageTitle title={t('profile.title')} description={t('profile.description')} />
        <div className="settings-page-inner"><div className="profile-state-panel" role="status">{t('profile.loading')}</div></div>
      </div>
    )
  }

  if (error && !profile) {
    return (
      <div className="page-stack settings-console-page">
        <PageTitle title={t('profile.title')} description={t('profile.description')} />
        <div className="settings-page-inner">
          <BannerNotice tone="warning"><div className="profile-error-content"><strong>{t('profile.loadFailed')}</strong><span>{error}</span><Button className="settings-secondary-button" theme="outline" size="small" loading={loading} disabled={loading} onClick={() => { void loadProfile() }}>{t('profile.retry')}</Button></div></BannerNotice>
        </div>
      </div>
    )
  }

  if (!profile || (!enterpriseWorkspace && !preferences) || (enterpriseWorkspace && !enterpriseContext)) return null

  const profileContact = contactProvider ? profile[contactProvider] : profile.phone
  const enterprisePermissions = enterpriseContext
    ? ENTERPRISE_CAPABILITY_DEFINITIONS.filter(({ key }) => enterpriseContext.capabilities[key]).map(({ labelKey }) => t(labelKey))
    : []

  async function copyEnterpriseMemberID(): Promise<void> {
    if (!enterpriseContext) return
    try {
      await navigator.clipboard.writeText(enterpriseContext.member_id)
      Toast.success(t('profile.enterprise.messages.memberIdCopied'))
    } catch {
      Toast.error(t('profile.messages.copyFailed'))
    }
  }

  return (
    <div className="page-stack settings-console-page">
      <PageTitle title={enterpriseWorkspace ? t('profile.enterprise.title') : t('profile.title')} description={enterpriseWorkspace ? t('profile.enterprise.description') : t('profile.description')} />
      <div className="settings-page-inner">
        {error ? <BannerNotice tone="warning"><div className="profile-error-content"><span>{error}</span><Button className="settings-secondary-button" theme="outline" size="small" loading={loading} disabled={loading} onClick={() => { void loadProfile() }}>{t('profile.retry')}</Button></div></BannerNotice> : null}

        {renderPersonalProfileSection(profile)}

        {enterpriseWorkspace ? <section className="settings-section" aria-labelledby="profile-enterprise-title">
          <div className="settings-section-head">
            <h2 id="profile-enterprise-title">{t('profile.enterprise.accountTitle')}</h2>
            <p>{t('profile.enterprise.accountDescription')}</p>
          </div>
          <div className="settings-form enterprise-account-form">
            <div className="settings-row"><span className="settings-label">{t('profile.enterprise.name')}</span><div className="settings-control"><span className="settings-readonly">{enterpriseContext?.name}</span></div></div>
            <div className="settings-row"><span className="settings-label">{t('profile.enterprise.code')}</span><div className="settings-control"><code className="settings-readonly">{enterpriseContext?.code}</code></div></div>
            <div className="settings-row"><span className="settings-label">{t('profile.enterprise.memberId')}</span><div className="settings-control"><div className="settings-inline"><code className="settings-readonly">{enterpriseContext?.member_id}</code><Button className="settings-secondary-button" theme="outline" size="small" onClick={() => { void copyEnterpriseMemberID() }}>{t('profile.overview.copyShort')}</Button></div></div></div>
            <div className="settings-row"><span className="settings-label">{t('profile.enterprise.role')}</span><div className="settings-control"><span className="settings-readonly">{enterpriseContext ? roleLabels(enterpriseContext.roles.length ? enterpriseContext.roles : [enterpriseContext.role], profile.locale, enterpriseContext.role_options) : '--'}</span></div></div>
            <div className="settings-row"><span className="settings-label">{t('profile.enterprise.permissions.title')}</span><div className="settings-control"><div className="enterprise-permission-list">{enterprisePermissions.length ? enterprisePermissions.map((permission) => <span className="model-tag" key={permission}>{permission}</span>) : <span className="settings-readonly">{t('profile.enterprise.permissions.none')}</span>}</div></div></div>
          </div>
        </section> : null}

        {!enterpriseWorkspace ? <section className="settings-section" aria-labelledby="profile-notification-title">
          <div className="settings-section-head">
            <h2 id="profile-notification-title">{t('profile.notifications.title')}</h2>
            <p>{t('profile.notifications.description')}</p>
          </div>
          <div className="notification-list">
            {preferenceItems.map(({ code, item }) => {
              const definition = isNotificationPreferenceCode(code) ? PREFERENCE_DEFINITIONS[code] : null
              if (!definition) return null
              return (
                <label className="notification-row" htmlFor={`profile-notification-${code}`} key={code}>
                  <span><strong>{t(definition.labelKey)}</strong><small>{t(definition.descriptionKey)}</small></span>
                  <Switch id={`profile-notification-${code}`} aria-label={t(definition.labelKey)} checked={item.enabled} disabled={Boolean(savingPreference)} loading={savingPreference === code} onChange={(enabled) => { void savePreference(code, enabled) }} />
                </label>
              )
            })}
          </div>
        </section> : null}

        <section className="settings-section" aria-labelledby="profile-workspace-title">
          <div className="settings-section-head">
            <h2 id="profile-workspace-title">{t('profile.workspace.title')}</h2>
            <p>{t('profile.workspace.description')}</p>
          </div>
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
        </section>

        {!enterpriseWorkspace ? <section className="settings-section" aria-labelledby="profile-security-title">
          <div className="settings-section-head">
            <h2 className="danger-copy" id="profile-security-title">{t('profile.security.title')}</h2>
            <p>{t('profile.security.description')}</p>
          </div>
          <div className="settings-actions">
            <Button className="settings-danger-button" theme="outline" type="danger" onClick={() => setDeactivateVisible(true)}>{t('profile.security.deactivate')}</Button>
            <span className="settings-hint">{t('profile.security.deactivateHint')}</span>
          </div>
        </section> : null}
      </div>

      <ProfileContactDialog
        visible={Boolean(contactProvider)}
        provider={contactProvider ?? 'phone'}
        currentContact={profileContact}
        accessToken={getAccessToken()}
        locale={profile.locale}
        onAuthFailure={invalidateSession}
        onCancel={() => setContactProvider(null)}
        onSaved={(nextProfile) => { applyProfile(nextProfile); setContactProvider(null) }}
      />
      <Modal
        title={t('profile.security.dialogTitle')}
        visible={deactivateVisible}
        onCancel={() => setDeactivateVisible(false)}
        onOk={() => { setDeactivateVisible(false); Toast.warning(t('profile.security.dialogPending')) }}
        okText={t('profile.security.dialogContinue')}
        cancelText={t('profile.security.dialogCancel')}
        okButtonProps={{ className: 'profile-modal-primary-button', 'aria-label': t('profile.security.dialogContinue') }}
        cancelButtonProps={{ className: 'profile-modal-secondary-button', 'aria-label': t('profile.security.dialogCancel') }}
      >
        <p>{t('profile.security.dialogDescription')}</p>
      </Modal>
    </div>
  )
}
