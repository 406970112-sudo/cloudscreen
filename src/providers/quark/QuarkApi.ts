import { Capacitor, CapacitorHttp } from '@capacitor/core'
import type { RemoteFile } from '../../types/domain'

const SHARE_BASE_URL = 'https://drive.quark.cn/1/clouddrive'
const DRIVE_BASE_URL = 'https://drive-pc.quark.cn/1/clouddrive'
const SOCIAL_TOKEN_URL = 'https://drive-social-api.quark.cn/1/clouddrive/chat/conv/file/acquire_dl_token?pr=ucpro&fr=pc&sys=win32&ve=6.9.7.761&fr=win&la=zh-CN&ch=pckk%40product_guanwan'
const QUARK_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 QuarkPC/6.9.7.761 QuarkCloudDrivePC/6.9.7.761 quark-cloud-drive/2.5.40'

interface QuarkEnvelope<T> {
  code: number
  message?: string
  data?: T
}

export interface QuarkShareListItem {
  fid: string
  file_name: string
  size?: number
  file?: boolean
  dir?: boolean
  share_fid_token?: string
}

export interface QuarkShareDetailData {
  list: QuarkShareListItem[]
  metadata?: {
    _total?: number
    total?: number
  }
}

interface QuarkDownloadItem {
  download_url: string
  file_name?: string
  size?: number
}

export class QuarkApiError extends Error {
  readonly code?: number

  constructor(message: string, code?: number) {
    super(message)
    this.name = 'QuarkApiError'
    this.code = code
  }
}

export interface QuarkApiPort {
  getShareToken(pwdId: string, passcode?: string): Promise<string>
  getShareFiles(pwdId: string, stoken: string, parentId?: string): Promise<QuarkShareListItem[]>
  getDownloadUrl(pwdId: string, stoken: string, file: RemoteFile): Promise<{ url: string; headers: Record<string, string> }>
}

export class QuarkApi implements QuarkApiPort {
  private readonly cookieProvider: () => Promise<string | undefined>

  constructor(cookieProvider: () => Promise<string | undefined>) {
    this.cookieProvider = cookieProvider
  }

  async getShareToken(pwdId: string, passcode?: string): Promise<string> {
    const response = await this.request<{ stoken: string }>(
      `${SHARE_BASE_URL}/share/sharepage/token`,
      'POST',
      {
        pwd_id: pwdId,
        passcode: passcode || '',
        support_visit_limit_private_share: true,
      },
    )
    const token = response.data?.stoken
    if (!token) throw new QuarkApiError('夸克分享令牌为空')
    return token
  }

  async getShareFiles(pwdId: string, stoken: string, parentId = '0'): Promise<QuarkShareListItem[]> {
    const files: QuarkShareListItem[] = []
    for (let page = 1; page <= 10; page += 1) {
      const response = await this.request<QuarkShareDetailData>(
        `${SHARE_BASE_URL}/share/sharepage/detail`,
        'GET',
        undefined,
        {
          pwd_id: pwdId,
          stoken,
          pdir_fid: parentId,
          force: '0',
          _page: page,
          _size: 100,
          _fetch_banner: '1',
          _fetch_share: '1',
          _fetch_total: '1',
          _sort: 'file_type:asc,file_name:asc',
        },
      )
      const list = response.data?.list ?? []
      files.push(...list)
      const total = response.data?.metadata?._total ?? response.data?.metadata?.total ?? files.length
      if (list.length === 0 || files.length >= total) break
    }
    return files
  }

