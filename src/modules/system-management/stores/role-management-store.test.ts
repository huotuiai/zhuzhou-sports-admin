import type {
  RoleBasicInfoInput,
  RoleCreateInput,
  RoleManagementService,
  RolePage,
  RolePermissionInput,
  RoleQuery,
  SystemDepartment,
  SystemPermission,
  SystemRole,
  SystemUser,
  UserManagementService,
  UserPage,
  UserQuery,
} from '../types'
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createRoleManagementStore } from './role-management-store'

const timestamp = '2026-08-26T00:00:00.000Z'

function role(id: number, overrides: Partial<SystemRole> = {}): SystemRole {
  return {
    id: String(id), code: `role_${id}`, name: `角色 ${id}`, kind: 'custom', enabled: true,
    userCount: 0, permissionIds: ['1', '2', '3'], description: '', createdAt: timestamp, updatedAt: timestamp,
    ...overrides,
  }
}

function user(id: number, overrides: Partial<SystemUser> = {}): SystemUser {
  return {
    id: String(id), username: `user_${id}`, name: `用户 ${id}`, phone: '', departmentIds: ['1'], roleIds: [],
    status: 'enabled', builtIn: false, mustChangePassword: false, passwordUpdatedAt: timestamp,
    lastLoginAt: null, lockedAt: null, createdAt: timestamp, updatedAt: timestamp, ...overrides,
  }
}

function department(id: number): SystemDepartment {
  return {
    id: String(id), parentId: null, name: `部门 ${id}`, ownerUserId: null, sort: id, status: 'enabled',
    userCount: 0, childCount: 0, createdAt: timestamp, updatedAt: timestamp,
  }
}

const permissions: SystemPermission[] = [
  { id: '1', parentId: null, name: '系统管理', code: 'system', type: 'group', sort: 1 },
  { id: '2', parentId: '1', name: '角色管理', code: 'system:role', type: 'page', sort: 1 },
  { id: '3', parentId: '2', name: '新增角色', code: 'system:role:create', type: 'action', sort: 1 },
]

class StubRoleManagementService implements RoleManagementService {
  roles: SystemRole[] = []
  roleUsers = new Map<string, SystemUser[]>()
  listCalls: Array<{ query: RoleQuery; page: number; pageSize: number }> = []
  replaceUserCalls: Array<{ id: string; userIds: string[] }> = []
  replaceMenuCalls: Array<{ id: string; permissionIds: string[] }> = []
  fail = false
  nextId = 1000

  private ensureAvailable(): void {
    if (this.fail) throw new Error('角色接口失败')
  }

  async listRoles(query: RoleQuery, page: number, pageSize: number): Promise<RolePage> {
    this.ensureAvailable()
    this.listCalls.push({ query: { ...query }, page, pageSize })
    const keyword = query.keyword.trim()
    const filtered = this.roles.filter(item => !keyword || item.name.includes(keyword) || item.code?.includes(keyword))
    const start = (page - 1) * pageSize
    return { roles: structuredClone(filtered.slice(start, start + pageSize)), total: filtered.length, page, pageSize }
  }

  async getRole(id: string): Promise<SystemRole> {
    this.ensureAvailable()
    const record = this.roles.find(item => item.id === id)
    if (!record) throw new Error('角色不存在')
    return structuredClone(record)
  }

  async createRole(input: RoleCreateInput): Promise<SystemRole> {
    this.ensureAvailable()
    const record = role(++this.nextId, {
      name: input.name, description: input.description, permissionIds: [...input.permissionIds],
    })
    this.roles.unshift(record)
    return structuredClone(record)
  }

  async updateRole(id: string, input: RoleBasicInfoInput): Promise<SystemRole> {
    this.ensureAvailable()
    const index = this.roles.findIndex(item => item.id === id)
    if (index < 0) throw new Error('角色不存在')
    this.roles[index] = { ...this.roles[index]!, name: input.name, description: input.description }
    return structuredClone(this.roles[index]!)
  }

  async deleteRole(id: string): Promise<void> {
    this.ensureAvailable()
    this.roles = this.roles.filter(item => item.id !== id)
  }

