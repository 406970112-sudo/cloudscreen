import { Capacitor } from '@capacitor/core'
import { LocalStorageLibraryRepository } from './LocalStorageLibraryRepository'
import type { LibraryRepository } from './LibraryRepository'

export type StorageBackend = 'sqlite' | 'local-storage'

export interface RepositorySelection {
  repository: LibraryRepository
  backend: StorageBackend
  warning?: string
}

export async function createLibraryRepository(): Promise<RepositorySelection> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { SqliteLibraryRepository } = await import('./SqliteLibraryRepository')
      const repository = new SqliteLibraryRepository()
      await repository.initialize()
      return {
        repository,
        backend: 'sqlite',
      }
    } catch (error) {
      const repository = new LocalStorageLibraryRepository()
      await repository.initialize()
      return {
        repository,
        backend: 'local-storage',
        warning: `SQLite 初始化失败，已回退到浏览器存储：${error instanceof Error ? error.message : '未知错误'}`,
      }
    }
  }

  const repository = new LocalStorageLibraryRepository()
  await repository.initialize()
  return {
    repository,
    backend: 'local-storage',
  }
}
