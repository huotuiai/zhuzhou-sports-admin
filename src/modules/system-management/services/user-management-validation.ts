import type {
  DepartmentWriteInput,
  SystemUser,
  UserBasicInfoInput,
  UserCreateInput,
  UserManagementValidationContext,
  UserPasswordResetInput,
  ValidationIssue,
} from '../types'
import { getDepartmentDescendantIds, normalizeIdentity } from '../lib/rbac'

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
  else if (input.password.length < 8 || input.password.length > 64 || !/[a-zA-Z]/.test(input.password) || !/\d/.test(input.password)) {
    issues.push({ field: 'password', code: 'invalid', message: '密码须为 8–64 位且同时包含字母和数字' })
  }
  if (!input.confirmPassword) issues.push({ field: 'confirmPassword', code: 'required', message: '请再次输入密码' })
  else if (input.confirmPassword !== input.password) issues.push({ field: 'confirmPassword', code: 'invalid', message: '两次输入的密码不一致' })
  return issues
}

function validateUserRelations(
  departmentIds: readonly string[],
  roleIds: readonly string[],
  context: UserManagementValidationContext,
  allowedDisabledDepartmentIds: ReadonlySet<string> = new Set(),
): ValidationIssue<'departmentIds' | 'roleIds'>[] {
  const issues: ValidationIssue<'departmentIds' | 'roleIds'>[] = []
  if (departmentIds.length === 0) issues.push({ field: 'departmentIds', code: 'required', message: '请至少选择一个所属部门' })
  else if (departmentIds.some(id => !context.departments.some(item => item.id === id))) {
    issues.push({ field: 'departmentIds', code: 'not_found', message: '所选部门不存在' })
  }
  else if (departmentIds.some(id => context.departments.some(item => item.id === id && item.status === 'disabled') && !allowedDisabledDepartmentIds.has(id))) {
    issues.push({ field: 'departmentIds', code: 'invalid', message: '已停用部门不能新增分配' })
  }
  if (roleIds.length === 0) issues.push({ field: 'roleIds', code: 'required', message: '请至少分配一个角色' })
  else if (roleIds.some(id => !context.roles.some(role => role.id === id))) {
    issues.push({ field: 'roleIds', code: 'not_found', message: '所选角色不存在' })
  }
  return issues
}

export function validateUserCreateInput(
  input: UserCreateInput,
  context: UserManagementValidationContext,
): ValidationIssue<keyof UserCreateInput>[] {
  const value = sanitizeUserCreate(input)
  const issues: ValidationIssue<keyof UserCreateInput>[] = []
  if (!value.username) issues.push({ field: 'username', code: 'required', message: '请输入用户名' })
  else if (!/^[a-zA-Z][a-zA-Z0-9_]{3,31}$/.test(value.username)) {
    issues.push({ field: 'username', code: 'invalid', message: '用户名仅支持字母开头的 4–32 位字母、数字或下划线' })
  }
  else if (context.users.some(user => normalizeIdentity(user.username) === normalizeIdentity(value.username))) {
    issues.push({ field: 'username', code: 'duplicate', message: '用户名不能重复' })
  }
  if (!value.name) issues.push({ field: 'name', code: 'required', message: '请输入姓名' })
  else if (Array.from(value.name).length > 50) issues.push({ field: 'name', code: 'too_long', message: '姓名不能超过 50 个字符' })
  if (value.phone && !/^1\d{10}$/.test(value.phone)) issues.push({ field: 'phone', code: 'invalid', message: '请输入正确的 11 位手机号' })
  issues.push(...validateUserRelations(value.departmentIds, value.roleIds, context))
  issues.push(...validatePassword(value))
  return issues
}

export function validateUserBasicInfoInput(
  input: UserBasicInfoInput,
  context: UserManagementValidationContext,
  user: SystemUser,
): ValidationIssue<keyof UserBasicInfoInput>[] {
  const value = sanitizeUserInfo(input)
  const issues: ValidationIssue<keyof UserBasicInfoInput>[] = []
  if (!value.name) issues.push({ field: 'name', code: 'required', message: '请输入姓名' })
  else if (Array.from(value.name).length > 50) issues.push({ field: 'name', code: 'too_long', message: '姓名不能超过 50 个字符' })
  if (value.phone && !/^1\d{10}$/.test(value.phone)) issues.push({ field: 'phone', code: 'invalid', message: '请输入正确的 11 位手机号' })
  issues.push(...validateUserRelations(value.departmentIds, value.roleIds, context, new Set(user.departmentIds)))
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
  context: UserManagementValidationContext,
  excludedId?: string,
): ValidationIssue<keyof DepartmentWriteInput>[] {
  const value = sanitizeDepartment(input)
  const issues: ValidationIssue<keyof DepartmentWriteInput>[] = []
  if (!value.name) issues.push({ field: 'name', code: 'required', message: '请输入部门名称' })
  else if (Array.from(value.name).length > 50) issues.push({ field: 'name', code: 'too_long', message: '部门名称不能超过 50 个字符' })
  else if (context.departments.some(item => item.id !== excludedId && item.parentId === value.parentId && normalizeIdentity(item.name) === normalizeIdentity(value.name))) {
    issues.push({ field: 'name', code: 'duplicate', message: '同级部门名称不能重复' })
  }
  if (value.parentId && !context.departments.some(item => item.id === value.parentId)) {
    issues.push({ field: 'parentId', code: 'not_found', message: '所选上级部门不存在' })
  }
  else if (excludedId && value.parentId && (value.parentId === excludedId || getDepartmentDescendantIds(excludedId, context.departments).includes(value.parentId))) {
    issues.push({ field: 'parentId', code: 'invalid', message: '上级部门不能选择自己或自己的下级' })
  }
  if (value.ownerUserId && !context.users.some(user => user.id === value.ownerUserId)) {
    issues.push({ field: 'ownerUserId', code: 'not_found', message: '所选部门主管不存在' })
  }
  if (!Number.isInteger(value.sort) || value.sort < 0 || value.sort > 9999) {
    issues.push({ field: 'sort', code: 'invalid', message: '排序须为 0–9999 的整数' })
  }
  if (!['enabled', 'disabled'].includes(value.status)) issues.push({ field: 'status', code: 'invalid', message: '请选择有效的部门状态' })
  return issues
}
