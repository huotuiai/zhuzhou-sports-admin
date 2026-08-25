import type { SignedRequestConfig } from '@/lib/http'
import type { AuthDataRequester } from './auth'
import { describe, expect, it } from 'vitest'
import { createAuthService, mapAuthTokenResult } from './auth'

const user = {
  id: 9_007_199_254_740_990,
  username: 'operator',
  display_name: '运营管理员',
  mobile: null,
  email: 'operator@example.com',
  avatar_url: null,
  is_super: 0,
  status: 1,
  login_fail_count: 0,
  must_change_password: 1,
  last_login_at: null,
  remark: null,
  create_at: '2026-08-01T00:00:00+08:00',
  update_at: '2026-08-02T00:00:00+08:00',
}

const tokenResult = {
  access_token: 'access-token',
  token_type: 'Bearer',
  expires_in: 3600,
  user,
  role_ids: [12],
  role_codes: ['operator'],
  menus: [{
    id: 21,
    parent_id: 0,
    name: '数据看板',
    menu_type: 2,
    path: '/',
    component: 'DataDashboardView',
    perms: 'stats:view',
    icon: 'chart',
    sort_order: 1,
    visible: 1,
    status: 1,
    remark: null,
  }],
}

describe('auth service', () => {
  it('maps token, profile and int64 identifiers to the application session', () => {
    const mapped = mapAuthTokenResult(tokenResult, undefined, Date.parse('2026-08-25T00:00:00.000Z'))
    expect(mapped).toMatchObject({
      accessToken: 'access-token',
      tokenType: 'Bearer',
      expiresAt: '2026-08-25T01:00:00.000Z',
      user: { username: 'operator', name: '运营管理员', mustChangePassword: true },
      roleIds: ['12'],
      roleCodes: ['operator'],
      menus: [{ id: '21', parentId: '0', permission: 'stats:view', enabled: true }],
    })
    expect(typeof mapped.user.id).toBe('string')
  })

  it('preserves menus when refresh omits them', () => {
    const previous = mapAuthTokenResult(tokenResult)
    const refreshed = mapAuthTokenResult({
      ...tokenResult,
      access_token: 'refreshed-token',
      menus: undefined,
    }, previous)
    expect(refreshed.accessToken).toBe('refreshed-token')
    expect(refreshed.menus).toEqual(previous.menus)
  })

  it('calls all four authentication endpoints with the correct auth controls', async () => {
    const calls: Array<Pick<SignedRequestConfig, 'method' | 'url' | 'requiresAuth' | 'skipAuthRefresh' | 'skipUnauthorizedRedirect'>> = []
    const requester: AuthDataRequester = async <T, D = unknown>(config: SignedRequestConfig<D>): Promise<T> => {
      calls.push({
        method: config.method,
        url: config.url,
        requiresAuth: config.requiresAuth,
        skipAuthRefresh: config.skipAuthRefresh,
        skipUnauthorizedRedirect: config.skipUnauthorizedRedirect,
      })
      if (config.url?.endsWith('/me')) {
        return { user, role_ids: [12], role_codes: ['operator'], menus: tokenResult.menus } as T
      }
      if (config.url?.endsWith('/logout')) return { logged_out: true } as T
      return tokenResult as T
    }
    const service = createAuthService(requester, () => Date.parse('2026-08-25T00:00:00.000Z'))
    const loggedIn = await service.login({ username: 'operator', password: 'password' })
    await service.getProfile()
    await service.refresh(loggedIn)
    await service.logout()

    expect(calls.map(({ method, url }) => [method, url])).toEqual([
      ['POST', 'api/v1/admin/auth/login'],
      ['GET', 'api/v1/admin/auth/me'],
      ['POST', 'api/v1/admin/auth/refresh'],
      ['POST', 'api/v1/admin/auth/logout'],
    ])
    expect(calls[0]).toMatchObject({ requiresAuth: false, skipAuthRefresh: true })
    expect(calls[2]).toMatchObject({ skipAuthRefresh: true, skipUnauthorizedRedirect: true })
    expect(calls[3]).toMatchObject({ skipAuthRefresh: true, skipUnauthorizedRedirect: true })
  })
})
