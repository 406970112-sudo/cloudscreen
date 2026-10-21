import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { inferPlaybackKind } from '../providers/DirectMediaProvider'
import type { MediaProbe, PlayableSource } from '../types/domain'
import { isHttpUrl } from '../lib/url'

const MEDIA_CONTENT_TYPE_PATTERN = /^(video|audio)\//i
const STREAM_CONTENT_TYPES = new Set([
  'application/vnd.apple.mpegurl',
  'application/x-mpegurl',
  'application/dash+xml',
])

function normalizeHeaders(headers: Record<string, string | string[]> | undefined): Record<string, string> {
  if (!headers) return {}
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), Array.isArray(value) ? value.join(', ') : value]),
  )
}

function parseContentLength(value: string | undefined): number | undefined {
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

export function classifyProbeResponse(
  status: number,
  headers: Record<string, string>,
  source: PlayableSource,
): MediaProbe {
  const contentType = headers['content-type']?.split(';')[0]?.trim().toLowerCase()
  const contentLength = parseContentLength(headers['content-length'])
  const supportsRange = status === 206
    ? true
    : headers['accept-ranges']?.toLowerCase().includes('bytes')
      ? true
      : status === 200
        ? false
        : undefined
  const checkedAt = Date.now()

  if (status === 401 || status === 403) {
    return {
      playable: 'blocked',
      status,
      supportsRange,
      contentType,
      contentLength,
      message: '播放地址需要授权或已过期，请重新获取播放源',
      checkedAt,
    }
  }

  if (status >= 400) {
    return {
      playable: 'blocked',
      status,
      supportsRange,
      contentType,
      contentLength,
      message: `服务器拒绝了播放请求（HTTP ${status}）`,
      checkedAt,
    }
  }

  const looksLikeMedia = Boolean(
    contentType &&
    (MEDIA_CONTENT_TYPE_PATTERN.test(contentType) || STREAM_CONTENT_TYPES.has(contentType)),
  )

  if (contentType === 'text/html') {
    return {
      playable: 'blocked',
      status,
      supportsRange,
      contentType,
      contentLength,
      message: '链接返回的是网页而不是媒体流，可能是分享页而非可播放地址',
      checkedAt,
    }
  }

  if (looksLikeMedia || source.kind !== 'other') {
    return {
      playable: 'likely',
      status,
      supportsRange,
      contentType,
      contentLength,
      message: supportsRange === true
        ? '服务器支持分段请求，拖动进度条的条件较好'
        : '服务器已响应，但未确认支持分段请求；长视频拖动可能失败',
      checkedAt,
    }
  }

  return {
    playable: 'unknown',
    status,
    supportsRange,
    contentType,
    contentLength,
    message: '服务器已响应，但无法仅凭响应头确认媒体类型',
    checkedAt,
  }
}

export async function probePlayableSource(source: PlayableSource, signal?: AbortSignal): Promise<MediaProbe> {
  if (!isHttpUrl(source.url)) {
    throw new Error('播放地址必须是 http/https')
  }

  const requestHeaders = {
    ...source.headers,
    Range: 'bytes=0-1023',
  }

  try {
    if (Capacitor.isNativePlatform()) {
      const response = await CapacitorHttp.request({
        url: source.url,
        method: 'GET',
        headers: requestHeaders,
        responseType: 'text',
        connectTimeout: 10_000,
        readTimeout: 10_000,
      })
      return classifyProbeResponse(
        response.status,
        normalizeHeaders(response.headers as Record<string, string | string[]>),
        source,
      )
    }

    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 10_000)
    const abortFromCaller = () => controller.abort()
    signal?.addEventListener('abort', abortFromCaller, { once: true })
    try {
      const response = await fetch(source.url, {
        method: 'GET',
        headers: requestHeaders,
        signal: controller.signal,
      })
      const headerObject: Record<string, string> = {}
      response.headers.forEach((value, key) => {
        headerObject[key.toLowerCase()] = value
      })
      return classifyProbeResponse(response.status, headerObject, source)
    } finally {
      window.clearTimeout(timeout)
      signal?.removeEventListener('abort', abortFromCaller)
    }
  } catch (error) {
    if (signal?.aborted) throw error
    return {
      playable: 'unknown',
      message: '暂时无法探测播放能力，仍可尝试播放；失败通常由跨域、超时、鉴权或服务器限制引起',
      checkedAt: Date.now(),
    }
  }
}

export function describePlaybackKind(source: PlayableSource): string {
  if (source.kind === 'hls') return 'HLS 流'
  if (source.kind === 'dash') return 'DASH 流'
  if (source.kind === 'mp4') return 'MP4/WebM'
  return `${inferPlaybackKind(source.url).toUpperCase()} 媒体`
}
