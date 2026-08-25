import type { AuthSession } from '@/types/auth'

export const AUTH_SESSION_KEY = 'zz-sports-session'
export const REMEMBERED_USERNAME_KEY = 'zz-sports-remembered-username'
export const TOKEN_REFRESH_THRESHOLD_MS = 5 * 60 * 1000

let memorySession: AuthSession | null | undefined

function getSessionStorage(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  }
  catch {
    return null
  }
}

function getLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  }
  catch {
    return null
  }
}

function isStoredSession(value: unknown): value is AuthSession {
  if (!value || typeof value !== 'object') return false
  const session = value as Partial<AuthSession>
  return typeof session.accessToken === 'string' && session.accessToken.length > 0 &&
    typeof session.tokenType === 'string' && typeof session.expiresAt === 'string' &&
    Boolean(session.user && typeof session.user.username === 'string') &&
    Array.isArray(session.roleIds) && Array.isArray(session.roleCodes) && Array.isArray(session.menus)
}

export function isAuthSessionExpired(session: AuthSession, now = Date.now()): boolean {
  const expiresAt = Date.parse(session.expiresAt)
  return !Number.isFinite(expiresAt) || expiresAt <= now
}

export function shouldRefreshAuthSession(session: AuthSession, now = Date.now()): boolean {
  return !isAuthSessionExpired(session, now) && Date.parse(session.expiresAt) - now <= TOKEN_REFRESH_THRESHOLD_MS
}

export function readAuthSession(): AuthSession | null {
  if (memorySession !== undefined) {
    if (memorySession && isAuthSessionExpired(memorySession)) clearAuthSession()
    return memorySession
  }

  const storage = getSessionStorage()
  const rawSession = storage?.getItem(AUTH_SESSION_KEY)
  if (!rawSession) {
    memorySession = null
    return null
  }

  try {
    const parsed: unknown = JSON.parse(rawSession)
    if (!isStoredSession(parsed) || isAuthSessionExpired(parsed)) throw new Error('Invalid auth session')
    memorySession = parsed
    return memorySession
  }
  catch {
    storage?.removeItem(AUTH_SESSION_KEY)
    memorySession = null
    return null
  }
}

export function writeAuthSession(session: AuthSession): void {
  memorySession = session
  getSessionStorage()?.setItem(AUTH_SESSION_KEY, JSON.stringify(session))
}

export function clearAuthSession(): void {
  memorySession = null
  getSessionStorage()?.removeItem(AUTH_SESSION_KEY)
}

export function getRememberedUsername(): string {
  return getLocalStorage()?.getItem(REMEMBERED_USERNAME_KEY) ?? ''
}

export function setRememberedUsername(username: string | null): void {
  const storage = getLocalStorage()
  if (!storage) return
  if (username) storage.setItem(REMEMBERED_USERNAME_KEY, username)
  else storage.removeItem(REMEMBERED_USERNAME_KEY)
}
