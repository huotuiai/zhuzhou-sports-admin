import type {
  RoleBasicInfoInput,
  RoleCreateInput,
  RolePermissionInput,
  SystemPermission,
  SystemRole,
  ValidationIssue,
} from '../types'
import { normalizeIdentity } from '../lib/rbac'

function sanitizedRoleInfo(input: RoleBasicInfoInput): RoleBasicInfoInput {
  return {
    name: input.name.trim().normalize('NFKC'),
    description: input.description.trim().normalize('NFKC'),
  }
}

function validateRoleInfo(
  input: RoleBasicInfoInput,
  roles: readonly SystemRole[],
  excludedId?: string,
): ValidationIssue<keyof RoleBasicInfoInput>[] {
  const value = sanitizedRoleInfo(input)
  const issues: ValidationIssue<keyof RoleBasicInfoInput>[] = []
  const length = Array.from(value.name).length
  if (!value.name) issues.push({ field: 'name', code: 'required', message: '请输入角色名称' })
  else if (length < 2) issues.push({ field: 'name', code: 'too_short', message: '角色名称不能少于 2 个字符' })
  else if (length > 20) issues.push({ field: 'name', code: 'too_long', message: '角色名称不能超过 20 个字符' })
  else if (roles.some(role => role.id !== excludedId && normalizeIdentity(role.name) === normalizeIdentity(value.name))) {
    issues.push({ field: 'name', code: 'duplicate', message: '角色名称不能重复' })
  }
  if (Array.from(value.description).length > 300) {
    issues.push({ field: 'description', code: 'too_long', message: '描述不能超过 300 个字符' })
  }
  return issues
}

export function validateRolePermissionInput(
  input: RolePermissionInput,
  permissions: readonly SystemPermission[],
): ValidationIssue<keyof RolePermissionInput>[] {
  const validIds = new Set(permissions.map(permission => permission.id))
  if (input.permissionIds.some(id => !validIds.has(id))) {
    return [{ field: 'permissionIds', code: 'not_found', message: '所选权限不存在' }]
  }
  if (!permissions.some(permission => permission.type === 'action' && input.permissionIds.includes(permission.id))) {
    return [{ field: 'permissionIds', code: 'required', message: '请至少选择一个功能点' }]
  }
  return []
}

export function validateRoleCreateInput(
  input: RoleCreateInput,
  roles: readonly SystemRole[],
  permissions: readonly SystemPermission[],
): ValidationIssue<keyof RoleCreateInput>[] {
  return [
    ...validateRoleInfo(input, roles),
    ...validateRolePermissionInput(input, permissions),
  ]
}

export function validateRoleBasicInfoInput(
  input: RoleBasicInfoInput,
  roles: readonly SystemRole[],
  excludedId?: string,
): ValidationIssue<keyof RoleBasicInfoInput>[] {
  return validateRoleInfo(input, roles, excludedId)
}
