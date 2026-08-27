import { describe, expect, it } from 'vitest'
import { workspaceContextFor, workspaceContextKey } from './workspace'

describe('workspace context helpers', () => {
  it('creates a personal account context without an enterprise id', () => {
    const context = workspaceContextFor({ id: 'personal', type: 'personal' })
    expect(context).toEqual({ account_type: 'personal' })
    expect(workspaceContextKey(context)).toBe('personal:personal')
  })

  it('creates a stable enterprise context and cache key', () => {
    const context = workspaceContextFor({ id: 'enterprise-1', type: 'enterprise' })
    expect(context).toEqual({ account_type: 'enterprise', enterprise_id: 'enterprise-1' })
    expect(workspaceContextKey(context)).toBe('enterprise:enterprise-1')
  })
})
