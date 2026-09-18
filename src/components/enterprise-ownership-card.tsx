import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Button from '@douyinfe/semi-ui/lib/es/button'
import {
  getAllEnterpriseMembers,
  getEnterpriseContext,
  type EnterpriseContext,
  type EnterpriseMember,
  type EnterpriseOwnershipTransferResult,
  type EnterpriseVersion,
} from '@/api/enterprise-console'
import { getProfileEnterprises, getUserProfile, type UserProfile } from '@/api/profile'
import { isAuthenticationFailure } from '@/api/http'
import { getAccessToken, getAuthSessionSnapshot } from '@/auth/token-storage'
import { useAppStore } from '@/data/app-state'
import { useEnterpriseErrorHandler, type EnterpriseRequestError } from '@/pages/enterprise-console-shared'
import { appToast } from './app-toast'
import { workspacesFromMemberships } from './common'
import { EnterpriseOwnershipTransferDialog } from './enterprise-ownership-transfer-dialog'
import './enterprise-ownership-transfer.css'

function hasOwnerRole(value: Pick<EnterpriseContext | EnterpriseMember, 'role' | 'roles'>): boolean {
  return value.role === 'owner' || value.roles.includes('owner')
}

function hasTransferVersion(version: EnterpriseVersion | undefined): boolean {
  return typeof version === 'string'
    ? /^[1-9]\d*$/.test(version)
    : typeof version === 'number' && Number.isSafeInteger(version) && version > 0
}

function transferredMembers(members: EnterpriseMember[], result: EnterpriseOwnershipTransferResult): EnterpriseMember[] {
  return members.map((member) => {
    if (member.id === result.new_owner_member_id) {
      return { ...member, role: result.new_owner_role, roles: [result.new_owner_role], version: result.new_owner_version }
    }
    if (member.id === result.previous_owner_member_id) {
      return { ...member, role: result.previous_owner_role, roles: [result.previous_owner_role], version: result.previous_owner_version }
    }
    return member
  })
}

