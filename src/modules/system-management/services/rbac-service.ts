import type {
  PermissionWriteInput,
  RbacService,
  RbacSnapshot,
  RoleWriteInput,
  SystemPermission,
  SystemRole,
  SystemUser,
  UserWriteInput,
  ValidationIssue,
} from '../types'
import { createDefaultRbacSnapshot } from '../default-data'
import {
  getAncestorPermissionIds,
  getDescendantPermissionIds,
  normalizeIdentity,
  sortByOrderAndName,
} from '../lib/rbac'
import { createClientId } from '@/lib/id'

export const RBAC_STORAGE_KEY = 'zz-sports-rbac:v2'
const SCHEMA_VERSION = 4
const LEGACY_SCHEMA_VERSIONS = [2, 3] as const

interface StoredRbacData extends RbacSnapshot {
  schemaVersion: typeof SCHEMA_VERSION
}

export class RbacServiceError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'RbacServiceError'
  }
}

export interface LocalRbacServiceOptions {
  storage?: Storage
  createId?: () => string
  now?: () => Date
}

function resolveBrowserStorage(): Storage {
  if (typeof globalThis.localStorage === 'undefined') {
    throw new RbacServiceError('当前环境不支持本地存储')
  }
  return globalThis.localStorage
}

function cloneSnapshot(snapshot: RbacSnapshot): RbacSnapshot {
  return {
    users: snapshot.users.map((item) => ({ ...item, roleIds: [...item.roleIds] })),
    roles: snapshot.roles.map((item) => ({ ...item, permissionIds: [...item.permissionIds] })),
    permissions: snapshot.permissions.map((item) => ({ ...item })),
  }
}

function sortSnapshot(snapshot: RbacSnapshot): RbacSnapshot {
  return {
    users: [...snapshot.users].sort((first, second) => second.updatedAt.localeCompare(first.updatedAt)),
    roles: sortByOrderAndName(snapshot.roles),
    permissions: sortByOrderAndName(snapshot.permissions),
  }
}

