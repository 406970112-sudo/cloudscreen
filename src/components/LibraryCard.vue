<script setup lang="ts">
import { computed } from 'vue'
import type { LibraryItem } from '../types/domain'
import AppIcon from './AppIcon.vue'

const props = defineProps<{
  item: LibraryItem
  showResume?: boolean
}>()

const progress = computed(() => {
  if (!props.item.positionSeconds || !props.item.durationSeconds) return undefined
  return Math.min(100, Math.max(0, (props.item.positionSeconds / props.item.durationSeconds) * 100))
})

const progressLabel = computed(() => {
  if (!progress.value) return undefined
  return `已观看 ${Math.round(progress.value)}%`
})
</script>

<template>
  <RouterLink :to="`/resource/${item.id}`" class="library-card card-link">
    <div class="library-card__icon">
      <AppIcon :name="item.file.isDir ? 'folder' : 'play'" :size="22" />
    </div>
    <div class="library-card__body">
      <div class="library-card__title">{{ item.title }}</div>
      <div class="library-card__meta">
        <span>{{ item.providerName }}</span>
        <span v-if="progressLabel">{{ progressLabel }}</span>
        <span v-else-if="item.favorited">已收藏</span>
      </div>
      <div v-if="showResume && progress" class="progress-track">
        <span :style="{ width: `${progress}%` }" />
      </div>
    </div>
    <AppIcon name="chevron" class="muted-icon" />
  </RouterLink>
</template>
