import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useLibraryStore } from '../stores/library'
import type { RemoteFile, SearchResult } from '../types/domain'

const resource: SearchResult = {
  id: 'direct-media-store-test',
  title: '测试视频',
  source: 'direct-media',
  shareUrl: 'https://cdn.example.com/test.mp4',
  panType: 'direct',
  resourceType: 'video',
}

const file: RemoteFile = { id: 'file', name: 'test.mp4', isDir: false, mime: 'video/mp4' }

describe('library store', () => {
  beforeEach(() => {
    window.localStorage.clear()
    setActivePinia(createPinia())
  })

  it('tracks playback, resume progress and favorites', async () => {
    const store = useLibraryStore()
    await store.initialize()
    const item = await store.rememberInspection(resource, file, '授权直链')

    await store.recordPlayback(item.id)
    await store.updateProgress(item.id, 42, 120)
    await store.toggleFavorite(item.id)

    expect(store.history).toHaveLength(1)
    expect(store.favorites).toHaveLength(1)
    expect(store.getById(item.id)).toMatchObject({
      favorited: true,
      positionSeconds: 42,
      durationSeconds: 120,
    })
  })
})
