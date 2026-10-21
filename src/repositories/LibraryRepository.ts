import type { LibraryItem } from '../types/domain'

export interface LibraryRepository {
  initialize(): Promise<void>
  list(): Promise<LibraryItem[]>
  upsert(item: LibraryItem): Promise<void>
  remove(id: string): Promise<void>
  clear(): Promise<void>
}
