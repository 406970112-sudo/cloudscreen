import type { PlayableSource, RemoteFile } from '../types/domain'

export interface ShareDescriptor {
  shareId: string
  canonicalUrl: string
  code?: string
  title: string
  providerData?: Record<string, unknown>
}

export interface CloudProvider {
  id: string
  name: string
  canHandle(url: string): boolean
  parseShare(url: string, code?: string, title?: string): Promise<ShareDescriptor>
  listFiles(share: ShareDescriptor, parentId?: string): Promise<RemoteFile[]>
  resolvePlayable(file: RemoteFile, share: ShareDescriptor): Promise<PlayableSource>
}

export class UnsupportedProviderError extends Error {
  readonly providerLabel?: string

  constructor(message: string, providerLabel?: string) {
    super(message)
    this.name = 'UnsupportedProviderError'
    this.providerLabel = providerLabel
  }
}
