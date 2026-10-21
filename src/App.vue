<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute } from 'vue-router'
import BottomNav from './components/BottomNav.vue'
import { useLibraryStore } from './stores/library'

const route = useRoute()
const library = useLibraryStore()

onMounted(() => {
  void library.initialize()
})
</script>

<template>
  <div class="app-shell">
    <main :class="['app-main', { 'app-main--with-nav': route.meta.showNav }]">
      <RouterView />
    </main>
    <BottomNav v-if="route.meta.showNav" />
  </div>
</template>
