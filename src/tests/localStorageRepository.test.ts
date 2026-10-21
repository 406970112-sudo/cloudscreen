import { beforeEach, describe, expect, it } from 'vitest'
import { LocalStorageLibraryRepository } from '../repositories/LocalStorageLibraryRepository'
import type { LibraryItem } from '../types/domain'

const item: LibraryItem = {
  id: 'direct-media-12345678',
  providerId: 'direct-media',
  providerName: '授权直链',
  title: '演示视频',
  shareUrl: 'https://cdn.example.com/video.mp4',
  panType: 'direct',
  resourceType: 'video',
  file: { id: 'file-1', name: 'video.mp4', isDir: false, mime: 'video/mp4' },
  favorited: false,
  createdAt: 1,
  updatedAt: 1,
}

describe('LocalStorageLibraryRepository', () => {
  beforeEach(() => window.localStorage.clear())

  it('persists, updates and removes library items', async () => {
    const repository = new LocalStorageLibraryRepository()
    await repository.initialize()
    await repository.upsert(item)

    const first = new LocalStorageLibraryRepository()
    await first.initialize()
    expect(await first.list()).toHaveLength(1)

    await first.upsert({ ...item, favorited: true, updatedAt: 2 })
    expect((await first.list())[0]?.favorited).toBe(true)

    await first.remove(item.id)
    expect(await first.list()).toHaveLength(0)
  })

  it('clears malformed stored data safely', async () => {
    window.localStorage.setItem('videoplay.library.v1', '{broken')
    const repository = new LocalStorageLibraryRepository()
    await repository.initialize()
    expect(await repository.list()).toEqual([])
  })
})
