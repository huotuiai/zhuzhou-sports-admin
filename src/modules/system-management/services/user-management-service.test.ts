import type { SignedRequestConfig } from '@/lib/http'
import type { UserBasicInfoInput, UserCreateInput, UserQuery } from '../types'
import { describe, expect, it } from 'vitest'
import {
  createUserManagementService,
  mapApiDepartment,
  mapApiRole,
  mapApiUser,
  type ApiDepartmentVO,
  type ApiRoleVO,
  type ApiUserVO,
  type UserManagementDataRequester,
} from './user-management-service'

const timestamp = '2026-08-26T08:00:00+08:00'

function apiUser(overrides: Partial<ApiUserVO> = {}): ApiUserVO {
  return {
    id: '9007199254740993',
    create_at: timestamp,
    update_at: timestamp,
    username: 'venue_user',
    display_name: '场馆用户',
    mobile: '13800000001',
    email: null,
    avatar_url: null,
    is_super: 0,
    status: 1,
    login_fail_count: 0,
    must_change_password: 1,
    last_login_at: null,
    remark: null,
    role_ids: [11],
    role_names: ['场馆运营'],
    dept_ids: [21],
    dept_names: ['场馆运营部'],
    ...overrides,
  }
}

function apiDepartment(overrides: Partial<ApiDepartmentVO> = {}): ApiDepartmentVO {
  return {
    id: 21,
    create_at: timestamp,
    update_at: timestamp,
    parent_id: 0,
    name: '场馆运营部',
    leader_user_id: null,
    sort_order: 10,
    status: 1,
    remark: null,
    leader_name: null,
    user_count: 3,
    child_count: 1,
    ...overrides,
  }
}

function apiRole(overrides: Partial<ApiRoleVO> = {}): ApiRoleVO {
  return {
    id: 11,
    create_at: timestamp,
    update_at: timestamp,
    code: 'venue',
    name: '场馆运营',
    is_preset: 1,
    is_super: 0,
    sort_order: 10,
    status: 1,
    remark: '场馆业务角色',
    menu_ids: [101, 102],
    user_count: 3,
    ...overrides,
  }
}

function queuedRequester(responses: unknown[]) {
  const configs: SignedRequestConfig[] = []
  const request: UserManagementDataRequester = async <T, D>(config: SignedRequestConfig<D>): Promise<T> => {
    configs.push(config as unknown as SignedRequestConfig)
    return responses.shift() as T
  }
  return { configs, request }
}

describe('user management API service', () => {
  it('maps int64 identifiers and API view fields to browser-safe domain models', () => {
    expect(mapApiUser(apiUser({ status: 2, is_super: 1 }))).toMatchObject({
      id: '9007199254740993',
      name: '场馆用户',
      status: 'locked',
      builtIn: true,
      roleIds: ['11'],
      roleNames: ['场馆运营'],
      departmentIds: ['21'],
      departmentNames: ['场馆运营部'],
    })
    expect(mapApiDepartment(apiDepartment({ parent_id: '0', user_count: '3' }))).toMatchObject({
      id: '21', parentId: null, userCount: 3, childCount: 1,
    })
    expect(mapApiRole(apiRole({ is_super: 1, status: 0 }))).toMatchObject({
      id: '11', kind: 'super-admin', enabled: false, permissionIds: ['101', '102'],
    })
  })

  it('serializes server-side user filters and pagination exactly once', async () => {
    const { configs, request } = queuedRequester([{ list: [apiUser({ id: 1 })], total: '41', page: 2, page_size: 20 }])
    const service = createUserManagementService(request)
    const query: UserQuery = { keyword: ' 场馆 ', departmentId: '21', roleId: '11', status: 'locked' }

    const result = await service.listUsers(query, 2, 20)

    expect(result).toMatchObject({ total: 41, page: 2, pageSize: 20 })
    expect(configs[0]).toMatchObject({
      method: 'GET',
      url: 'api/v1/admin/users',
      params: { page: 2, page_size: 20, keyword: '场馆', dept_id: '21', role_id: '11', status: 2 },
    })
  })

  it('maps create and update forms without leaking confirmation or prototype-absent fields', async () => {
    const { configs, request } = queuedRequester([apiUser({ id: 1 }), apiUser({ id: 1, status: 2 })])
    const service = createUserManagementService(request)
    const createInput: UserCreateInput = {
      username: ' venue_user ', name: ' 场馆用户 ', phone: '', departmentIds: ['21'], roleIds: ['11'],
      password: 'Admin1234', confirmPassword: 'Admin1234',
    }
    const updateInput: UserBasicInfoInput = {
      name: '场馆负责人', phone: '', departmentIds: ['21'], roleIds: ['11'], status: 'locked',
    }

    await service.createUser(createInput)
    await service.updateUser('1', updateInput, { includeStatus: false })

    expect(configs[0]?.data).toEqual({
      username: 'venue_user', password: 'Admin1234', display_name: '场馆用户', role_ids: [11], dept_ids: [21],
    })
    expect(configs[1]).toMatchObject({
      method: 'PATCH', url: 'api/v1/admin/users/1',
      data: { display_name: '场馆负责人', mobile: '', role_ids: [11], dept_ids: [21] },
    })
  })

  it('uses dedicated status, password, unlock and delete endpoints', async () => {
    const { configs, request } = queuedRequester([apiUser({ id: 8, status: 0 }), { reset: true }, { unlocked: true }, { deleted: true }])
    const service = createUserManagementService(request)

    await service.changeUserStatus('8', 'disabled')
    await service.resetUserPassword('8', { password: 'Reset1234', confirmPassword: 'Reset1234' })
    await service.unlockUser('8')
    await service.deleteUser('8')

    expect(configs.map(config => [config.method, config.url, config.data])).toEqual([
      ['PATCH', 'api/v1/admin/users/8', { status: 0 }],
      ['POST', 'api/v1/admin/users/8/reset-password', { password: 'Reset1234' }],
      ['POST', 'api/v1/admin/users/8/unlock', {}],
      ['DELETE', 'api/v1/admin/users/8', undefined],
    ])
  })

  it('maps department roots and sends null when clearing the leader', async () => {
    const { configs, request } = queuedRequester([apiDepartment({ id: 30 }), apiDepartment({ id: 30, leader_user_id: null }), { deleted: true }])
    const service = createUserManagementService(request)
    const input = { parentId: null, name: '赛事保障组', ownerUserId: null, sort: 20, status: 'enabled' as const }

    await service.createDepartment(input)
    await service.updateDepartment('30', input)
    await service.deleteDepartment('30')

    expect(configs[0]?.data).toEqual({ parent_id: 0, name: '赛事保障组', sort_order: 20, status: 1 })
    expect(configs[1]?.data).toEqual({ parent_id: 0, name: '赛事保障组', leader_user_id: null, sort_order: 20, status: 1 })
    expect(configs[2]).toMatchObject({ method: 'DELETE', url: 'api/v1/admin/depts/30' })
  })

  it('maps paged role references without changing the role-management service', async () => {
    const { configs, request } = queuedRequester([{ list: [apiRole()], total: 1, page: 1, page_size: 100 }])
    const result = await createUserManagementService(request).listRoles(1, 100)
    expect(result.roles[0]).toMatchObject({ code: 'venue', kind: 'preset', enabled: true })
    expect(configs[0]).toMatchObject({ method: 'GET', url: 'api/v1/admin/roles', params: { page: 1, page_size: 100 } })
  })
})
