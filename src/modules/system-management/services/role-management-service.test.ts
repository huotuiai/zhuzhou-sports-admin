import type { SignedRequestConfig } from '@/lib/http'
import type { RoleCreateInput, RolePermissionInput, RoleQuery } from '../types'
import { describe, expect, it } from 'vitest'
import {
  createRoleManagementService,
  mapApiMenu,
} from './role-management-service'
import type {
  ApiMenuVO,
  RoleManagementDataRequester,
} from './role-management-service'
import type { ApiRoleVO, ApiUserVO } from './user-management-service'

const timestamp = '2026-08-26T00:00:00.000Z'

function apiRole(overrides: Partial<ApiRoleVO> = {}): ApiRoleVO {
  return {
    id: 11,
    create_at: timestamp,
    update_at: timestamp,
    code: 'venue',
    name: '场馆运营',
    is_preset: 0,
    is_super: 0,
    sort_order: 10,
    status: 1,
    remark: '场馆业务角色',
    menu_ids: [101, 102],
    user_count: 3,
    ...overrides,
  }
}

function apiMenu(overrides: Partial<ApiMenuVO> = {}): ApiMenuVO {
  return {
    id: '9007199254740993',
    parent_id: 0,
    name: '用户管理',
    menu_type: 2,
    path: '/system/users',
    component: null,
    perms: 'system:user:list',
    icon: null,
    sort_order: 20,
    visible: 1,
    status: 1,
    remark: null,
    ...overrides,
  }
}

function apiUser(overrides: Partial<ApiUserVO> = {}): ApiUserVO {
  return {
    id: 31,
    create_at: timestamp,
    update_at: timestamp,
    username: 'venue_user',
    display_name: '场馆用户',
    mobile: null,
    email: null,
    avatar_url: null,
    is_super: 0,
    status: 1,
    login_fail_count: 0,
    must_change_password: 0,
    last_login_at: null,
    remark: null,
    role_ids: [11],
    role_names: ['场馆运营'],
    dept_ids: [],
    dept_names: [],
    ...overrides,
  }
}

function queuedRequester(responses: unknown[]) {
  const configs: SignedRequestConfig[] = []
  const request: RoleManagementDataRequester = async <T, D>(config: SignedRequestConfig<D>): Promise<T> => {
    configs.push(config as unknown as SignedRequestConfig)
    return responses.shift() as T
  }
  return { configs, request }
}

