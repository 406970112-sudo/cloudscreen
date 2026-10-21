import type { LibraryItem } from '../types/domain'
import type { LibraryRepository } from './LibraryRepository'

const STORAGE_KEY = 'videoplay.library.v1'

export class LocalStorageLibraryRepository implements LibraryRepository {
  private items: LibraryItem[] = []

  async initialize(): Promise<void> {
    const serialized = window.localStorage.getItem(STORAGE_KEY)
    if (!serialized) {
      this.items = []
      return
    }
    try {
      const parsed = JSON.parse(serialized) as LibraryItem[]
      this.items = Array.isArray(parsed) ? parsed : []
    } catch {
      this.items = []
    }
  }

  async list(): Promise<LibraryItem[]> {
    return [...this.items]
  }

  async upsert(item: LibraryItem): Promise<void> {
    const index = this.items.findIndex((candidate) => candidate.id === item.id)
    if (index >= 0) this.items[index] = item
    else this.items.push(item)
    this.persist()
  }

  async remove(id: string): Promise<void> {
    this.items = this.items.filter((item) => item.id !== id)
    this.persist()
  }

  async clear(): Promise<void> {
    this.items = []
    this.persist()
  }

  private persist(): void {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.items))
  }
}
