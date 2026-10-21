import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { createLibraryRepository, type StorageBackend } from '../repositories'
import type { LibraryRepository } from '../repositories/LibraryRepository'
import type { LibraryItem, MediaProbe, RemoteFile, SearchResult } from '../types/domain'

export const useLibraryStore = defineStore('library', () => {
  const items = ref<LibraryItem[]>([])
  const ready = ref(false)
  const error = ref<string>()
  const storageBackend = ref<StorageBackend>('local-storage')
  let repository: LibraryRepository | undefined
  let initialization: Promise<void> | undefined

  const history = computed(() =>
    items.value
      .filter((item) => item.lastPlayedAt !== undefined)
      .sort((left, right) => (right.lastPlayedAt ?? 0) - (left.lastPlayedAt ?? 0)),
  )

  const favorites = computed(() =>
    items.value
      .filter((item) => item.favorited)
      .sort((left, right) => right.updatedAt - left.updatedAt),
  )

  async function initialize(): Promise<void> {
    if (ready.value) return
    if (initialization) return initialization

    initialization = (async () => {
      const selection = await createLibraryRepository()
      repository = selection.repository
      storageBackend.value = selection.backend
      if (selection.warning) error.value = selection.warning
      try {
        await repository.initialize()
        items.value = await repository.list()
      } catch (initializationError) {
        error.value = initializationError instanceof Error
          ? initializationError.message
          : '资源库初始化失败'
        items.value = []
      } finally {
        ready.value = true
      }
    })()

    return initialization
  }

  function getById(id: string): LibraryItem | undefined {
    return items.value.find((item) => item.id === id)
  }

  function persist(item: LibraryItem): void {
    if (!repository) return
    void repository.upsert(item).catch((persistenceError) => {
      error.value = persistenceError instanceof Error ? persistenceError.message : '保存资源失败'
    })
  }

  function replaceItem(item: LibraryItem): void {
    const index = items.value.findIndex((candidate) => candidate.id === item.id)
    if (index >= 0) items.value[index] = item
    else items.value.push(item)
  }

  async function rememberInspection(resource: SearchResult, file: RemoteFile, providerName: string): Promise<LibraryItem> {
    await initialize()
    const existing = getById(resource.id)
    const now = Date.now()
    const item: LibraryItem = existing
      ? {
          ...existing,
          title: resource.title,
          shareUrl: resource.shareUrl,
          shareCode: resource.shareCode,
          providerName,
          file,
          updatedAt: now,
        }
      : {
          id: resource.id,
          providerId: resource.source,
          providerName,
          title: resource.title,
          shareUrl: resource.shareUrl,
          shareCode: resource.shareCode,
          panType: resource.panType,
          resourceType: resource.resourceType ?? 'unknown',
          file,
          favorited: false,
          createdAt: now,
          updatedAt: now,
        }
    replaceItem(item)
    persist(item)
    return item
  }

  async function toggleFavorite(id: string): Promise<void> {
    const item = getById(id)
    if (!item) return
    const updated = { ...item, favorited: !item.favorited, updatedAt: Date.now() }
    replaceItem(updated)
    await repository?.upsert(updated)
  }

  async function recordPlayback(id: string): Promise<void> {
    const item = getById(id)
    if (!item) return
    const updated = { ...item, lastPlayedAt: Date.now(), updatedAt: Date.now() }
    replaceItem(updated)
    await repository?.upsert(updated)
  }

  async function updateProgress(id: string, positionSeconds: number, durationSeconds?: number): Promise<void> {
    const item = getById(id)
    if (!item) return
    const shouldPersist =
      Math.abs((item.positionSeconds ?? 0) - positionSeconds) >= 2 ||
      item.durationSeconds !== durationSeconds
    if (!shouldPersist) return
    const updated = {
      ...item,
      positionSeconds,
      durationSeconds: durationSeconds ?? item.durationSeconds,
      lastPlayedAt: Date.now(),
      updatedAt: Date.now(),
    }
    replaceItem(updated)
    await repository?.upsert(updated)
  }

  async function updateProbe(id: string, probe: MediaProbe): Promise<void> {
    const item = getById(id)
    if (!item) return
    const updated = { ...item, lastProbe: probe, updatedAt: Date.now() }
    replaceItem(updated)
    await repository?.upsert(updated)
  }

  async function resetProgress(id: string): Promise<void> {
    const item = getById(id)
    if (!item) return
    const updated = {
      ...item,
      lastPlayedAt: undefined,
      positionSeconds: undefined,
      durationSeconds: undefined,
      updatedAt: Date.now(),
    }
    replaceItem(updated)
    await repository?.upsert(updated)
  }

  async function remove(id: string): Promise<void> {
    items.value = items.value.filter((item) => item.id !== id)
    await repository?.remove(id)
  }

  async function clear(): Promise<void> {
    items.value = []
    await repository?.clear()
  }

  return {
    items,
    ready,
    error,
    storageBackend,
    history,
    favorites,
    initialize,
    getById,
    rememberInspection,
    toggleFavorite,
    recordPlayback,
    updateProgress,
    updateProbe,
    resetProgress,
    remove,
    clear,
  }
})