describe('role management API service', () => {
  it('maps dynamic menus and preserves int64 identifiers as strings', () => {
    expect(mapApiMenu(apiMenu())).toEqual({
      id: '9007199254740993',
      parentId: null,
      name: '用户管理',
      code: 'system:user:list',
      type: 'page',
      sort: 20,
    })
    expect(mapApiMenu(apiMenu({ id: 102, parent_id: 101, menu_type: 3, perms: null, path: null }))).toMatchObject({
      id: '102', parentId: '101', code: 'menu:102', type: 'action',
    })
  })

  it('keeps role menus and submitted grants limited to real API records during the navigation transition', async () => {
    const menuRecords = [
      apiMenu({ id: 1, name: '运营管理', menu_type: 1, path: null, perms: null, sort_order: 10 }),
      apiMenu({ id: 10, parent_id: 1, name: '数据展示', path: '/', perms: 'dashboard:view', sort_order: 10 }),
      apiMenu({ id: 11, parent_id: 10, name: '导出', menu_type: 3, path: null, perms: 'dashboard:export', visible: 0 }),
      apiMenu({ id: 13, parent_id: 1, name: '数据大屏', path: '/operations/data-screen', perms: 'dashboard:view' }),
    ]
    const { configs, request } = queuedRequester([
      menuRecords,
      apiRole({ menu_ids: [1, 10, 11, 13] }),
      apiRole({ menu_ids: [1, 10, 11, 13] }),
    ])
    const service = createRoleManagementService(request)

    const permissions = await service.listMenus()
    const permissionIds = permissions.map(permission => permission.id)
    await service.createRole({ name: '运营管理', description: '', permissionIds })
    await service.replaceRoleMenus('11', { permissionIds })

    expect(permissions).toEqual([
      { id: '1', parentId: null, name: '运营管理', code: 'menu:1', type: 'group', sort: 10 },
      { id: '10', parentId: '1', name: '运营数据', code: 'dashboard:view', type: 'page', sort: 10 },
      { id: '11', parentId: '10', name: '导出', code: 'dashboard:export', type: 'action', sort: 20 },
      { id: '13', parentId: '1', name: '数据大屏', code: 'dashboard:view', type: 'page', sort: 20 },
    ])
    expect(configs[1]?.data).toEqual({ name: '运营管理', remark: '', menu_ids: [1, 10, 11, 13] })
    expect(configs[2]?.data).toEqual({ menu_ids: [1, 10, 11, 13] })
    expect(menuRecords[1]?.name).toBe('数据展示')
  })

  it('preserves a future server-provided directory and independent security permission', async () => {
    const { request } = queuedRequester([[
      apiMenu({ id: 200, parent_id: 1, name: '数据展示', menu_type: 1, path: null, perms: null }),
      apiMenu({ id: 10, parent_id: 200, name: '运营数据', path: '/', perms: 'dashboard:view' }),
      apiMenu({ id: 201, parent_id: 200, name: '安保数据', path: '/operations/security-data', perms: 'security:view' }),
    ]])

    expect(await createRoleManagementService(request).listMenus()).toEqual([
      { id: '200', parentId: '1', name: '数据展示', code: 'menu:200', type: 'group', sort: 20 },
      { id: '10', parentId: '200', name: '运营数据', code: 'dashboard:view', type: 'page', sort: 20 },
      { id: '201', parentId: '200', name: '安保数据', code: 'security:view', type: 'page', sort: 20 },
    ])
  })

  it('uses server-side role keyword pagination and maps API counts', async () => {
    const { configs, request } = queuedRequester([{ list: [apiRole()], total: '41', page: 2, page_size: 20 }])
    const query: RoleQuery = { keyword: ' 场馆 ' }

    const result = await createRoleManagementService(request).listRoles(query, 2, 20)

    expect(result).toMatchObject({ total: 41, page: 2, pageSize: 20 })
    expect(result.roles[0]).toMatchObject({ id: '11', userCount: 3, permissionIds: ['101', '102'] })
    expect(configs[0]).toMatchObject({
      method: 'GET', url: 'api/v1/admin/roles', params: { page: 2, page_size: 20, keyword: '场馆' },
    })
  })

  it('sends only prototype fields for create and basic edit', async () => {
    const { configs, request } = queuedRequester([apiRole(), apiRole({ name: '场馆保障' })])
    const service = createRoleManagementService(request)
    const input: RoleCreateInput = { name: ' 场馆运营 ', description: ' 负责场馆 ', permissionIds: ['101', '102'] }

    await service.createRole(input)
    await service.updateRole('11', { name: ' 场馆保障 ', description: '' })

    expect(configs[0]).toMatchObject({
      method: 'POST', url: 'api/v1/admin/roles',
      data: { name: '场馆运营', remark: '负责场馆', menu_ids: [101, 102] },
    })
    expect(configs[1]).toMatchObject({
      method: 'PATCH', url: 'api/v1/admin/roles/11',
      data: { name: '场馆保障', remark: '' },
    })
    expect(configs[1]?.data).not.toHaveProperty('code')
    expect(configs[1]?.data).not.toHaveProperty('status')
    expect(configs[1]?.data).not.toHaveProperty('menu_ids')
  })

  it('uses detail, delete, menu and role-user endpoints with full replacements', async () => {
    const { configs, request } = queuedRequester([
      apiRole(),
      { deleted: true },
      [apiMenu({ id: 101 })],
      apiRole({ menu_ids: [101] }),
      [apiUser()],
      { updated: true },
    ])
    const service = createRoleManagementService(request)
    const permissions: RolePermissionInput = { permissionIds: ['101'] }

    await service.getRole('11')
    await service.deleteRole('11')
    await service.listMenus()
    await service.replaceRoleMenus('11', permissions)
    await service.listRoleUsers('11')
    await service.replaceRoleUsers('11', ['31', '32'])

    expect(configs.map(config => [config.method, config.url, config.data])).toEqual([
      ['GET', 'api/v1/admin/roles/11', undefined],
      ['DELETE', 'api/v1/admin/roles/11', undefined],
      ['GET', 'api/v1/admin/menus', undefined],
      ['PUT', 'api/v1/admin/roles/11/menus', { menu_ids: [101] }],
      ['GET', 'api/v1/admin/roles/11/users', undefined],
      ['PUT', 'api/v1/admin/roles/11/users', { user_ids: [31, 32] }],
    ])
  })

  it('rejects IDs that cannot be represented safely in a JSON number', async () => {
    const service = createRoleManagementService(queuedRequester([]).request)

    await expect(service.replaceRoleUsers('11', ['9007199254740993'])).rejects.toThrow('安全提交')
    await expect(service.createRole({ name: '测试角色', description: '', permissionIds: ['9007199254740993'] })).rejects.toThrow('安全提交')
  })
})
