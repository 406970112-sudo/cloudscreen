import { Capacitor } from '@capacitor/core'
import { SecureStoragePlugin } from 'capacitor-secure-storage-plugin'

export async function getSecureValue(key: string): Promise<string | undefined> {
  try {
    const result = await SecureStoragePlugin.get({ key })
    return result.value || undefined
  } catch {
    return undefined
  }
}

export async function setSecureValue(key: string, value: string): Promise<void> {
  if (!value) {
    await removeSecureValue(key)
    return
  }
  await SecureStoragePlugin.set({ key, value })
}

export async function removeSecureValue(key: string): Promise<void> {
  try {
    await SecureStoragePlugin.remove({ key })
  } catch {
    // Removing an absent secret is equivalent to a successful logout.
  }
}

export function isSecureStorageNative(): boolean {
  return Capacitor.isNativePlatform()
}
