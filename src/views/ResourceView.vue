<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import { requireProviderForUrl } from '../providers/registry'
import type { ShareDescriptor } from '../providers/CloudProvider'
import { inferPlaybackKindFromName } from '../providers/DirectMediaProvider'
import { QuarkLoginRequiredError } from '../providers/quark/QuarkProvider'
import { describePlaybackKind, probePlayableSource } from '../services/mediaProbe'
import { useLibraryStore } from '../stores/library'
import { usePlaybackStore } from '../stores/playback'
import { useQuarkAuthStore } from '../stores/quarkAuth'

const route = useRoute()
const router = useRouter()
const library = useLibraryStore()
const playback = usePlaybackStore()
const quarkAuth = useQuarkAuthStore()
const busy = ref(false)
const loginRequired = ref(false)
const errorMessage = ref('')

const item = computed(() => library.getById(String(route.params.id)))
const itemHostname = computed(() => {
  if (!item.value) return ''
  try { return new URL(item.value.shareUrl).hostname } catch { return '' }
})

const playbackKind = computed(() => item.value
  ? describePlaybackKind({ kind: inferPlaybackKindFromName(item.value.file.name), url: item.value.shareUrl })
  : '')

const resumeLabel = computed(() => {
  const position = item.value?.positionSeconds
  if (!position) return ''
  const minutes = Math.floor(position / 60)
  const seconds = Math.floor(position % 60).toString().padStart(2, '0')
  return `上次看到 ${minutes}:${seconds}`
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

async function resolveAndOpenPlayer(): Promise<void> {
  if (!item.value) throw new Error('资源不存在')
  const provider = requireProviderForUrl(item.value.shareUrl)
  const source = await provider.resolvePlayable(item.value.file, toShareDescriptor())
  const probe = await probePlayableSource(source)
  await library.updateProbe(item.value.id, probe)
  if (probe.playable === 'blocked') {
    throw new Error(probe.message)
  }
  playback.setSession({ itemId: item.value.id, source, probe })
  await router.push({ name: 'player', params: { id: item.value.id } })
}

async function startPlayback(): Promise<void> {
  if (!item.value || busy.value) return
  busy.value = true
  loginRequired.value = false
  errorMessage.value = ''
  try {
    try {
      await resolveAndOpenPlayer()
    } catch (error) {
      if (!(error instanceof QuarkLoginRequiredError)) throw error
      loginRequired.value = true
      errorMessage.value = '需要登录夸克，登录成功后会自动继续播放，不会转存文件。'
      const loggedIn = await quarkAuth.login()
      if (!loggedIn) {
        errorMessage.value = quarkAuth.error || '夸克登录未完成'
        return
      }
      loginRequired.value = false
      errorMessage.value = ''
      await resolveAndOpenPlayer()
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '播放准备失败'
  } finally {
    busy.value = false
  }
}

async function toggleFavorite(): Promise<void> {
  if (!item.value) return
  await library.toggleFavorite(item.value.id)
}

function goBack(): void {
  void router.push('/')
}
</script>

<template>
  <section class="page page--detail">
    <header class="top-bar">
      <button class="icon-button" type="button" aria-label="返回" @click="goBack">
        <AppIcon name="back" />
      </button>
      <span class="top-bar__title">资源详情</span>
      <button
        v-if="item"
        class="icon-button"
        type="button"
        :aria-label="item.favorited ? '取消收藏' : '收藏'"
        @click="toggleFavorite"
      >
        <AppIcon :name="item.favorited ? 'heart-filled' : 'heart'" :class="{ 'accent-text': item.favorited }" />
      </button>
      <span v-else class="icon-button icon-button--placeholder" />
    </header>

    <div v-if="!library.ready" class="loading-state">正在读取资源…</div>

    <div v-else-if="!item" class="empty-state glass-card">
      <AppIcon name="link" :size="30" />
      <h2>没有找到这个资源</h2>
      <p>资源可能已被移除，或当前会话已失效。</p>
      <button class="secondary-button" type="button" @click="goBack">返回导入页</button>
    </div>

    <template v-else>
      <div class="detail-hero glass-card">
        <div class="detail-hero__glow" />
        <div class="file-icon"><AppIcon name="play" :size="30" /></div>
        <span class="badge badge--success">{{ item.providerName }}</span>
        <h1>{{ item.title }}</h1>
        <p class="detail-subtitle">{{ item.file.name }}</p>
        <div class="detail-tags">
          <span>{{ item.panType === 'direct' ? '媒体直链' : item.panType }}</span>
          <span v-if="item.file.mime">{{ item.file.mime }}</span>
          <span v-if="item.shareCode">提取码 {{ item.shareCode }}</span>
        </div>
      </div>

      <div class="action-stack">
        <button class="primary-button primary-button--large" type="button" :disabled="busy" @click="startPlayback">
          <AppIcon name="play" :size="22" />
          <span>{{ quarkAuth.busy ? '请在登录页完成夸克登录…' : busy ? '正在检查播放能力…' : resumeLabel || '在线播放' }}</span>
        </button>
        <div v-if="item.lastProbe" class="probe-row">
          <span :class="['probe-dot', `probe-dot--${item.lastProbe.playable}`]" />
          <span>{{ item.lastProbe.message }}</span>
        </div>
        <div v-if="errorMessage" class="notice notice--error" role="alert">
          {{ errorMessage }}
          <button v-if="loginRequired" type="button" class="notice-link" @click="startPlayback">重新登录并继续</button>
        </div>
      </div>

      <section class="section-block">
        <div class="section-heading">
          <h2>播放信息</h2>
        </div>
        <div class="info-list glass-card">
          <div class="info-row">
            <span>播放类型</span>
            <strong>{{ playbackKind }}</strong>
          </div>
          <div class="info-row">
            <span>分段请求</span>
            <strong>{{ item.lastProbe?.supportsRange === true ? '支持' : item.lastProbe?.supportsRange === false ? '未确认' : '播放时检测' }}</strong>
          </div>
          <div class="info-row">
            <span>播放地址</span>
            <strong class="truncate">{{ itemHostname }}</strong>
          </div>
        </div>
      </section>

      <section class="section-block">
        <div class="section-heading">
          <h2>文件</h2>
          <span class="section-note">1 项</span>
        </div>
        <div class="file-row glass-card">
          <div class="file-row__icon"><AppIcon name="play" :size="20" /></div>
          <div class="file-row__body">
            <strong>{{ item.file.name }}</strong>
            <span>{{ item.file.mime || '媒体文件' }}</span>
          </div>
          <span class="badge badge--success">视频</span>
        </div>
      </section>

      <div class="privacy-note">
        <AppIcon name="shield" :size="18" />
        <span>签名地址可能过期。播放失败时请重新导入原始资源；应用不会长期保存临时播放地址。</span>
      </div>
    </template>
  </section>
</template>
