import { describe, expect, it } from 'vitest'
import type { PermissionWriteInput, RoleWriteInput, UserWriteInput } from '../types'
import { RBAC_STORAGE_KEY, LocalRbacService } from './rbac-service'

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()
  get length(): number { return this.values.size }
  clear(): void { this.values.clear() }
  getItem(key: string): string | null { return this.values.get(key) ?? null }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null }
  removeItem(key: string): void { this.values.delete(key) }
  setItem(key: string, value: string): void { this.values.set(key, value) }
}

function createService() {
  let id = 0
  let day = 10
  return new LocalRbacService({
    storage: new MemoryStorage(),
    createId: () => `custom-${++id}`,
    now: () => new Date(`2026-08-${day++}T08:00:00.000Z`),
  })
}

function permissionInput(overrides: Partial<PermissionWriteInput> = {}): PermissionWriteInput {
  return {
    parentId: 'permission-system',
    name: '报表管理',
    code: 'system:report:view',
    type: 'menu',
    routePath: '/system/reports',
    sort: 40,
    visible: true,
    enabled: true,
    description: '',
    ...overrides,
  }
}

function roleInput(permissionIds: string[], overrides: Partial<RoleWriteInput> = {}): RoleWriteInput {
  return {
    name: '报表管理员',
    code: 'REPORT_ADMIN',
    sort: 30,
    dataScope: 'department',
    permissionIds,
    enabled: true,
    remark: '',
    ...overrides,
  }
}

function userInput(roleIds: string[], overrides: Partial<UserWriteInput> = {}): UserWriteInput {
  return {
    username: 'report.admin',
    password: '123456',
    name: '报表管理员',
    phone: '13800000002',
    email: 'report.admin@zzsports.local',
    department: '信息中心',
    roleIds,
    enabled: true,
    remark: '',
    ...overrides,
  }
}

describe('LocalRbacService', () => {
  it('seeds a complete user-role-permission chain', async () => {
    const snapshot = await createService().load()
    const admin = snapshot.users.find((user) => user.username === 'admin')
    const superAdmin = snapshot.roles.find((role) => role.code === 'SUPER_ADMIN')
    expect(admin?.roleIds).toContain(superAdmin?.id)
    expect(superAdmin?.permissionIds).toHaveLength(snapshot.permissions.length)
    expect(snapshot.permissions.some((permission) => permission.code === 'system:user:create')).toBe(true)
  })

  it('migrates existing v2 data with the new application permissions', async () => {
    const storage = new MemoryStorage()
    const seedService = new LocalRbacService({ storage })
    const snapshot = await seedService.load()
    const legacyPermissions = snapshot.permissions.filter((permission) =>
      !permission.id.startsWith('permission-ticket-gate') &&
      !permission.id.startsWith('permission-shuttle') &&
      permission.id !== 'permission-application')
    const legacy = {
      schemaVersion: 2,
      ...snapshot,
      permissions: legacyPermissions.map((permission) =>
        permission.id === 'permission-area' || permission.id === 'permission-parking'
          ? { ...permission, parentId: null }
          : permission),
      roles: snapshot.roles.map((role) => ({
        ...role,
        permissionIds: role.permissionIds.filter((id) => legacyPermissions.some((permission) => permission.id === id)),
      })),
    }
    storage.setItem(RBAC_STORAGE_KEY, JSON.stringify(legacy))

    const migrated = await new LocalRbacService({ storage }).load()
    expect(migrated.permissions.find((item) => item.id === 'permission-area')?.parentId).toBe('permission-application')
    expect(migrated.permissions.some((item) => item.id === 'permission-ticket-gate')).toBe(true)
    expect(migrated.permissions.some((item) => item.id === 'permission-shuttle')).toBe(true)
    expect(migrated.permissions.some((item) => item.id === 'permission-seat')).toBe(true)
    expect(migrated.roles.find((item) => item.id === 'role-super-admin')?.permissionIds).toHaveLength(migrated.permissions.length)
    expect(migrated.roles.find((item) => item.id === 'role-operator')?.permissionIds).toContain('permission-application')
  })

  it('runs permission to role to user creation and updates the relations', async () => {
    const service = createService()
    const permission = await service.createPermission(permissionInput())
    const role = await service.createRole(roleInput([permission.id]))
    const user = await service.createUser(userInput([role.id]))

    expect(user).not.toHaveProperty('password')
    const snapshot = await service.load()
    expect(snapshot.users.find((item) => item.id === user.id)?.roleIds).toEqual([role.id])
    expect(snapshot.roles.find((item) => item.id === role.id)?.permissionIds).toEqual(
      expect.arrayContaining(['permission-system', permission.id]),
    )
    expect(snapshot.roles.find((item) => item.id === 'role-super-admin')?.permissionIds).toContain(permission.id)

    const updated = await service.updateUser(user.id, userInput([role.id], { name: '报表负责人', password: '' }))
    expect(updated.name).toBe('报表负责人')
  })

  it('blocks deletion while RBAC records are referenced, then allows ordered cleanup', async () => {
    const service = createService()
    const permission = await service.createPermission(permissionInput())
    const role = await service.createRole(roleInput([permission.id]))
    const user = await service.createUser(userInput([role.id]))

    await expect(service.removeRole(role.id)).rejects.toThrow('请先解除关联')
    await expect(service.removePermission(permission.id)).rejects.toThrow('请先解除授权')
    await service.removeUser(user.id)
    await service.removeRole(role.id)
    await service.removePermission(permission.id)
    expect((await service.load()).permissions.some((item) => item.id === permission.id)).toBe(false)
  })

  it('enforces built-in and permission-tree safety constraints', async () => {
    const service = createService()
    const snapshot = await service.load()
    await expect(service.removeUser('user-admin')).rejects.toThrow('内置管理员不能删除')
    await expect(service.removeRole('role-super-admin')).rejects.toThrow('内置超级管理员角色不能删除')
    await expect(service.removePermission('permission-system')).rejects.toThrow('内置权限不能删除')

    const admin = snapshot.users.find((user) => user.id === 'user-admin')!
    await expect(service.updateUser(admin.id, {
      username: admin.username,
      password: '',
      name: admin.name,
      phone: admin.phone,
      email: admin.email,
      department: admin.department,
      roleIds: ['role-operator'],
      enabled: true,
      remark: admin.remark,
    })).rejects.toThrow('必须保留超级管理员角色')

    const systemPermission = snapshot.permissions.find((item) => item.id === 'permission-system')!
    await expect(service.updatePermission(systemPermission.id, {
      parentId: systemPermission.parentId,
      name: systemPermission.name,
      code: 'changed:code',
      type: systemPermission.type,
      routePath: systemPermission.routePath,
      sort: systemPermission.sort,
      visible: systemPermission.visible,
      enabled: systemPermission.enabled,
      description: systemPermission.description,
    })).rejects.toThrow('内置权限的上级、类型和权限标识不能修改')

    await expect(service.createPermission(permissionInput({
      parentId: 'permission-system',
      type: 'button',
      routePath: '',
    }))).rejects.toThrow('按钮权限的上级必须是菜单权限')
    expect(snapshot.permissions.length).toBeGreaterThan(10)
  })

  it('validates duplicate identities and unknown relations', async () => {
    const service = createService()
    await expect(service.createUser(userInput(['missing-role']))).rejects.toThrow('所选角色不存在或已停用')
    await expect(service.createRole(roleInput(['missing-permission']))).rejects.toThrow('所选权限不存在或已停用')
    await expect(service.createPermission(permissionInput({ code: 'system:user:view' }))).rejects.toThrow('权限标识不能重复')
  })
})
