/**
 * 统一把当前工作空间转换为各业务 API 使用的账号上下文。
 * 该对象只包含请求所需字段，不携带 UI 状态，便于在不同页面复用。
 */
export type WorkspaceAccountContext =
  | { account_type: 'personal' }
  | { account_type: 'enterprise'; enterprise_id: string }

export type WorkspaceLike = {
  id: string
  type: 'personal' | 'enterprise'
}

export function workspaceContextFor(workspace: WorkspaceLike): WorkspaceAccountContext {
  return workspace.type === 'enterprise'
    ? { account_type: 'enterprise', enterprise_id: workspace.id }
    : { account_type: 'personal' }
}

export function workspaceContextKey(context: WorkspaceAccountContext): string {
  return context.account_type === 'enterprise'
    ? `enterprise:${context.enterprise_id}`
    : 'personal:personal'
}
