import { createResourceId } from '../lib/hash'
import { getFileNameFromUrl, getMediaExtension, isHttpUrl } from '../lib/url'
import type { PlayableSource, RemoteFile } from '../types/domain'
import type { CloudProvider, ShareDescriptor } from './CloudProvider'

const MEDIA_EXTENSIONS = new Set([
  'mp4', 'm4v', 'webm', 'mov', 'mkv', 'avi', 'ts', 'm3u8', 'mpd', 'flv',
])

const KIND_BY_EXTENSION = {
  mp4: 'mp4',
  m4v: 'mp4',
  webm: 'mp4',
  mov: 'mp4',
  mkv: 'other',
  avi: 'other',
  ts: 'other',
  flv: 'other',
  m3u8: 'hls',
  mpd: 'dash',
} as const

const MIME_BY_EXTENSION: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  ts: 'video/mp2t',
  flv: 'video/x-flv',
  m3u8: 'application/vnd.apple.mpegurl',
  mpd: 'application/dash+xml',
}

export function isDirectMediaUrl(value: string): boolean {
  if (!isHttpUrl(value)) return false
  const extension = getMediaExtension(value)
  return Boolean(extension && MEDIA_EXTENSIONS.has(extension))
}

export function inferPlaybackKind(url: string): PlayableSource['kind'] {
  return inferPlaybackKindFromName(url)
}

export function inferPlaybackKindFromName(name: string): PlayableSource['kind'] {
  const cleanName = name.split(/[?#]/)[0]
  const extension = cleanName.split('.').at(-1)?.toLowerCase()
  return extension && extension in KIND_BY_EXTENSION
    ? KIND_BY_EXTENSION[extension as keyof typeof KIND_BY_EXTENSION]
    : 'other'
}

export class DirectMediaProvider implements CloudProvider {
  readonly id = 'direct-media'
  readonly name = '授权直链'

  canHandle(url: string): boolean {
    return isDirectMediaUrl(url)
  }

  async parseShare(url: string, code?: string, title?: string): Promise<ShareDescriptor> {
    if (!this.canHandle(url)) {
      throw new Error('该地址不是可识别的媒体直链')
    }
    const extension = getMediaExtension(url)
    return {
      shareId: createResourceId(this.id, url, code),
      canonicalUrl: url,
      code,
      title: title?.trim() || getFileNameFromUrl(url) || (extension ? `媒体.${extension}` : '媒体资源'),
    }
  }

  async listFiles(share: ShareDescriptor): Promise<RemoteFile[]> {
    const extension = getMediaExtension(share.canonicalUrl)
    return [{
      id: createResourceId(this.id, share.canonicalUrl, share.code),
      name: share.title || getFileNameFromUrl(share.canonicalUrl),
      mime: extension ? MIME_BY_EXTENSION[extension] : undefined,
      isDir: false,
    }]
  }

  async resolvePlayable(file: RemoteFile, share: ShareDescriptor): Promise<PlayableSource> {
    if (file.isDir || !isHttpUrl(share.canonicalUrl)) {
      throw new Error('该资源不是可播放文件')
    }
    return {
      kind: inferPlaybackKind(share.canonicalUrl),
      url: share.canonicalUrl,
    }
  }
}