function EnterpriseOwnershipContent({ enterpriseId }: { enterpriseId: string }) {
  const { t } = useTranslation()
  const translateRef = useRef(t)
  translateRef.current = t
  const store = useAppStore()
  const storeRef = useRef(store)
  storeRef.current = store
  const handleError = useEnterpriseErrorHandler()
  const [context, setContext] = useState<EnterpriseContext | null>(null)
  const [members, setMembers] = useState<EnterpriseMember[]>([])
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<EnterpriseRequestError | null>(null)
  const [open, setOpen] = useState(false)
  const [transferred, setTransferred] = useState(false)
  const transferResultRef = useRef<EnterpriseOwnershipTransferResult | null>(null)
  // 请求完成时卡片可能已经卸载，仍需识别发起转让的登录会话。
  const ownershipSession = useRef({ sessionId: getAuthSessionSnapshot()?.sessionId, accessToken: getAccessToken() })
  const mounted = useRef(false)
  const requestVersion = useRef(0)
  const controllerRef = useRef<AbortController | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    const version = ++requestVersion.current
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    const accessToken = getAccessToken() ?? undefined
    const sessionId = getAuthSessionSnapshot()?.sessionId
    const sameSession = () => sessionId
      ? getAuthSessionSnapshot()?.sessionId === sessionId
      : getAccessToken() === (accessToken ?? null)
    const options = { accessToken, signal: controller.signal }
    const requestContext = { enterprise_id: enterpriseId }
    if (mounted.current) {
      setLoading(true)
      setError(null)
    }
    try {
      // 独立刷新企业上下文和成员目录，局部失败也不能保留已失效的所有者权限。
      const [contextResult, membersResult, membershipsResult, profileResult] = await Promise.allSettled([
        getEnterpriseContext(requestContext, options),
        getAllEnterpriseMembers(requestContext, options),
        transferResultRef.current
          ? getProfileEnterprises(accessToken ?? '', { signal: controller.signal })
          : Promise.resolve(null),
        // 转让弹窗需要当前账号已绑定的联系方式，提前取回可在弹窗首帧确定确认按钮状态。
        getUserProfile(accessToken ?? ''),
      ])
      if ((!mounted.current && !transferResultRef.current) || version !== requestVersion.current || controller.signal.aborted || !sameSession()) {
        throw new DOMException('Aborted', 'AbortError')
      }
      const transferResult = transferResultRef.current
      if (contextResult.status === 'fulfilled') {
        const nextContext = transferResult ? {
          ...contextResult.value,
          role: transferResult.previous_owner_role,
          roles: [transferResult.previous_owner_role],
          enterprise_version: transferResult.enterprise_version,
          member_version: transferResult.previous_owner_version,
          capabilities: { ...contextResult.value.capabilities, can_transfer_ownership: false },
        } : contextResult.value
        if (mounted.current) setContext(nextContext)
        // 其他窗口已转让时，冲突刷新也应同步撤销当前工作空间的旧 owner 特权。
        if (!hasOwnerRole(nextContext) && storeRef.current.workspaces.some((workspace) => workspace.id === enterpriseId && workspace.role === 'owner')) {
          storeRef.current.replaceEnterpriseWorkspaces(storeRef.current.workspaces.filter((workspace) => workspace.type === 'enterprise').map((workspace) => (
            workspace.id === enterpriseId ? { ...workspace, role: nextContext.role } : workspace
          )))
        }
      }
      if (membersResult.status === 'fulfilled' && mounted.current) {
        setMembers(transferResult ? transferredMembers(membersResult.value, transferResult) : membersResult.value)
      }
      // 资料读取失败不阻断卡片，弹窗会在缺少预取资料时自行重试。
      if (profileResult.status === 'fulfilled' && mounted.current) setProfile(profileResult.value)
      if (membershipsResult.status === 'fulfilled' && membershipsResult.value) {
        // 读副本可能短暂返回旧 owner 角色，本轮同步以已提交的转让结果为准。
        storeRef.current.replaceEnterpriseWorkspaces(workspacesFromMemberships(membershipsResult.value).map((workspace) => (
          transferResult && workspace.id === enterpriseId ? { ...workspace, role: transferResult.previous_owner_role } : workspace
        )))
      }
      const failures = [contextResult, membersResult, membershipsResult].filter((result) => result.status === 'rejected')
      const failure = failures.find((result) => isAuthenticationFailure(result.reason)) ?? failures[0]
      if (failure) throw failure.reason
    } catch (reason: unknown) {
      if (version === requestVersion.current && !controller.signal.aborted && sameSession()) {
        const nextError = handleError(reason)
        if (nextError && mounted.current) setError(nextError)
        else if (nextError && transferResultRef.current) appToast.error(translateRef.current('console.ownershipTransfer.refreshPending'))
      }
      // 冲突后的刷新失败必须回传给弹窗，不能允许其沿用旧版本再次确认。
      throw reason
    } finally {
      if (mounted.current && version === requestVersion.current) setLoading(false)
    }
  }, [enterpriseId, handleError])

  useEffect(() => {
    mounted.current = true
    void refresh().catch(() => undefined)
    return () => {
      mounted.current = false
      // 降权可能立即卸载企业页面，已成功转让的后台同步仍须完成；认证会话另行校验。
      if (!transferResultRef.current) {
        requestVersion.current++
        controllerRef.current?.abort()
      }
    }
  }, [refresh])

  function handleTransferred(result: EnterpriseOwnershipTransferResult): void {
    const session = ownershipSession.current
    const sameOwnershipSession = session.sessionId
      ? getAuthSessionSnapshot()?.sessionId === session.sessionId
      : getAccessToken() === session.accessToken
    if (result.enterprise_id !== enterpriseId || !sameOwnershipSession) return
    transferResultRef.current = result
    if (mounted.current) {
      setTransferred(true)
      setOpen(false)
      setContext((previous) => previous ? {
        ...previous,
        enterprise_version: result.enterprise_version,
        member_version: result.previous_owner_version,
        role: result.previous_owner_role,
        roles: [result.previous_owner_role],
        capabilities: { ...previous.capabilities, can_transfer_ownership: false },
      } : previous)
      setMembers((previous) => transferredMembers(previous, result))
    }
    // 先使用转让成功响应撤销本地 owner 特权，随后刷新失败也不能再次发起转让。
    const currentStore = storeRef.current
    currentStore.replaceEnterpriseWorkspaces(currentStore.workspaces.filter((workspace) => workspace.type === 'enterprise').map((workspace) => (
      workspace.id === enterpriseId ? { ...workspace, role: result.previous_owner_role } : workspace
    )))
    appToast.success(t('console.ownershipTransfer.success'))
    void refresh().catch(() => undefined)
  }

  const owner = members.find((member) => member.status === 'active' && hasOwnerRole(member))
  const ownerName = owner?.display_name || owner?.user_id || t('console.ownershipTransfer.ownerUnavailable')
  const canTransfer = Boolean(context
    && hasOwnerRole(context)
    && context.capabilities.can_transfer_ownership === true
    && hasTransferVersion(context.enterprise_version)
    && hasTransferVersion(context.member_version)
    && (!context.member_status || context.member_status === 'active')
    && !transferred)

  return (
    <div className="enterprise-ownership-section">
      <div className="settings-card enterprise-settings-card enterprise-settings-card--ownership" aria-busy={loading}>
        {loading && !context ? (
          <p className="enterprise-ownership-status" role="status">{t('console.common.loading')}</p>
        ) : (
          <div className="owner-row">
            <span className="owner-avatar">{owner ? ownerName.slice(0, 1).toUpperCase() : '—'}</span>
            <strong>{ownerName}<small>{t('console.enterpriseSettings.owner')}</small></strong>
          </div>
        )}
        <Button
          theme="outline"
          disabled={!canTransfer || loading || Boolean(error)}
          title={!canTransfer && !transferred ? t('console.ownershipTransfer.unavailable') : undefined}
          onClick={() => setOpen(true)}
        >
          {t('console.enterpriseSettings.transfer')}
        </Button>
      </div>
      {error ? (
        <div className="enterprise-ownership-error" role="alert">
          <div>
            <p>{transferred ? t('console.ownershipTransfer.refreshPending') : error.message || t('console.ownershipTransfer.loadFailed')}</p>
            {error.requestId ? <small>{t('console.common.requestId')}: {error.requestId}</small> : null}
          </div>
          <Button theme="outline" disabled={loading} loading={loading} onClick={() => void refresh().catch(() => undefined)}>
            {t(transferred ? 'console.ownershipTransfer.refresh' : 'console.common.retry')}
          </Button>
        </div>
      ) : null}
      {/* 弹窗常驻：关闭时保留实例才能播放 Semi 的退场动效，刷新版本时也不会丢失已填写的表单。 */}
      {context ? (
        <EnterpriseOwnershipTransferDialog
          visible={open}
          context={context}
          members={members}
          initialProfile={profile}
          onClose={() => setOpen(false)}
          onTransferred={handleTransferred}
          onRefresh={refresh}
        />
      ) : null}
    </div>
  )
}

export function EnterpriseOwnershipCard() {
  const { t } = useTranslation()
  const store = useAppStore()
  const enterpriseId = store.activeWorkspace.type === 'enterprise' ? store.activeWorkspace.id : ''
  if (!enterpriseId) return <p className="enterprise-ownership-status">{t('console.enterprise.gated')}</p>
  // 空间切换后卸载旧请求和验证弹窗，避免将旧企业的结果写入当前企业。
  return <EnterpriseOwnershipContent key={enterpriseId} enterpriseId={enterpriseId} />
}
