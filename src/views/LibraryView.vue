<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from '../components/AppIcon.vue'
import LibraryCard from '../components/LibraryCard.vue'
import { useLibraryStore } from '../stores/library'

const library = useLibraryStore()
const activeTab = ref<'history' | 'favorites'>('history')

const visibleItems = computed(() => activeTab.value === 'history' ? library.history : library.favorites)
</script>

<template>
  <section class="page page--library">
    <header class="page-header">
      <div>
        <div class="eyebrow">你的本地资源</div>
        <h1>资源库</h1>
      </div>
      <span class="count-pill">{{ library.items.length }} 项</span>
    </header>

    <div class="segmented-control" role="tablist" aria-label="资源库分类">
      <button
        type="button"
        role="tab"
        :aria-selected="activeTab === 'history'"
        :class="{ active: activeTab === 'history' }"
        @click="activeTab = 'history'"
      >
        <AppIcon name="clock" :size="17" /> 历史
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="activeTab === 'favorites'"
        :class="{ active: activeTab === 'favorites' }"
        @click="activeTab = 'favorites'"
      >
        <AppIcon name="heart" :size="17" /> 收藏
      </button>
    </div>

    <div v-if="!library.ready" class="loading-state">正在读取资源库…</div>

    <div v-else-if="visibleItems.length === 0" class="empty-state glass-card">
      <div class="empty-icon">
        <AppIcon :name="activeTab === 'history' ? 'clock' : 'heart'" :size="30" />
      </div>
      <h2>{{ activeTab === 'history' ? '还没有播放记录' : '还没有收藏' }}</h2>
      <p>导入一个授权媒体直链后，在资源详情页开始播放或收藏。</p>
      <RouterLink to="/" class="secondary-button">去导入</RouterLink>
    </div>

    <div v-else class="card-list">
      <LibraryCard
        v-for="item in visibleItems"
        :key="item.id"
        :item="item"
        :show-resume="activeTab === 'history'"
      />
    </div>

    <div v-if="library.error" class="notice notice--warning">{{ library.error }}</div>
  </section>
</template>
