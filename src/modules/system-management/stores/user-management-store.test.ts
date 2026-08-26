import type {
  DepartmentWriteInput,
  RolePage,
  SystemDepartment,
  SystemRole,
  SystemUser,
  UserBasicInfoInput,
  UserCreateInput,
  UserManagementService,
  UserPage,
  UserQuery,
} from '../types'
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createUserManagementStore } from './user-management-store'

const timestamp = '2026-08-26T00:00:00.000Z'

function user(id: number, overrides: Partial<SystemUser> = {}): SystemUser {
  return {
    id: String(id),
    username: `user_${id}`,
    name: `用户 ${id}`,
    phone: '',
    departmentIds: ['1'],
    roleIds: ['1'],
    status: 'enabled',
    builtIn: false,
    mustChangePassword: false,
    passwordUpdatedAt: timestamp,
    lastLoginAt: null,
    lockedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  }
}

function department(id: number, overrides: Partial<SystemDepartment> = {}): SystemDepartment {
  return {
    id: String(id), parentId: null, name: `部门 ${id}`, ownerUserId: null, sort: id, status: 'enabled',
    userCount: 0, childCount: 0, createdAt: timestamp, updatedAt: timestamp, ...overrides,
  }
}

function role(id: number): SystemRole {
  return {
    id: String(id), code: `role_${id}`, name: `角色 ${id}`, kind: 'custom', enabled: true,
    permissionIds: [], description: '', createdAt: timestamp, updatedAt: timestamp,
  }
}

class StubUserManagementService implements UserManagementService {
  users: SystemUser[] = []
  departments: SystemDepartment[] = [department(1)]
  roles: SystemRole[] = [role(1)]
  userListCalls: Array<{ query: UserQuery; page: number; pageSize: number }> = []
  roleListCalls: number[] = []
  fail = false
  nextId = 1000

  private ensureAvailable(): void {
    if (this.fail) throw new Error('接口失败')
  }

  async listUsers(query: UserQuery, page: number, pageSize: number): Promise<UserPage> {
    this.ensureAvailable()
    this.userListCalls.push({ query: { ...query }, page, pageSize })
    const filtered = this.users.filter((item) => {
      if (query.keyword && ![item.username, item.name, item.phone].join(' ').includes(query.keyword)) return false
      if (query.departmentId && !item.departmentIds.includes(query.departmentId)) return false
      if (query.roleId && !item.roleIds.includes(query.roleId)) return false
      return query.status === 'all' || item.status === query.status
    })
    const start = (page - 1) * pageSize
    return { users: structuredClone(filtered.slice(start, start + pageSize)), total: filtered.length, page, pageSize }
  }

  async getUser(id: string): Promise<SystemUser> {
    this.ensureAvailable()
    const record = this.users.find(item => item.id === id)
    if (!record) throw new Error('用户不存在')
    return structuredClone(record)
  }

  async createUser(input: UserCreateInput): Promise<SystemUser> {
    this.ensureAvailable()
    const record = user(++this.nextId, {
      username: input.username, name: input.name, phone: input.phone,
      departmentIds: [...input.departmentIds], roleIds: [...input.roleIds], mustChangePassword: true,
    })
    this.users.unshift(record)
    return structuredClone(record)
  }

  async updateUser(id: string, input: UserBasicInfoInput): Promise<SystemUser> {
    this.ensureAvailable()
    const index = this.users.findIndex(item => item.id === id)
    if (index < 0) throw new Error('用户不存在')
    this.users[index] = { ...this.users[index]!, ...input, departmentIds: [...input.departmentIds], roleIds: [...input.roleIds] }
    return structuredClone(this.users[index]!)
  }

  async changeUserStatus(id: string, status: 'enabled' | 'disabled'): Promise<SystemUser> {
    const record = await this.getUser(id)
    const index = this.users.findIndex(item => item.id === id)
    this.users[index] = { ...record, status }
    return structuredClone(this.users[index]!)
  }

  async resetUserPassword(id: string): Promise<void> {
    const record = await this.getUser(id)
    const index = this.users.findIndex(item => item.id === id)
    this.users[index] = { ...record, mustChangePassword: true }
  }

  async unlockUser(id: string): Promise<void> {
    await this.changeUserStatus(id, 'enabled')
  }

  async deleteUser(id: string): Promise<void> {
    this.ensureAvailable()
    this.users = this.users.filter(item => item.id !== id)
  }

  async listDepartments(): Promise<SystemDepartment[]> {
    this.ensureAvailable()
    return structuredClone(this.departments)
  }

  async createDepartment(input: DepartmentWriteInput): Promise<SystemDepartment> {
    this.ensureAvailable()
    const record = department(++this.nextId, input)
    this.departments.push(record)
    return structuredClone(record)
  }

