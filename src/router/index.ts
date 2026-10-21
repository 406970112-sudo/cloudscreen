import { createRouter, createWebHashHistory } from 'vue-router'
import ImportView from '../views/ImportView.vue'
import LibraryView from '../views/LibraryView.vue'
import SettingsView from '../views/SettingsView.vue'
import ResourceView from '../views/ResourceView.vue'
import PlayerView from '../views/PlayerView.vue'
import ShareBrowserView from '../views/ShareBrowserView.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'import', component: ImportView, meta: { showNav: true } },
    { path: '/library', name: 'library', component: LibraryView, meta: { showNav: true } },
    { path: '/settings', name: 'settings', component: SettingsView, meta: { showNav: true } },
    { path: '/share', name: 'share-browser', component: ShareBrowserView, meta: { showNav: false } },
    { path: '/resource/:id', name: 'resource', component: ResourceView, meta: { showNav: false } },
    { path: '/player/:id', name: 'player', component: PlayerView, meta: { showNav: false } },
  ],
  scrollBehavior: () => ({ top: 0 }),
})
