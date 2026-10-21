<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type Hls from 'hls.js'
import AppIcon from '../components/AppIcon.vue'
import { requireProviderForUrl } from '../providers/registry'
import type { ShareDescriptor } from '../providers/CloudProvider'
import { describePlaybackKind } from '../services/mediaProbe'
import {
  isNativeRuntime,
  openNativePlayer,
  startProgressTracking,
  stopNativePlayer,
} from '../services/player'
import { useLibraryStore } from '../stores/library'
import { usePlaybackStore } from '../stores/playback'
import type { PlayableSource } from '../types/domain'

const route = useRoute()
const router = useRouter()
const library = useLibraryStore()
const playback = usePlaybackStore()

const videoElement = ref<HTMLVideoElement>()
const preparing = ref(true)
const nativeReady = ref(false)
const errorMessage = ref('')
const localProgress = ref(0)
const localDuration = ref(0)
let stopTracking: (() => void) | undefined
let hlsPlayer: Hls | undefined
let playbackRecorded = false

const item = computed(() => library.getById(String(route.params.id)))
const native = isNativeRuntime()
const source = computed<PlayableSource | undefined>(() => {
  const session = playback.session
  return session && session.itemId === item.value?.id ? session.source : undefined
})

function toShareDescriptor(): ShareDescriptor {
  if (!item.value) throw new Error('资源不存在')
  return {
    shareId: item.value.id,
    canonicalUrl: item.value.shareUrl,
    code: item.value.shareCode,
    title: item.value.title,
  }
}

async function resolveIfNeeded(): Promise<PlayableSource> {
  if (source.value) return source.value
  if (!item.value) throw new Error('资源不存在')
  const provider = requireProviderForUrl(item.value.shareUrl)
  return provider.resolvePlayable(item.value.file, toShareDescriptor())
}

async function start(): Promise<void> {
  await library.initialize()
  if (!item.value) {
    errorMessage.value = '资源不存在'
    preparing.value = false
    return
  }

  const currentItem = item.value
  try {
    const resolvedSource = await resolveIfNeeded()

    if (native) {
      await openNativePlayer(resolvedSource, currentItem.title, currentItem.positionSeconds ?? 0)
      nativeReady.value = true
      await markPlaybackStarted()
      stopTracking = startProgressTracking((position, duration) => {
        localProgress.value = position
        localDuration.value = duration ?? localDuration.value
        void library.updateProgress(currentItem.id, position, duration)
      })
    } else {
      preparing.value = false
      await nextTick()
      const video = videoElement.value
      if (!video) throw new Error('网页播放器初始化失败')
      if (resolvedSource.kind === 'hls') {
        const { default: HlsPlayer } = await import('hls.js')
        if (HlsPlayer.isSupported()) {
          hlsPlayer = new HlsPlayer()
          hlsPlayer.loadSource(resolvedSource.url)
          hlsPlayer.attachMedia(video)
        } else {
          video.src = resolvedSource.url
        }
      } else {
        video.src = resolvedSource.url
      }
      video.currentTime = currentItem.positionSeconds ?? 0
      video.volume = 1
      await video.play().catch((playError: DOMException) => {
        if (playError.name !== 'NotAllowedError') {
          errorMessage.value = '浏览器无法播放该媒体，可能是格式、跨域或鉴权限制'
        }
      })
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '播放器启动失败'
  } finally {
    preparing.value = false
  }
}

async function markPlaybackStarted(): Promise<void> {
  if (playbackRecorded || !item.value) return
  playbackRecorded = true
  await library.recordPlayback(item.value.id)
}

async function reopenNativePlayer(): Promise<void> {
  if (!item.value || !source.value) return
  try {
    await openNativePlayer(source.value, item.value.title, localProgress.value || item.value.positionSeconds || 0)
    nativeReady.value = true
    await markPlaybackStarted()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '无法重新打开播放器'
  }
}

function handleVideoError(): void {
  errorMessage.value = '浏览器无法播放该媒体，可能是格式、跨域、请求头或鉴权限制'
}

function handleTimeUpdate(): void {
  const video = videoElement.value
  if (!video || !item.value) return
  localProgress.value = video.currentTime
  localDuration.value = video.duration || 0
  void library.updateProgress(item.value.id, video.currentTime, Number.isFinite(video.duration) ? video.duration : undefined)
}

async function leavePlayer(): Promise<void> {
  if (native) await stopNativePlayer()
  else videoElement.value?.pause()
  playback.clearSession()
  await router.back()
}

onMounted(() => {
  void start()
})

onBeforeUnmount(() => {
  stopTracking?.()
  hlsPlayer?.destroy()
  const video = videoElement.value
  if (video && item.value) {
    void library.updateProgress(item.value.id, video.currentTime, Number.isFinite(video.duration) ? video.duration : undefined)
  }
})
</script>

<template>
  <section class="page page--player">
    <header class="top-bar top-bar--overlay">
      <button class="icon-button" type="button" aria-label="返回" @click="leavePlayer">
        <AppIcon name="back" />
      </button>
      <span class="top-bar__title">正在播放</span>
      <span class="icon-button icon-button--placeholder" />
    </header>

    <div v-if="preparing" class="player-loading">
      <div class="spinner" />
      <p>准备播放器…</p>
    </div>

    <div v-else-if="errorMessage" class="empty-state glass-card page-state">
      <AppIcon name="link" :size="30" />
      <h2>无法播放</h2>
      <p>{{ errorMessage }}</p>
      <button class="secondary-button" type="button" @click="leavePlayer">返回资源</button>
    </div>

    <template v-else-if="item && source">
      <div class="player-stage">
        <video
          v-if="!native"
          ref="videoElement"
          class="web-video"
          controls
          playsinline
          preload="metadata"
          @loadedmetadata="markPlaybackStarted"
          @timeupdate="handleTimeUpdate"
          @error="handleVideoError"
        />
        <div v-else class="native-player-placeholder">
          <div class="native-player-placeholder__rings" />
          <AppIcon name="play" :size="46" />
          <h2>{{ nativeReady ? '原生播放器已启动' : '正在启动原生播放器' }}</h2>
          <p>播放器在系统全屏层运行；返回本页可重新打开并恢复进度。</p>
          <button class="primary-button" type="button" @click="reopenNativePlayer">
            <AppIcon name="play" :size="18" />
            <span>重新打开播放器</span>
          </button>
        </div>
      </div>

      <div class="player-meta glass-card">
        <span class="badge badge--success">{{ describePlaybackKind(source) }}</span>
        <h1>{{ item.title }}</h1>
        <p>{{ item.providerName }} · {{ item.file.name }}</p>
        <div v-if="localDuration > 0" class="progress-track progress-track--lg">
          <span :style="{ width: `${Math.min(100, (localProgress / localDuration) * 100)}%` }" />
        </div>
      </div>

      <div class="privacy-note">
        <AppIcon name="shield" :size="18" />
        <span>播放失败时不会自动重试可能已过期的签名地址，请重新导入原始资源。</span>
      </div>
    </template>
  </section>
</template>
