<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
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
const manualOpen = ref(false)
const searchKeyword = ref('')
const searchResults = ref<LaoerSearchResult[]>([])
const searchBusy = ref(false)
const searchError = ref('')
const searchNotice = ref('')
const resolvingToken = ref('')
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

async function importResource(
  errorTarget: 'manual' | 'search' = 'manual',
  titleHint?: string,
): Promise<boolean> {
  if (errorTarget === 'manual') errorMessage.value = ''
  else searchError.value = ''
  busy.value = true
  try {
    const input = parseShareText(rawText.value)
    const provider = requireProviderForUrl(input.url)
    const share = await provider.parseShare(
      input.url,
      code.value.trim() || input.code,
      titleHint?.trim() || input.title,
    )

    if (provider.id === 'quark') {
      await router.push({
        name: 'share-browser',
        query: {
          url: share.canonicalUrl,
          code: share.code || '',
          title: share.title,
        },
      })
      return true
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
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : '导入失败'
    if (errorTarget === 'manual') errorMessage.value = message
    else searchError.value = message
    return false
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

async function runResourceSearch(): Promise<void> {
  const keyword = searchKeyword.value.trim()
  if (!keyword) {
    searchError.value = '请输入要搜索的资源名称'
    return
  }
  if (searchBusy.value || busy.value) return

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
  if (resolvingToken.value || busy.value) return

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
    code.value = parseShareText(resolvedUrl).code ?? ''
    await importResource('search', result.title)
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
    <header class="home-header">
      <div class="home-header__brand">云播</div>
      <h1>搜索资源，直接播放</h1>
      <p>输入影视名称，选好结果后继续解析。</p>
    </header>

    <section class="search-card glass-card" aria-label="资源搜索">
      <div class="search-card__heading">
        <div>
          <strong>想看什么？</strong>
          <span>当前搜索夸克网盘资源</span>
        </div>
        <span v-if="searchResults.length" class="badge badge--neutral">{{ searchResults.length }} 条</span>
      </div>

      <form class="resource-search__form resource-search__form--primary" @submit.prevent="runResourceSearch">
        <label class="search-field">
          <AppIcon name="search" :size="19" />
          <span class="sr-only">搜索资源</span>
          <input
            v-model="searchKeyword"
            class="resource-search__input"
            type="search"
            autocomplete="off"
            placeholder="输入影视或资源名称"
            :disabled="searchBusy || busy"
          />
        </label>
        <button
          class="resource-search__submit"
          type="submit"
          :disabled="searchBusy || busy || !searchKeyword.trim()"
        >
          {{ searchBusy ? '搜索中' : '搜索' }}
        </button>
      </form>

      <div class="resource-search__status" aria-live="polite">
        <div v-if="searchBusy" class="search-state">
          <span class="search-spinner" />
          正在搜索资源…
        </div>
        <div v-else-if="resolvingToken" class="search-state">
          <span class="search-spinner" />
          正在解析资源…
        </div>
        <template v-else>
          <div v-if="searchError" class="notice notice--error" role="alert">{{ searchError }}</div>
          <div v-if="searchResults.length" class="resource-search__results">
            <button
              v-for="result in searchResults"
              :key="result.tokenUrl"
              class="resource-search__result"
              type="button"
              :disabled="Boolean(resolvingToken) || busy"
              @click="selectSearchResult(result)"
            >
              <span class="resource-search__result-body">
                <strong>{{ result.title }}</strong>
                <span>{{ getLaoerSourceLabel(result.sourceType) }}</span>
              </span>
              <span class="resource-search__result-action">
                {{ resolvingToken === result.tokenUrl ? '正在解析…' : '解析并查看' }}
              </span>
            </button>
          </div>
          <div v-else-if="searchNotice" class="search-state">{{ searchNotice }}</div>
        </template>
      </div>
    </section>

    <section :class="['manual-import', { 'manual-import--open': manualOpen }]">
      <button
        class="manual-import__toggle"
        type="button"
        :aria-expanded="manualOpen"
        aria-controls="manual-import-panel"
        @click="manualOpen = !manualOpen"
      >
        <span><AppIcon name="link" :size="18" />手动粘贴分享链接或媒体地址</span>
        <AppIcon name="chevron" :size="18" class="manual-import__chevron" />
      </button>

      <form
        v-if="manualOpen"
        id="manual-import-panel"
        class="import-card glass-card manual-import__panel"
        @submit.prevent="importResource('manual')"
      >
        <label class="field-label" for="share-input">分享链接或媒体地址</label>
        <div class="textarea-wrap">
          <textarea
            id="share-input"
            v-model="rawText"
            rows="4"
            placeholder="例如：https://pan.quark.cn/s/xxxx 提取码: abcd&#10;也支持 MP4/HLS 媒体直链"
          />
          <button type="button" class="text-button example-button" @click="useExample">填入示例</button>
        </div>

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
          <span>{{ busy ? '正在解析…' : '解析并查看资源' }}</span>
          <AppIcon name="chevron" :size="18" />
        </button>
      </form>
    </section>

  </section>
</template>
