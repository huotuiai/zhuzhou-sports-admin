import type { Component } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import {
  ArmchairIcon,
  BusFrontIcon,
  HouseIcon,
  KeyRoundIcon,
  MapPinnedIcon,
  ShieldCheckIcon,
  SquareParkingIcon,
  TicketCheckIcon,
  UsersRoundIcon,
} from '@lucide/vue'

export interface SidebarNavigationItem {
  id: string
  label: string
  icon: Component
  to?: RouteLocationRaw
  disabled?: boolean
  badge?: string
}

export interface SidebarNavigationGroup {
  id: string
  label: string
  items: readonly SidebarNavigationItem[]
}

/**
 * 侧边栏只负责导航结构。业务模块明确后，将对应路由按组加入即可。
 * 未配置路由的示例项保持禁用，避免误导用户。
 */
export const sidebarNavigation: readonly SidebarNavigationGroup[] = [
  {
    id: 'base',
    label: '基础导航',
    items: [
      {
        id: 'home',
        label: '首页',
        icon: HouseIcon,
        to: { name: 'home' },
      },
    ],
  },
  {
    id: 'application-management',
    label: '应用管理',
    items: [
      {
        id: 'control-zones',
        label: '管制区域',
        icon: MapPinnedIcon,
        to: { name: 'area-control' },
      },
      {
        id: 'parking-lots',
        label: '停车场列表',
        icon: SquareParkingIcon,
        to: { name: 'parking-management' },
      },
      {
        id: 'ticket-gates',
        label: '检票口管理',
        icon: TicketCheckIcon,
        to: { name: 'ticket-gate-management' },
      },
      {
        id: 'shuttle-points',
        label: '接驳点管理',
        icon: BusFrontIcon,
        to: { name: 'shuttle-point-management' },
      },
      {
        id: 'venue-seats',
        label: '座位管理',
        icon: ArmchairIcon,
        to: { name: 'seat-management' },
      },
    ],
  },
  {
    id: 'system-management',
    label: '系统管理',
    items: [
      {
        id: 'users',
        label: '用户管理',
        icon: UsersRoundIcon,
        to: { name: 'user-management' },
      },
      {
        id: 'roles',
        label: '角色管理',
        icon: ShieldCheckIcon,
        to: { name: 'role-management' },
      },
      {
        id: 'permissions',
        label: '权限管理',
        icon: KeyRoundIcon,
        to: { name: 'permission-management' },
      },
    ],
  },
] as const
