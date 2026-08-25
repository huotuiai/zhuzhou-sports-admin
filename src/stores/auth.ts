import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { AuthCredentials, AuthService, AuthSession } from '@/types/auth'
import {
  clearAuthSession,
  getRememberedUsername as readRememberedUsername,
  readAuthSession,
  setRememberedUsername,
  writeAuthSession,
} from '@/lib/auth-session'
import { ApiError } from '@/lib/http'
import { authService } from '@/services/auth'

export function createAuthStore(service: AuthService, storeId = 'auth') {
  return defineStore(storeId, () => {
    const session = ref<AuthSession | null>(readAuthSession())
    const isLoading = ref(false)
    const isInitializing = ref(false)
    const isInitialized = ref(false)
    const isAuthenticated = computed(() => session.value !== null)
    const user = computed(() => session.value?.user ?? null)
    let initializePromise: Promise<void> | null = null
    let refreshPromise: Promise<void> | null = null

    function setSession(nextSession: AuthSession): void {
      session.value = nextSession
      writeAuthSession(nextSession)
    }

    function clearSession(): void {
      session.value = null
      clearAuthSession()
    }

    async function login(credentials: AuthCredentials, rememberUsername: boolean) {
      isLoading.value = true
      try {
        const nextSession = await service.login(credentials)
        setSession(nextSession)
        setRememberedUsername(rememberUsername ? credentials.username : null)
        isInitialized.value = true
      } finally {
        isLoading.value = false
      }
    }

    async function logout() {
      try {
        if (session.value) await service.logout()
      }
      catch {
        // 服务端为无状态 JWT，退出失败也必须结束本地会话。
      }
      finally {
        clearSession()
        isInitialized.value = true
      }
    }

    function getRememberedUsername() {
      return readRememberedUsername()
    }

    async function refresh(): Promise<void> {
      if (refreshPromise) return refreshPromise
      const currentSession = session.value ?? readAuthSession()
      if (!currentSession) throw new ApiError('登录状态已失效，请重新登录', { code: 40100, kind: 'auth' })

      refreshPromise = service.refresh(currentSession)
        .then(setSession)
        .finally(() => {
          refreshPromise = null
        })
      return refreshPromise
    }

    async function initialize(): Promise<void> {
      if (isInitialized.value) return
      if (initializePromise) return initializePromise

      isInitializing.value = true
      initializePromise = (async () => {
        const currentSession = readAuthSession()
        session.value = currentSession
        if (!currentSession) return

        try {
          const profile = await service.getProfile()
          const activeSession = session.value ?? readAuthSession()
          if (activeSession) setSession({ ...activeSession, ...profile })
        }
        catch {
          clearSession()
        }
      })().finally(() => {
        isInitializing.value = false
        isInitialized.value = true
        initializePromise = null
      })
      return initializePromise
    }

    return {
      session,
      user,
      isLoading,
      isInitializing,
      isInitialized,
      isAuthenticated,
      login,
      logout,
      refresh,
      initialize,
      clearSession,
      getRememberedUsername,
    }
  })
}

export const useAuthStore = createAuthStore(authService)
