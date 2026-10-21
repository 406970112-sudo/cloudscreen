import { beforeEach, describe, expect, it, vi } from 'vitest'

type Listener = (event: Record<string, unknown>) => void

const mocks = vi.hoisted(() => ({
  addListener: vi.fn(),
}))

vi.mock('@capgo/capacitor-video-player', () => ({
  VideoPlayer: {
    addListener: mocks.addListener,
    initPlayer: vi.fn(),
    getCurrentTime: vi.fn(),
    getDuration: vi.fn(),
    setCurrentTime: vi.fn(),
    stopAllPlayers: vi.fn(),
  },
}))

import {
  describeNativePlaybackFailure,
  PLAYER_ID,
  startNativePlayerEventTracking,
} from '../services/player'

const listeners = new Map<string, Listener>()
const remove = vi.fn().mockResolvedValue(undefined)

function emit(eventName: string, event: Record<string, unknown>): void {
  listeners.get(eventName)?.(event)
}

beforeEach(() => {
  listeners.clear()
  remove.mockClear()
  mocks.addListener.mockReset().mockImplementation(async (eventName: string, listener: Listener) => {
    listeners.set(eventName, listener)
    return { remove }
  })
})

describe('native player event tracking', () => {
  it('reports an exit before Ready as a failed start', async () => {
    const onReady = vi.fn()
    const onExit = vi.fn()
    const stop = await startNativePlayerEventTracking({ onReady, onExit })

    emit('jeepCapVideoPlayerExit', { dismiss: true })

    expect(onExit).toHaveBeenCalledWith(false)
    expect(onReady).not.toHaveBeenCalled()
    stop()
  })

  it('reports Ready before a later exit and ignores the wrong player id', async () => {
    const onReady = vi.fn()
    const onExit = vi.fn()
    const stop = await startNativePlayerEventTracking({ onReady, onExit })

    emit('jeepCapVideoPlayerReady', { fromPlayerId: 'another-player' })
    emit('jeepCapVideoPlayerReady', { fromPlayerId: PLAYER_ID })
    emit('jeepCapVideoPlayerExit', { dismiss: true })

    expect(onReady).toHaveBeenCalledTimes(1)
    expect(onExit).toHaveBeenCalledWith(true)
    stop()
    expect(remove).toHaveBeenCalledTimes(2)
  })
})

describe('native playback failure messages', () => {
  it('mentions MKV/H.265 compatibility for matching files', () => {
    expect(describeNativePlaybackFailure('movie.S01E01.H265.mkv')).toContain('MKV/H.265')
  })

  it('uses a cautious generic message for other files', () => {
    const message = describeNativePlaybackFailure('movie.mp4')
    expect(message).toContain('格式或编码')
    expect(message).not.toContain('MKV/H.265')
  })
})