  async getDownloadUrl(
    pwdId: string,
    stoken: string,
    file: RemoteFile,
  ): Promise<{ url: string; headers: Record<string, string> }> {
    const socialToken = await this.getSocialToken().catch((error) => {
      if (error instanceof QuarkApiError && (error.code === 31001 || error.code === 412)) return ''
      throw error
    })
    const shareFidToken = String(file.providerData?.shareFidToken ?? '')
    if (!shareFidToken) throw new QuarkApiError('分享文件令牌缺失，请重新解析链接')

    const response = await this.request<QuarkDownloadItem[]>(
      `${DRIVE_BASE_URL}/file/download`,
      'POST',
      {
        fids: [file.id],
        fids_token: [shareFidToken],
        pwd_id: pwdId,
        stoken,
        speedup_session: '',
        token: socialToken,
      },
    )
    const item = response.data?.[0]
    if (!item?.download_url) throw new QuarkApiError('夸克没有返回可播放地址')

    const cookie = await this.cookieProvider()
    const headers: Record<string, string> = {
      'User-Agent': QUARK_USER_AGENT,
      Referer: 'https://pan.quark.cn/',
      Origin: 'https://pan.quark.cn',
    }
    if (cookie) headers.Cookie = cookie
    return { url: item.download_url, headers }
  }

  private async getSocialToken(): Promise<string> {
    const now = Date.now()
    const seconds = Math.floor(now / 1000)
    const response = await this.request<{ token: string }>(
      SOCIAL_TOKEN_URL,
      'POST',
      {
        conversation_id: `300000${seconds}`,
        conversation_type: 3,
        msg_id: `${seconds}000`,
      },
    )
    return response.data?.token ?? ''
  }

  private async request<T>(
    baseUrl: string,
    method: 'GET' | 'POST',
    body?: unknown,
    params?: Record<string, string | number>,
  ): Promise<QuarkEnvelope<T>> {
    const cookie = await this.cookieProvider()
    const url = this.buildUrl(baseUrl, params)
    const headers: Record<string, string> = {
      Accept: 'application/json, text/plain, */*',
      'Content-Type': 'application/json',
      'User-Agent': QUARK_USER_AGENT,
      Origin: 'https://pan.quark.cn',
      Referer: 'https://pan.quark.cn/',
    }
    if (cookie) headers.Cookie = cookie

    let payload: unknown
    try {
      if (Capacitor.isNativePlatform()) {
        const response = await CapacitorHttp.request({
          url,
          method,
          headers,
          data: body,
          connectTimeout: 15_000,
          readTimeout: 20_000,
        })
        payload = typeof response.data === 'string' ? JSON.parse(response.data) : response.data
        if (response.status >= 400) {
          const envelope = payload as QuarkEnvelope<T>
          throw new QuarkApiError(
            envelope?.message || `夸克接口请求失败（HTTP ${response.status}）`,
            typeof envelope?.code === 'number' ? envelope.code : response.status,
          )
        }
      } else {
        const response = await fetch(url, {
          method,
          headers,
          body: method === 'POST' && body !== undefined ? JSON.stringify(body) : undefined,
        })
        const responsePayload = await response.json().catch(() => undefined)
        if (!response.ok) {
          const envelope = responsePayload as QuarkEnvelope<T> | undefined
          throw new QuarkApiError(
            envelope?.message || `夸克接口请求失败（HTTP ${response.status}）`,
            typeof envelope?.code === 'number' ? envelope.code : response.status,
          )
        }
        payload = responsePayload
      }
    } catch (error) {
      if (error instanceof QuarkApiError) throw error
      if (!Capacitor.isNativePlatform()) {
        throw new QuarkApiError('浏览器预览受夸克跨域限制，分享解析请在 Android App 中测试；媒体直链仍可在浏览器验证')
      }
      throw new QuarkApiError('无法连接夸克接口，请检查网络后重试')
    }

    const envelope = payload as QuarkEnvelope<T>
    if (typeof envelope?.code === 'number' && envelope.code !== 0) {
      throw new QuarkApiError(envelope.message || `夸克接口返回错误 ${envelope.code}`, envelope.code)
    }
    return envelope
  }

  private buildUrl(baseUrl: string, extraParams?: Record<string, string | number>): string {
    const url = new URL(baseUrl)
    const defaults: Record<string, string | number> = {
      pr: 'ucpro',
      fr: 'pc',
      uc_param_str: '',
      __t: Date.now(),
      __dt: 1000,
      ...extraParams,
    }
    for (const [key, value] of Object.entries(defaults)) {
      url.searchParams.set(key, String(value))
    }
    return url.toString()
  }
}
