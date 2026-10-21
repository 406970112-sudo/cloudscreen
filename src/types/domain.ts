export type PanType = 'direct' | 'quark' | 'aliyun' | 'baidu' | '123pan' | 'other'
export type ResourceType = 'video' | 'folder' | 'file' | 'unknown'
export type PlaybackKind = 'mp4' | 'hls' | 'dash' | 'other'
export type PlaybackReadiness = 'likely' | 'unknown' | 'blocked'

export interface ShareInput {
  rawText: string
  url: string
  code?: string
  title?: string
}

export interface SearchResult {
  id: string
  title: string
  source: string
  shareUrl: string
  panType: PanType
  shareCode?: string
  resourceType?: ResourceType
  verifiedAt?: string
}

export interface RemoteFile {
  id: string
  name: string
  size?: number
  mime?: string
  isDir: boolean
  providerData?: Record<string, unknown>
}

export interface PlayableSource {
  kind: PlaybackKind
  url: string
  headers?: Record<string, string>
  expiresAt?: string
  supportsRange?: boolean
  requiresAuth?: boolean
}

export interface MediaProbe {
  playable: PlaybackReadiness
  status?: number
  supportsRange?: boolean
  contentType?: string
  contentLength?: number
  message: string
  checkedAt: number
}

export interface LibraryItem {
  id: string
  providerId: string
  providerName: string
  title: string
  shareUrl: string
  shareCode?: string
  panType: PanType
  resourceType: ResourceType
  file: RemoteFile
  favorited: boolean
  createdAt: number
  updatedAt: number
  lastPlayedAt?: number
  positionSeconds?: number
  durationSeconds?: number
  lastProbe?: MediaProbe
}

export interface PlaybackSession {
  itemId: string
  source: PlayableSource
  probe: MediaProbe
}