  async listMenus(): Promise<SystemPermission[]> {
    this.ensureAvailable()
    return structuredClone(permissions)
  }

  async replaceRoleMenus(id: string, input: RolePermissionInput): Promise<SystemRole> {
    this.ensureAvailable()
    this.replaceMenuCalls.push({ id, permissionIds: [...input.permissionIds] })
    const index = this.roles.findIndex(item => item.id === id)
    if (index < 0) throw new Error('角色不存在')
    this.roles[index] = { ...this.roles[index]!, permissionIds: [...input.permissionIds] }
    return structuredClone(this.roles[index]!)
  }

  async listRoleUsers(id: string): Promise<SystemUser[]> {
    this.ensureAvailable()
    return structuredClone(this.roleUsers.get(id) ?? [])
  }

  async replaceRoleUsers(id: string, userIds: readonly string[]): Promise<void> {
    this.ensureAvailable()
    this.replaceUserCalls.push({ id, userIds: [...userIds] })
    const existing = this.roleUsers.get(id) ?? []
    this.roleUsers.set(id, userIds.map(userId => existing.find(item => item.id === userId) ?? user(Number(userId))))
    const roleRecord = this.roles.find(item => item.id === id)
    if (roleRecord) roleRecord.userCount = userIds.length
  }
}

class StubUserManagementService implements UserManagementService {
  users: SystemUser[] = []
  departments: SystemDepartment[] = [department(1)]
  userListCalls: Array<{ page: number; pageSize: number }> = []

  async listUsers(_query: UserQuery, page: number, pageSize: number): Promise<UserPage> {
    this.userListCalls.push({ page, pageSize })
    const start = (page - 1) * pageSize
    return { users: structuredClone(this.users.slice(start, start + pageSize)), total: this.users.length, page, pageSize }
  }

  async getUser(): Promise<SystemUser> { throw new Error('unused') }
  async createUser(): Promise<SystemUser> { throw new Error('unused') }
  async updateUser(): Promise<SystemUser> { throw new Error('unused') }
  async changeUserStatus(): Promise<SystemUser> { throw new Error('unused') }
  async resetUserPassword(): Promise<void> { throw new Error('unused') }
  async unlockUser(): Promise<void> { throw new Error('unused') }
  async deleteUser(): Promise<void> { throw new Error('unused') }
  async listDepartments(): Promise<SystemDepartment[]> { return structuredClone(this.departments) }
  async createDepartment(): Promise<SystemDepartment> { throw new Error('unused') }
  async updateDepartment(): Promise<SystemDepartment> { throw new Error('unused') }
  async deleteDepartment(): Promise<void> { throw new Error('unused') }
  async listRoles(): Promise<RolePage> { throw new Error('unused') }
}

