import { configureStore } from '@reduxjs/toolkit'
import authReducer from './auth-slice'

export function createAppStore() {
  return configureStore({
    reducer: {
      auth: authReducer,
    },
  })
}

export const store = createAppStore()

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
