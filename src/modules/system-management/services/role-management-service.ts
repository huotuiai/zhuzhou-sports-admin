import type { SignedRequestConfig } from '@/lib/http'
import type {
  RoleManagementService,
  RolePage,
  RoleQuery,
  SystemPermission,
} from '../types'
import { ApiError, requestData } from '@/lib/http'
import { mapApiRole, mapApiUser } from './user-management-service'
import type { ApiRoleVO, ApiUserVO } from './user-management-service'

export interface ApiMenuVO {
  id: number | string
  parent_id: number | string | null
  name: string
  menu_type: number
  path: string | null
  component: string | null
  perms: string | null
  icon: string | null
  sort_order: number
  visible: number
  status: number
  remark: string | null
}

interface ApiPage<T> {
  list: T[]
  total: number | string
  page: number
  page_size: number
}

interface ApiRoleCreateRequest {
  name: string
  remark: string
  menu_ids: number[]
}

interface ApiRoleUpdateRequest {
  name: string
  remark: string
}

interface ApiIdListRequest {
  menu_ids?: number[]
  user_ids?: number[]
}

export interface RoleManagementDataRequester {
  <T, D = unknown>(config: SignedRequestConfig<D>): Promise<T>
}

function responseError(message: string): ApiError {
  return new ApiError(message, { kind: 'response' })
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value) throw responseError(`服务器返回的${field}不完整`)
  return value
}

function integer(value: unknown, fallback = 0): number {
  const result = Number(value)
  return Number.isInteger(result) ? result : fallback
}

function nonNegativeInteger(value: unknown): number {
  return Math.max(0, integer(value))
}

function bodyId(value: string): number {
  const result = Number(value)
  if (!Number.isSafeInteger(result) || result <= 0) {
    throw new ApiError('接口 ID 超出浏览器可安全提交的范围', { kind: 'configuration' })
  }
  return result
}

function endpoint(path: string, id: string, suffix = ''): string {
  return `${path}/${encodeURIComponent(id)}${suffix}`
}

function menuType(value: unknown): SystemPermission['type'] {
  if (integer(value) === 1) return 'group'
  if (integer(value) === 2) return 'page'
  if (integer(value) === 3) return 'action'
  throw responseError('服务器返回的菜单类型无效')
}

export function mapApiMenu(value: ApiMenuVO): SystemPermission {
  if (value.id === undefined || value.id === null) throw responseError('服务器返回的菜单 ID 不完整')
  const id = String(value.id)
  const parentId = value.parent_id === undefined || value.parent_id === null || String(value.parent_id) === '0'
    ? null
    : String(value.parent_id)
  const path = typeof value.path === 'string' ? value.path : ''
  const perms = typeof value.perms === 'string' ? value.perms : ''
  return {
    id,
    parentId,
    name: requiredText(value.name, '菜单名称'),
    code: perms || path || `menu:${id}`,
    type: menuType(value.menu_type),
    sort: integer(value.sort_order),
  }
}

function mapRolePage(value: ApiPage<ApiRoleVO>): RolePage {
  return {
    roles: Array.isArray(value.list) ? value.list.map(mapApiRole) : [],
    total: nonNegativeInteger(value.total),
    page: Math.max(1, integer(value.page, 1)),
    pageSize: Math.max(1, integer(value.page_size, 20)),
  }
}

export function createRoleManagementService(
  request: RoleManagementDataRequester = requestData,
): RoleManagementService {
  return {
    async listRoles(query: RoleQuery, page: number, pageSize: number) {
      const params: Record<string, string | number> = { page, page_size: pageSize }
      const keyword = query.keyword.trim().normalize('NFKC')
      if (keyword) params.keyword = keyword
      return mapRolePage(await request<ApiPage<ApiRoleVO>>({
        method: 'GET',
        url: 'api/v1/admin/roles',
        params,
      }))
    },

    async getRole(id) {
      return mapApiRole(await request<ApiRoleVO>({
        method: 'GET',
        url: endpoint('api/v1/admin/roles', id),
      }))
    },

    async createRole(input) {
      const data: ApiRoleCreateRequest = {
        name: input.name.trim().normalize('NFKC'),
        remark: input.description.trim().normalize('NFKC'),
        menu_ids: input.permissionIds.map(bodyId),
      }
      return mapApiRole(await request<ApiRoleVO, ApiRoleCreateRequest>({
        method: 'POST',
        url: 'api/v1/admin/roles',
        data,
      }))
    },

    async updateRole(id, input) {
      const data: ApiRoleUpdateRequest = {
        name: input.name.trim().normalize('NFKC'),
        remark: input.description.trim().normalize('NFKC'),
      }
      return mapApiRole(await request<ApiRoleVO, ApiRoleUpdateRequest>({
        method: 'PATCH',
        url: endpoint('api/v1/admin/roles', id),
        data,
      }))
    },

    async deleteRole(id) {
      await request<{ deleted: boolean }>({
        method: 'DELETE',
        url: endpoint('api/v1/admin/roles', id),
      })
    },

    async listMenus() {
      const result = await request<ApiMenuVO[]>({ method: 'GET', url: 'api/v1/admin/menus' })
      return Array.isArray(result) ? result.map(mapApiMenu) : []
    },

    async replaceRoleMenus(id, input) {
      const data = { menu_ids: input.permissionIds.map(bodyId) }
      return mapApiRole(await request<ApiRoleVO, ApiIdListRequest>({
        method: 'PUT',
        url: endpoint('api/v1/admin/roles', id, '/menus'),
        data,
      }))
    },

    async listRoleUsers(id) {
      const result = await request<ApiUserVO[]>({
        method: 'GET',
        url: endpoint('api/v1/admin/roles', id, '/users'),
      })
      return Array.isArray(result) ? result.map(mapApiUser) : []
    },

    async replaceRoleUsers(id, userIds) {
      const data = { user_ids: userIds.map(bodyId) }
      await request<{ updated: boolean }, ApiIdListRequest>({
        method: 'PUT',
        url: endpoint('api/v1/admin/roles', id, '/users'),
        data,
      })
    },
  }
}

export const roleManagementService = createRoleManagementService()
