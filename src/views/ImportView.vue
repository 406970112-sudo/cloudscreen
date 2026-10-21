<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import {
  getLaoerSourceLabel,
  resolveLaoerResource,
  searchLaoerResources,
  type LaoerSearchResult,
} from '../services/laoerSearch'
import { parseShareText } from '../services/shareText'
import { detectKnownCloud, findProviderForUrl, requireProviderForUrl } from '../providers/registry'
import { useLibraryStore } from '../stores/library'
import type { PanType, SearchResult } from '../types/domain'

const router = useRouter()
const library = useLibraryStore()

const rawText = ref('')
const code = ref('')
const busy = ref(false)
const errorMessage = ref('')
const searchOpen = ref(false)
const searchKeyword = ref('')
const searchResults = ref<LaoerSearchResult[]>([])
const searchBusy = ref(false)
const searchError = ref('')
const searchNotice = ref('')
const resolvingToken = ref('')
const searchInput = ref<HTMLInputElement>()

let searchController: AbortController | undefined
let resolveController: AbortController | undefined
let searchRequestId = 0
let resolveRequestId = 0

const parsedPreview = computed(() => {
  try {
    return parseShareText(rawText.value)
  } catch {
    return undefined
  }
})

const knownCloud = computed(() => parsedPreview.value ? detectKnownCloud(parsedPreview.value.url) : undefined)
const previewHostname = computed(() => {
  if (!parsedPreview.value) return ''
  try { return new URL(parsedPreview.value.url).hostname } catch { return '' }
})

const supportedProvider = computed(() => {
  if (!parsedPreview.value) return undefined
  return findProviderForUrl(parsedPreview.value.url)
})

const supportedLabel = computed(() => {
  if (!supportedProvider.value) return knownCloud.value ? `${knownCloud.value.label}待接入` : '未识别适配器'
  return supportedProvider.value.id === 'quark' ? '夸克分享可直接播放' : '可导入媒体直链'
})

watch(rawText, () => {
  try {
    const parsed = parseShareText(rawText.value)
    code.value = parsed.code ?? ''
  } catch {
    // Input is incomplete while the user is typing.
  }
})

async function findFirstPlayableFile(
  provider: ReturnType<typeof requireProviderForUrl>,
  share: Awaited<ReturnType<ReturnType<typeof requireProviderForUrl>['parseShare']>>,
): Promise<Awaited<ReturnType<ReturnType<typeof requireProviderForUrl>['listFiles']>>[number] | undefined> {
  const queue: Array<{ parentId: string; depth: number }> = [{ parentId: '0', depth: 0 }]
  const visited = new Set<string>()

  while (queue.length > 0 && visited.size < 20) {
    const current = queue.shift()
    if (!current || visited.has(current.parentId)) continue
    visited.add(current.parentId)

    const files = await provider.listFiles(share, current.parentId)
    const video = files.find((file) => !file.isDir && /\.(mp4|m4v|webm|mov|mkv|avi|ts|m3u8|mpd|flv)$/i.test(file.name))
    if (video) return video

    if (current.depth < 2) {
      for (const folder of files.filter((file) => file.isDir)) {
        queue.push({ parentId: folder.id, depth: current.depth + 1 })
      }
    }
  }
  return undefined
}

async function importResource(): Promise<void> {
  errorMessage.value = ''
  busy.value = true
  try {
    const input = parseShareText(rawText.value)
    const provider = requireProviderForUrl(input.url)
    const share = await provider.parseShare(input.url, code.value.trim() || input.code, input.title)

    if (provider.id === 'quark') {
      await router.push({
        name: 'share-browser',
        query: {
          url: share.canonicalUrl,
          code: share.code || '',
          title: share.title,
        },
      })
      return
    }

    const file = await findFirstPlayableFile(provider, share)
    if (!file) throw new Error('没有找到 MP4、HLS 等可播放视频')

    const panType: PanType = provider.id === 'direct-media' ? 'direct' : 'other'
    const resource: SearchResult = {
      id: share.shareId,
      title: share.title === '夸克网盘分享' ? file.name : share.title,
      source: provider.id,
      shareUrl: share.canonicalUrl,
      panType,
      shareCode: code.value.trim() || input.code,
      resourceType: 'video',
      verifiedAt: new Date().toISOString(),
    }
    const item = await library.rememberInspection(resource, file, provider.name)
    await router.push({ name: 'resource', params: { id: item.id } })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '导入失败'
  } finally {
    busy.value = false
  }
}

