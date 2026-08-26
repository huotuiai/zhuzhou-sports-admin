import type { SignedRequestConfig } from '@/lib/http'
import type {
  RolePage,
  SystemDepartment,
  SystemRole,
  SystemUser,
  UserManagementService,
  UserPage,
  UserStatus,
} from '../types'
import { ApiError, requestData } from '@/lib/http'

export interface ApiUserVO {
  id: number | string
  create_at: string
  update_at: string
  username: string
  display_name: string | null
  mobile: string | null
  email: string | null
  avatar_url: string | null
  is_super: number | boolean
  status: number
  login_fail_count: number
  must_change_password: number | boolean
  last_login_at: string | null
  remark: string | null
  role_ids: Array<number | string>
  role_names: string[]
  dept_ids: Array<number | string>
  dept_names: string[]
}

export interface ApiDepartmentVO {
  id: number | string
  create_at: string
  update_at: string
  parent_id: number | string | null
  name: string
  leader_user_id: number | string | null
  sort_order: number
  status: number
  remark: string | null
  leader_name: string | null
  user_count: number | string
  child_count: number | string
}

export interface ApiRoleVO {
  id: number | string
  create_at: string
  update_at: string
  code: string
  name: string
  is_preset: number | boolean
  is_super: number | boolean
  sort_order: number
  status: number
  remark: string | null
  menu_ids: Array<number | string>
  user_count: number | string
}

interface ApiPage<T> {
  list: T[]
  total: number | string
  page: number
  page_size: number
}

interface ApiUserCreateRequest {
  username: string
  password: string
  display_name: string
  mobile?: string
  role_ids: number[]
  dept_ids: number[]
}

interface ApiUserUpdateRequest {
  display_name?: string
  mobile?: string
  status?: 0 | 1
  role_ids?: number[]
  dept_ids?: number[]
}

interface ApiDepartmentCreateRequest {
  parent_id: number
  name: string
  leader_user_id?: number
  sort_order: number
  status: 0 | 1
}

interface ApiDepartmentUpdateRequest {
  parent_id: number
  name: string
  leader_user_id: number | null
  sort_order: number
  status: 0 | 1
}

export interface UserManagementDataRequester {
  <T, D = unknown>(config: SignedRequestConfig<D>): Promise<T>
}

function responseError(message: string): ApiError {
  return new ApiError(message, { kind: 'response' })
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value) throw responseError(`服务器返回的${field}不完整`)
  return value
}

