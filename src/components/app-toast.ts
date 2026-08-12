import Toast from '@douyinfe/semi-ui/lib/es/toast'
import './app-toast.css'

const toastOptions = (content: string, duration: number) => ({
  content,
  className: 'app-toast',
  duration,
  showClose: false,
})

export const appToast = {
  success(content: string): void {
    Toast.success(toastOptions(content, 2))
  },
  error(content: string): void {
    Toast.error(toastOptions(content, 3))
  },
  warning(content: string): void {
    Toast.warning(toastOptions(content, 3))
  },
  info(content: string): void {
    Toast.info(toastOptions(content, 2))
  },
}
