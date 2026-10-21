import type { PanType } from '../types/domain'
import { getQuarkCookie } from '../services/quarkAuth'
import { UnsupportedProviderError, type CloudProvider } from './CloudProvider'
import { DirectMediaProvider } from './DirectMediaProvider'
import { QuarkApi } from './quark/QuarkApi'
import { QuarkProvider } from './quark/QuarkProvider'

const directProvider = new DirectMediaProvider()
const quarkProvider = new QuarkProvider(new QuarkApi(getQuarkCookie))

const KNOWN_CLOUD_HOSTS: Array<{ panType: PanType; label: string; hosts: string[] }> = [
  { panType: 'quark', label: '夸克网盘', hosts: ['pan.quark.cn', 'drive.quark.cn'] },
  { panType: 'aliyun', label: '阿里云盘', hosts: ['aliyundrive.com', 'alipan.com'] },
  { panType: 'baidu', label: '百度网盘', hosts: ['pan.baidu.com', 'yun.baidu.com'] },
  { panType: '123pan', label: '123 云盘', hosts: ['123pan.com', '123684.com', '123865.com'] },
  { panType: 'other', label: '其他网盘', hosts: ['115.com', 'cloud.189.cn', 'caiyun.139.com'] },
]

export function getProviders(): CloudProvider[] {
  return [quarkProvider, directProvider]
}

export function findProvider(providerId: string): CloudProvider | undefined {
  return getProviders().find((provider) => provider.id === providerId)
}

export function findProviderForUrl(url: string): CloudProvider | undefined {
  return getProviders().find((provider) => provider.canHandle(url))
}

export function detectKnownCloud(url: string): { panType: PanType; label: string } | undefined {
  let hostname: string
  try {
    hostname = new URL(url).hostname.toLowerCase()
  } catch {
    return undefined
  }

  const match = KNOWN_CLOUD_HOSTS.find(({ hosts }) =>
    hosts.some((host) => hostname === host || hostname.endsWith(`.${host}`)),
  )
  return match ? { panType: match.panType, label: match.label } : undefined
}

export function requireProviderForUrl(url: string): CloudProvider {
  const provider = findProviderForUrl(url)
  if (provider) return provider

  const known = detectKnownCloud(url)
  if (known) {
    throw new UnsupportedProviderError(
      `${known.label}适配器尚未接入。需要该平台官方授权接口或你提供的合法测试链接与凭据后才能实现。`,
      known.label,
    )
  }

  throw new UnsupportedProviderError(
    '当前支持夸克分享链接，以及可识别的媒体直链（如 mp4、webm、m3u8）。',
  )
}
