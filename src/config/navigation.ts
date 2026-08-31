import type { Component } from 'vue'
import {
  ArmchairIcon,
  BookOpenTextIcon,
  BusFrontIcon,
  CarFrontIcon,
  ChartNoAxesCombinedIcon,
  ChevronRightIcon,
  CircleDotIcon,
  FileTextIcon,
  LayoutDashboardIcon,
  MessageSquareIcon,
  ScanEyeIcon,
  ShieldIcon,
  TrafficConeIcon,
  UserRoundIcon,
  UsersRoundIcon,
} from '@lucide/vue'

export type PermissionCode
  = | 'dashboard:view'
    | 'dashboard:export'
    | 'content:view'
    | 'content:operate'
    | 'content:export'
    | 'control:view'
    | 'control:operate'
    | 'control:export'
    | 'seat:view'
    | 'seat:operate'
    | 'seat:export'
    | 'gate:view'
    | 'gate:operate'
    | 'gate:export'
    | 'parking:view'
    | 'parking:operate'
    | 'parking:export'
    | 'shuttle:view'
    | 'shuttle:operate'
    | 'shuttle:export'
    | 'vr:view'
    | 'vr:operate'
    | 'user:view'
    | 'user:operate'
    | 'user:export'
    | 'role:view'
    | 'role:operate'
    | 'integration:view'
    | 'integration:operate'
    | 'audit:view'
    | 'audit:export'
    | 'service:view'
    | 'service:operate'
    | 'service:export'

export interface NavigationRegistration {
  id: string
  path: string
  routeName: string
  permission: PermissionCode
  icon: Component
  trailingIcon?: Component
}

export interface AuthorizedNavigationItem extends NavigationRegistration {
  label: string
}

export interface AuthorizedNavigationGroup {
  id: string
  label: string
  items: AuthorizedNavigationItem[]
}

const managementArrow = ChevronRightIcon

/**
 * Only trusted frontend routes and icons are registered here. The API menu tree
 * supplies labels, grouping, ordering and access, but never executable components.
 */
export const navigationRegistry: readonly NavigationRegistration[] = [
  { id: 'data-dashboard', path: '/', routeName: 'data-dashboard', permission: 'dashboard:view', icon: ChartNoAxesCombinedIcon },
  { id: 'data-screen', path: '/operations/data-screen', routeName: 'data-screen', permission: 'dashboard:view', icon: LayoutDashboardIcon },
  { id: 'content-management', path: '/operations/content', routeName: 'content-management', permission: 'content:view', icon: BookOpenTextIcon, trailingIcon: managementArrow },
  { id: 'traffic-control', path: '/area-control', routeName: 'area-control', permission: 'control:view', icon: TrafficConeIcon, trailingIcon: managementArrow },
  { id: 'venue-seats', path: '/seats', routeName: 'seat-management', permission: 'seat:view', icon: ArmchairIcon, trailingIcon: managementArrow },
  { id: 'ticket-gates', path: '/ticket-gates', routeName: 'ticket-gate-management', permission: 'gate:view', icon: CircleDotIcon, trailingIcon: managementArrow },
  { id: 'parking-areas', path: '/parking-management', routeName: 'parking-management', permission: 'parking:view', icon: CarFrontIcon, trailingIcon: managementArrow },
  { id: 'shuttle-buses', path: '/shuttle-points', routeName: 'shuttle-point-management', permission: 'shuttle:view', icon: BusFrontIcon, trailingIcon: managementArrow },
  { id: 'vr-links', path: '/vr-links', routeName: 'vr-link-management', permission: 'vr:view', icon: ScanEyeIcon, trailingIcon: managementArrow },
  { id: 'users', path: '/system/users', routeName: 'user-management', permission: 'user:view', icon: UserRoundIcon, trailingIcon: managementArrow },
  { id: 'roles', path: '/system/roles', routeName: 'role-management', permission: 'role:view', icon: UsersRoundIcon, trailingIcon: managementArrow },
  { id: 'external-data', path: '/system/external-data', routeName: 'external-data-integration', permission: 'integration:view', icon: ShieldIcon, trailingIcon: managementArrow },
  { id: 'operation-logs', path: '/system/operation-logs', routeName: 'operation-logs', permission: 'audit:view', icon: FileTextIcon, trailingIcon: managementArrow },
  { id: 'user-services', path: '/system/user-services', routeName: 'user-service-management', permission: 'service:view', icon: MessageSquareIcon, trailingIcon: managementArrow },
] as const

export function navigationRegistrationForPath(path: string): NavigationRegistration | undefined {
  return navigationRegistry.find(item => item.path === path)
}
