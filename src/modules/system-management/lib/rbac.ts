import type {
  PermissionTreeNode,
  SystemPermission,
  SystemRole,
  SystemUser,
} from '../types'

export const DATA_SCOPE_LABELS = {
  all: '全部数据',
  department: '本部门数据',
  'department-and-children': '本部门及下级数据',
  self: '仅本人数据',
} as const

export const PERMISSION_TYPE_LABELS = {
  directory: '目录',
  menu: '菜单',
  button: '按钮',
} as const

export function normalizeIdentity(value: string): string {
  return value.trim().normalize('NFKC').toLocaleLowerCase('zh-CN')
}

export function sortByOrderAndName<T extends { sort: number; name: string }>(records: readonly T[]): T[] {
  return [...records].sort((first, second) => first.sort - second.sort || first.name.localeCompare(second.name, 'zh-CN'))
}

export function buildPermissionTree(
  permissions: readonly SystemPermission[],
  parentId: string | null = null,
  depth = 0,
): PermissionTreeNode[] {
  return sortByOrderAndName(permissions.filter((item) => item.parentId === parentId)).map((item) => ({
    ...item,
    depth,
    children: buildPermissionTree(permissions, item.id, depth + 1),
  }))
}

export function flattenPermissionTree(nodes: readonly PermissionTreeNode[]): PermissionTreeNode[] {
  return nodes.flatMap((node) => [node, ...flattenPermissionTree(node.children)])
}

export function getDescendantPermissionIds(
  permissionId: string,
  permissions: readonly SystemPermission[],
): string[] {
  const childIds = permissions
    .filter((item) => item.parentId === permissionId)
    .map((item) => item.id)
  return childIds.flatMap((id) => [id, ...getDescendantPermissionIds(id, permissions)])
}

export function getAncestorPermissionIds(
  permissionId: string,
  permissions: readonly SystemPermission[],
): string[] {
  const current = permissions.find((item) => item.id === permissionId)
  if (!current?.parentId) return []
  return [current.parentId, ...getAncestorPermissionIds(current.parentId, permissions)]
}

export function roleNamesForUser(user: SystemUser, roles: readonly SystemRole[]): string[] {
  const roleMap = new Map(roles.map((role) => [role.id, role.name]))
  return user.roleIds.map((id) => roleMap.get(id)).filter((name): name is string => Boolean(name))
}

export function permissionNamesForRole(
  role: SystemRole,
  permissions: readonly SystemPermission[],
): string[] {
  const permissionMap = new Map(permissions.map((permission) => [permission.id, permission.name]))
  return role.permissionIds
    .map((id) => permissionMap.get(id))
    .filter((name): name is string => Boolean(name))
}
