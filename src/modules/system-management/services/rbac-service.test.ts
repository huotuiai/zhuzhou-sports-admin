import type { RoleCreateInput, UserCreateInput } from '../types'
import { describe, expect, it } from 'vitest'
import { sidebarNavigation } from '@/config/navigation'
import { ALL_PERMISSION_IDS, DEFAULT_PERMISSIONS } from '../default-data'
import { LocalRbacService, RBAC_SCHEMA_VERSION, RBAC_STORAGE_KEY } from './rbac-service'

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()
  get length(): number { return this.values.size }
  clear(): void { this.values.clear() }
  getItem(key: string): string | null { return this.values.get(key) ?? null }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null }
  removeItem(key: string): void { this.values.delete(key) }
  setItem(key: string, value: string): void { this.values.set(key, value) }
}

function createService(storage = new MemoryStorage()) {
  let id = 0
  let day = 10
  return {
    service: new LocalRbacService({
      storage,
      createId: () => `custom-${++id}`,
      now: () => new Date(`2026-08-${day++}T08:00:00.000Z`),
    }),
    storage,
  }
}

function roleInput(overrides: Partial<RoleCreateInput> = {}): RoleCreateInput {
  return { name: '活动运营员', description: '负责活动内容维护', permissionIds: ['permission-content-activity-view'], ...overrides }
}

function userInput(overrides: Partial<UserCreateInput> = {}): UserCreateInput {
  return {
    username: 'content_operator', name: '内容运营员', phone: '13800000002',
    departmentIds: ['department-operations'], roleIds: ['role-operator'],
    password: 'Admin1234', confirmPassword: 'Admin1234', ...overrides,
  }
}

function legacyUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-custom', username: 'seat_operator', name: '座位配置员', phone: '13800000003',
    email: 'seat.operator@zzsports.local', department: '场馆运营部', roleIds: ['role-seat-custom'],
    enabled: true, builtIn: false, remark: '旧备注', createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z', ...overrides,
  }
}

function legacyRole(overrides: Record<string, unknown> = {}) {
  return {
    id: 'role-seat-custom', name: '座位配置员', code: 'SEAT_CUSTOM',
    permissionIds: ['permission-seat-update', 'permission-custom-unknown'], builtIn: false,
    remark: '保留的自定义角色', createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z', ...overrides,
  }
}

