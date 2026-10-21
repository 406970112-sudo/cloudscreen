<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import type { ShareDescriptor } from '../providers/CloudProvider'
import { requireProviderForUrl } from '../providers/registry'
import { useLibraryStore } from '../stores/library'
import type { PanType, RemoteFile, SearchResult } from '../types/domain'

interface FolderCrumb {
  id: string
  name: string
}

const route = useRoute()
const router = useRouter()
const library = useLibraryStore()

const shareUrl = computed(() => String(route.query.url ?? ''))
const shareCode = computed(() => String(route.query.code ?? ''))
const share = ref<ShareDescriptor>()
const files = ref<RemoteFile[]>([])
const crumbs = ref<FolderCrumb[]>([{ id: '0', name: '分享目录' }])
const loading = ref(true)
const errorMessage = ref('')

const provider = computed(() => {
  try {
    return requireProviderForUrl(shareUrl.value)
  } catch {
    return undefined
  }
})

const folders = computed(() => files.value.filter((file) => file.isDir))
const regularFiles = computed(() => files.value.filter((file) => !file.isDir))
const currentFolder = computed(() => crumbs.value.at(-1))

function isVideoFile(file: RemoteFile): boolean {
  return /\.(mp4|m4v|webm|mov|mkv|avi|ts|m3u8|mpd|flv)$/i.test(file.name)
}

function formatSize(size?: number): string {
  if (!size) return ''
  if (size >= 1024 ** 3) return `${(size / 1024 ** 3).toFixed(1)} GB`
  if (size >= 1024 ** 2) return `${(size / 1024 ** 2).toFixed(0)} MB`
  if (size >= 1024) return `${(size / 1024).toFixed(0)} KB`
  return `${size} B`
}

async function loadDirectory(parentId: string): Promise<void> {
  if (!provider.value || !share.value) return
  loading.value = true
  errorMessage.value = ''
  try {
    files.value = await provider.value.listFiles(share.value, parentId)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '读取分享目录失败'
  } finally {
    loading.value = false
  }
}

async function openFolder(folder: RemoteFile): Promise<void> {
  crumbs.value.push({ id: folder.id, name: folder.name })
  await loadDirectory(folder.id)
}

async function goBack(): Promise<void> {
  if (crumbs.value.length <= 1) {
    await router.push('/')
    return
  }
  crumbs.value.pop()
  const previous = crumbs.value.at(-1)
  if (previous) await loadDirectory(previous.id)
}

async function playFile(file: RemoteFile): Promise<void> {
  if (!provider.value || !share.value || !isVideoFile(file)) return
  errorMessage.value = ''
  try {
    const resource: SearchResult = {
      id: `${share.value.shareId}-${file.id}`,
      title: file.name,
      source: provider.value.id,
      shareUrl: share.value.canonicalUrl,
      panType: provider.value.id === 'quark' ? 'quark' as PanType : 'other',
      shareCode: share.value.code,
      resourceType: 'video',
      verifiedAt: new Date().toISOString(),
    }
    const item = await library.rememberInspection(resource, file, provider.value.name)
    await router.push({ name: 'resource', params: { id: item.id } })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '创建播放记录失败'
  }
}

onMounted(async () => {
  const currentProvider = provider.value
  if (!currentProvider) {
    errorMessage.value = '分享链接的适配器不可用'
    loading.value = false
    return
  }
  try {
    share.value = await currentProvider.parseShare(
      shareUrl.value,
      shareCode.value || undefined,
      String(route.query.title ?? ''),
    )
    await loadDirectory('0')
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '解析分享链接失败'
    loading.value = false
  }
})
</script>

<template>
  <section class="page page--browser">
    <header class="top-bar">
      <button class="icon-button" type="button" aria-label="返回" @click="goBack">
        <AppIcon name="back" />
      </button>
      <span class="top-bar__title">{{ currentFolder?.name ?? '分享目录' }}</span>
      <span class="icon-button icon-button--placeholder" />
    </header>

    <div class="browser-heading">
      <div>
        <div class="eyebrow">夸克分享 · 直接播放</div>
        <h1>{{ String(route.query.title || '选择视频') }}</h1>
      </div>
      <span class="count-pill">{{ provider?.name }}</span>
    </div>

    <div class="breadcrumbs">
      <button
        v-for="(crumb, index) in crumbs"
        :key="`${crumb.id}-${index}`"
        type="button"
        :disabled="index === crumbs.length - 1"
        @click="crumbs = crumbs.slice(0, index + 1); loadDirectory(crumb.id)"
      >
        {{ crumb.name }}
        <AppIcon v-if="index < crumbs.length - 1" name="chevron" :size="13" />
      </button>
    </div>

    <div v-if="loading" class="loading-state">正在读取分享目录…</div>

    <div v-else-if="errorMessage" class="empty-state glass-card">
      <AppIcon name="link" :size="30" />
      <h2>目录读取失败</h2>
      <p>{{ errorMessage }}</p>
      <button class="secondary-button" type="button" @click="goBack">返回上一级</button>
    </div>

    <div v-else-if="folders.length === 0 && regularFiles.length === 0" class="empty-state glass-card">
      <AppIcon name="folder" :size="30" />
      <h2>这个目录是空的</h2>
      <p>请返回上一级选择其他目录。</p>
    </div>

    <div v-else class="browser-list">
      <button
        v-for="folder in folders"
        :key="folder.id"
        type="button"
        class="browser-row glass-card"
        @click="openFolder(folder)"
      >
        <span class="browser-row__icon browser-row__icon--folder"><AppIcon name="folder" :size="21" /></span>
        <span class="browser-row__body">
          <strong>{{ folder.name }}</strong>
          <small>文件夹</small>
        </span>
        <AppIcon name="chevron" :size="18" class="muted-icon" />
      </button>

      <button
        v-for="file in regularFiles"
        :key="file.id"
        type="button"
        :disabled="!isVideoFile(file)"
        class="browser-row glass-card"
        @click="playFile(file)"
      >
        <span :class="['browser-row__icon', { 'browser-row__icon--video': isVideoFile(file) }]">
          <AppIcon :name="isVideoFile(file) ? 'play' : 'link'" :size="20" />
        </span>
        <span class="browser-row__body">
          <strong>{{ file.name }}</strong>
          <small>{{ [formatSize(file.size), isVideoFile(file) ? '点击直接播放' : '非视频文件'].filter(Boolean).join(' · ') }}</small>
        </span>
        <span v-if="isVideoFile(file)" class="badge badge--success">播放</span>
        <span v-else class="badge badge--neutral">不可播放</span>
      </button>
    </div>

    <div class="privacy-note">
      <AppIcon name="shield" :size="18" />
      <span>目录读取和播放地址获取均为只读请求，不会把分享文件保存到你的网盘。</span>
    </div>
  </section>
</template>
