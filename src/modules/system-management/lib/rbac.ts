import type {
  DepartmentTreeNode,
  PermissionTreeNode,
  RoleKind,
  RolePermissionSummary,
  SystemDepartment,
  SystemPermission,
  SystemRole,
  SystemUser,
} from '../types'

export const ROLE_KIND_LABELS: Record<RoleKind, string> = {
  'super-admin': '超管',
  preset: '预置',
  custom: '自定义',
}

export const PERMISSION_TYPE_LABELS: Record<SystemPermission['type'], string> = {
  group: '分组',
  page: '页面',
  action: '功能点',
}

export function normalizeIdentity(value: string): string {
  return value.trim().normalize('NFKC').toLocaleLowerCase('zh-CN')
}

export function buildDepartmentTree(
  departments: readonly SystemDepartment[],
  parentId: string | null = null,
  depth = 0,
): DepartmentTreeNode[] {
  return departments
    .filter((item) => item.parentId === parentId)
    .sort((first, second) => first.sort - second.sort || first.name.localeCompare(second.name, 'zh-CN'))
    .map((item) => ({
      ...item,
      depth,
      children: buildDepartmentTree(departments, item.id, depth + 1),
    }))
}

export function flattenDepartmentTree(nodes: readonly DepartmentTreeNode[]): DepartmentTreeNode[] {
  return nodes.flatMap((node) => [node, ...flattenDepartmentTree(node.children)])
}

export function getDepartmentDescendantIds(
  departmentId: string,
  departments: readonly SystemDepartment[],
): string[] {
  const childIds = departments.filter((item) => item.parentId === departmentId).map((item) => item.id)
  return childIds.flatMap((id) => [id, ...getDepartmentDescendantIds(id, departments)])
}

export function departmentNamesForUser(
  user: SystemUser,
  departments: readonly SystemDepartment[],
): string[] {
  const departmentMap = new Map(departments.map((item) => [item.id, item.name]))
  const names = user.departmentIds.map((id) => departmentMap.get(id)).filter((name): name is string => Boolean(name))
  return names.length ? names : (user.departmentNames ?? [])
}

export function buildPermissionTree(
  permissions: readonly SystemPermission[],
  parentId: string | null = null,
  depth = 0,
): PermissionTreeNode[] {
  return permissions
    .filter((item) => item.parentId === parentId)
    .sort((first, second) => first.sort - second.sort || first.name.localeCompare(second.name, 'zh-CN'))
    .map((item) => ({
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
  const childIds = permissions.filter((item) => item.parentId === permissionId).map((item) => item.id)
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

export function normalizePermissionIds(
  permissionIds: readonly string[],
  permissions: readonly SystemPermission[],
): string[] {
  const validIds = new Set(permissions.map((item) => item.id))
  const selected = new Set(permissionIds.filter((id) => validIds.has(id)))
  for (const id of [...selected]) {
    getAncestorPermissionIds(id, permissions).forEach((ancestorId) => selected.add(ancestorId))
  }
  return permissions.map((item) => item.id).filter((id) => selected.has(id))
}

export function roleNamesForUser(user: SystemUser, roles: readonly SystemRole[]): string[] {
  const roleMap = new Map(roles.map((role) => [role.id, role.name]))
  const names = user.roleIds.map((id) => roleMap.get(id)).filter((name): name is string => Boolean(name))
  return names.length ? names : (user.roleNames ?? [])
}

export function summarizeRolePermissions(
  role: SystemRole,
  permissions: readonly SystemPermission[],
): RolePermissionSummary {
  const selected = new Set(role.permissionIds)
  const pageCount = permissions.filter((item) => item.type === 'page' && selected.has(item.id)).length
  const actionCount = permissions.filter((item) => item.type === 'action' && selected.has(item.id)).length
  return {
    pageCount,
    actionCount,
    label: role.kind === 'super-admin' ? '全部页面 / 全部功能点' : `${pageCount} 页面 / ${actionCount} 功能点`,
  }
}
