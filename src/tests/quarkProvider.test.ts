import { describe, expect, it, vi } from 'vitest'
import { QuarkApiError, type QuarkApiPort } from '../providers/quark/QuarkApi'
import { QuarkProvider } from '../providers/quark/QuarkProvider'
import type { RemoteFile } from '../types/domain'

function createApi(overrides: Partial<QuarkApiPort> = {}): QuarkApiPort {
  return {
    getShareToken: vi.fn().mockResolvedValue('share-token'),
    getShareFiles: vi.fn().mockResolvedValue([
      {
        fid: 'file-1',
        file_name: 'demo.mp4',
        size: 1024,
        file: true,
        dir: false,
        share_fid_token: 'file-token',
      },
    ]),
    getDownloadUrl: vi.fn().mockResolvedValue({
      url: 'https://cdn.quark.example/demo.mp4?sig=1',
      headers: { Cookie: '__uid=1', Referer: 'https://pan.quark.cn/' },
    }),
    ...overrides,
  }
}

describe('QuarkProvider', () => {
  it('recognizes only Quark share URLs', () => {
    const provider = new QuarkProvider(createApi())
    expect(provider.canHandle('https://pan.quark.cn/s/abc123')).toBe(true)
    expect(provider.canHandle('https://pan.quark.cn/list')).toBe(false)
    expect(provider.canHandle('https://cdn.example.com/video.mp4')).toBe(false)
  })

  it('lists share files without saving them', async () => {
    const api = createApi()
    const provider = new QuarkProvider(api)
    const share = await provider.parseShare('https://pan.quark.cn/s/abc123', 'x1y2')
    const files = await provider.listFiles(share)

    expect(api.getShareToken).toHaveBeenCalledWith('abc123', 'x1y2')
    expect(api.getShareFiles).toHaveBeenCalledWith('abc123', 'share-token', '0')
    expect(files[0]).toMatchObject({
      id: 'file-1',
      name: 'demo.mp4',
      isDir: false,
      providerData: { shareFidToken: 'file-token' },
    })
  })

  it('resolves a temporary playback URL with request headers', async () => {
    const api = createApi()
    const provider = new QuarkProvider(api)
    const share = await provider.parseShare('https://pan.quark.cn/s/abc123', 'x1y2')
    const [file] = await provider.listFiles(share)
    const source = await provider.resolvePlayable(file as RemoteFile, share)

    expect(source.kind).toBe('mp4')
    expect(source.url).toContain('demo.mp4')
    expect(source.headers).toMatchObject({ Referer: 'https://pan.quark.cn/' })
    expect(api.getDownloadUrl).toHaveBeenCalled()
  })

  it('turns guest size limits into a login instruction without saving', async () => {
    const api = createApi({
      getDownloadUrl: vi.fn().mockRejectedValue(new QuarkApiError('size limit', 23018)),
    })
    const provider = new QuarkProvider(api)
    const share = await provider.parseShare('https://pan.quark.cn/s/abc123')
    const [file] = await provider.listFiles(share)

    await expect(provider.resolvePlayable(file as RemoteFile, share)).rejects.toThrow('不会转存文件')
  })
})

import { QuarkApi } from '../providers/quark/QuarkApi'

describe('QuarkApi error mapping', () => {
  it('preserves the business code from an HTTP 400 response body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: 400,
      code: 23018,
      message: 'download file size limit',
    }), { status: 400, headers: { 'Content-Type': 'application/json' } })))

    const api = new QuarkApi(async () => undefined)
    await expect(api.getShareToken('share-id')).rejects.toMatchObject({ code: 23018 })
    vi.unstubAllGlobals()
  })
})

import { QuarkLoginRequiredError } from '../providers/quark/QuarkProvider'

describe('Quark login-required boundary', () => {
  it('exposes a typed login-required error so the app can retry after login', async () => {
    const api = createApi({
      getDownloadUrl: vi.fn().mockRejectedValue(new QuarkApiError('login required', 31001)),
    })
    const provider = new QuarkProvider(api)
    const share = await provider.parseShare('https://pan.quark.cn/s/abc123')
    const [file] = await provider.listFiles(share)

    await expect(provider.resolvePlayable(file as RemoteFile, share)).rejects.toBeInstanceOf(QuarkLoginRequiredError)
  })
})
