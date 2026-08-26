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
  roleNames?: string[]
  departmentNames?: string[]
  status: UserStatus
  builtIn: boolean
  email?: string | null
  remark?: string | null
  loginFailCount?: number
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
  ownerName?: string | null
  sort: number
  status: DepartmentStatus
  remark?: string | null
  userCount?: number
  childCount?: number
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
  code?: string
  name: string
  kind: RoleKind
  enabled?: boolean
  preset?: boolean
  sort?: number
  userCount?: number
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
  departmentId: string
  roleId: string
  status: UserStatusFilter
}

export interface UserPage {
  users: SystemUser[]
  total: number
  page: number
  pageSize: number
}

export interface UserUpdateOptions {
  includeStatus?: boolean
}

export interface RolePage {
  roles: SystemRole[]
  total: number
  page: number
  pageSize: number
}

export interface RoleManagementService {
  listRoles(query: RoleQuery, page: number, pageSize: number): Promise<RolePage>
  getRole(id: string): Promise<SystemRole>
  createRole(input: RoleCreateInput): Promise<SystemRole>
  updateRole(id: string, input: RoleBasicInfoInput): Promise<SystemRole>
  deleteRole(id: string): Promise<void>
  listMenus(): Promise<SystemPermission[]>
  replaceRoleMenus(id: string, input: RolePermissionInput): Promise<SystemRole>
  listRoleUsers(id: string): Promise<SystemUser[]>
  replaceRoleUsers(id: string, userIds: readonly string[]): Promise<void>
}

export interface UserManagementService {
  listUsers(query: UserQuery, page: number, pageSize: number): Promise<UserPage>
  getUser(id: string): Promise<SystemUser>
  createUser(input: UserCreateInput): Promise<SystemUser>
  updateUser(id: string, input: UserBasicInfoInput, options?: UserUpdateOptions): Promise<SystemUser>
  changeUserStatus(id: string, status: Exclude<UserStatus, 'locked'>): Promise<SystemUser>
  resetUserPassword(id: string, input: UserPasswordResetInput): Promise<void>
  unlockUser(id: string): Promise<void>
  deleteUser(id: string): Promise<void>
  listDepartments(): Promise<SystemDepartment[]>
  createDepartment(input: DepartmentWriteInput): Promise<SystemDepartment>
  updateDepartment(id: string, input: DepartmentWriteInput): Promise<SystemDepartment>
  deleteDepartment(id: string): Promise<void>
  listRoles(page: number, pageSize: number): Promise<RolePage>
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

export interface UserManagementValidationContext {
  users: SystemUser[]
  departments: SystemDepartment[]
  roles: SystemRole[]
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
