import { fetchAuthenticatedJson } from './authenticated'
import type { ApiTimeValue } from '@/utils/format'

const NOTIFICATIONS_PATH = '/api/user/notifications'

export type NotificationSeverity = 'info' | 'warning' | 'critical' | string

export interface UserNotification {
  id: string
  type: string
  category: string
  severity: NotificationSeverity
  title: string
  content: string
  action_url?: string
  read: boolean
  // 中文：新接口返回 Unix 毫秒；保留字符串类型以兼容灰度期间旧通知记录。
  created_at: ApiTimeValue
  read_at?: ApiTimeValue
}

export interface NotificationListResponse {
  items: UserNotification[]
  unread_count: number
}

export interface NotificationListParams {
  limit?: number
  unread_only?: boolean
  signal?: AbortSignal
}

export function getNotifications(params: NotificationListParams = {}): Promise<NotificationListResponse> {
  const query = new URLSearchParams()
  if (params.limit !== undefined) query.set('limit', String(Math.min(100, Math.max(1, params.limit))))
  if (params.unread_only) query.set('unread_only', '1')
  const suffix = query.toString()
  return fetchAuthenticatedJson<NotificationListResponse>(`${NOTIFICATIONS_PATH}${suffix ? `?${suffix}` : ''}`, { signal: params.signal })
}

export function markNotificationRead(notificationID: string, options: { signal?: AbortSignal } = {}): Promise<{ read: boolean }> {
  return fetchAuthenticatedJson<{ read: boolean }>(`${NOTIFICATIONS_PATH}/${encodeURIComponent(notificationID)}/read`, {
    method: 'PATCH',
    signal: options.signal,
  })
}

export function markAllNotificationsRead(options: { signal?: AbortSignal } = {}): Promise<{ read: boolean }> {
  return fetchAuthenticatedJson<{ read: boolean }>(`${NOTIFICATIONS_PATH}/read-all`, {
    method: 'POST',
    signal: options.signal,
  })
}