describe('role management store', () => {
  let service: StubRoleManagementService
  let usersService: StubUserManagementService

  beforeEach(() => {
    setActivePinia(createPinia())
    service = new StubRoleManagementService()
    usersService = new StubUserManagementService()
  })

  it('initializes dynamic menus and delegates keyword pagination to the server', async () => {
    service.roles = Array.from({ length: 45 }, (_, index) => role(index + 1))
    const store = createRoleManagementStore(service, usersService, 'role-init')()

    await expect(store.initialize()).resolves.toBe(true)
    expect(store.roles).toHaveLength(20)
    expect(store.permissions).toEqual(permissions)
    expect(store.total).toBe(45)

    await store.queryRoles({ keyword: '角色 25' })
    expect(store.roles.map(item => item.id)).toEqual(['25'])
    expect(service.listCalls.at(-1)).toMatchObject({ query: { keyword: '角色 25' }, page: 1, pageSize: 20 })
  })

  it('refreshes the current page and invalidates cached role references', async () => {
    service.roles = Array.from({ length: 25 }, (_, index) => role(index + 1))
    const store = createRoleManagementStore(service, usersService, 'role-refresh')()
    await store.initialize()
    await store.changePage(2)
    await store.loadRoleReferences()
    expect(store.referencesLoaded).toBe(true)

    service.roles[20] = role(21, { name: '服务端最新角色', userCount: 8 })
    await expect(store.refresh()).resolves.toBe(true)

    expect(store.roles[0]).toMatchObject({ id: '21', name: '服务端最新角色', userCount: 8 })
    expect(store.page).toBe(2)
    expect(store.referencesLoaded).toBe(false)
    expect(service.listCalls.at(-1)).toMatchObject({ query: { keyword: '' }, page: 2, pageSize: 20 })
  })

  it('loads every reference page and refreshes the current page after CRUD', async () => {
    service.roles = Array.from({ length: 205 }, (_, index) => role(index + 1))
    const store = createRoleManagementStore(service, usersService, 'role-references')()
    await store.initialize()

    await expect(store.loadRoleReferences()).resolves.toBe(true)
    expect(store.roleReferences).toHaveLength(205)
    expect(service.listCalls.filter(call => call.pageSize === 100).map(call => call.page)).toEqual([1, 2, 3])

    const created = await store.createRole({ name: '赛事保障', description: '', permissionIds: ['1', '2', '3'] })
    expect(created?.name).toBe('赛事保障')
    expect(store.page).toBe(1)
    await expect(store.updateRole(created!.id, { name: '赛事运行', description: '更新' })).resolves.toMatchObject({ name: '赛事运行' })
    await expect(store.updatePermissions(created!.id, { permissionIds: ['3'] })).resolves.toMatchObject({ permissionIds: ['3'] })
    expect(service.replaceMenuCalls.at(-1)).toEqual({ id: created!.id, permissionIds: ['3'] })
  })

  it('moves to the previous page after deleting its last role and blocks protected deletions', async () => {
    service.roles = Array.from({ length: 21 }, (_, index) => role(index + 1))
    const store = createRoleManagementStore(service, usersService, 'role-delete')()
    await store.initialize()
    await store.changePage(2)

    await expect(store.deleteRole('21')).resolves.toBe(true)
    expect(store.page).toBe(1)
    expect(store.total).toBe(20)

    service.roles[0] = role(1, { kind: 'preset' })
    await store.queryRoles({ keyword: '角色 1' })
    await expect(store.deleteRole('1')).resolves.toBe(false)
    expect(store.error).toBe('预置角色不能删除')
  })

  it('loads all assignment candidates, excludes unbound super accounts and protects existing relations', async () => {
    service.roles = [role(11)]
    usersService.users = Array.from({ length: 205 }, (_, index) => user(index + 1))
    usersService.users[0] = user(1, { builtIn: true })
    usersService.users[1] = user(2, { builtIn: true })
    service.roleUsers.set('11', [usersService.users[0]!, usersService.users[2]!])
    const store = createRoleManagementStore(service, usersService, 'role-assignment')()
    await store.initialize()

    await expect(store.loadAssignment('11')).resolves.toBe(true)
    expect(store.assignmentBoundUserIds).toEqual(['1', '3'])
    expect(store.assignmentUsers.some(item => item.id === '1')).toBe(true)
    expect(store.assignmentUsers.some(item => item.id === '2')).toBe(false)
    expect(usersService.userListCalls.map(call => call.page)).toEqual([1, 2, 3])

    await expect(store.replaceRoleUsers('11', ['3'])).resolves.toBe(false)
    expect(store.error).toContain('受保护关系')
    await expect(store.replaceRoleUsers('11', ['1', '3', '4'])).resolves.toBe(true)
    expect(service.replaceUserCalls).toEqual([{ id: '11', userIds: ['1', '3', '4'] }])
    expect(store.roles[0]?.userCount).toBe(3)
  })

  it('keeps super-admin permissions and assignments read-only and retains state on API failure', async () => {
    service.roles = [role(1, { kind: 'super-admin' }), role(2)]
    const store = createRoleManagementStore(service, usersService, 'role-protection')()
    await store.initialize()

    await expect(store.updatePermissions('1', { permissionIds: ['3'] })).resolves.toBeNull()
    await expect(store.replaceRoleUsers('1', [])).resolves.toBe(false)
    expect(service.replaceMenuCalls).toHaveLength(0)
    expect(service.replaceUserCalls).toHaveLength(0)

    service.fail = true
    await expect(store.queryRoles()).resolves.toBe(false)
    expect(store.roles).toHaveLength(2)
    expect(store.error).toBe('角色接口失败')
  })
})