  async updateDepartment(id: string, input: DepartmentWriteInput): Promise<SystemDepartment> {
    this.ensureAvailable()
    const index = this.departments.findIndex(item => item.id === id)
    if (index < 0) throw new Error('部门不存在')
    this.departments[index] = { ...this.departments[index]!, ...input }
    return structuredClone(this.departments[index]!)
  }

  async deleteDepartment(id: string): Promise<void> {
    this.ensureAvailable()
    this.departments = this.departments.filter(item => item.id !== id)
  }

  async listRoles(page: number, pageSize: number): Promise<RolePage> {
    this.ensureAvailable()
    this.roleListCalls.push(page)
    const start = (page - 1) * pageSize
    return { roles: structuredClone(this.roles.slice(start, start + pageSize)), total: this.roles.length, page, pageSize }
  }
}

describe('user management store', () => {
  let service: StubUserManagementService

  beforeEach(() => {
    setActivePinia(createPinia())
    service = new StubUserManagementService()
  })

  it('initializes the current page, all departments and every role reference page', async () => {
    service.users = Array.from({ length: 205 }, (_, index) => user(index + 1))
    service.roles = Array.from({ length: 205 }, (_, index) => role(index + 1))
    const store = createUserManagementStore(service, 'user-init')()

    await expect(store.initialize()).resolves.toBe(true)

    expect(store.users).toHaveLength(20)
    expect(store.total).toBe(205)
    expect(store.roles).toHaveLength(205)
    expect(service.roleListCalls).toEqual([1, 2, 3])
    await expect(store.loadDepartmentLeaderCandidates()).resolves.toBe(true)
    expect(store.departmentLeaderCandidates).toHaveLength(205)
    expect(service.userListCalls.filter(call => call.pageSize === 100).map(call => call.page)).toEqual([1, 2, 3])
  })

  it('delegates single-value filters and pagination to the service', async () => {
    service.users = [
      user(1, { name: '场馆负责人', departmentIds: ['10'], roleIds: ['20'] }),
      user(2, { name: '其他用户', departmentIds: ['11'], roleIds: ['21'] }),
    ]
    const store = createUserManagementStore(service, 'user-query')()
    await store.initialize()

    await store.queryUsers({ keyword: '场馆', departmentId: '10', roleId: '20', status: 'enabled' })

    expect(store.users.map(item => item.id)).toEqual(['1'])
    expect(service.userListCalls.at(-1)).toMatchObject({
      query: { keyword: '场馆', departmentId: '10', roleId: '20', status: 'enabled' }, page: 1, pageSize: 20,
    })
  })

  it('refreshes after CRUD and moves back when deleting the last record on a page', async () => {
    service.users = Array.from({ length: 21 }, (_, index) => user(index + 1))
    const store = createUserManagementStore(service, 'user-crud')()
    await store.initialize()
    await store.changePage(2)
    expect(store.users.map(item => item.id)).toEqual(['21'])

    await expect(store.deleteUser('21')).resolves.toBe(true)
    expect(store.page).toBe(1)
    expect(store.total).toBe(20)

    const created = await store.createUser({
      username: 'new_user', name: '新用户', phone: '', departmentIds: ['1'], roleIds: ['1'],
      password: 'Admin1234', confirmPassword: 'Admin1234',
    })
    expect(created?.username).toBe('new_user')
    expect(store.page).toBe(1)
    expect(await store.updateUser(created!.id, { name: '已更新', phone: '', departmentIds: ['1'], roleIds: ['1'], status: 'enabled' })).toMatchObject({ name: '已更新' })
    expect(await store.resetPassword(created!.id, { password: 'Reset1234', confirmPassword: 'Reset1234' })).toBe(true)
  })

  it('refreshes department counts and relationships after create, update and delete', async () => {
    const store = createUserManagementStore(service, 'department-crud')()
    await store.initialize()
    const input: DepartmentWriteInput = { parentId: null, name: '赛事保障组', ownerUserId: null, sort: 20, status: 'enabled' }

    const created = await store.createDepartment(input)
    expect(store.departments.some(item => item.id === created?.id)).toBe(true)
    expect(await store.updateDepartment(created!.id, { ...input, name: '赛事运行组' })).toMatchObject({ name: '赛事运行组' })
    await expect(store.deleteDepartment(created!.id)).resolves.toBe(true)
    expect(store.departments.some(item => item.id === created?.id)).toBe(false)
  })

  it('keeps state and exposes readable API errors', async () => {
    service.users = [user(1)]
    const store = createUserManagementStore(service, 'user-errors')()
    await store.initialize()
    service.fail = true

    await expect(store.queryUsers()).resolves.toBe(false)
    expect(store.users).toHaveLength(1)
    expect(store.error).toBe('接口失败')
    await expect(store.deleteUser('1')).resolves.toBe(false)
    expect(store.deletingId).toBeNull()
  })
})
