export type DataScope = 'all' | 'department' | 'department-and-children' | 'self'
export type PermissionType = 'directory' | 'menu' | 'button'
export type StatusFilter = 'all' | 'enabled' | 'disabled'

export interface SystemUser {
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

export interface UserWriteInput {
  username: string
  password: string
  name: string
  phone: string
  email: string
  department: string
  roleIds: string[]
  enabled: boolean
  remark: string
}

export interface SystemRole {
  id: string
  name: string
  code: string
  sort: number
  dataScope: DataScope
  permissionIds: string[]
  enabled: boolean
  builtIn: boolean
  remark: string
  createdAt: string
  updatedAt: string
}

export interface RoleWriteInput {
  name: string
  code: string
  sort: number
  dataScope: DataScope
  permissionIds: string[]
  enabled: boolean
  remark: string
}

export interface SystemPermission {
  id: string
  parentId: string | null
  name: string
  code: string
  type: PermissionType
  routePath: string
  sort: number
  visible: boolean
  enabled: boolean
  builtIn: boolean
  description: string
  createdAt: string
  updatedAt: string
}

export interface PermissionWriteInput {
  parentId: string | null
  name: string
  code: string
  type: PermissionType
  routePath: string
  sort: number
  visible: boolean
  enabled: boolean
  description: string
}

export interface UserQuery {
  keyword: string
  roleId: string
  status: StatusFilter
}

export interface RoleQuery {
  keyword: string
  status: StatusFilter
}

export interface PermissionQuery {
  keyword: string
  type: 'all' | PermissionType
  status: StatusFilter
}

export interface ValidationIssue<TField extends string> {
  field: TField
  code: 'required' | 'duplicate' | 'invalid' | 'too_long' | 'not_found'
  message: string
}

export type UserValidationField = keyof UserWriteInput
export type RoleValidationField = keyof RoleWriteInput
export type PermissionValidationField = keyof PermissionWriteInput

export interface RbacSnapshot {
  users: SystemUser[]
  roles: SystemRole[]
  permissions: SystemPermission[]
}

export interface RbacService {
  load(): Promise<RbacSnapshot>
  createUser(input: UserWriteInput): Promise<SystemUser>
  updateUser(id: string, input: UserWriteInput): Promise<SystemUser>
  removeUser(id: string): Promise<void>
  createRole(input: RoleWriteInput): Promise<SystemRole>
  updateRole(id: string, input: RoleWriteInput): Promise<SystemRole>
  removeRole(id: string): Promise<void>
  createPermission(input: PermissionWriteInput): Promise<SystemPermission>
  updatePermission(id: string, input: PermissionWriteInput): Promise<SystemPermission>
  removePermission(id: string): Promise<void>
}

export interface PermissionTreeNode extends SystemPermission {
  children: PermissionTreeNode[]
  depth: number
}