function migrateLegacySnapshot(snapshot: RbacSnapshot): RbacSnapshot {
  const defaults = createDefaultRbacSnapshot()
  const defaultPermissions = new Map(defaults.permissions.map((item) => [item.id, item]))
  const permissionsById = new Map(snapshot.permissions.map((item) => [item.id, item]))

  for (const permission of defaults.permissions) {
    const existing = permissionsById.get(permission.id)
    if (existing) {
      if (existing.builtIn) {
        Object.assign(existing, {
          parentId: permission.parentId,
          name: permission.name,
          code: permission.code,
          type: permission.type,
          routePath: permission.routePath,
          sort: permission.sort,
        })
      }
      continue
    }
    const added = { ...permission }
    snapshot.permissions.push(added)
    permissionsById.set(added.id, added)
  }

  for (const role of snapshot.roles) {
    const permissionIds = new Set(role.permissionIds.filter((id) => permissionsById.has(id)))
    if (role.builtIn) {
      defaults.permissions.forEach((permission) => permissionIds.add(permission.id))
    } else {
      for (const id of [...permissionIds]) {
        let permission = defaultPermissions.get(id)
        while (permission?.parentId) {
          permissionIds.add(permission.parentId)
          permission = defaultPermissions.get(permission.parentId)
        }
      }
    }
    role.permissionIds = [...permissionIds]
  }

  return snapshot
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isUser(value: unknown): value is SystemUser {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.id === 'string' && typeof item.username === 'string' &&
    typeof item.name === 'string' && typeof item.phone === 'string' &&
    typeof item.email === 'string' && typeof item.department === 'string' &&
    isStringArray(item.roleIds) && typeof item.enabled === 'boolean' &&
    typeof item.builtIn === 'boolean' && typeof item.remark === 'string' &&
    typeof item.createdAt === 'string' && typeof item.updatedAt === 'string'
}

function isRole(value: unknown): value is SystemRole {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.id === 'string' && typeof item.name === 'string' &&
    typeof item.code === 'string' && typeof item.sort === 'number' &&
    ['all', 'department', 'department-and-children', 'self'].includes(String(item.dataScope)) &&
    isStringArray(item.permissionIds) && typeof item.enabled === 'boolean' &&
    typeof item.builtIn === 'boolean' && typeof item.remark === 'string' &&
    typeof item.createdAt === 'string' && typeof item.updatedAt === 'string'
}

function isPermission(value: unknown): value is SystemPermission {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.id === 'string' && (item.parentId === null || typeof item.parentId === 'string') &&
    typeof item.name === 'string' && typeof item.code === 'string' &&
    ['directory', 'menu', 'button'].includes(String(item.type)) &&
    typeof item.routePath === 'string' && typeof item.sort === 'number' &&
    typeof item.visible === 'boolean' && typeof item.enabled === 'boolean' &&
    typeof item.builtIn === 'boolean' && typeof item.description === 'string' &&
    typeof item.createdAt === 'string' && typeof item.updatedAt === 'string'
}

function sanitizeUser(input: UserWriteInput): UserWriteInput {
  return {
    username: input.username.trim().normalize('NFKC'),
    password: input.password,
    name: input.name.trim().normalize('NFKC'),
    phone: input.phone.trim(),
    email: input.email.trim().toLocaleLowerCase(),
    department: input.department.trim().normalize('NFKC'),
    roleIds: [...new Set(input.roleIds)],
    enabled: input.enabled,
    remark: input.remark.trim().normalize('NFKC'),
  }
}

function userFieldsWithoutPassword(input: UserWriteInput): Omit<UserWriteInput, 'password'> {
  const sanitized = sanitizeUser(input)
  return {
    username: sanitized.username,
    name: sanitized.name,
    phone: sanitized.phone,
    email: sanitized.email,
    department: sanitized.department,
    roleIds: sanitized.roleIds,
    enabled: sanitized.enabled,
    remark: sanitized.remark,
  }
}

function sanitizeRole(input: RoleWriteInput): RoleWriteInput {
  return {
    name: input.name.trim().normalize('NFKC'),
    code: input.code.trim().normalize('NFKC').toUpperCase(),
    sort: Math.trunc(input.sort),
    dataScope: input.dataScope,
    permissionIds: [...new Set(input.permissionIds)],
    enabled: input.enabled,
    remark: input.remark.trim().normalize('NFKC'),
  }
}

function roleInputWithAncestors(input: RoleWriteInput, snapshot: RbacSnapshot): RoleWriteInput {
  const sanitized = sanitizeRole(input)
  const permissionIds = new Set(sanitized.permissionIds)
  for (const id of sanitized.permissionIds) {
    getAncestorPermissionIds(id, snapshot.permissions).forEach((ancestorId) => permissionIds.add(ancestorId))
  }
  return { ...sanitized, permissionIds: [...permissionIds] }
}

function sanitizePermission(input: PermissionWriteInput): PermissionWriteInput {
  return {
    parentId: input.parentId || null,
    name: input.name.trim().normalize('NFKC'),
    code: input.code.trim().normalize('NFKC'),
    type: input.type,
    routePath: input.routePath.trim(),
    sort: Math.trunc(input.sort),
    visible: input.visible,
    enabled: input.enabled,
    description: input.description.trim().normalize('NFKC'),
  }
}

export function validateUserInput(
  input: UserWriteInput,
  snapshot: RbacSnapshot,
  excludedId?: string,
): ValidationIssue<keyof UserWriteInput>[] {
  const value = sanitizeUser(input)
  const issues: ValidationIssue<keyof UserWriteInput>[] = []
  if (!value.username) issues.push({ field: 'username', code: 'required', message: '请输入登录账号' })
  else if (!/^[a-zA-Z][a-zA-Z0-9._-]{2,31}$/.test(value.username)) {
    issues.push({ field: 'username', code: 'invalid', message: '账号须以字母开头，由 3–32 位字母、数字、点、下划线或短横线组成' })
  } else if (snapshot.users.some((item) => item.id !== excludedId && normalizeIdentity(item.username) === normalizeIdentity(value.username))) {
    issues.push({ field: 'username', code: 'duplicate', message: '登录账号不能重复' })
  }
  if (!excludedId && !value.password) issues.push({ field: 'password', code: 'required', message: '请输入初始密码' })
  else if (value.password && (value.password.length < 6 || value.password.length > 32)) {
    issues.push({ field: 'password', code: 'invalid', message: '密码长度须为 6–32 位' })
  }
  if (!value.name) issues.push({ field: 'name', code: 'required', message: '请输入用户姓名' })
  if (value.phone && !/^1\d{10}$/.test(value.phone)) issues.push({ field: 'phone', code: 'invalid', message: '请输入正确的 11 位手机号' })
  if (value.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) issues.push({ field: 'email', code: 'invalid', message: '请输入正确的邮箱地址' })
  if (!value.department) issues.push({ field: 'department', code: 'required', message: '请输入所属部门' })
  if (value.roleIds.length === 0) issues.push({ field: 'roleIds', code: 'required', message: '请至少分配一个角色' })
  else if (value.roleIds.some((id) => !snapshot.roles.some((role) => role.id === id && role.enabled))) {
    issues.push({ field: 'roleIds', code: 'not_found', message: '所选角色不存在或已停用' })
  }
  if (Array.from(value.remark).length > 300) issues.push({ field: 'remark', code: 'too_long', message: '备注不能超过 300 个字符' })
  return issues
}

export function validateRoleInput(
  input: RoleWriteInput,
  snapshot: RbacSnapshot,
  excludedId?: string,
): ValidationIssue<keyof RoleWriteInput>[] {
  const value = sanitizeRole(input)
  const issues: ValidationIssue<keyof RoleWriteInput>[] = []
  if (!value.name) issues.push({ field: 'name', code: 'required', message: '请输入角色名称' })
  if (!value.code) issues.push({ field: 'code', code: 'required', message: '请输入角色编码' })
  else if (!/^[A-Z][A-Z0-9_]{1,49}$/.test(value.code)) issues.push({ field: 'code', code: 'invalid', message: '角色编码须为 2–50 位大写字母、数字或下划线' })
  else if (snapshot.roles.some((item) => item.id !== excludedId && normalizeIdentity(item.code) === normalizeIdentity(value.code))) {
    issues.push({ field: 'code', code: 'duplicate', message: '角色编码不能重复' })
  }
  if (!Number.isInteger(value.sort) || value.sort < 0 || value.sort > 9999) issues.push({ field: 'sort', code: 'invalid', message: '排序值须为 0–9999 的整数' })
  if (value.permissionIds.length === 0) issues.push({ field: 'permissionIds', code: 'required', message: '请至少选择一项权限' })
  else if (value.permissionIds.some((id) => !snapshot.permissions.some((permission) => permission.id === id && permission.enabled))) {
    issues.push({ field: 'permissionIds', code: 'not_found', message: '所选权限不存在或已停用' })
  }
  if (Array.from(value.remark).length > 300) issues.push({ field: 'remark', code: 'too_long', message: '备注不能超过 300 个字符' })
  return issues
}

export function validatePermissionInput(
  input: PermissionWriteInput,
  snapshot: RbacSnapshot,
  excludedId?: string,
): ValidationIssue<keyof PermissionWriteInput>[] {
  const value = sanitizePermission(input)
  const issues: ValidationIssue<keyof PermissionWriteInput>[] = []
  if (!value.name) issues.push({ field: 'name', code: 'required', message: '请输入权限名称' })
  if (!value.code) issues.push({ field: 'code', code: 'required', message: '请输入权限标识' })
  else if (!/^[a-z][a-z0-9:_-]{1,99}$/.test(value.code)) issues.push({ field: 'code', code: 'invalid', message: '权限标识须为 2–100 位小写字母、数字、冒号、下划线或短横线' })
  else if (snapshot.permissions.some((item) => item.id !== excludedId && normalizeIdentity(item.code) === normalizeIdentity(value.code))) {
    issues.push({ field: 'code', code: 'duplicate', message: '权限标识不能重复' })
  }
  if (value.parentId) {
    if (value.parentId === excludedId) issues.push({ field: 'parentId', code: 'invalid', message: '不能选择自身作为上级权限' })
    else if (!snapshot.permissions.some((item) => item.id === value.parentId)) issues.push({ field: 'parentId', code: 'not_found', message: '所选上级权限不存在' })
    else if (excludedId && getDescendantPermissionIds(excludedId, snapshot.permissions).includes(value.parentId)) {
      issues.push({ field: 'parentId', code: 'invalid', message: '不能选择当前权限的下级作为上级权限' })
    } else {
      const parent = snapshot.permissions.find((item) => item.id === value.parentId)
      if (value.type === 'button' && parent?.type !== 'menu') issues.push({ field: 'parentId', code: 'invalid', message: '按钮权限的上级必须是菜单权限' })
      if (value.type === 'directory' && parent?.type !== 'directory') issues.push({ field: 'parentId', code: 'invalid', message: '目录权限的上级只能是目录权限' })
    }
  }
  if (value.type === 'menu' && !value.routePath) issues.push({ field: 'routePath', code: 'required', message: '菜单权限须填写路由地址' })
  if (value.type === 'button' && !value.parentId) issues.push({ field: 'parentId', code: 'required', message: '按钮权限须选择所属菜单' })
  if (!Number.isInteger(value.sort) || value.sort < 0 || value.sort > 9999) issues.push({ field: 'sort', code: 'invalid', message: '排序值须为 0–9999 的整数' })
  if (Array.from(value.description).length > 300) issues.push({ field: 'description', code: 'too_long', message: '说明不能超过 300 个字符' })
  return issues
}

function throwFirstIssue(issues: readonly ValidationIssue<string>[]): void {
  if (issues[0]) throw new RbacServiceError(issues[0].message)
}

export class LocalRbacService implements RbacService {
  private readonly injectedStorage: Storage | undefined
  private readonly createId: () => string
  private readonly now: () => Date

  constructor(options: LocalRbacServiceOptions = {}) {
    this.injectedStorage = options.storage
    this.createId = options.createId ?? createClientId
    this.now = options.now ?? (() => new Date())
  }

  private get storage(): Storage {
    return this.injectedStorage ?? resolveBrowserStorage()
  }

  private read(): RbacSnapshot {
    const raw = this.storage.getItem(RBAC_STORAGE_KEY)
    if (!raw) {
      const defaults = createDefaultRbacSnapshot()
      this.write(defaults)
      return defaults
    }
    try {
      const parsed: unknown = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object') throw new Error('Invalid storage envelope')
      const data = parsed as Record<string, unknown>
      const schemaVersion = Number(data.schemaVersion)
      if (![...LEGACY_SCHEMA_VERSIONS, SCHEMA_VERSION].includes(schemaVersion) || !Array.isArray(data.users) ||
        !Array.isArray(data.roles) || !Array.isArray(data.permissions) ||
        !data.users.every(isUser) || !data.roles.every(isRole) || !data.permissions.every(isPermission)) {
        throw new Error('Unsupported or invalid storage schema')
      }
      const snapshot = cloneSnapshot(data as unknown as StoredRbacData)
      if (schemaVersion !== SCHEMA_VERSION) {
        const migrated = migrateLegacySnapshot(snapshot)
        this.write(migrated)
        return cloneSnapshot(migrated)
      }
      return snapshot
    } catch (error) {
      throw new RbacServiceError('本地系统管理数据无法解析', { cause: error })
    }
  }

  private write(snapshot: RbacSnapshot): void {
    const data: StoredRbacData = { schemaVersion: SCHEMA_VERSION, ...cloneSnapshot(snapshot) }
    this.storage.setItem(RBAC_STORAGE_KEY, JSON.stringify(data))
  }

  async load(): Promise<RbacSnapshot> {
    return sortSnapshot(this.read())
  }

  async createUser(input: UserWriteInput): Promise<SystemUser> {
    const snapshot = this.read()
    throwFirstIssue(validateUserInput(input, snapshot))
    const timestamp = this.now().toISOString()
    const user: SystemUser = { ...userFieldsWithoutPassword(input), id: this.createId(), builtIn: false, createdAt: timestamp, updatedAt: timestamp }
    snapshot.users.push(user)
    this.write(snapshot)
    return { ...user, roleIds: [...user.roleIds] }
  }

  async updateUser(id: string, input: UserWriteInput): Promise<SystemUser> {
    const snapshot = this.read()
    const index = snapshot.users.findIndex((item) => item.id === id)
    if (index < 0) throw new RbacServiceError('未找到要更新的用户')
    throwFirstIssue(validateUserInput(input, snapshot, id))
    const previous = snapshot.users[index]!
    if (previous.builtIn && !input.enabled) throw new RbacServiceError('内置管理员不能停用')
    if (previous.builtIn && !input.roleIds.includes('role-super-admin')) {
      throw new RbacServiceError('内置管理员必须保留超级管理员角色')
    }
    const user: SystemUser = { ...userFieldsWithoutPassword(input), id, builtIn: previous.builtIn, createdAt: previous.createdAt, updatedAt: this.now().toISOString() }
    snapshot.users[index] = user
    this.write(snapshot)
    return { ...user, roleIds: [...user.roleIds] }
  }

  async removeUser(id: string): Promise<void> {
    const snapshot = this.read()
    const user = snapshot.users.find((item) => item.id === id)
    if (!user) throw new RbacServiceError('未找到要删除的用户')
    if (user.builtIn) throw new RbacServiceError('内置管理员不能删除')
    snapshot.users = snapshot.users.filter((item) => item.id !== id)
    this.write(snapshot)
  }

  async createRole(input: RoleWriteInput): Promise<SystemRole> {
    const snapshot = this.read()
    throwFirstIssue(validateRoleInput(input, snapshot))
    const timestamp = this.now().toISOString()
    const role: SystemRole = { ...roleInputWithAncestors(input, snapshot), id: this.createId(), builtIn: false, createdAt: timestamp, updatedAt: timestamp }
    snapshot.roles.push(role)
    this.write(snapshot)
    return { ...role, permissionIds: [...role.permissionIds] }
  }

  async updateRole(id: string, input: RoleWriteInput): Promise<SystemRole> {
    const snapshot = this.read()
    const index = snapshot.roles.findIndex((item) => item.id === id)
    if (index < 0) throw new RbacServiceError('未找到要更新的角色')
    throwFirstIssue(validateRoleInput(input, snapshot, id))
    const previous = snapshot.roles[index]!
    if (previous.builtIn && !input.enabled) throw new RbacServiceError('内置超级管理员角色不能停用')
    const roleInput = previous.builtIn
      ? { ...input, enabled: true, permissionIds: snapshot.permissions.map((item) => item.id) }
      : input
    const role: SystemRole = { ...roleInputWithAncestors(roleInput, snapshot), id, builtIn: previous.builtIn, createdAt: previous.createdAt, updatedAt: this.now().toISOString() }
    snapshot.roles[index] = role
    this.write(snapshot)
    return { ...role, permissionIds: [...role.permissionIds] }
  }

  async removeRole(id: string): Promise<void> {
    const snapshot = this.read()
    const role = snapshot.roles.find((item) => item.id === id)
    if (!role) throw new RbacServiceError('未找到要删除的角色')
    if (role.builtIn) throw new RbacServiceError('内置超级管理员角色不能删除')
    const userCount = snapshot.users.filter((user) => user.roleIds.includes(id)).length
    if (userCount > 0) throw new RbacServiceError(`该角色已分配给 ${userCount} 个用户，请先解除关联`)
    snapshot.roles = snapshot.roles.filter((item) => item.id !== id)
    this.write(snapshot)
  }

  async createPermission(input: PermissionWriteInput): Promise<SystemPermission> {
    const snapshot = this.read()
    throwFirstIssue(validatePermissionInput(input, snapshot))
    const timestamp = this.now().toISOString()
    const permission: SystemPermission = { ...sanitizePermission(input), id: this.createId(), builtIn: false, createdAt: timestamp, updatedAt: timestamp }
    snapshot.permissions.push(permission)
    for (const role of snapshot.roles) {
      if (role.builtIn) role.permissionIds = [...new Set([...role.permissionIds, permission.id])]
    }
    this.write(snapshot)
    return { ...permission }
  }

  async updatePermission(id: string, input: PermissionWriteInput): Promise<SystemPermission> {
    const snapshot = this.read()
    const index = snapshot.permissions.findIndex((item) => item.id === id)
    if (index < 0) throw new RbacServiceError('未找到要更新的权限')
    throwFirstIssue(validatePermissionInput(input, snapshot, id))
    const previous = snapshot.permissions[index]!
    if (previous.builtIn && (
      input.parentId !== previous.parentId || input.type !== previous.type ||
      normalizeIdentity(input.code) !== normalizeIdentity(previous.code)
    )) {
      throw new RbacServiceError('内置权限的上级、类型和权限标识不能修改')
    }
    if (previous.builtIn && !input.enabled) throw new RbacServiceError('内置权限不能停用')
    const permission: SystemPermission = { ...sanitizePermission(input), id, builtIn: previous.builtIn, createdAt: previous.createdAt, updatedAt: this.now().toISOString() }
    snapshot.permissions[index] = permission
    this.write(snapshot)
    return { ...permission }
  }

  async removePermission(id: string): Promise<void> {
    const snapshot = this.read()
    const permission = snapshot.permissions.find((item) => item.id === id)
    if (!permission) throw new RbacServiceError('未找到要删除的权限')
    if (permission.builtIn) throw new RbacServiceError('内置权限不能删除')
    if (snapshot.permissions.some((item) => item.parentId === id)) throw new RbacServiceError('该权限存在下级权限，请先删除或移动下级权限')
    const roleCount = snapshot.roles.filter((role) => !role.builtIn && role.permissionIds.includes(id)).length
    if (roleCount > 0) throw new RbacServiceError(`该权限已被 ${roleCount} 个角色使用，请先解除授权`)
    snapshot.permissions = snapshot.permissions.filter((item) => item.id !== id)
    for (const role of snapshot.roles) role.permissionIds = role.permissionIds.filter((permissionId) => permissionId !== id)
    this.write(snapshot)
  }
}

export const rbacService = new LocalRbacService()
