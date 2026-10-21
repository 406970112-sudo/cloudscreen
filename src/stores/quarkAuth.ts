import { ref } from 'vue'
import { defineStore } from 'pinia'
import {
  clearQuarkLogin,
  hasQuarkLogin,
  loginToQuark,
} from '../services/quarkAuth'

export const useQuarkAuthStore = defineStore('quark-auth', () => {
  const loggedIn = ref(false)
  const checking = ref(false)
  const busy = ref(false)
  const error = ref('')

  async function refresh(): Promise<void> {
    checking.value = true
    try {
      loggedIn.value = await hasQuarkLogin()
    } finally {
      checking.value = false
    }
  }

  async function login(): Promise<boolean> {
    error.value = ''
    busy.value = true
    try {
      await loginToQuark()
      loggedIn.value = true
      return true
    } catch (loginError) {
      error.value = loginError instanceof Error ? loginError.message : '夸克登录失败'
      loggedIn.value = await hasQuarkLogin()
      return false
    } finally {
      busy.value = false
    }
  }

  async function logout(): Promise<void> {
    await clearQuarkLogin()
    loggedIn.value = false
    error.value = ''
  }

  return { loggedIn, checking, busy, error, refresh, login, logout }
})
