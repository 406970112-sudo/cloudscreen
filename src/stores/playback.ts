import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { PlaybackSession } from '../types/domain'

export const usePlaybackStore = defineStore('playback', () => {
  const session = ref<PlaybackSession>()

  function setSession(nextSession: PlaybackSession): void {
    session.value = nextSession
  }

  function clearSession(): void {
    session.value = undefined
  }

  return { session, setSession, clearSession }
})
