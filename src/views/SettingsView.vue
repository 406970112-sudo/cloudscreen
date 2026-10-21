<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Capacitor } from '@capacitor/core'
import AppIcon from '../components/AppIcon.vue'
import { useLibraryStore } from '../stores/library'
import { useQuarkAuthStore } from '../stores/quarkAuth'

const library = useLibraryStore()
const quarkAuth = useQuarkAuthStore()
const cleared = ref(false)
const native = Capacitor.isNativePlatform()

onMounted(() => {
  void quarkAuth.refresh()
})

async function clearLibrary(): Promise<void> {
  if (!window.confirm('确定清空历史、收藏和播放进度吗？此操作不可撤销。')) return
  await library.clear()
  cleared.value = true
  window.setTimeout(() => { cleared.value = false }, 2500)
}

async function loginQuark(): Promise<void> {
  await quarkAuth.login()
}

async function logoutQuark(): Promise<void> {
  if (!window.confirm('确定退出夸克登录吗？')) return
  await quarkAuth.logout()
}
</script>

<template>
  <section class="page page--settings">
    <header class="page-header">
      <div>
        <div class="eyebrow">应用偏好与说明</div>
        <h1>设置</h1>
      </div>
    </header>

    <section class="settings-group">
      <h2>账号</h2>
      <div class="settings-card glass-card">
        <div class="settings-row settings-row--account">
          <div class="provider-name">
            <span class="provider-mark provider-mark--green"><AppIcon name="shield" :size="18" /></span>
            <div>
              <strong>夸克网盘</strong>
              <p>{{ quarkAuth.loggedIn ? '已登录，可播放超出游客限制的分享文件' : '游客可播放小文件；登录只提升限制，不转存' }}</p>
            </div>
          </div>
          <button
            v-if="!quarkAuth.loggedIn"
            class="mini-button"
            type="button"
            :disabled="quarkAuth.busy || !native"
            @click="loginQuark"
          >
            {{ quarkAuth.busy ? '登录中…' : '登录' }}
          </button>
          <button v-else class="mini-button mini-button--muted" type="button" @click="logoutQuark">
            退出
          </button>
        </div>
        <div v-if="!native" class="notice notice--warning settings-notice">
          浏览器预览无法安全读取夸克登录 Cookie；请在 Android 真机中完成登录。
        </div>
        <div v-if="quarkAuth.error" class="notice notice--error settings-notice">{{ quarkAuth.error }}</div>
        <div class="account-policy">
          <AppIcon name="shield" :size="16" />
          <span>登录 Cookie 仅保存于系统安全存储，只用于获取分享文件的临时播放地址。</span>
        </div>
      </div>
    </section>

    <section class="settings-group">
      <h2>运行环境</h2>
      <div class="settings-card glass-card">
        <div class="settings-row">
          <div>
            <strong>本地存储</strong>
            <p>历史、收藏、播放进度</p>
          </div>
          <span class="badge badge--success">{{ library.storageBackend === 'sqlite' ? 'SQLite' : '浏览器存储' }}</span>
        </div>
        <div class="settings-row">
          <div>
            <strong>播放器</strong>
            <p>Android/iOS 使用原生全屏播放器</p>
          </div>
          <span class="badge badge--neutral">Capacitor 8</span>
        </div>
      </div>
    </section>

    <section class="settings-group">
      <h2>适配器</h2>
      <div class="settings-card glass-card">
        <div class="settings-row">
          <div class="provider-name">
            <span class="provider-mark provider-mark--green"><AppIcon name="link" :size="18" /></span>
            <div>
              <strong>夸克分享直连</strong>
              <p>分享文件直接取播放地址，不调用转存接口</p>
            </div>
          </div>
          <span class="badge badge--success">已启用</span>
        </div>
        <div class="settings-row">
          <div class="provider-name">
            <span class="provider-mark"><AppIcon name="link" :size="18" /></span>
            <div>
              <strong>媒体直链</strong>
              <p>MP4 / WebM / HLS / DASH</p>
            </div>
          </div>
          <span class="badge badge--success">已启用</span>
        </div>
        <div class="settings-row">
          <div class="provider-name">
            <span class="provider-mark"><AppIcon name="folder" :size="18" /></span>
            <div>
              <strong>其他网盘分享</strong>
              <p>按“可直连、不转存”标准逐个接入</p>
            </div>
          </div>
          <span class="badge badge--neutral">待接入</span>
        </div>
      </div>
    </section>

    <section class="settings-group">
      <h2>数据管理</h2>
      <div class="settings-card glass-card">
        <button class="settings-action settings-action--danger" type="button" @click="clearLibrary">
          <span><AppIcon name="trash" :size="19" /> 清空资源库</span>
          <AppIcon name="chevron" :size="18" />
        </button>
        <div v-if="cleared" class="notice notice--success">资源库已清空</div>
      </div>
    </section>

    <section class="settings-group">
      <h2>使用边界</h2>
      <div class="policy-card glass-card">
        <AppIcon name="shield" :size="24" />
        <div>
          <strong>不转存、不绕权、不代理视频流量</strong>
          <p>应用只通过分享页面允许的接口获取临时播放地址。若平台要求转存或会员权限，会明确提示，不会静默执行转存。</p>
        </div>
      </div>
    </section>

    <p class="version-label">云播 MVP · v0.2.0</p>
  </section>
</template>
