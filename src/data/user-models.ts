import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { getAccessToken } from '@/auth/token-storage'
import { getUserModelDetail, getUserModels, getUserModelsErrorMessage, type UserModelAccountType, type UserModelDetail, type UserModelList, type UserModelsQuery, type UserModelModality } from '@/api/user-models'
import { isAuthenticationFailure } from '@/api/http'
import { invalidateAuth } from '@/store/auth-slice'
import { useAppDispatch } from '@/store/hooks'
import { useAppStore } from './app-state'
import { mapUserModels, type ModelRecord } from './models'

export interface UserModelsState {
  models: ModelRecord[]
  activities: UserModelList['activities']
  total: number | null
  page: number | null
  pageSize: number | null
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

export interface UseUserModelsOptions {
  activityId?: string
  modelType?: UserModelModality
  page?: number
  pageSize?: number
}

export function useUserModels(options: UseUserModelsOptions = {}): UserModelsState {
  const store = useAppStore()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const workspaceType = store.activeWorkspace.type
  const workspaceId = store.activeWorkspace.id
  const [reloadToken, setReloadToken] = useState(0)
  // Older deployments return a full list without pagination metadata. Keep that
  // result in memory so local filters do not trigger a second, incompatible request.
  const fullDirectoryCache = useRef(new Map<string, Pick<UserModelsState, 'models' | 'activities' | 'total' | 'page' | 'pageSize'>>())
  const directoryKey = `${workspaceType}:${workspaceId}:${options.activityId ?? ''}:${options.modelType ?? ''}`
  const [state, setState] = useState<Omit<UserModelsState, 'refresh'>>({ models: [], activities: [], total: null, page: null, pageSize: null, loading: true, error: '' })

  useEffect(() => {
    let active = true
    const accessToken = getAccessToken()
    if (!accessToken) return () => { active = false }

    const cachedDirectory = fullDirectoryCache.current.get(directoryKey)
    if (cachedDirectory) {
      setState({ ...cachedDirectory, loading: false, error: '' })
      return () => { active = false }
    }
    setState({ models: [], activities: [], total: null, page: null, pageSize: null, loading: Boolean(accessToken), error: '' })
    const query: UserModelsQuery = { ...workspaceQuery(workspaceType, workspaceId), ...(options.activityId ? { activity_id: options.activityId } : {}), ...(options.modelType ? { model_type: options.modelType } : {}), ...(options.page !== undefined ? { page: options.page } : {}), ...(options.pageSize !== undefined ? { page_size: options.pageSize } : {}) }
    void getUserModels(query).then((result) => {
      const nextState = { models: mapUserModels(result.items), activities: result.activities, total: result.total ?? null, page: result.page ?? null, pageSize: result.page_size ?? null, loading: false, error: '' }
      if (result.page === undefined && result.page_size === undefined) {
        fullDirectoryCache.current.set(directoryKey, { models: nextState.models, activities: nextState.activities, total: null, page: null, pageSize: null })
      }
      if (active) setState(nextState)
    }).catch((error: unknown) => {
      if (!active) return
      if (isAuthenticationFailure(error)) {
        dispatch(invalidateAuth())
        navigate('/', { replace: true })
        return
      }
      setState({ models: [], activities: [], total: null, page: null, pageSize: null, loading: false, error: getUserModelsErrorMessage(error) })
    })
    return () => { active = false }
  }, [dispatch, navigate, options.activityId, options.modelType, options.page, options.pageSize, reloadToken, workspaceId, workspaceType])

  const refresh = useCallback(() => {
    fullDirectoryCache.current.delete(directoryKey)
    setReloadToken((value) => value + 1)
  }, [directoryKey])
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
