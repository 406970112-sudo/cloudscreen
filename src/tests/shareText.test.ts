import { describe, expect, it } from 'vitest'
import { parseShareText } from '../services/shareText'

describe('parseShareText', () => {
  it('extracts an http URL and a Chinese access code', () => {
    const result = parseShareText('测试视频 https://cdn.example.com/video.mp4 提取码: a1b2')
    expect(result.url).toBe('https://cdn.example.com/video.mp4')
    expect(result.code).toBe('a1b2')
    expect(result.title).toBe('测试视频')
  })

  it('extracts the code from common URL query parameters', () => {
    const result = parseShareText('https://cdn.example.com/movie.m3u8?pwd=z9x8')
    expect(result.code).toBe('z9x8')
  })

  it('removes trailing Chinese punctuation from a pasted URL', () => {
    const result = parseShareText('请打开 https://cdn.example.com/video.webm。')
    expect(result.url).toBe('https://cdn.example.com/video.webm')
  })

  it('rejects text without a URL', () => {
    expect(() => parseShareText('这里没有链接')).toThrow('没有识别到有效的 http/https 链接')
  })
})
