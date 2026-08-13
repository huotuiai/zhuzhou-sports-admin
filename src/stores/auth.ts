import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { mockAuthService } from '@/services/auth'
import type { AuthCredentials, AuthSession } from '@/types/auth'

const SESSION_KEY = 'zz-sports-session'
const REMEMBERED_USERNAME_KEY = 'zz-sports-remembered-username'

function readSession(): AuthSession | null {
  const rawSession = sessionStorage.getItem(SESSION_KEY)
  if (!rawSession) return null

  try {
    const parsed = JSON.parse(rawSession) as Partial<AuthSession>
    if (!parsed.token || !parsed.expiresAt || !parsed.user) return null
    if (new Date(parsed.expiresAt).getTime() <= Date.now()) {
      sessionStorage.removeItem(SESSION_KEY)
      return null
    }
    return parsed as AuthSession
  } catch {
    sessionStorage.removeItem(SESSION_KEY)
    return null
  }
}

export const useAuthStore = defineStore('auth', () => {
  const session = ref<AuthSession | null>(readSession())
  const isLoading = ref(false)
  const isAuthenticated = computed(() => session.value !== null)
  const user = computed(() => session.value?.user ?? null)

  async function login(credentials: AuthCredentials, rememberUsername: boolean) {
    isLoading.value = true
    try {
      const nextSession = await mockAuthService.login(credentials)
      session.value = nextSession
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(nextSession))

      if (rememberUsername) {
        localStorage.setItem(REMEMBERED_USERNAME_KEY, credentials.username)
      } else {
        localStorage.removeItem(REMEMBERED_USERNAME_KEY)
      }
    } finally {
      isLoading.value = false
    }
  }

  async function logout() {
    await mockAuthService.logout()
    session.value = null
    sessionStorage.removeItem(SESSION_KEY)
  }

  function getRememberedUsername() {
    return localStorage.getItem(REMEMBERED_USERNAME_KEY) ?? ''
  }

  return { session, user, isLoading, isAuthenticated, login, logout, getRememberedUsername }
})
