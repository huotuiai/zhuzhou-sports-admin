import type {
  DepartmentWriteInput,
  RbacService,
  RbacSnapshot,
  RoleBasicInfoInput,
  RoleCreateInput,
  RolePermissionInput,
  SystemDepartment,
  SystemRole,
  SystemUser,
  UserBasicInfoInput,
  UserCreateInput,
  UserPasswordResetInput,
  UserStatus,
  ValidationIssue,
} from '../types'
import {
  ALL_PERMISSION_IDS,
  DEFAULT_DEPARTMENTS,
  DEFAULT_PERMISSIONS,
  DEFAULT_ROLES,
  createDefaultRbacSnapshot,
} from '../default-data'
import { getDepartmentDescendantIds, normalizeIdentity, normalizePermissionIds } from '../lib/rbac'
import { createClientId } from '@/lib/id'

export const RBAC_STORAGE_KEY = 'zz-sports-rbac:v2'
export const RBAC_SCHEMA_VERSION = 8
const DYNAMIC_PERMISSION_SCHEMA_VERSIONS = [2, 3, 4, 5, 6] as const

interface StoredRbacData {
  schemaVersion: typeof RBAC_SCHEMA_VERSION
  users: SystemUser[]
  departments: SystemDepartment[]
  roles: SystemRole[]
}

interface LegacyUser {
  id: string
  username: string
  name: string
  phone: string
  email: string
  department: string
  roleIds: string[]
  enabled: boolean
  builtIn: boolean
  remark: string
  createdAt: string
  updatedAt: string
}

interface LegacyRole {
  id: string
  name: string
  code?: string
  permissionIds: string[]
  builtIn?: boolean
  remark?: string
  description?: string
  createdAt: string
  updatedAt: string
}

interface LegacyDynamicRbacData {
  users: LegacyUser[]
  roles: LegacyRole[]
  permissions: Array<{ id: string }>
}

