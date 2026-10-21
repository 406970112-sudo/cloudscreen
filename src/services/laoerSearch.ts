import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { isHttpUrl } from '../lib/url'

const LAOER_ORIGIN = 'https://laoer.motewan.com'
const SEARCH_ENDPOINT = `${LAOER_ORIGIN}/api/other/web_search`
const RESOLVE_ENDPOINT = `${LAOER_ORIGIN}/api/other/save_url`
const SEARCH_TIMEOUT_MS = 20_000
const RESOLVE_TIMEOUT_MS = 15_000

const SOURCE_LABELS: Record<number, string> = {
  0: '夸克网盘',
  1: '阿里云盘',
  2: '百度网盘',
  3: 'UC 网盘',
  4: '迅雷网盘',
}

export interface LaoerSearchResult {
  title: string
  tokenUrl: string
  sourceType: number
  stoken?: string
}

export interface LaoerSearchResponse {
  results: LaoerSearchResult[]
  notice?: string
  completed: boolean
}

interface LaoerResolveEnvelope {
  code?: number
  message?: string
  data?: {
    url?: string
  }
}

interface RawSearchResult {
  title?: unknown
  url?: unknown
  is_type?: unknown
  stoken?: unknown
}

function createAbortError(): Error {
  const error = new Error('请求已取消')
  error.name = 'AbortError'
  return error
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

function normalizeSearchResult(value: unknown): LaoerSearchResult | undefined {
  if (!value || typeof value !== 'object') return undefined
  const item = value as RawSearchResult
  const tokenUrl = typeof item.url === 'string' ? item.url.trim() : ''
  if (!tokenUrl) return undefined

  const sourceType = Number(item.is_type)
  return {
    title: typeof item.title === 'string' && item.title.trim() ? item.title.trim() : '未命名资源',
    tokenUrl,
    sourceType: Number.isFinite(sourceType) ? sourceType : 0,
    stoken: typeof item.stoken === 'string' ? item.stoken : undefined,
  }
}

export function getLaoerSourceLabel(sourceType: number): string {
  return SOURCE_LABELS[sourceType] ?? '其他网盘'
}

export function parseSearchEventStream(payload: string): LaoerSearchResponse {
  const results: LaoerSearchResult[] = []
  const seen = new Set<string>()
  let notice: string | undefined
  let completed = false

  for (const block of payload.replace(/\r\n/g, '\n').split(/\n{2,}/)) {
    const data = block
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n')
      .trim()

    if (!data) continue

    const doneIndex = data.indexOf('[DONE]')
    if (doneIndex >= 0) {
      completed = true
      const doneMessage = data.slice(doneIndex + '[DONE]'.length).trim()
      if (doneMessage) notice = doneMessage
      continue
    }

    const parsed = parseJson(data)
    const result = normalizeSearchResult(parsed)
    if (!result || seen.has(result.tokenUrl)) continue
    seen.add(result.tokenUrl)
    results.push(result)
  }

  return { results, notice, completed }
}

async function readNativeResponse(
  operation: string,
  request: () => Promise<{ status: number; data: unknown }>,
  signal?: AbortSignal,
): Promise<unknown> {
  if (signal?.aborted) throw createAbortError()
  try {
    const response = await request()
    if (signal?.aborted) throw createAbortError()
    if (response.status >= 400) {
      throw new Error(`${operation}失败（HTTP ${response.status}）`)
    }
    return response.data
  } catch (error) {
    if (isAbortError(error) || error instanceof Error && error.message.startsWith(`${operation}失败`)) {
      throw error
    }
    throw new Error(`${operation}失败，请检查网络后重试`)
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  operation: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<Response> {
  if (signal?.aborted) throw createAbortError()

  const controller = new AbortController()
  let timedOut = false
  const abortFromCaller = () => controller.abort()
  signal?.addEventListener('abort', abortFromCaller, { once: true })
  const timeout = globalThis.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (error) {
    if (signal?.aborted) throw createAbortError()
    if (timedOut) throw new Error(`${operation}超时，请稍后重试`)
    if (isAbortError(error)) throw error
    throw new Error(`${operation}失败，请检查网络后重试`)
  } finally {
    globalThis.clearTimeout(timeout)
    signal?.removeEventListener('abort', abortFromCaller)
  }
}

async function requestSearchPayload(keyword: string, signal?: AbortSignal): Promise<string> {
  const params = new URLSearchParams({ title: keyword, is_type: '0' })
  const url = `${SEARCH_ENDPOINT}?${params.toString()}`

  if (Capacitor.isNativePlatform()) {
    const data = await readNativeResponse(
      '资源搜索',
      () => CapacitorHttp.get({
        url,
        headers: { Accept: 'text/event-stream' },
        responseType: 'text',
        connectTimeout: 10_000,
        readTimeout: SEARCH_TIMEOUT_MS,
      }),
      signal,
    )
    return typeof data === 'string' ? data : JSON.stringify(data ?? '')
  }

  const response = await fetchWithTimeout(
    url,
    { headers: { Accept: 'text/event-stream' } },
    '资源搜索',
    SEARCH_TIMEOUT_MS,
    signal,
  )
  if (!response.ok) throw new Error(`资源搜索失败（HTTP ${response.status}）`)
  return response.text()
}

export async function searchLaoerResources(keyword: string, signal?: AbortSignal): Promise<LaoerSearchResponse> {
  const normalizedKeyword = keyword.trim()
  if (!normalizedKeyword) throw new Error('请输入要搜索的资源名称')

  const payload = await requestSearchPayload(normalizedKeyword, signal)
  const parsed = parseSearchEventStream(payload)
  const results = parsed.results.filter((result) => result.sourceType === 0)

  if (!parsed.completed && results.length === 0) {
    throw new Error('搜索服务返回异常，请稍后重试')
  }

  return {
    results,
    notice: parsed.notice || (results.length === 0 ? '没有找到相关资源' : undefined),
    completed: parsed.completed,
  }
}

async function requestResolvedResource(result: LaoerSearchResult, signal?: AbortSignal): Promise<LaoerResolveEnvelope> {
  const body = JSON.stringify({
    url: encodeURIComponent(result.tokenUrl),
    title: result.title,
  })

  if (Capacitor.isNativePlatform()) {
    const data = await readNativeResponse(
      '获取资源地址',
      () => CapacitorHttp.post({
        url: RESOLVE_ENDPOINT,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        data: JSON.parse(body) as Record<string, string>,
        connectTimeout: 10_000,
        readTimeout: RESOLVE_TIMEOUT_MS,
      }),
      signal,
    )
    return (parseJson(data) as LaoerResolveEnvelope | undefined) ?? {}
  }

  const response = await fetchWithTimeout(
    RESOLVE_ENDPOINT,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body,
    },
    '获取资源地址',
    RESOLVE_TIMEOUT_MS,
    signal,
  )
  const payload = await response.json().catch(() => undefined) as LaoerResolveEnvelope | undefined
  if (!response.ok) {
    throw new Error(payload?.message || `获取资源地址失败（HTTP ${response.status}）`)
  }
  return payload ?? {}
}

export async function resolveLaoerResource(result: LaoerSearchResult, signal?: AbortSignal): Promise<string> {
  const candidate = result.tokenUrl.trim()
  if (!candidate) throw new Error('搜索结果缺少资源地址')
  if (isHttpUrl(candidate)) return candidate

  const envelope = await requestResolvedResource(result, signal)
  if (envelope.code !== 200) {
    throw new Error(envelope.message || '搜索服务未能返回有效的资源地址')
  }

  const resolvedUrl = envelope.data?.url?.trim() ?? ''
  if (!isHttpUrl(resolvedUrl)) {
    throw new Error('搜索服务返回的资源地址无效')
  }
  return resolvedUrl
}
