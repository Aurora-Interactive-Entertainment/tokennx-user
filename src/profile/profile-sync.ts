import type { UserProfile } from '@/api/profile'

type ProfileUpdateListener = (profile: UserProfile) => void

const listeners = new Set<ProfileUpdateListener>()

export function publishProfileUpdate(profile: UserProfile): void {
  for (const listener of listeners) listener(profile)
}

export function subscribeProfileUpdates(listener: ProfileUpdateListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