interface LegacyV7RbacData {
  users: LegacyUser[]
  roles: SystemRole[]
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

const LEGACY_PERMISSION_MAP: Readonly<Record<string, readonly string[]>> = {
  'permission-home': ['permission-home-view'],
  'permission-application': [],
  'permission-area': ['permission-area-view'],
  'permission-parking': ['permission-parking-view'],
  'permission-parking-create': ['permission-parking-operate'],
  'permission-parking-update': ['permission-parking-operate'],
  'permission-parking-delete': ['permission-parking-operate'],
  'permission-ticket-gate': ['permission-ticket-gate-view'],
  'permission-ticket-gate-create': ['permission-ticket-gate-operate'],
  'permission-ticket-gate-update': ['permission-ticket-gate-operate'],
  'permission-ticket-gate-status': ['permission-ticket-gate-operate'],
  'permission-ticket-gate-nearby': ['permission-ticket-gate-operate'],
  'permission-ticket-gate-delete': ['permission-ticket-gate-operate'],
  'permission-shuttle': ['permission-shuttle-view'],
  'permission-shuttle-create': ['permission-shuttle-operate'],
  'permission-shuttle-update': ['permission-shuttle-operate'],
  'permission-shuttle-delete': ['permission-shuttle-operate'],
  'permission-seat': ['permission-seat-view'],
  'permission-seat-create': ['permission-seat-operate'],
  'permission-seat-update': ['permission-seat-operate'],
  'permission-seat-delete': ['permission-seat-operate'],
  'permission-operations': [],
  'permission-content': [
    'permission-content-activity-view', 'permission-content-news-view',
    'permission-content-banner-view', 'permission-content-hint-view',
  ],
  'permission-content-create': [
    'permission-content-activity-operate', 'permission-content-news-operate',
    'permission-content-banner-operate', 'permission-content-hint-operate',
  ],
  'permission-content-update': [
    'permission-content-activity-operate', 'permission-content-news-operate',
    'permission-content-banner-operate', 'permission-content-hint-operate',
  ],
  'permission-content-delete': [
    'permission-content-activity-operate', 'permission-content-news-operate',
    'permission-content-banner-operate', 'permission-content-hint-operate',
  ],
  'permission-content-status': [
    'permission-content-activity-operate', 'permission-content-news-operate',
    'permission-content-banner-operate', 'permission-content-hint-operate',
  ],
  'permission-content-sync': ['permission-content-activity-operate', 'permission-content-news-operate'],
  'permission-content-export': [
    'permission-content-activity-export', 'permission-content-news-export',
    'permission-content-banner-export', 'permission-content-hint-export',
  ],
  'permission-system': [],
  'permission-user': ['permission-user-view'],
  'permission-user-create': ['permission-user-operate'],
  'permission-user-update': ['permission-user-operate'],
  'permission-user-delete': ['permission-user-operate'],
  'permission-role': ['permission-role-view'],
  'permission-role-create': ['permission-role-operate'],
  'permission-role-update': ['permission-role-operate'],
  'permission-role-delete': ['permission-role-operate'],
  'permission-permission': ['permission-role-view'],
  'permission-permission-create': ['permission-role-operate'],
  'permission-permission-update': ['permission-role-operate'],
  'permission-permission-delete': ['permission-role-operate'],
}

function resolveBrowserStorage(): Storage {
  if (typeof globalThis.localStorage === 'undefined') throw new RbacServiceError('当前环境不支持本地存储')
  return globalThis.localStorage
}

function cloneUser(user: SystemUser): SystemUser {
  return { ...user, departmentIds: [...user.departmentIds], roleIds: [...user.roleIds] }
}

function cloneDepartment(department: SystemDepartment): SystemDepartment {
  return { ...department }
}

function cloneRole(role: SystemRole): SystemRole {
  return { ...role, permissionIds: [...role.permissionIds] }
}

function cloneSnapshot(snapshot: RbacSnapshot): RbacSnapshot {
  return {
    users: snapshot.users.map(cloneUser),
    departments: snapshot.departments.map(cloneDepartment),
    roles: snapshot.roles.map(cloneRole),
    permissions: snapshot.permissions.map((item) => ({ ...item })),
  }
}

function sortSnapshot(snapshot: RbacSnapshot): RbacSnapshot {
  const kindOrder = { 'super-admin': 0, preset: 1, custom: 2 } as const
  return {
    users: [...snapshot.users].sort((first, second) =>
      second.createdAt.localeCompare(first.createdAt) || first.name.localeCompare(second.name, 'zh-CN')),
    departments: [...snapshot.departments].sort((first, second) =>
      first.sort - second.sort || first.name.localeCompare(second.name, 'zh-CN')),
    roles: [...snapshot.roles].sort((first, second) =>
      kindOrder[first.kind] - kindOrder[second.kind] ||
      first.createdAt.localeCompare(second.createdAt) ||
      first.name.localeCompare(second.name, 'zh-CN')),
    permissions: DEFAULT_PERMISSIONS.map((item) => ({ ...item })),
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isUser(value: unknown): value is SystemUser {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.id === 'string' && typeof item.username === 'string' && typeof item.name === 'string' &&
    typeof item.phone === 'string' && isStringArray(item.departmentIds) && isStringArray(item.roleIds) &&
    ['enabled', 'disabled', 'locked'].includes(String(item.status)) && typeof item.builtIn === 'boolean' &&
    typeof item.mustChangePassword === 'boolean' && typeof item.passwordUpdatedAt === 'string' &&
    isNullableString(item.lastLoginAt) && isNullableString(item.lockedAt) &&
    typeof item.createdAt === 'string' && typeof item.updatedAt === 'string'
}

function isLegacyUser(value: unknown): value is LegacyUser {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.id === 'string' && typeof item.username === 'string' && typeof item.name === 'string' &&
    typeof item.phone === 'string' && typeof item.email === 'string' && typeof item.department === 'string' &&
    isStringArray(item.roleIds) && typeof item.enabled === 'boolean' && typeof item.builtIn === 'boolean' &&
    typeof item.remark === 'string' && typeof item.createdAt === 'string' && typeof item.updatedAt === 'string'
}

function isDepartment(value: unknown): value is SystemDepartment {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.id === 'string' && isNullableString(item.parentId) && typeof item.name === 'string' &&
    isNullableString(item.ownerUserId) && typeof item.sort === 'number' && Number.isInteger(item.sort) &&
    ['enabled', 'disabled'].includes(String(item.status)) &&
    typeof item.createdAt === 'string' && typeof item.updatedAt === 'string'
}

function isRole(value: unknown): value is SystemRole {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.id === 'string' && typeof item.name === 'string' &&
    ['super-admin', 'preset', 'custom'].includes(String(item.kind)) && isStringArray(item.permissionIds) &&
    typeof item.description === 'string' && typeof item.createdAt === 'string' && typeof item.updatedAt === 'string'
}

function isLegacyRole(value: unknown): value is LegacyRole {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.id === 'string' && typeof item.name === 'string' && isStringArray(item.permissionIds) &&
    typeof item.createdAt === 'string' && typeof item.updatedAt === 'string'
}

function mapLegacyPermissionIds(permissionIds: readonly string[]): string[] {
  const fixedIds = new Set(DEFAULT_PERMISSIONS.map((item) => item.id))
  const mapped = new Set<string>()
  for (const id of permissionIds) {
    const replacements = LEGACY_PERMISSION_MAP[id]
    if (replacements) replacements.forEach((replacement) => mapped.add(replacement))
    else if (fixedIds.has(id)) mapped.add(id)
  }
  return normalizePermissionIds([...mapped], DEFAULT_PERMISSIONS)
}

function legacyRoleKind(role: LegacyRole): SystemRole['kind'] {
  if (role.id === 'role-super-admin' || role.code === 'SUPER_ADMIN' || normalizeIdentity(role.name) === normalizeIdentity('超级管理员')) return 'super-admin'
  if (['role-operator', 'role-auditor', 'role-traffic-admin'].includes(role.id)) return 'preset'
  if (['场馆管理员', '数据查看员', '交警管理员'].some((name) => normalizeIdentity(name) === normalizeIdentity(role.name))) return 'preset'
  return 'custom'
}

function reconcileDefaultRoles(inputRoles: readonly SystemRole[]): SystemRole[] {
  const roles = inputRoles.map(cloneRole)
  for (const defaultRole of DEFAULT_ROLES) {
    const existing = roles.find((role) => role.id === defaultRole.id || normalizeIdentity(role.name) === normalizeIdentity(defaultRole.name))
    if (!existing) {
      roles.push(cloneRole(defaultRole))
      continue
    }
    existing.kind = defaultRole.kind
    if (existing.id === defaultRole.id) {
      existing.name = defaultRole.name
      existing.description = defaultRole.description
    }
    if (defaultRole.kind === 'super-admin') existing.permissionIds = [...ALL_PERMISSION_IDS]
  }
  return roles
}

function migrateDynamicRoles(legacyRoles: readonly LegacyRole[]): SystemRole[] {
  return reconcileDefaultRoles(legacyRoles.map((legacy) => {
    const kind = legacyRoleKind(legacy)
    const defaultRole = DEFAULT_ROLES.find((item) => item.id === legacy.id)
    return {
      id: legacy.id,
      name: defaultRole?.name ?? legacy.name,
      kind,
      permissionIds: kind === 'super-admin' ? [...ALL_PERMISSION_IDS] : mapLegacyPermissionIds(legacy.permissionIds),
      description: defaultRole?.description ?? legacy.description ?? legacy.remark ?? '',
      createdAt: legacy.createdAt,
      updatedAt: legacy.updatedAt,
    }
  }))
}

function migrateUsers(legacyUsers: readonly LegacyUser[], roles: readonly SystemRole[]): {
  users: SystemUser[]
  departments: SystemDepartment[]
} {
  const departments = DEFAULT_DEPARTMENTS.map(cloneDepartment)
  let migratedDepartmentSequence = 0
  const departmentIdForName = (name: string, timestamp: string): string => {
    const normalized = normalizeIdentity(name)
    const existing = departments.find((item) => normalizeIdentity(item.name) === normalized)
    if (existing) return existing.id
    const id = `department-migrated-${++migratedDepartmentSequence}`
    departments.push({
      id, parentId: null, name: name.trim().normalize('NFKC'), ownerUserId: null,
      sort: 900 + migratedDepartmentSequence, status: 'enabled', createdAt: timestamp, updatedAt: timestamp,
    })
    return id
  }
  const validRoleIds = new Set(roles.map((role) => role.id))
  const superRole = roles.find((role) => role.kind === 'super-admin')!
  const users = legacyUsers.map((legacy): SystemUser => {
    const roleIds = legacy.roleIds.filter((id) => validRoleIds.has(id))
    if (legacy.builtIn && !roleIds.includes(superRole.id)) roleIds.push(superRole.id)
    const departmentIds = legacy.department.trim()
      ? [departmentIdForName(legacy.department, legacy.createdAt)]
      : []
    return {
      id: legacy.id,
      username: legacy.username,
      name: legacy.name,
      phone: legacy.phone,
      departmentIds,
      roleIds,
      status: legacy.enabled ? 'enabled' : 'disabled',
      builtIn: legacy.builtIn,
      mustChangePassword: false,
      passwordUpdatedAt: legacy.updatedAt,
      lastLoginAt: null,
      lockedAt: null,
      createdAt: legacy.createdAt,
      updatedAt: legacy.updatedAt,
    }
  })
  const validUserIds = new Set(users.map((user) => user.id))
  for (const department of departments) {
    if (department.ownerUserId && !validUserIds.has(department.ownerUserId)) department.ownerUserId = null
  }
  return { users, departments }
}

function migrateDynamicData(data: LegacyDynamicRbacData): RbacSnapshot {
  const roles = migrateDynamicRoles(data.roles)
  const { users, departments } = migrateUsers(data.users, roles)
  return { users, departments, roles, permissions: DEFAULT_PERMISSIONS.map((item) => ({ ...item })) }
}

function migrateV7Data(data: LegacyV7RbacData): RbacSnapshot {
  const roles = reconcileDefaultRoles(data.roles.map((role) => role.kind === 'super-admin'
    ? { ...cloneRole(role), permissionIds: [...ALL_PERMISSION_IDS] }
    : { ...cloneRole(role), permissionIds: normalizePermissionIds(role.permissionIds, DEFAULT_PERMISSIONS) }))
  const { users, departments } = migrateUsers(data.users, roles)
  return { users, departments, roles, permissions: DEFAULT_PERMISSIONS.map((item) => ({ ...item })) }
}

function sanitizeUserCreate(input: UserCreateInput): UserCreateInput {
  return {
    username: input.username.trim().normalize('NFKC'),
    name: input.name.trim().normalize('NFKC'),
    phone: input.phone.trim(),
    departmentIds: [...new Set(input.departmentIds)],
    roleIds: [...new Set(input.roleIds)],
    password: input.password,
    confirmPassword: input.confirmPassword,
  }
}

function sanitizeUserInfo(input: UserBasicInfoInput): UserBasicInfoInput {
  return {
    name: input.name.trim().normalize('NFKC'),
    phone: input.phone.trim(),
    departmentIds: [...new Set(input.departmentIds)],
    roleIds: [...new Set(input.roleIds)],
    status: input.status,
  }
}

function validatePassword(input: UserPasswordResetInput): ValidationIssue<keyof UserPasswordResetInput>[] {
  const issues: ValidationIssue<keyof UserPasswordResetInput>[] = []
  if (!input.password) issues.push({ field: 'password', code: 'required', message: '请输入密码' })
  else if (input.password.length < 8 || input.password.length > 32 || !/[a-zA-Z]/.test(input.password) || !/\d/.test(input.password)) {
    issues.push({ field: 'password', code: 'invalid', message: '密码须为 8–32 位且同时包含字母和数字' })
  }
  if (!input.confirmPassword) issues.push({ field: 'confirmPassword', code: 'required', message: '请再次输入密码' })
  else if (input.confirmPassword !== input.password) issues.push({ field: 'confirmPassword', code: 'invalid', message: '两次输入的密码不一致' })
  return issues
}

function validateUserRelations(
  departmentIds: readonly string[],
  roleIds: readonly string[],
  snapshot: RbacSnapshot,
  allowedDisabledDepartmentIds: ReadonlySet<string> = new Set(),
): ValidationIssue<'departmentIds' | 'roleIds'>[] {
  const issues: ValidationIssue<'departmentIds' | 'roleIds'>[] = []
  if (departmentIds.length === 0) issues.push({ field: 'departmentIds', code: 'required', message: '请至少选择一个所属部门' })
  else if (departmentIds.some((id) => !snapshot.departments.some((item) => item.id === id))) {
    issues.push({ field: 'departmentIds', code: 'not_found', message: '所选部门不存在' })
  } else if (departmentIds.some((id) => snapshot.departments.some((item) => item.id === id && item.status === 'disabled') && !allowedDisabledDepartmentIds.has(id))) {
    issues.push({ field: 'departmentIds', code: 'invalid', message: '已停用部门不能新增分配' })
  }
  if (roleIds.length === 0) issues.push({ field: 'roleIds', code: 'required', message: '请至少分配一个角色' })
  else if (roleIds.some((id) => !snapshot.roles.some((role) => role.id === id))) {
    issues.push({ field: 'roleIds', code: 'not_found', message: '所选角色不存在' })
  }
  return issues
}

export function validateUserCreateInput(
  input: UserCreateInput,
  snapshot: RbacSnapshot,
): ValidationIssue<keyof UserCreateInput>[] {
  const value = sanitizeUserCreate(input)
  const issues: ValidationIssue<keyof UserCreateInput>[] = []
  if (!value.username) issues.push({ field: 'username', code: 'required', message: '请输入用户名' })
  else if (!/^[a-zA-Z0-9_]{4,20}$/.test(value.username)) issues.push({ field: 'username', code: 'invalid', message: '用户名仅支持 4–20 位字母、数字或下划线' })
  else if (snapshot.users.some((user) => normalizeIdentity(user.username) === normalizeIdentity(value.username))) {
    issues.push({ field: 'username', code: 'duplicate', message: '用户名不能重复' })
  }
  if (!value.name) issues.push({ field: 'name', code: 'required', message: '请输入姓名' })
  else if (Array.from(value.name).length > 50) issues.push({ field: 'name', code: 'too_long', message: '姓名不能超过 50 个字符' })
  if (value.phone && !/^1\d{10}$/.test(value.phone)) issues.push({ field: 'phone', code: 'invalid', message: '请输入正确的 11 位手机号' })
  issues.push(...validateUserRelations(value.departmentIds, value.roleIds, snapshot))
  issues.push(...validatePassword(value))
  return issues
}

export function validateUserBasicInfoInput(
  input: UserBasicInfoInput,
  snapshot: RbacSnapshot,
  user: SystemUser,
): ValidationIssue<keyof UserBasicInfoInput>[] {
  const value = sanitizeUserInfo(input)
  const issues: ValidationIssue<keyof UserBasicInfoInput>[] = []
  if (!value.name) issues.push({ field: 'name', code: 'required', message: '请输入姓名' })
  else if (Array.from(value.name).length > 50) issues.push({ field: 'name', code: 'too_long', message: '姓名不能超过 50 个字符' })
  if (value.phone && !/^1\d{10}$/.test(value.phone)) issues.push({ field: 'phone', code: 'invalid', message: '请输入正确的 11 位手机号' })
  issues.push(...validateUserRelations(value.departmentIds, value.roleIds, snapshot, new Set(user.departmentIds)))
  if (!['enabled', 'disabled', 'locked'].includes(value.status)) issues.push({ field: 'status', code: 'invalid', message: '请选择有效的账号状态' })
  else if (value.status === 'locked' && user.status !== 'locked') issues.push({ field: 'status', code: 'invalid', message: '锁定状态只能由登录风控产生' })
  return issues
}

export function validateUserPasswordResetInput(
  input: UserPasswordResetInput,
): ValidationIssue<keyof UserPasswordResetInput>[] {
  return validatePassword(input)
}

function sanitizeDepartment(input: DepartmentWriteInput): DepartmentWriteInput {
  return {
    parentId: input.parentId,
    name: input.name.trim().normalize('NFKC'),
    ownerUserId: input.ownerUserId,
    sort: input.sort,
    status: input.status,
  }
}

export function validateDepartmentInput(
  input: DepartmentWriteInput,
  snapshot: RbacSnapshot,
  excludedId?: string,
): ValidationIssue<keyof DepartmentWriteInput>[] {
  const value = sanitizeDepartment(input)
  const issues: ValidationIssue<keyof DepartmentWriteInput>[] = []
  if (!value.name) issues.push({ field: 'name', code: 'required', message: '请输入部门名称' })
  else if (Array.from(value.name).length > 50) issues.push({ field: 'name', code: 'too_long', message: '部门名称不能超过 50 个字符' })
  else if (snapshot.departments.some((item) => item.id !== excludedId && item.parentId === value.parentId && normalizeIdentity(item.name) === normalizeIdentity(value.name))) {
    issues.push({ field: 'name', code: 'duplicate', message: '同级部门名称不能重复' })
  }
  if (value.parentId && !snapshot.departments.some((item) => item.id === value.parentId)) {
    issues.push({ field: 'parentId', code: 'not_found', message: '所选上级部门不存在' })
  } else if (excludedId && value.parentId && (value.parentId === excludedId || getDepartmentDescendantIds(excludedId, snapshot.departments).includes(value.parentId))) {
    issues.push({ field: 'parentId', code: 'invalid', message: '上级部门不能选择自己或自己的下级' })
  }
  if (value.ownerUserId && !snapshot.users.some((user) => user.id === value.ownerUserId)) {
    issues.push({ field: 'ownerUserId', code: 'not_found', message: '所选部门主管不存在' })
  }
  if (!Number.isInteger(value.sort) || value.sort < 0 || value.sort > 9999) {
    issues.push({ field: 'sort', code: 'invalid', message: '排序须为 0–9999 的整数' })
  }
  if (!['enabled', 'disabled'].includes(value.status)) issues.push({ field: 'status', code: 'invalid', message: '请选择有效的部门状态' })
  return issues
}

function sanitizeRoleInfo<T extends RoleCreateInput | RoleBasicInfoInput>(input: T): T {
  return { ...input, name: input.name.trim().normalize('NFKC'), description: input.description.trim().normalize('NFKC') }
}

function validateRoleInfo(input: RoleBasicInfoInput, snapshot: RbacSnapshot, excludedId?: string): ValidationIssue<keyof RoleBasicInfoInput>[] {
  const value = sanitizeRoleInfo(input)
  const issues: ValidationIssue<keyof RoleBasicInfoInput>[] = []
  const length = Array.from(value.name).length
  if (!value.name) issues.push({ field: 'name', code: 'required', message: '请输入角色名称' })
  else if (length < 2) issues.push({ field: 'name', code: 'too_short', message: '角色名称不能少于 2 个字符' })
  else if (length > 20) issues.push({ field: 'name', code: 'too_long', message: '角色名称不能超过 20 个字符' })
  else if (snapshot.roles.some((role) => role.id !== excludedId && normalizeIdentity(role.name) === normalizeIdentity(value.name))) {
    issues.push({ field: 'name', code: 'duplicate', message: '角色名称不能重复' })
  }
  if (Array.from(value.description).length > 300) issues.push({ field: 'description', code: 'too_long', message: '描述不能超过 300 个字符' })
  return issues
}

export function validateRoleCreateInput(input: RoleCreateInput, snapshot: RbacSnapshot): ValidationIssue<keyof RoleCreateInput>[] {
  const issues: ValidationIssue<keyof RoleCreateInput>[] = [...validateRoleInfo(input, snapshot)]
  const validIds = new Set(DEFAULT_PERMISSIONS.map((item) => item.id))
  if (input.permissionIds.some((id) => !validIds.has(id))) issues.push({ field: 'permissionIds', code: 'not_found', message: '所选权限不存在' })
  else if (!DEFAULT_PERMISSIONS.some((item) => item.type === 'action' && input.permissionIds.includes(item.id))) issues.push({ field: 'permissionIds', code: 'required', message: '请至少选择一个功能点' })
  return issues
}

export function validateRoleBasicInfoInput(input: RoleBasicInfoInput, snapshot: RbacSnapshot, excludedId?: string): ValidationIssue<keyof RoleBasicInfoInput>[] {
  return validateRoleInfo(input, snapshot, excludedId)
}

export function validateRolePermissionInput(input: RolePermissionInput): ValidationIssue<keyof RolePermissionInput>[] {
  const validIds = new Set(DEFAULT_PERMISSIONS.map((item) => item.id))
  if (input.permissionIds.some((id) => !validIds.has(id))) return [{ field: 'permissionIds', code: 'not_found', message: '所选权限不存在' }]
  if (!DEFAULT_PERMISSIONS.some((item) => item.type === 'action' && input.permissionIds.includes(item.id))) return [{ field: 'permissionIds', code: 'required', message: '请至少选择一个功能点' }]
  return []
}

function throwFirstIssue(issues: readonly ValidationIssue<string>[]): void {
  if (issues.length) throw new RbacServiceError(issues[0]!.message)
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
      return cloneSnapshot(defaults)
    }
    try {
      const parsed: unknown = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object') throw new Error('Invalid storage envelope')
      const data = parsed as Record<string, unknown>
      const schemaVersion = Number(data.schemaVersion)
      if (schemaVersion === RBAC_SCHEMA_VERSION) {
        if (!Array.isArray(data.users) || !data.users.every(isUser) ||
          !Array.isArray(data.departments) || !data.departments.every(isDepartment) ||
          !Array.isArray(data.roles) || !data.roles.every(isRole)) throw new Error('Invalid v8 storage data')
        return {
          users: data.users.map(cloneUser),
          departments: data.departments.map(cloneDepartment),
          roles: data.roles.map((role) => role.kind === 'super-admin'
            ? { ...cloneRole(role), permissionIds: [...ALL_PERMISSION_IDS] }
            : { ...cloneRole(role), permissionIds: normalizePermissionIds(role.permissionIds, DEFAULT_PERMISSIONS) }),
          permissions: DEFAULT_PERMISSIONS.map((item) => ({ ...item })),
        }
      }
      let migrated: RbacSnapshot
      if (schemaVersion === 7) {
        if (!Array.isArray(data.users) || !data.users.every(isLegacyUser) || !Array.isArray(data.roles) || !data.roles.every(isRole)) throw new Error('Invalid v7 storage data')
        migrated = migrateV7Data(data as unknown as LegacyV7RbacData)
      } else if ((DYNAMIC_PERMISSION_SCHEMA_VERSIONS as readonly number[]).includes(schemaVersion)) {
        if (!Array.isArray(data.users) || !data.users.every(isLegacyUser) ||
          !Array.isArray(data.roles) || !data.roles.every(isLegacyRole) ||
          !Array.isArray(data.permissions) || !data.permissions.every((item) => Boolean(item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string'))) {
          throw new Error('Invalid legacy storage data')
        }
        migrated = migrateDynamicData(data as unknown as LegacyDynamicRbacData)
      } else {
        throw new Error('Unsupported storage schema')
      }
      this.write(migrated)
      return cloneSnapshot(migrated)
    } catch (error) {
      throw new RbacServiceError('本地系统管理数据无法解析', { cause: error })
    }
  }

  private write(snapshot: RbacSnapshot): void {
    const data: StoredRbacData = {
      schemaVersion: RBAC_SCHEMA_VERSION,
      users: snapshot.users.map(cloneUser),
      departments: snapshot.departments.map(cloneDepartment),
      roles: snapshot.roles.map(cloneRole),
    }
    this.storage.setItem(RBAC_STORAGE_KEY, JSON.stringify(data))
  }

  async load(): Promise<RbacSnapshot> {
    return sortSnapshot(this.read())
  }

  async createUser(input: UserCreateInput): Promise<SystemUser> {
    const snapshot = this.read()
    throwFirstIssue(validateUserCreateInput(input, snapshot))
    const value = sanitizeUserCreate(input)
    const timestamp = this.now().toISOString()
    const user: SystemUser = {
      id: this.createId(), username: value.username, name: value.name, phone: value.phone,
      departmentIds: value.departmentIds, roleIds: value.roleIds, status: 'enabled', builtIn: false,
      mustChangePassword: true, passwordUpdatedAt: timestamp, lastLoginAt: null, lockedAt: null,
      createdAt: timestamp, updatedAt: timestamp,
    }
    snapshot.users.push(user)
    this.write(snapshot)
    return cloneUser(user)
  }

  async updateUserInfo(id: string, input: UserBasicInfoInput): Promise<SystemUser> {
    const snapshot = this.read()
    const user = snapshot.users.find((item) => item.id === id)
    if (!user) throw new RbacServiceError('未找到要更新的用户')
    throwFirstIssue(validateUserBasicInfoInput(input, snapshot, user))
    const value = sanitizeUserInfo(input)
    const superRole = snapshot.roles.find((role) => role.kind === 'super-admin')!
    if (user.builtIn && value.status !== 'enabled') throw new RbacServiceError('内置管理员不能停用或锁定')
    if (user.builtIn && !value.roleIds.includes(superRole.id)) throw new RbacServiceError('内置管理员必须保留超级管理员角色')
    if (user.status === 'locked' && value.status !== 'locked') throw new RbacServiceError('锁定账号请先通过解锁或停用操作处理')
    Object.assign(user, value, { updatedAt: this.now().toISOString() })
    this.write(snapshot)
    return cloneUser(user)
  }

  async resetUserPassword(id: string, input: UserPasswordResetInput): Promise<SystemUser> {
    const snapshot = this.read()
    const user = snapshot.users.find((item) => item.id === id)
    if (!user) throw new RbacServiceError('未找到要重置密码的用户')
    throwFirstIssue(validateUserPasswordResetInput(input))
    const timestamp = this.now().toISOString()
    user.mustChangePassword = true
    user.passwordUpdatedAt = timestamp
    user.updatedAt = timestamp
    this.write(snapshot)
    return cloneUser(user)
  }

  async setUserStatus(id: string, status: Exclude<UserStatus, 'locked'>): Promise<SystemUser> {
    const snapshot = this.read()
    const user = snapshot.users.find((item) => item.id === id)
    if (!user) throw new RbacServiceError('未找到要更新状态的用户')
    if (user.builtIn && status !== 'enabled') throw new RbacServiceError('内置管理员不能停用')
    user.status = status
    user.lockedAt = null
    user.updatedAt = this.now().toISOString()
    this.write(snapshot)
    return cloneUser(user)
  }

  async unlockUser(id: string): Promise<SystemUser> {
    const snapshot = this.read()
    const user = snapshot.users.find((item) => item.id === id)
    if (!user) throw new RbacServiceError('未找到要解锁的用户')
    if (user.status !== 'locked') throw new RbacServiceError('当前账号未处于锁定状态')
    user.status = 'enabled'
    user.lockedAt = null
    user.updatedAt = this.now().toISOString()
    this.write(snapshot)
    return cloneUser(user)
  }

  async removeUser(id: string): Promise<void> {
    const snapshot = this.read()
    const user = snapshot.users.find((item) => item.id === id)
    if (!user) throw new RbacServiceError('未找到要删除的用户')
    if (user.builtIn) throw new RbacServiceError('内置管理员不能删除')
    if (snapshot.roles.some((role) => role.kind === 'super-admin' && user.roleIds.includes(role.id))) throw new RbacServiceError('超级管理员账号不能删除')
    snapshot.users = snapshot.users.filter((item) => item.id !== id)
    for (const department of snapshot.departments) {
      if (department.ownerUserId === id) {
        department.ownerUserId = null
        department.updatedAt = this.now().toISOString()
      }
    }
    this.write(snapshot)
  }

  async createDepartment(input: DepartmentWriteInput): Promise<SystemDepartment> {
    const snapshot = this.read()
    throwFirstIssue(validateDepartmentInput(input, snapshot))
    const timestamp = this.now().toISOString()
    const department: SystemDepartment = { ...sanitizeDepartment(input), id: this.createId(), createdAt: timestamp, updatedAt: timestamp }
    snapshot.departments.push(department)
    this.write(snapshot)
    return cloneDepartment(department)
  }

  async updateDepartment(id: string, input: DepartmentWriteInput): Promise<SystemDepartment> {
    const snapshot = this.read()
    const department = snapshot.departments.find((item) => item.id === id)
    if (!department) throw new RbacServiceError('未找到要更新的部门')
    throwFirstIssue(validateDepartmentInput(input, snapshot, id))
    Object.assign(department, sanitizeDepartment(input), { updatedAt: this.now().toISOString() })
    this.write(snapshot)
    return cloneDepartment(department)
  }

  async removeDepartment(id: string): Promise<void> {
    const snapshot = this.read()
    const department = snapshot.departments.find((item) => item.id === id)
    if (!department) throw new RbacServiceError('未找到要删除的部门')
    const childCount = snapshot.departments.filter((item) => item.parentId === id).length
    if (childCount) throw new RbacServiceError(`该部门存在 ${childCount} 个下级部门，无法删除`)
    const userCount = snapshot.users.filter((user) => user.departmentIds.includes(id)).length
    if (userCount) throw new RbacServiceError(`该部门仍被 ${userCount} 个用户引用，无法删除`)
    snapshot.departments = snapshot.departments.filter((item) => item.id !== id)
    this.write(snapshot)
  }

  async createRole(input: RoleCreateInput): Promise<SystemRole> {
    const snapshot = this.read()
    throwFirstIssue(validateRoleCreateInput(input, snapshot))
    const timestamp = this.now().toISOString()
    const value = sanitizeRoleInfo(input)
    const role: SystemRole = {
      id: this.createId(), name: value.name, kind: 'custom',
      permissionIds: normalizePermissionIds(value.permissionIds, DEFAULT_PERMISSIONS),
      description: value.description, createdAt: timestamp, updatedAt: timestamp,
    }
    snapshot.roles.push(role)
    this.write(snapshot)
    return cloneRole(role)
  }

  async updateRoleInfo(id: string, input: RoleBasicInfoInput): Promise<SystemRole> {
    const snapshot = this.read()
    const role = snapshot.roles.find((item) => item.id === id)
    if (!role) throw new RbacServiceError('未找到要更新的角色')
    throwFirstIssue(validateRoleBasicInfoInput(input, snapshot, id))
    const value = sanitizeRoleInfo(input)
    if (role.kind === 'super-admin' && value.name !== role.name) throw new RbacServiceError('超级管理员角色名称不能修改')
    role.name = value.name
    role.description = value.description
    role.updatedAt = this.now().toISOString()
    this.write(snapshot)
    return cloneRole(role)
  }

  async updateRolePermissions(id: string, input: RolePermissionInput): Promise<SystemRole> {
    const snapshot = this.read()
    const role = snapshot.roles.find((item) => item.id === id)
    if (!role) throw new RbacServiceError('未找到要授权的角色')
    if (role.kind === 'super-admin') throw new RbacServiceError('超级管理员权限锁定为全部')
    throwFirstIssue(validateRolePermissionInput(input))
    role.permissionIds = normalizePermissionIds(input.permissionIds, DEFAULT_PERMISSIONS)
    role.updatedAt = this.now().toISOString()
    this.write(snapshot)
    return cloneRole(role)
  }

  async assignRoleUsers(id: string, userIds: readonly string[]): Promise<SystemUser[]> {
    const snapshot = this.read()
    const role = snapshot.roles.find((item) => item.id === id)
    if (!role) throw new RbacServiceError('未找到要分配的角色')
    const selectedIds = new Set(userIds)
    if ([...selectedIds].some((userId) => !snapshot.users.some((user) => user.id === userId))) throw new RbacServiceError('所选用户不存在')
    if (role.kind === 'super-admin' && snapshot.users.some((user) => user.builtIn && !selectedIds.has(user.id))) throw new RbacServiceError('内置管理员不能解除超级管理员角色')
    const timestamp = this.now().toISOString()
    for (const user of snapshot.users) {
      const hadRole = user.roleIds.includes(id)
      const shouldHaveRole = selectedIds.has(user.id)
      if (hadRole === shouldHaveRole) continue
      user.roleIds = shouldHaveRole ? [...user.roleIds, id] : user.roleIds.filter((roleId) => roleId !== id)
      user.updatedAt = timestamp
    }
    this.write(snapshot)
    return snapshot.users.filter((user) => selectedIds.has(user.id)).map(cloneUser)
  }

  async removeRole(id: string): Promise<void> {
    const snapshot = this.read()
    const role = snapshot.roles.find((item) => item.id === id)
    if (!role) throw new RbacServiceError('未找到要删除的角色')
    if (role.kind !== 'custom') throw new RbacServiceError('超管和预置角色不能删除')
    const userCount = snapshot.users.filter((user) => user.roleIds.includes(id)).length
    if (userCount > 0) throw new RbacServiceError(`该角色已绑定 ${userCount} 个用户，请先解除绑定`)
    snapshot.roles = snapshot.roles.filter((item) => item.id !== id)
    this.write(snapshot)
  }
}

export const rbacService = new LocalRbacService()
