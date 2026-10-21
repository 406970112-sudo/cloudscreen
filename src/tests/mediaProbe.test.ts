import { describe, expect, it } from 'vitest'
import { classifyProbeResponse } from '../services/mediaProbe'

const mp4 = { kind: 'mp4' as const, url: 'https://cdn.example.com/video.mp4' }

describe('classifyProbeResponse', () => {
  it('detects range support from a 206 response', () => {
    const result = classifyProbeResponse(206, {
      'content-type': 'video/mp4',
      'content-range': 'bytes 0-1023/1048576',
    }, mp4)
    expect(result.playable).toBe('likely')
    expect(result.supportsRange).toBe(true)
  })

  it('marks a 200 response as not confirmed for range', () => {
    const result = classifyProbeResponse(200, { 'content-type': 'video/mp4' }, mp4)
    expect(result.playable).toBe('likely')
    expect(result.supportsRange).toBe(false)
  })

  it('blocks authorization failures', () => {
    const result = classifyProbeResponse(403, {}, mp4)
    expect(result.playable).toBe('blocked')
    expect(result.message).toContain('重新获取')
  })

  it('blocks HTML share pages', () => {
    const result = classifyProbeResponse(200, { 'content-type': 'text/html; charset=utf-8' }, mp4)
    expect(result.playable).toBe('blocked')
  })

  it('keeps unknown content types cautious', () => {
    const result = classifyProbeResponse(200, { 'content-type': 'application/octet-stream' }, {
      kind: 'other',
      url: 'https://cdn.example.com/video',
    })
    expect(result.playable).toBe('unknown')
  })
})
