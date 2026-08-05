import type { UserApiKey } from '@/api/user-api-keys'
import { modelPermissionKey, type ModelRecord } from '@/data/models'

// 中文：模型目录和 API Key 权限都可能使用公开 ID、内部编码或别名，统一在这里收敛比较口径。
export function apiKeySupportsModel(apiKey: Pick<UserApiKey, 'scope' | 'model_ids' | 'models'> | undefined, model: Pick<ModelRecord, 'id' | 'code' | 'alias'>): boolean {
  if (!apiKey) return false
  if (apiKey.scope === 'all') return true
  const allowedModelKeys = new Set([
    ...(apiKey.model_ids ?? []),
    ...apiKey.models.flatMap((item) => [item.id, item.alias]),
  ].map((value) => value.trim()).filter(Boolean))
  if (allowedModelKeys.size === 0) return false
  return [modelPermissionKey(model), model.id, model.code, model.alias]
    .filter((value): value is string => Boolean(value?.trim()))
    .some((value) => allowedModelKeys.has(value.trim()))
}
