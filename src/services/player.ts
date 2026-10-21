import { Capacitor } from '@capacitor/core'
import type { PluginListenerHandle } from '@capacitor/core'
import { VideoPlayer } from '@capgo/capacitor-video-player'
import type { PlayableSource } from '../types/domain'

export const PLAYER_ID = 'videoplay-main'
const PLAYER_TITLE = '云播'
const PLAYER_READY_EVENT = 'jeepCapVideoPlayerReady'
const PLAYER_EXIT_EVENT = 'jeepCapVideoPlayerExit'

interface NativePlayerEventPayload {
  fromPlayerId?: string
}

interface VideoPlayerWithEvents {
  addListener(
    eventName: typeof PLAYER_READY_EVENT | typeof PLAYER_EXIT_EVENT,
    listener: (event: NativePlayerEventPayload) => void,
  ): Promise<PluginListenerHandle>
}

export interface NativePlayerEventHandlers {
  onReady?: () => void
  onExit?: (started: boolean) => void
}

const playerWithEvents = VideoPlayer as unknown as VideoPlayerWithEvents

export function isNativeRuntime(): boolean {
  return Capacitor.isNativePlatform()
}

export async function startNativePlayerEventTracking(
  handlers: NativePlayerEventHandlers,
): Promise<() => void> {
  let ready = false
  let exited = false
  let disposed = false
  let readyListener: PluginListenerHandle | undefined
  let exitListener: PluginListenerHandle | undefined

  try {
    readyListener = await playerWithEvents.addListener(PLAYER_READY_EVENT, (event) => {
      if (disposed || (event.fromPlayerId && event.fromPlayerId !== PLAYER_ID)) return
      if (ready) return
      ready = true
      handlers.onReady?.()
    })
    exitListener = await playerWithEvents.addListener(PLAYER_EXIT_EVENT, () => {
      if (disposed || exited) return
      exited = true
      handlers.onExit?.(ready)
    })
  } catch (error) {
    void readyListener?.remove()
    void exitListener?.remove()
    throw error
  }

  return () => {
    disposed = true
    void readyListener?.remove()
    void exitListener?.remove()
  }
}

export async function openNativePlayer(
  source: PlayableSource,
  title: string,
  startAtSeconds = 0,
): Promise<void> {
  const result = await VideoPlayer.initPlayer({
    playerId: PLAYER_ID,
    mode: 'fullscreen',
    url: source.url,
    headers: source.headers,
    title,
    smallTitle: PLAYER_TITLE,
    showControls: true,
    displayMode: 'all',
    exitOnEnd: true,
    loopOnEnd: false,
    pipEnabled: true,
    bkmodeEnabled: false,
    chromecast: false,
    accentColor: '#27e3a4',
  })

  if (!result.result) {
    throw new Error(result.message || '原生播放器启动失败')
  }

  if (startAtSeconds > 0) {
    window.setTimeout(() => {
      void VideoPlayer.setCurrentTime({ playerId: PLAYER_ID, seektime: startAtSeconds }).catch(() => undefined)
    }, 900)
  }
}

export function startProgressTracking(
  onProgress: (positionSeconds: number, durationSeconds?: number) => void,
): () => void {
  let active = true
  let timer: number | undefined

  const poll = async () => {
    if (!active) return
    try {
      const [positionResult, durationResult] = await Promise.all([
        VideoPlayer.getCurrentTime({ playerId: PLAYER_ID }),
        VideoPlayer.getDuration({ playerId: PLAYER_ID }),
      ])
      const position = Number(positionResult.value)
      const duration = Number(durationResult.value)
      if (Number.isFinite(position) && position >= 0) {
        onProgress(
          position,
          Number.isFinite(duration) && duration > 0 ? duration : undefined,
        )
      }
    } catch {
      // The interval can race with the native player closing. The next poll is harmless.
    }
  }

  timer = window.setInterval(() => void poll(), 5_000)
  void poll()

  return () => {
    active = false
    if (timer !== undefined) window.clearInterval(timer)
  }
}

export async function stopNativePlayer(): Promise<void> {
  try {
    await VideoPlayer.stopAllPlayers()
  } catch {
    // Stops are best-effort when the native player has already closed.
  }
}

export function describeNativePlaybackFailure(fileName: string): string {
  const normalized = fileName.toUpperCase()
  if (/\.MKV(?:$|[?#])/.test(normalized) || /H\.?265|HEVC/.test(normalized)) {
    return '该视频未能开始播放，当前设备可能不支持 MKV/H.265 编码。播放地址有效时，是否接入转码可由你后续决定。'
  }
  return '播放器未能开始播放。可能是当前设备不支持该视频的格式或编码，也可能是网络异常或播放地址失效。'
}
