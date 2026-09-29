import type { RouteLocationRaw } from 'vue-router'
import type {
  AuthorizedNavigationGroup,
  AuthorizedNavigationItem,
  AuthorizedNavigationNode,
  NavigationRegistration,
  PermissionCode,
} from '@/config/navigation'
import type { AuthMenu } from '@/types/auth'
import { FolderIcon } from '@lucide/vue'
import { menuDisplayName } from '@/config/data-display'
import { navigationRegistrationForPath, navigationRegistry } from '@/config/navigation'
import { adaptLegacyDataDisplayNavigation } from '@/lib/data-display-navigation'

export interface AccessContext {
  menus: readonly AuthMenu[]
  isSuper: boolean
}

interface MenuIndex {
  effectiveIds: Set<string>
}

function rootParent(parentId: string | null): boolean {
  return parentId === null || parentId === '' || parentId === '0'
}

export function normalizeMenuPath(path: string): string {
  const pathname = path.split(/[?#]/u, 1)[0] ?? ''
  if (!pathname) return ''
  if (pathname === '/') return pathname
  return pathname.replace(/\/+$/u, '') || '/'
}

function compareMenus(left: AuthMenu, right: AuthMenu): number {
  return left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, 'zh-CN') || left.id.localeCompare(right.id)
}

function indexMenus(menus: readonly AuthMenu[]): MenuIndex {
  const byId = new Map(menus.map(menu => [menu.id, menu]))
  const effectiveIds = new Set<string>()
  const checked = new Map<string, boolean>()

  function isEffective(menu: AuthMenu, visiting = new Set<string>()): boolean {
    const cached = checked.get(menu.id)
    if (cached !== undefined) return cached
    if (!menu.enabled || visiting.has(menu.id)) {
      checked.set(menu.id, false)
      return false
    }
    if (rootParent(menu.parentId)) {
      const effective = menu.menuType === 1
      checked.set(menu.id, effective)
      if (effective) effectiveIds.add(menu.id)
      return effective
    }
    const parent = byId.get(menu.parentId!)
    if (!parent) {
      checked.set(menu.id, false)
      return false
    }
    const validParentType = ((menu.menuType === 1 || menu.menuType === 2) && parent.menuType === 1) ||
      (menu.menuType === 3 && parent.menuType === 2)
    if (!validParentType) {
      checked.set(menu.id, false)
      return false
    }
    const nextVisiting = new Set(visiting)
    nextVisiting.add(menu.id)
    const effective = isEffective(parent, nextVisiting)
    checked.set(menu.id, effective)
    if (effective) effectiveIds.add(menu.id)
    return effective
  }

  menus.forEach(menu => isEffective(menu))
  return { effectiveIds }
}

function permissionSet(context: AccessContext, index = indexMenus(context.menus)): Set<string> {
  return new Set(context.menus
    .filter(menu => index.effectiveIds.has(menu.id) && Boolean(menu.permission))
    .map(menu => menu.permission!))
}

export function effectivePermissionCodes(context: AccessContext): string[] {
  return [...permissionSet(context)].sort()
}

export function hasPermission(context: AccessContext, permission: PermissionCode | string): boolean {
  return context.isSuper || permissionSet(context).has(permission)
}

function activePageForPath(context: AccessContext, path: string, index = indexMenus(context.menus)): AuthMenu | undefined {
  const normalizedPath = normalizeMenuPath(path)
  return context.menus.find(menu => menu.menuType === 2 && index.effectiveIds.has(menu.id) && normalizeMenuPath(menu.path ?? '') === normalizedPath)
}

export function canAccessPath(context: AccessContext, path: string): boolean {
  const normalizedPath = normalizeMenuPath(path)
  const registration = navigationRegistrationForPath(normalizedPath)
  if (!registration) return false
  const authorizationPath = normalizeMenuPath(registration.authorizationPath ?? normalizedPath)
  const index = indexMenus(context.menus)
  const page = activePageForPath(context, authorizationPath, index)
  if (!page) return false
  if (context.isSuper || page.permission === registration.permission) return true
  return context.menus.some(menu => menu !== page && menu.menuType === 2 && index.effectiveIds.has(menu.id) &&
    normalizeMenuPath(menu.path ?? '') === authorizationPath && menu.permission === registration.permission)
}

function registeredItem(page: AuthMenu, registration: NavigationRegistration): AuthorizedNavigationItem {
  return { ...registration, kind: 'page', label: menuDisplayName(page) || registration.id }
}

export function buildAuthorizedNavigation(context: AccessContext): AuthorizedNavigationGroup[] {
  const index = indexMenus(context.menus)
  const groups = context.menus
    .filter(menu => menu.menuType === 1 && rootParent(menu.parentId) && menu.visible && index.effectiveIds.has(menu.id))
    .sort(compareMenus)

  function childrenFor(parentId: string): AuthorizedNavigationNode[] {
    return context.menus
      .filter(menu => menu.parentId === parentId && menu.visible && index.effectiveIds.has(menu.id))
      .sort(compareMenus)
      .flatMap<AuthorizedNavigationNode>((menu) => {
        if (menu.menuType === 1) {
          const children = childrenFor(menu.id)
          return children.length ? [{ kind: 'directory', id: menu.id, label: menu.name, icon: FolderIcon, children }] : []
        }
        if (menu.menuType !== 2) return []
        const registration = navigationRegistrationForPath(normalizeMenuPath(menu.path ?? ''))
        if (!registration || !canAccessPath(context, registration.path) ||
          (!registration.authorizationPath && !context.isSuper && menu.permission !== registration.permission)) return []
        return [registeredItem(menu, registration)]
      })
  }

  const navigation = groups.flatMap((group) => {
    const items = childrenFor(group.id)
    return items.length ? [{ id: group.id, label: group.name, items }] : []
  })
  return adaptLegacyDataDisplayNavigation(navigation, context.menus, path => canAccessPath(context, path))
}

function accessibleRegistrations(context: AccessContext): NavigationRegistration[] {
  const index = indexMenus(context.menus)
  function visit(menus: readonly AuthMenu[]): NavigationRegistration[] {
    return [...menus].sort(compareMenus).flatMap((menu) => {
      if (!index.effectiveIds.has(menu.id)) return []
      if (menu.menuType === 1) return visit(context.menus.filter(child => child.parentId === menu.id))
      if (menu.menuType !== 2) return []
      const registration = navigationRegistrationForPath(normalizeMenuPath(menu.path ?? ''))
      if (!registration || !canAccessPath(context, registration.path) ||
        (!registration.authorizationPath && !context.isSuper && menu.permission !== registration.permission)) return []
      return [registration]
    })
  }

  return visit(context.menus.filter(menu => rootParent(menu.parentId)))
}

export function navigationBreadcrumbs(groups: readonly AuthorizedNavigationGroup[], routeName: string): string[] {
  function find(nodes: readonly AuthorizedNavigationNode[]): string[] | null {
    for (const node of nodes) {
      if (node.kind === 'page' && node.routeName === routeName) return [node.label]
      if (node.kind === 'directory') {
        const path = find(node.children)
        if (path) return [node.label, ...path]
      }
    }
    return null
  }

  for (const group of groups) {
    const path = find(group.items)
    if (path) return [group.label, ...path]
  }
  return []
}

export function firstAccessibleRoute(context: AccessContext): RouteLocationRaw | null {
  const first = accessibleRegistrations(context)[0]
  return first ? { name: first.routeName } : null
}

export function isRegisteredAdminPath(path: string): boolean {
  return navigationRegistry.some(item => item.path === normalizeMenuPath(path))
}
