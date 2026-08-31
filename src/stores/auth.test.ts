import type { AuthCredentials, AuthProfile, AuthService, AuthSession } from '@/types/auth'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  AUTH_SESSION_KEY,
  clearAuthSession,
  writeAuthSession,
} from '@/lib/auth-session'
import { createAuthStore } from './auth'

const menus = [
  {
    id: '1', parentId: '0', name: '场地管理', menuType: 1 as const, path: null, component: null,
    permission: null, icon: null, sortOrder: 10, visible: true, enabled: true, remark: null,
  },
  {
    id: '2', parentId: '1', name: 'VR 导航', menuType: 2 as const, path: '/vr-links', component: null,
    permission: 'vr:view', icon: 'VR', sortOrder: 10, visible: true, enabled: true, remark: null,
  },
  {
    id: '3', parentId: '2', name: '操作', menuType: 3 as const, path: null, component: null,
    permission: 'vr:operate', icon: null, sortOrder: 10, visible: false, enabled: true, remark: null,
  },
]

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()

  get length(): number { return this.values.size }
  clear(): void { this.values.clear() }
  getItem(key: string): string | null { return this.values.get(key) ?? null }
  key(index: number): string | null { return Array.from(this.values.keys())[index] ?? null }
  removeItem(key: string): void { this.values.delete(key) }
  setItem(key: string, value: string): void { this.values.set(key, value) }
}

function authSession(patch: Partial<AuthSession> = {}): AuthSession {
  return {
    accessToken: 'token-1',
    tokenType: 'Bearer',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    user: { id: '1', username: 'admin', name: '管理员' },
    roleIds: ['1'],
    roleCodes: ['super'],
    menus: [],
    ...patch,
  }
}

class StubAuthService implements AuthService {
  nextSession = authSession()
  profile: AuthProfile = {
    user: { id: '1', username: 'admin', name: '已校验管理员' },
    roleIds: ['2'],
    roleCodes: ['operator'],
    menus: [],
  }
  loginCalls: AuthCredentials[] = []
  profileCalls = 0
  profileDelayMs = 0
  profileFails = false
  refreshCalls = 0
  logoutFails = false

  async login(credentials: AuthCredentials): Promise<AuthSession> {
    this.loginCalls.push(credentials)
    return this.nextSession
  }

  async getProfile(): Promise<AuthProfile> {
    this.profileCalls += 1
    if (this.profileFails) throw new Error('me 请求失败')
    if (this.profileDelayMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, this.profileDelayMs))
    }
    return this.profile
  }

  async refresh(currentSession: AuthSession): Promise<AuthSession> {
    this.refreshCalls += 1
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    return { ...currentSession, accessToken: 'token-refreshed' }
  }

  async logout(): Promise<void> {
    if (this.logoutFails) throw new Error('退出请求失败')
  }
}

describe('auth store', () => {
  let service: StubAuthService
  let browserSessionStorage: MemoryStorage
  let browserLocalStorage: MemoryStorage

  beforeEach(() => {
    browserSessionStorage = new MemoryStorage()
    browserLocalStorage = new MemoryStorage()
    vi.stubGlobal('sessionStorage', browserSessionStorage)
    vi.stubGlobal('localStorage', browserLocalStorage)
    clearAuthSession()
    setActivePinia(createPinia())
    service = new StubAuthService()
  })

  it('logs in, persists the session and remembers only the username', async () => {
    const store = createAuthStore(service, 'auth-login-test')()
    await store.login({ username: 'admin', password: 'secret' }, true)

    expect(store.isAuthenticated).toBe(true)
    expect(JSON.parse(browserSessionStorage.getItem(AUTH_SESSION_KEY)!)).toMatchObject({ accessToken: 'token-1' })
    expect(service.profileCalls).toBe(1)
    expect(browserLocalStorage.getItem('zz-sports-remembered-username')).toBe('admin')
    expect(browserLocalStorage.getItem('password')).toBeNull()
  })

  it('derives permissions, page access and dynamic navigation from the active profile', async () => {
    service.profile = {
      user: { id: '1', username: 'operator', name: '运营员', isSuper: false },
      roleIds: ['2'],
      roleCodes: ['operator'],
      menus,
    }
    const store = createAuthStore(service, 'auth-access-test')()
    await store.login({ username: 'operator', password: 'secret' }, false)

    expect(store.permissionCodes).toEqual(['vr:operate', 'vr:view'])
    expect(store.hasPermission('vr:operate')).toBe(true)
    expect(store.hasPermission('vr:export')).toBe(false)
    expect(store.canAccessPath('/vr-links?status=enabled')).toBe(true)
    expect(store.canAccessPath('/ticket-gates')).toBe(false)
    expect(store.authorizedNavigation[0]?.items[0]?.label).toBe('VR 导航')
    expect(store.firstAccessibleRoute).toEqual({ name: 'vr-link-management' })
  })

  it('clears the provisional token when me validation fails after login', async () => {
    service.profileFails = true
    const store = createAuthStore(service, 'auth-login-profile-failure-test')()

    await expect(store.login({ username: 'admin', password: 'secret' }, true)).rejects.toThrow('me 请求失败')

    expect(store.isAuthenticated).toBe(false)
    expect(browserSessionStorage.getItem(AUTH_SESSION_KEY)).toBeNull()
    expect(browserLocalStorage.getItem('zz-sports-remembered-username')).toBeNull()
  })

  it('validates a restored session through me only once and merges the profile', async () => {
    writeAuthSession(authSession())
    const store = createAuthStore(service, 'auth-initialize-test')()

    await Promise.all([store.initialize(), store.initialize()])
    expect(service.profileCalls).toBe(1)
    expect(store.user?.name).toBe('已校验管理员')
    expect(store.session?.accessToken).toBe('token-1')
    expect(store.session?.roleCodes).toEqual(['operator'])
    expect(store.isInitialized).toBe(true)
  })

  it('deduplicates concurrent refreshes and stores the new token', async () => {
    writeAuthSession(authSession())
    const store = createAuthStore(service, 'auth-refresh-test')()

    await Promise.all([store.refresh(), store.refresh(), store.refresh()])
    expect(service.refreshCalls).toBe(1)
    expect(store.session?.accessToken).toBe('token-refreshed')
  })

  it('keeps a token refreshed while the restored profile is being validated', async () => {
    writeAuthSession(authSession())
    service.profileDelayMs = 10
    const store = createAuthStore(service, 'auth-initialize-refresh-test')()

    const initialization = store.initialize()
    await store.refresh()
    await initialization

    expect(store.session?.accessToken).toBe('token-refreshed')
    expect(store.user?.name).toBe('已校验管理员')
  })

  it('clears the local session even when logout request fails', async () => {
    writeAuthSession(authSession())
    service.logoutFails = true
    const store = createAuthStore(service, 'auth-logout-test')()

    await expect(store.logout()).resolves.toBeUndefined()
    expect(store.isAuthenticated).toBe(false)
    expect(browserSessionStorage.getItem(AUTH_SESSION_KEY)).toBeNull()
  })

  it('drops an expired stored session before initialization', async () => {
    writeAuthSession(authSession({ expiresAt: new Date(Date.now() - 1_000).toISOString() }))
    const store = createAuthStore(service, 'auth-expired-test')()
    await store.initialize()

    expect(store.isAuthenticated).toBe(false)
    expect(service.profileCalls).toBe(0)
  })
})
