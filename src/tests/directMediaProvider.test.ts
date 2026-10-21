import { describe, expect, it } from 'vitest'
import { DirectMediaProvider, inferPlaybackKind, isDirectMediaUrl } from '../providers/DirectMediaProvider'
import { detectKnownCloud, findProviderForUrl, requireProviderForUrl } from '../providers/registry'

describe('DirectMediaProvider', () => {
  const provider = new DirectMediaProvider()

  it('recognizes common direct media links', () => {
    expect(isDirectMediaUrl('https://cdn.example.com/a.mp4')).toBe(true)
    expect(isDirectMediaUrl('https://cdn.example.com/live/index.m3u8?token=1')).toBe(true)
    expect(isDirectMediaUrl('https://pan.quark.cn/s/abc')).toBe(false)
  })

  it('maps extensions to playback kinds', () => {
    expect(inferPlaybackKind('https://cdn.example.com/a.mp4')).toBe('mp4')
    expect(inferPlaybackKind('https://cdn.example.com/a.m3u8')).toBe('hls')
    expect(inferPlaybackKind('https://cdn.example.com/a.mpd')).toBe('dash')
  })

  it('creates a stable file entry without contacting the network', async () => {
    const share = await provider.parseShare('https://cdn.example.com/demo/video.mp4', undefined, '演示视频')
    const files = await provider.listFiles(share)
    expect(files).toHaveLength(1)
    expect(files[0]).toMatchObject({ name: '演示视频', isDir: false, mime: 'video/mp4' })
    const source = await provider.resolvePlayable(files[0]!, share)
    expect(source).toMatchObject({ kind: 'mp4', url: 'https://cdn.example.com/demo/video.mp4' })
  })

  it('routes Quark shares to the dedicated provider and rejects unconfigured clouds', () => {
    expect(findProviderForUrl('https://pan.quark.cn/s/abc')?.id).toBe('quark')
    expect(detectKnownCloud('https://pan.baidu.com/s/abc')).toEqual({ panType: 'baidu', label: '百度网盘' })
    expect(() => requireProviderForUrl('https://pan.baidu.com/s/abc')).toThrow('百度网盘适配器尚未接入')
  })
})
