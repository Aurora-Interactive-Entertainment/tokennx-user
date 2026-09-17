import { RequestErrorPanel } from '@/components/request-error-panel'
import { hydrateAuth } from '@/store/auth-slice'
import { useAppDispatch, useAppSelector } from '@/store/hooks'

/** 跟随页头占位展示恢复错误，避免移动端固定顶栏遮住提示或阻止浏览正文。 */
export function AuthRecoveryNotice() {
  const dispatch = useAppDispatch()
  const { hydrationError, hydrationRequestId } = useAppSelector((state) => state.auth)
  if (!hydrationError) return null
  return <RequestErrorPanel message={hydrationError.message} retrying={Boolean(hydrationRequestId)} onRetry={() => { void dispatch(hydrateAuth()) }} />
}
