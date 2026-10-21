import { createResourceId } from '../../lib/hash'
import { isHttpUrl } from '../../lib/url'
import type { PlayableSource, RemoteFile } from '../../types/domain'
import type { CloudProvider, ShareDescriptor } from '../CloudProvider'
import { inferPlaybackKindFromName } from '../DirectMediaProvider'
import { QuarkApiError, type QuarkApiPort, type QuarkShareListItem } from './QuarkApi'

const VIDEO_EXTENSIONS = new Set(['mp4', 'm4v', 'webm', 'mov', 'mkv', 'avi', 'ts', 'm3u8', 'mpd', 'flv'])

function looksLikeVideo(name: string): boolean {
  const extension = name.split('.').at(-1)?.toLowerCase()
  return Boolean(extension && VIDEO_EXTENSIONS.has(extension))
}

function extractShareId(url: string): string | undefined {
  try {
    return new URL(url).pathname.match(/^\/s\/([a-zA-Z0-9]+)/)?.[1]
  } catch {
    return undefined
  }
}

function mapShareFile(item: QuarkShareListItem): RemoteFile {
  return {
    id: item.fid,
    name: item.file_name,
    size: item.size,
    isDir: item.dir === true || item.file === false,
    mime: looksLikeVideo(item.file_name) ? undefined : undefined,
    providerData: {
      shareFidToken: item.share_fid_token ?? '',
    },
  }
}

export class QuarkLoginRequiredError extends Error {
  readonly code?: number

  constructor(message: string, code?: number) {
    super(message)
    this.name = 'QuarkLoginRequiredError'
    this.code = code
  }
}

export class QuarkProvider implements CloudProvider {
  readonly id = 'quark'
  readonly name = '夸克网盘'

  private readonly api: QuarkApiPort

  constructor(api: QuarkApiPort) {
    this.api = api
  }

  canHandle(url: string): boolean {
    if (!isHttpUrl(url)) return false
    try {
      const parsed = new URL(url)
      return parsed.hostname.endsWith('pan.quark.cn') && /^\/s\/[a-zA-Z0-9]+/.test(parsed.pathname)
    } catch {
      return false
    }
  }

  async parseShare(url: string, code?: string, title?: string): Promise<ShareDescriptor> {
    if (!this.canHandle(url)) throw new Error('不是有效的夸克分享链接')
    const shareId = extractShareId(url)
    if (!shareId) throw new Error('无法从链接中提取夸克分享 ID')
    return {
      shareId: createResourceId(this.id, url, code),
      canonicalUrl: url,
      code,
      title: title?.trim() || '夸克网盘分享',
      providerData: { pwdId: shareId },
    }
  }

  async listFiles(share: ShareDescriptor, parentId = '0'): Promise<RemoteFile[]> {
    const pwdId = this.getPwdId(share)
    const stoken = await this.api.getShareToken(pwdId, share.code)
    const items = await this.api.getShareFiles(pwdId, stoken, parentId)
    return items.map(mapShareFile)
  }

  async resolvePlayable(file: RemoteFile, share: ShareDescriptor): Promise<PlayableSource> {
    if (file.isDir) throw new Error('文件夹不能直接播放')
    const pwdId = this.getPwdId(share)
    try {
      const stoken = await this.api.getShareToken(pwdId, share.code)
      const resolved = await this.api.getDownloadUrl(pwdId, stoken, file)
      return {
        kind: inferPlaybackKindFromName(file.name),
        url: resolved.url,
        headers: resolved.headers,
      }
    } catch (error) {
      if (error instanceof QuarkApiError) {
        if (error.code === 23018 || error.code === 31001 || error.code === 41020 || error.code === 412) {
          throw new QuarkLoginRequiredError('该文件需要夸克登录；登录成功后会自动继续直接播放，不会转存文件。', error.code)
        }
        if (error.code === 41001 || error.code === 41004) {
          throw new Error('夸克分享已失效或提取码错误')
        }
        throw new Error(`夸克播放地址获取失败：${error.message}`)
      }
      throw error
    }
  }

  private getPwdId(share: ShareDescriptor): string {
    const pwdId = String(share.providerData?.pwdId ?? '') || extractShareId(share.canonicalUrl)
    if (!pwdId) throw new Error('夸克分享 ID 缺失')
    return pwdId
  }
}
