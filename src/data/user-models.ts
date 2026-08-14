import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { getAccessToken } from '@/auth/token-storage'
import { getUserModelDetail, getUserModels, getUserModelsErrorMessage, type UserModelAccountType, type UserModelDetail } from '@/api/user-models'
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

export interface UserModelDetailState {
  detail: UserModelDetail | null
  loading: boolean
  error: string
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

export function useUserModelDetail(modelKey: string | null): UserModelDetailState {
  const store = useAppStore()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const workspaceType = store.activeWorkspace.type
  const workspaceId = store.activeWorkspace.id
  const [state, setState] = useState<UserModelDetailState>({ detail: null, loading: false, error: '' })

  useEffect(() => {
    let active = true
    if (!modelKey) {
      setState({ detail: null, loading: false, error: '' })
      return () => { active = false }
    }
    const accessToken = getAccessToken()
    if (!accessToken) {
      setState({ detail: null, loading: false, error: '' })
      return () => { active = false }
    }
    setState({ detail: null, loading: true, error: '' })
    void getUserModelDetail(modelKey, workspaceQuery(workspaceType, workspaceId)).then((detail) => {
      if (active) setState({ detail, loading: false, error: '' })
    }).catch((error: unknown) => {
      if (!active) return
      if (isAuthenticationFailure(error)) {
        dispatch(invalidateAuth())
        navigate('/', { replace: true })
        return
      }
      setState({ detail: null, loading: false, error: getUserModelsErrorMessage(error) })
    })
    return () => { active = false }
  }, [dispatch, navigate, modelKey, workspaceId, workspaceType])

  return state
}
