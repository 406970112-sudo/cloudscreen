<script setup lang="ts">
import AppIcon from './AppIcon.vue'
</script>

<template>
  <nav class="bottom-nav" aria-label="主导航">
    <RouterLink to="/" class="nav-item">
      <AppIcon name="search" />
      <span>首页</span>
    </RouterLink>
    <RouterLink to="/library" class="nav-item">
      <AppIcon name="library" />
      <span>资源库</span>
    </RouterLink>
    <RouterLink to="/settings" class="nav-item">
      <AppIcon name="settings" />
      <span>设置</span>
    </RouterLink>
  </nav>
</template>
