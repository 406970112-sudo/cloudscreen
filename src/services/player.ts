import { Capacitor } from '@capacitor/core'
import { VideoPlayer } from '@capgo/capacitor-video-player'
import type { PlayableSource } from '../types/domain'

export const PLAYER_ID = 'videoplay-main'
const PLAYER_TITLE = '云播'

export function isNativeRuntime(): boolean {
  return Capacitor.isNativePlatform()
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
