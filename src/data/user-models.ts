import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { getAccessToken } from '@/auth/token-storage'
import { getUserModels, getUserModelsErrorMessage, type UserModelAccountType } from '@/api/user-models'
import { isAuthenticationFailure } from '@/api/http'
import { invalidateAuth } from '@/store/auth-slice'
import { useAppDispatch } from '@/store/hooks'
import { useAppStore } from './app-state'
import { mapUserModels, type ModelRecord } from './models'

export interface UserModelsState {
  models: ModelRecord[]
  loading: boolean
  error: string
  refresh: () => void
}

function workspaceQuery(accountType: UserModelAccountType, workspaceId: string): { account_type: UserModelAccountType; enterprise_id?: string } {
  return accountType === 'enterprise'
    ? { account_type: accountType, enterprise_id: workspaceId }
    : { account_type: accountType }
}

export function useUserModels(): UserModelsState {
  const store = useAppStore()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const workspaceType = store.activeWorkspace.type
  const workspaceId = store.activeWorkspace.id
  const [reloadToken, setReloadToken] = useState(0)
  const [state, setState] = useState<Omit<UserModelsState, 'refresh'>>({ models: [], loading: true, error: '' })

  useEffect(() => {
    let active = true
    const accessToken = getAccessToken()
    setState({ models: [], loading: Boolean(accessToken), error: '' })
    if (!accessToken) return () => { active = false }

    void getUserModels(workspaceQuery(workspaceType, workspaceId)).then((result) => {
      if (active) setState({ models: mapUserModels(result.items), loading: false, error: '' })
    }).catch((error: unknown) => {
      if (!active) return
      if (isAuthenticationFailure(error)) {
        dispatch(invalidateAuth())
        navigate('/', { replace: true })
        return
      }
      setState({ models: [], loading: false, error: getUserModelsErrorMessage(error) })
    })
    return () => { active = false }
  }, [dispatch, navigate, reloadToken, workspaceId, workspaceType])

  const refresh = useCallback(() => setReloadToken((value) => value + 1), [])
  return { ...state, refresh }
}
