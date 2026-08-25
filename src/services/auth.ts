import type { SignedRequestConfig } from '@/lib/http'
import type {
  AuthCredentials,
  AuthMenu,
  AuthMenuType,
  AuthProfile,
  AuthService,
  AuthSession,
  AuthUser,
  AuthUserStatus,
} from '@/types/auth'
import { ApiError, requestData } from '@/lib/http'

interface ApiAdminUser {
  id: number | string
  username: string
  display_name?: string | null
  mobile?: string | null
  email?: string | null
  avatar_url?: string | null
  is_super?: number | boolean
  status?: number
  login_fail_count?: number
  must_change_password?: number | boolean
  last_login_at?: string | null
  remark?: string | null
  create_at?: string | null
  update_at?: string | null
}

interface ApiAuthMenu {
  id: number | string
  parent_id?: number | string | null
  name?: string
  menu_type?: number
  path?: string | null
  component?: string | null
  perms?: string | null
  icon?: string | null
  sort_order?: number
  visible?: number | boolean
  status?: number | boolean
  remark?: string | null
}

interface ApiAuthProfile {
  user: ApiAdminUser
  role_ids?: Array<number | string>
  role_codes?: string[]
  menus?: ApiAuthMenu[]
}

interface ApiAuthTokenResult extends ApiAuthProfile {
  access_token: string
  token_type?: string
  expires_in: number
}

export interface AuthDataRequester {
  <T, D = unknown>(config: SignedRequestConfig<D>): Promise<T>
}

function nullableText(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function integer(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) ? parsed : fallback
}

function userStatus(value: unknown): AuthUserStatus {
  const parsed = integer(value, 1)
  return parsed === 0 || parsed === 2 ? parsed : 1
}

function menuType(value: unknown): AuthMenuType {
  const parsed = integer(value, 2)
  return parsed === 1 || parsed === 3 ? parsed : 2
}

function flag(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value === 1
  return fallback
}

export function mapAuthUser(user: ApiAdminUser): AuthUser {
  if (user.id === undefined || typeof user.username !== 'string' || !user.username) {
    throw new ApiError('服务器返回的用户信息不完整', { kind: 'response' })
  }
  const displayName = nullableText(user.display_name)
  return {
    id: String(user.id),
    name: displayName || user.username,
    username: user.username,
    displayName,
    mobile: nullableText(user.mobile),
    email: nullableText(user.email),
    avatarUrl: nullableText(user.avatar_url),
    isSuper: flag(user.is_super, false),
    status: userStatus(user.status),
    loginFailCount: integer(user.login_fail_count),
    mustChangePassword: flag(user.must_change_password, false),
    lastLoginAt: nullableText(user.last_login_at),
    remark: nullableText(user.remark),
    createdAt: nullableText(user.create_at),
    updatedAt: nullableText(user.update_at),
  }
}

export function mapAuthMenu(menu: ApiAuthMenu): AuthMenu {
  if (menu.id === undefined) throw new ApiError('服务器返回的菜单信息不完整', { kind: 'response' })
  return {
    id: String(menu.id),
    parentId: menu.parent_id === null || menu.parent_id === undefined ? null : String(menu.parent_id),
    name: typeof menu.name === 'string' ? menu.name : '',
    menuType: menuType(menu.menu_type),
    path: nullableText(menu.path),
    component: nullableText(menu.component),
    permission: nullableText(menu.perms),
    icon: nullableText(menu.icon),
    sortOrder: integer(menu.sort_order),
    visible: flag(menu.visible, true),
    enabled: flag(menu.status, true),
    remark: nullableText(menu.remark),
  }
}

function ids(values: Array<number | string> | undefined, fallback: string[] = []): string[] {
  return values ? values.map(String) : fallback
}

function strings(values: string[] | undefined, fallback: string[] = []): string[] {
  return values ? values.filter((value): value is string => typeof value === 'string') : fallback
}

function menus(values: ApiAuthMenu[] | undefined, fallback: AuthMenu[] = []): AuthMenu[] {
  return values ? values.map(mapAuthMenu) : fallback
}

export function mapAuthProfile(result: ApiAuthProfile): AuthProfile {
  if (!result.user) throw new ApiError('服务器返回的认证信息不完整', { kind: 'response' })
  return {
    user: mapAuthUser(result.user),
    roleIds: ids(result.role_ids),
    roleCodes: strings(result.role_codes),
    menus: menus(result.menus),
  }
}

export function mapAuthTokenResult(
  result: ApiAuthTokenResult,
  previousSession?: AuthSession,
  now = Date.now(),
): AuthSession {
  const expiresIn = Number(result.expires_in)
  if (!result.access_token || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new ApiError('服务器返回的 Token 信息不完整', { kind: 'response' })
  }
  if (!result.user && !previousSession) {
    throw new ApiError('服务器返回的用户信息不完整', { kind: 'response' })
  }

  return {
    accessToken: result.access_token,
    tokenType: result.token_type || previousSession?.tokenType || 'Bearer',
    expiresAt: new Date(now + expiresIn * 1000).toISOString(),
    user: result.user ? mapAuthUser(result.user) : previousSession!.user,
    roleIds: ids(result.role_ids, previousSession?.roleIds),
    roleCodes: strings(result.role_codes, previousSession?.roleCodes),
    menus: menus(result.menus, previousSession?.menus),
  }
}

export function createAuthService(
  request: AuthDataRequester = requestData,
  now: () => number = Date.now,
): AuthService {
  return {
    async login(credentials) {
      const result = await request<ApiAuthTokenResult, AuthCredentials>({
        method: 'POST',
        url: 'api/v1/admin/auth/login',
        data: credentials,
        requiresAuth: false,
        skipAuthRefresh: true,
      })
      return mapAuthTokenResult(result, undefined, now())
    },

    async getProfile() {
      const result = await request<ApiAuthProfile>({
        method: 'GET',
        url: 'api/v1/admin/auth/me',
      })
      return mapAuthProfile(result)
    },

    async refresh(currentSession) {
      const result = await request<ApiAuthTokenResult, Record<string, never>>({
        method: 'POST',
        url: 'api/v1/admin/auth/refresh',
        data: {},
        skipAuthRefresh: true,
        skipUnauthorizedRedirect: true,
      })
      return mapAuthTokenResult(result, currentSession, now())
    },

    async logout() {
      await request<{ logged_out: boolean }, Record<string, never>>({
        method: 'POST',
        url: 'api/v1/admin/auth/logout',
        data: {},
        skipAuthRefresh: true,
        skipUnauthorizedRedirect: true,
      })
    },
  }
}

export const authService = createAuthService()
