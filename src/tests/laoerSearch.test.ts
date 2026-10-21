import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getLaoerSourceLabel,
  parseSearchEventStream,
  resolveLaoerResource,
  searchLaoerResources,
} from '../services/laoerSearch'

function stubFetchResponse(response: Partial<Response>): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue(response as Response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('parseSearchEventStream', () => {
  it('parses SSE resource events and ignores duplicate tokens', () => {
    const payload = [
      'data: {"title":"资源 A","url":"/token-a","is_type":0,"stoken":"s1"}',
      '',
      'data: {"title":"资源 B","url":"/token-b","is_type":0,"stoken":"s2"}',
      '',
      'data: {"title":"重复资源","url":"/token-a","is_type":0}',
      '',
      'data: [DONE]',
      '',
    ].join('\n')

    const result = parseSearchEventStream(payload)

    expect(result.completed).toBe(true)
    expect(result.results).toHaveLength(2)
    expect(result.results[0]).toMatchObject({ title: '资源 A', tokenUrl: '/token-a', sourceType: 0 })
  })

  it('keeps the server message included after the done marker', () => {
    const result = parseSearchEventStream('data: [DONE] 暂无可用线路\n\n')

    expect(result.completed).toBe(true)
    expect(result.notice).toBe('暂无可用线路')
    expect(result.results).toEqual([])
  })
})

describe('searchLaoerResources', () => {
  it('encodes the keyword, requests Quark results and filters other sources', async () => {
    const fetchMock = stubFetchResponse({
      ok: true,
      status: 200,
      text: async () => [
        'data: {"title":"夸克资源","url":"/quark-token","is_type":0}',
        '',
        'data: {"title":"百度资源","url":"/baidu-token","is_type":2}',
        '',
        'data: [DONE]',
        '',
      ].join('\n'),
    })

    const response = await searchLaoerResources(' 庆余年 ')
    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]))

    expect(requestUrl.searchParams.get('title')).toBe('庆余年')
    expect(requestUrl.searchParams.get('is_type')).toBe('0')
    expect(response.results).toEqual([
      { title: '夸克资源', tokenUrl: '/quark-token', sourceType: 0, stoken: undefined },
    ])
  })

  it('rejects a response that does not contain search events', async () => {
    stubFetchResponse({
      ok: true,
      status: 200,
      text: async () => '<html>unexpected</html>',
    })

    await expect(searchLaoerResources('测试')).rejects.toThrow('搜索服务返回异常')
  })
})

describe('resolveLaoerResource', () => {
  it('posts a relative token to the resolve endpoint', async () => {
    const fetchMock = stubFetchResponse({
      ok: true,
      status: 200,
      json: async () => ({
        code: 200,
        data: { url: 'https://pan.quark.cn/s/abc?pwd=z9x8' },
      }),
    })

    const result = await resolveLaoerResource({
      title: '测试资源',
      tokenUrl: '/token+abc',
      sourceType: 0,
    })

    expect(result).toBe('https://pan.quark.cn/s/abc?pwd=z9x8')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://laoer.motewan.com/api/other/save_url',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ url: '%2Ftoken%2Babc', title: '测试资源' }),
      }),
    )
  })

  it('uses an absolute HTTP result without resolving it again', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const url = 'https://pan.quark.cn/s/already-absolute'

    await expect(resolveLaoerResource({ title: '直链', tokenUrl: url, sourceType: 0 })).resolves.toBe(url)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('surfaces the resolve endpoint error message', async () => {
    stubFetchResponse({
      ok: true,
      status: 200,
      json: async () => ({ code: 500, message: '线路暂不可用' }),
    })

    await expect(resolveLaoerResource({
      title: '测试资源',
      tokenUrl: '/token',
      sourceType: 0,
    })).rejects.toThrow('线路暂不可用')
  })

  it('rejects a non-http resource address', async () => {
    stubFetchResponse({
      ok: true,
      status: 200,
      json: async () => ({ code: 200, data: { url: 'javascript:alert(1)' } }),
    })

    await expect(resolveLaoerResource({
      title: '测试资源',
      tokenUrl: '/token',
      sourceType: 0,
    })).rejects.toThrow('资源地址无效')
  })
})

describe('getLaoerSourceLabel', () => {
  it('maps target source types to readable labels', () => {
    expect(getLaoerSourceLabel(0)).toBe('夸克网盘')
    expect(getLaoerSourceLabel(2)).toBe('百度网盘')
    expect(getLaoerSourceLabel(99)).toBe('其他网盘')
  })
})