function nullableText(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function flag(value: unknown): boolean {
  return value === true || value === 1
}

function integer(value: unknown, fallback = 0): number {
  const result = Number(value)
  return Number.isInteger(result) ? result : fallback
}

function nonNegativeInteger(value: unknown): number {
  return Math.max(0, integer(value))
}

function stringIds(values: unknown): string[] {
  return Array.isArray(values) ? values.map(String) : []
}

function stringList(values: unknown): string[] {
  return Array.isArray(values) ? values.filter((value): value is string => typeof value === 'string') : []
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

function userStatus(value: unknown): UserStatus {
  if (integer(value, 1) === 0) return 'disabled'
  if (integer(value, 1) === 2) return 'locked'
  return 'enabled'
}

function apiStatus(value: Exclude<UserStatus, 'locked'>): 0 | 1 {
  return value === 'enabled' ? 1 : 0
}

export function mapApiUser(value: ApiUserVO): SystemUser {
  if (value.id === undefined || value.id === null) throw responseError('服务器返回的用户 ID 不完整')
  const username = requiredText(value.username, '用户名')
  const createdAt = requiredText(value.create_at, '用户创建时间')
  const updatedAt = requiredText(value.update_at, '用户更新时间')
  const status = userStatus(value.status)
  return {
    id: String(value.id),
    username,
    name: nullableText(value.display_name) || username,
    phone: nullableText(value.mobile) || '',
    email: nullableText(value.email),
    remark: nullableText(value.remark),
    departmentIds: stringIds(value.dept_ids),
    departmentNames: stringList(value.dept_names),
    roleIds: stringIds(value.role_ids),
    roleNames: stringList(value.role_names),
    status,
    builtIn: flag(value.is_super),
    loginFailCount: nonNegativeInteger(value.login_fail_count),
    mustChangePassword: flag(value.must_change_password),
    passwordUpdatedAt: updatedAt,
    lastLoginAt: nullableText(value.last_login_at),
    lockedAt: status === 'locked' ? updatedAt : null,
    createdAt,
    updatedAt,
  }
}

export function mapApiDepartment(value: ApiDepartmentVO): SystemDepartment {
  if (value.id === undefined || value.id === null) throw responseError('服务器返回的部门 ID 不完整')
  const parentId = value.parent_id === null || value.parent_id === undefined || String(value.parent_id) === '0'
    ? null
    : String(value.parent_id)
  return {
    id: String(value.id),
    parentId,
    name: requiredText(value.name, '部门名称'),
    ownerUserId: value.leader_user_id === null || value.leader_user_id === undefined ? null : String(value.leader_user_id),
    ownerName: nullableText(value.leader_name),
    sort: integer(value.sort_order),
    status: integer(value.status, 1) === 0 ? 'disabled' : 'enabled',
    remark: nullableText(value.remark),
    userCount: nonNegativeInteger(value.user_count),
    childCount: nonNegativeInteger(value.child_count),
    createdAt: requiredText(value.create_at, '部门创建时间'),
    updatedAt: requiredText(value.update_at, '部门更新时间'),
  }
}

export function mapApiRole(value: ApiRoleVO): SystemRole {
  if (value.id === undefined || value.id === null) throw responseError('服务器返回的角色 ID 不完整')
  const isSuper = flag(value.is_super)
  const isPreset = flag(value.is_preset)
  return {
    id: String(value.id),
    code: requiredText(value.code, '角色编码'),
    name: requiredText(value.name, '角色名称'),
    kind: isSuper ? 'super-admin' : isPreset ? 'preset' : 'custom',
    enabled: integer(value.status, 1) !== 0,
    preset: isPreset,
    sort: integer(value.sort_order),
    userCount: nonNegativeInteger(value.user_count),
    permissionIds: stringIds(value.menu_ids),
    description: nullableText(value.remark) || '',
    createdAt: requiredText(value.create_at, '角色创建时间'),
    updatedAt: requiredText(value.update_at, '角色更新时间'),
  }
}

function mapUserPage(value: ApiPage<ApiUserVO>): UserPage {
  return {
    users: Array.isArray(value.list) ? value.list.map(mapApiUser) : [],
    total: nonNegativeInteger(value.total),
    page: Math.max(1, integer(value.page, 1)),
    pageSize: Math.max(1, integer(value.page_size, 20)),
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

export function createUserManagementService(
  request: UserManagementDataRequester = requestData,
): UserManagementService {
  return {
    async listUsers(query, page, pageSize) {
      const params: Record<string, string | number> = { page, page_size: pageSize }
      const keyword = query.keyword.trim().normalize('NFKC')
      if (keyword) params.keyword = keyword
      if (query.departmentId) params.dept_id = query.departmentId
      if (query.roleId) params.role_id = query.roleId
      if (query.status !== 'all') params.status = query.status === 'enabled' ? 1 : query.status === 'disabled' ? 0 : 2
      return mapUserPage(await request<ApiPage<ApiUserVO>>({ method: 'GET', url: 'api/v1/admin/users', params }))
    },

    async getUser(id) {
      return mapApiUser(await request<ApiUserVO>({ method: 'GET', url: endpoint('api/v1/admin/users', id) }))
    },

    async createUser(input) {
      const data: ApiUserCreateRequest = {
        username: input.username.trim().normalize('NFKC'),
        password: input.password,
        display_name: input.name.trim().normalize('NFKC'),
        role_ids: input.roleIds.map(bodyId),
        dept_ids: input.departmentIds.map(bodyId),
        ...(input.phone.trim() ? { mobile: input.phone.trim() } : {}),
      }
      return mapApiUser(await request<ApiUserVO, ApiUserCreateRequest>({ method: 'POST', url: 'api/v1/admin/users', data }))
    },

    async updateUser(id, input, options) {
      const data: ApiUserUpdateRequest = {
        display_name: input.name.trim().normalize('NFKC'),
        mobile: input.phone.trim(),
        role_ids: input.roleIds.map(bodyId),
        dept_ids: input.departmentIds.map(bodyId),
        ...(options?.includeStatus === false || input.status === 'locked' ? {} : { status: apiStatus(input.status) }),
      }
      return mapApiUser(await request<ApiUserVO, ApiUserUpdateRequest>({ method: 'PATCH', url: endpoint('api/v1/admin/users', id), data }))
    },

    async changeUserStatus(id, status) {
      const data: ApiUserUpdateRequest = { status: apiStatus(status) }
      return mapApiUser(await request<ApiUserVO, ApiUserUpdateRequest>({ method: 'PATCH', url: endpoint('api/v1/admin/users', id), data }))
    },

    async resetUserPassword(id, input) {
      await request<{ reset: boolean }, { password: string }>({
        method: 'POST',
        url: endpoint('api/v1/admin/users', id, '/reset-password'),
        data: { password: input.password },
      })
    },

    async unlockUser(id) {
      await request<{ unlocked: boolean }, Record<string, never>>({
        method: 'POST',
        url: endpoint('api/v1/admin/users', id, '/unlock'),
        data: {},
      })
    },

    async deleteUser(id) {
      await request<{ deleted: boolean }>({ method: 'DELETE', url: endpoint('api/v1/admin/users', id) })
    },

    async listDepartments() {
      const result = await request<ApiDepartmentVO[]>({ method: 'GET', url: 'api/v1/admin/depts' })
      return Array.isArray(result) ? result.map(mapApiDepartment) : []
    },

    async createDepartment(input) {
      const data: ApiDepartmentCreateRequest = {
        parent_id: input.parentId ? bodyId(input.parentId) : 0,
        name: input.name.trim().normalize('NFKC'),
        sort_order: input.sort,
        status: input.status === 'enabled' ? 1 : 0,
        ...(input.ownerUserId ? { leader_user_id: bodyId(input.ownerUserId) } : {}),
      }
      return mapApiDepartment(await request<ApiDepartmentVO, ApiDepartmentCreateRequest>({ method: 'POST', url: 'api/v1/admin/depts', data }))
    },

    async updateDepartment(id, input) {
      const data: ApiDepartmentUpdateRequest = {
        parent_id: input.parentId ? bodyId(input.parentId) : 0,
        name: input.name.trim().normalize('NFKC'),
        leader_user_id: input.ownerUserId ? bodyId(input.ownerUserId) : null,
        sort_order: input.sort,
        status: input.status === 'enabled' ? 1 : 0,
      }
      return mapApiDepartment(await request<ApiDepartmentVO, ApiDepartmentUpdateRequest>({ method: 'PATCH', url: endpoint('api/v1/admin/depts', id), data }))
    },

    async deleteDepartment(id) {
      await request<{ deleted: boolean }>({ method: 'DELETE', url: endpoint('api/v1/admin/depts', id) })
    },

    async listRoles(page, pageSize) {
      const result = await request<ApiPage<ApiRoleVO>>({
        method: 'GET',
        url: 'api/v1/admin/roles',
        params: { page, page_size: pageSize },
      })
      return mapRolePage(result)
    },
  }
}

export const userManagementService = createUserManagementService()
