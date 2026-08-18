export type RoleKind = 'super-admin' | 'preset' | 'custom'
export type PermissionType = 'group' | 'page' | 'action'
export type UserStatus = 'enabled' | 'disabled' | 'locked'
export type DepartmentStatus = 'enabled' | 'disabled'
export type UserStatusFilter = 'all' | UserStatus

export interface SystemUser {
  id: string
  username: string
  name: string
  phone: string
  departmentIds: string[]
  roleIds: string[]
  status: UserStatus
  builtIn: boolean
  mustChangePassword: boolean
  passwordUpdatedAt: string
  lastLoginAt: string | null
  lockedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface UserCreateInput {
  username: string
  name: string
  phone: string
  departmentIds: string[]
  roleIds: string[]
  password: string
  confirmPassword: string
}

export interface UserBasicInfoInput {
  name: string
  phone: string
  departmentIds: string[]
  roleIds: string[]
  status: UserStatus
}

export interface UserPasswordResetInput {
  password: string
  confirmPassword: string
}

export interface SystemDepartment {
  id: string
  parentId: string | null
  name: string
  ownerUserId: string | null
  sort: number
  status: DepartmentStatus
  createdAt: string
  updatedAt: string
}

export interface DepartmentWriteInput {
  parentId: string | null
  name: string
  ownerUserId: string | null
  sort: number
  status: DepartmentStatus
}

export interface SystemRole {
  id: string
  name: string
  kind: RoleKind
  permissionIds: string[]
  description: string
  createdAt: string
  updatedAt: string
}

export interface RoleCreateInput {
  name: string
  description: string
  permissionIds: string[]
}

export interface RoleBasicInfoInput {
  name: string
  description: string
}

export interface RolePermissionInput {
  permissionIds: string[]
}

export interface SystemPermission {
  id: string
  parentId: string | null
  name: string
  code: string
  type: PermissionType
  sort: number
}

export interface UserQuery {
  keyword: string
  departmentIds: string[]
  roleIds: string[]
  status: UserStatusFilter
}

export interface RoleQuery {
  keyword: string
}

export interface ValidationIssue<TField extends string> {
  field: TField
  code: 'required' | 'duplicate' | 'invalid' | 'too_short' | 'too_long' | 'not_found'
  message: string
}

export type UserCreateValidationField = keyof UserCreateInput
export type UserBasicInfoValidationField = keyof UserBasicInfoInput
export type UserPasswordResetValidationField = keyof UserPasswordResetInput
export type DepartmentValidationField = keyof DepartmentWriteInput
export type RoleCreateValidationField = keyof RoleCreateInput
export type RoleBasicInfoValidationField = keyof RoleBasicInfoInput
export type RolePermissionValidationField = keyof RolePermissionInput

export interface RbacSnapshot {
  users: SystemUser[]
  departments: SystemDepartment[]
  roles: SystemRole[]
  permissions: SystemPermission[]
}

export interface RbacService {
  load(): Promise<RbacSnapshot>
  createUser(input: UserCreateInput): Promise<SystemUser>
  updateUserInfo(id: string, input: UserBasicInfoInput): Promise<SystemUser>
  resetUserPassword(id: string, input: UserPasswordResetInput): Promise<SystemUser>
  setUserStatus(id: string, status: Exclude<UserStatus, 'locked'>): Promise<SystemUser>
  unlockUser(id: string): Promise<SystemUser>
  removeUser(id: string): Promise<void>
  createDepartment(input: DepartmentWriteInput): Promise<SystemDepartment>
  updateDepartment(id: string, input: DepartmentWriteInput): Promise<SystemDepartment>
  removeDepartment(id: string): Promise<void>
  createRole(input: RoleCreateInput): Promise<SystemRole>
  updateRoleInfo(id: string, input: RoleBasicInfoInput): Promise<SystemRole>
  updateRolePermissions(id: string, input: RolePermissionInput): Promise<SystemRole>
  assignRoleUsers(id: string, userIds: readonly string[]): Promise<SystemUser[]>
  removeRole(id: string): Promise<void>
}

export interface PermissionTreeNode extends SystemPermission {
  children: PermissionTreeNode[]
  depth: number
}

export interface DepartmentTreeNode extends SystemDepartment {
  children: DepartmentTreeNode[]
  depth: number
}

export interface RolePermissionSummary {
  pageCount: number
  actionCount: number
  label: string
}