function useExample(): void {
  rawText.value = 'https://example.com/demo/video.mp4'
  code.value = ''
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function toggleResourceSearch(): void {
  if (searchOpen.value) {
    closeResourceSearch()
    return
  }

  searchOpen.value = true
  void nextTick(() => searchInput.value?.focus())
}

function closeResourceSearch(): void {
  searchOpen.value = false
  searchRequestId += 1
  resolveRequestId += 1
  searchController?.abort()
  resolveController?.abort()
  searchController = undefined
  resolveController = undefined
  searchBusy.value = false
  resolvingToken.value = ''
}

async function runResourceSearch(): Promise<void> {
  const keyword = searchKeyword.value.trim()
  if (!keyword) {
    searchError.value = '请输入要搜索的资源名称'
    return
  }
  if (searchBusy.value) return

  searchController?.abort()
  const controller = new AbortController()
  const requestId = ++searchRequestId
  searchController = controller
  searchBusy.value = true
  searchError.value = ''
  searchNotice.value = ''
  searchResults.value = []

  try {
    const response = await searchLaoerResources(keyword, controller.signal)
    if (requestId !== searchRequestId) return
    searchResults.value = response.results
    searchNotice.value = response.notice ?? (response.results.length === 0 ? '没有找到相关资源' : '')
  } catch (error) {
    if (requestId !== searchRequestId || isAbortError(error)) return
    searchError.value = error instanceof Error ? error.message : '资源搜索失败'
  } finally {
    if (requestId === searchRequestId) {
      searchBusy.value = false
      searchController = undefined
    }
  }
}

async function selectSearchResult(result: LaoerSearchResult): Promise<void> {
  if (resolvingToken.value) return

  resolveController?.abort()
  const controller = new AbortController()
  const requestId = ++resolveRequestId
  resolveController = controller
  resolvingToken.value = result.tokenUrl
  searchError.value = ''

  try {
    const resolvedUrl = await resolveLaoerResource(result, controller.signal)
    if (requestId !== resolveRequestId) return
    rawText.value = resolvedUrl
    searchOpen.value = false
    await nextTick()
    document.getElementById('share-input')?.focus()
  } catch (error) {
    if (requestId !== resolveRequestId || isAbortError(error)) return
    searchError.value = error instanceof Error ? error.message : '获取资源地址失败'
  } finally {
    if (requestId === resolveRequestId) {
      resolvingToken.value = ''
      resolveController = undefined
    }
  }
}

onBeforeUnmount(() => {
  searchRequestId += 1
  resolveRequestId += 1
  searchController?.abort()
  resolveController?.abort()
})
</script>

<template>
  <section class="page page--import">
    <header class="hero-header">
      <div class="eyebrow"><span class="status-dot" /> 合规在线播放 · Android 优先</div>
      <h1>把可播放的地址<br><span>放进你的播放器</span></h1>
      <p>粘贴你拥有访问权的夸克分享链接或媒体直链。App 直接获取临时播放地址，不会把文件转存到你的网盘。</p>
    </header>

    <form class="import-card glass-card" @submit.prevent="importResource">
      <div class="field-heading">
        <label class="field-label" for="share-input">分享链接或媒体地址</label>
        <button
          class="text-button search-toggle"
          type="button"
          :aria-expanded="searchOpen"
          aria-controls="resource-search-panel"
          @click="toggleResourceSearch"
        >
          {{ searchOpen ? '收起搜索' : '搜索资源' }}
        </button>
      </div>
      <div class="textarea-wrap">
        <textarea
          id="share-input"
          v-model="rawText"
          rows="5"
          placeholder="例如：https://pan.quark.cn/s/xxxx 提取码: abcd&#10;也支持 MP4/HLS 媒体直链"
        />
        <button type="button" class="text-button example-button" @click="useExample">填入示例</button>
      </div>

      <section
        v-if="searchOpen"
        id="resource-search-panel"
        class="resource-search"
        aria-label="资源搜索"
      >
        <div class="resource-search__heading">
          <div>
            <strong>搜索夸克资源</strong>
            <span>资源检索由老二搜索提供</span>
          </div>
          <span v-if="searchResults.length" class="badge badge--neutral">{{ searchResults.length }} 条</span>
        </div>

        <div class="resource-search__form">
          <input
            ref="searchInput"
            v-model="searchKeyword"
            class="resource-search__input"
            type="search"
            autocomplete="off"
            placeholder="输入影视或资源名称"
            :disabled="searchBusy"
            @keydown.enter.prevent="runResourceSearch"
          />
          <button
            class="resource-search__submit"
            type="button"
            :disabled="searchBusy || !searchKeyword.trim()"
            @click="runResourceSearch"
          >
            {{ searchBusy ? '搜索中' : '搜索' }}
          </button>
        </div>

        <div class="resource-search__status" aria-live="polite">
          <div v-if="searchBusy" class="search-state">
            <span class="search-spinner" />
            正在搜索资源…
          </div>
          <div v-else-if="searchError" class="notice notice--error" role="alert">{{ searchError }}</div>
          <div v-else-if="searchResults.length" class="resource-search__results">
            <button
              v-for="result in searchResults"
              :key="result.tokenUrl"
              class="resource-search__result"
              type="button"
              :disabled="Boolean(resolvingToken)"
              @click="selectSearchResult(result)"
            >
              <span class="resource-search__result-body">
                <strong>{{ result.title }}</strong>
                <span>{{ getLaoerSourceLabel(result.sourceType) }}</span>
              </span>
              <span class="resource-search__result-action">
                {{ resolvingToken === result.tokenUrl ? '正在获取地址…' : '选择' }}
              </span>
            </button>
          </div>
          <div v-else-if="searchNotice" class="search-state">{{ searchNotice }}</div>
        </div>
      </section>

      <div class="code-row">
        <label class="field-label" for="code-input">提取码 <span>可选</span></label>
        <input id="code-input" v-model="code" type="text" autocomplete="off" placeholder="自动识别，也可手动填写" />
      </div>

      <div v-if="parsedPreview" class="preview-strip">
        <span :class="['badge', supportedProvider ? 'badge--success' : knownCloud ? 'badge--warning' : 'badge--neutral']">
          {{ supportedLabel }}
        </span>
        <span class="preview-host">{{ previewHostname }}</span>
      </div>

      <div v-if="errorMessage" class="notice notice--error" role="alert">{{ errorMessage }}</div>

      <button class="primary-button" type="submit" :disabled="busy || !rawText.trim()">
        <span>{{ busy ? '正在检查…' : '解析并查看资源' }}</span>
        <AppIcon name="chevron" :size="18" />
      </button>
    </form>

    <section class="section-block">
      <div class="section-heading">
        <h2>当前支持</h2>
        <span class="section-note">Stage 1</span>
      </div>
      <div class="support-list">
        <div class="support-item glass-card">
          <div class="support-icon support-icon--active"><AppIcon name="link" /></div>
          <div>
            <strong>夸克网盘分享直连</strong>
            <p>分享链接 → 文件信息 → 临时播放地址，不执行转存；大文件需先在设置中登录夸克。</p>
          </div>
          <span class="badge badge--success">可用</span>
        </div>
        <div class="support-item glass-card">
          <div class="support-icon"><AppIcon name="folder" /></div>
          <div>
            <strong>授权媒体直链及后续网盘</strong>
            <p>MP4、WebM、HLS 可直接播放；其他网盘会按同样“直连、不转存”标准逐个接入。</p>
          </div>
          <span class="badge badge--neutral">可用</span>
        </div>
      </div>
    </section>

    <div class="privacy-note">
      <AppIcon name="shield" :size="18" />
      <span>播放地址不定向转发、不代理视频流量；历史记录只保存资源标识和播放进度。</span>
    </div>
  </section>
</template>