describe('LocalRbacService v8', () => {
  it('权限树的分组和一级页面与左侧菜单逐项对应', () => {
    const rootPermissions = DEFAULT_PERMISSIONS.filter(item => item.parentId === null)

    expect(rootPermissions.map(item => item.name)).toEqual(sidebarNavigation.map(group => group.label))
    for (const group of sidebarNavigation) {
      const permissionGroup = rootPermissions.find(item => item.name === group.label)!
      const menuPermissions = DEFAULT_PERMISSIONS.filter(item =>
        item.parentId === permissionGroup.id && item.type !== 'action',
      )
      expect(menuPermissions.map(item => item.name)).toEqual(group.items.map(item => item.label))
      expect(menuPermissions.map(item => item.id)).toEqual(group.items.map(item => item.permissionId))
    }
  })

  it('以固定权限、部门树和代表性用户初始化 v8 数据', async () => {
    const { service, storage } = createService()
    const snapshot = await service.load()
    const stored = JSON.parse(storage.getItem(RBAC_STORAGE_KEY)!) as Record<string, unknown>

    expect(stored.schemaVersion).toBe(RBAC_SCHEMA_VERSION)
    expect(stored).not.toHaveProperty('permissions')
    expect(snapshot.departments.some(item => item.parentId !== null)).toBe(true)
    expect(snapshot.users.map(user => user.status)).toEqual(expect.arrayContaining(['enabled', 'disabled', 'locked']))
    expect(snapshot.roles.find(role => role.kind === 'super-admin')?.permissionIds).toEqual(ALL_PERMISSION_IDS)
  })

  it.each([2, 3, 4, 5, 6])('从 v%s 迁移时保留自定义角色、用户绑定和未知部门', async (schemaVersion) => {
    const storage = new MemoryStorage()
    storage.setItem(RBAC_STORAGE_KEY, JSON.stringify({
      schemaVersion,
      users: [
        legacyUser({ id: 'user-admin', username: 'admin', name: '管理员', department: '历史专班', builtIn: true, roleIds: ['role-super-admin'] }),
        legacyUser(),
      ],
      roles: [
        legacyRole({ id: 'role-super-admin', name: '超级管理员', code: 'SUPER_ADMIN', permissionIds: ['permission-home'], builtIn: true }),
        legacyRole({ id: 'role-operator', name: '场馆运营', code: 'VENUE_OPERATOR', permissionIds: ['permission-parking-create'], builtIn: true }),
        legacyRole({ id: 'role-auditor', name: '审计员', code: 'AUDITOR', permissionIds: ['permission-user'], builtIn: true }),
        legacyRole(),
      ],
      permissions: [{ id: 'permission-home' }, { id: 'permission-parking-create' }, { id: 'permission-user' }, { id: 'permission-seat-update' }],
    }))

    const migrated = await new LocalRbacService({ storage }).load()
    const stored = JSON.parse(storage.getItem(RBAC_STORAGE_KEY)!) as Record<string, unknown>
    expect(stored.schemaVersion).toBe(8)
    expect(migrated.roles.find(role => role.id === 'role-seat-custom')).toMatchObject({ kind: 'custom', description: '保留的自定义角色' })
    expect(migrated.users.find(user => user.id === 'user-custom')?.roleIds).toContain('role-seat-custom')
    expect(migrated.departments.some(item => item.name === '历史专班')).toBe(true)
    expect(migrated.users[0]).not.toHaveProperty('email')
    expect(migrated.users[0]).not.toHaveProperty('remark')
  })

  it('从 v7 迁移用户状态和单部门关系并保留角色', async () => {
    const storage = new MemoryStorage()
    storage.setItem(RBAC_STORAGE_KEY, JSON.stringify({
      schemaVersion: 7,
      users: [legacyUser({ enabled: false })],
      roles: [{ id: 'role-seat-custom', name: '座位配置员', kind: 'custom', permissionIds: ['permission-seat-operate'], description: '自定义', createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z' }],
    }))
    const snapshot = await new LocalRbacService({ storage }).load()
    expect(snapshot.users[0]).toMatchObject({ status: 'disabled', lastLoginAt: null, mustChangePassword: false })
    expect(snapshot.users[0]?.departmentIds).toHaveLength(1)
    expect(snapshot.roles.some(role => role.id === 'role-seat-custom')).toBe(true)
  })

  it('创建用户校验字段并确保密码永不落盘', async () => {
    const { service, storage } = createService()
    const user = await service.createUser(userInput())
    const raw = storage.getItem(RBAC_STORAGE_KEY)!

    expect(user).toMatchObject({ status: 'enabled', mustChangePassword: true })
    expect(raw).not.toContain('Admin1234')
    await expect(service.createUser(userInput({ username: 'bad.name' }))).rejects.toThrow('用户名仅支持')
    await expect(service.createUser(userInput({ username: 'other_user', phone: '123' }))).rejects.toThrow('11 位手机号')
    await expect(service.createUser(userInput({ username: 'other_user', departmentIds: [] }))).rejects.toThrow('至少选择一个所属部门')
    await expect(service.createUser(userInput({ username: 'other_user', roleIds: ['missing'] }))).rejects.toThrow('所选角色不存在')
  })

  it('拆分基本信息、密码重置、启停和解锁操作', async () => {
    const { service, storage } = createService()
    const user = await service.createUser(userInput())
    const updated = await service.updateUserInfo(user.id, { name: '内容运营负责人', phone: '', departmentIds: ['department-operations'], roleIds: ['role-operator'], status: 'disabled' })
    expect(updated).toMatchObject({ name: '内容运营负责人', status: 'disabled' })

    const reset = await service.resetUserPassword(user.id, { password: 'Reset1234', confirmPassword: 'Reset1234' })
    expect(reset.mustChangePassword).toBe(true)
    expect(storage.getItem(RBAC_STORAGE_KEY)).not.toContain('Reset1234')
    expect((await service.setUserStatus(user.id, 'enabled')).status).toBe('enabled')

    const lockedStorage = JSON.parse(storage.getItem(RBAC_STORAGE_KEY)!)
    lockedStorage.users.find((item: { id: string }) => item.id === user.id).status = 'locked'
    lockedStorage.users.find((item: { id: string }) => item.id === user.id).lockedAt = '2026-08-17T00:00:00.000Z'
    storage.setItem(RBAC_STORAGE_KEY, JSON.stringify(lockedStorage))
    expect((await service.unlockUser(user.id)).status).toBe('enabled')
  })

  it('保护内置管理员和持有超管角色的账号', async () => {
    const { service } = createService()
    await expect(service.removeUser('user-admin')).rejects.toThrow('内置管理员不能删除')
    await expect(service.setUserStatus('user-admin', 'disabled')).rejects.toThrow('内置管理员不能停用')
    await expect(service.updateUserInfo('user-admin', { name: '管理员', phone: '', departmentIds: ['department-venue'], roleIds: ['role-operator'], status: 'enabled' })).rejects.toThrow('必须保留超级管理员角色')
  })

  it('部门支持多根、同级唯一和循环引用校验', async () => {
    const { service } = createService()
    const root = await service.createDepartment({ parentId: null, name: '赛事保障组', ownerUserId: null, sort: 100, status: 'enabled' })
    const child = await service.createDepartment({ parentId: root.id, name: '现场小组', ownerUserId: null, sort: 10, status: 'enabled' })
    await expect(service.createDepartment({ parentId: root.id, name: '现场小组', ownerUserId: null, sort: 20, status: 'enabled' })).rejects.toThrow('同级部门名称不能重复')
    await expect(service.updateDepartment(root.id, { parentId: child.id, name: root.name, ownerUserId: null, sort: 100, status: 'enabled' })).rejects.toThrow('不能选择自己或自己的下级')
    await expect(service.createDepartment({ parentId: null, name: '错误排序', ownerUserId: null, sort: 10000, status: 'enabled' })).rejects.toThrow('0–9999')
  })

  it('部门删除会报告下级和用户引用阻塞', async () => {
    const { service } = createService()
    await expect(service.removeDepartment('department-venue')).rejects.toThrow('下级部门')
    await expect(service.removeDepartment('department-security')).resolves.toBeUndefined()
    await expect(service.removeDepartment('department-operations')).rejects.toThrow('用户引用')
  })

  it('删除部门主管用户时自动清空主管引用', async () => {
    const { service } = createService()
    const user = await service.createUser(userInput())
    const department = await service.createDepartment({ parentId: null, name: '临时部门', ownerUserId: user.id, sort: 99, status: 'enabled' })
    await service.removeUser(user.id)
    expect((await service.load()).departments.find(item => item.id === department.id)?.ownerUserId).toBeNull()
  })

  it('角色权限和用户分配规则继续生效', async () => {
    const { service } = createService()
    const role = await service.createRole(roleInput())
    expect(role.permissionIds).toEqual(expect.arrayContaining(['permission-operations', 'permission-content-activity-view']))
    await service.assignRoleUsers(role.id, ['user-operator'])
    expect((await service.load()).users.find(user => user.id === 'user-operator')?.roleIds).toContain(role.id)
    await expect(service.removeRole(role.id)).rejects.toThrow('已绑定 1 个用户')
    await expect(service.assignRoleUsers('role-super-admin', [])).rejects.toThrow('内置管理员不能解除')
  })

  it('本地数据损坏时明确报错且不覆盖', async () => {
    const storage = new MemoryStorage()
    storage.setItem(RBAC_STORAGE_KEY, '{invalid-json')
    await expect(new LocalRbacService({ storage }).load()).rejects.toThrow('本地系统管理数据无法解析')
    expect(storage.getItem(RBAC_STORAGE_KEY)).toBe('{invalid-json')
  })
})
