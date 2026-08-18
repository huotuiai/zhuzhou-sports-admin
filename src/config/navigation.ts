import type { Component } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
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
  ShieldIcon,
  TrafficConeIcon,
  UserRoundIcon,
  UsersRoundIcon,
} from '@lucide/vue'

export interface SidebarNavigationItem {
  id: string
  label: string
  icon: Component
  to: RouteLocationRaw
  trailingIcon?: Component
}

export interface SidebarNavigationGroup {
  id: string
  label: string
  items: readonly SidebarNavigationItem[]
}

const managementArrow = ChevronRightIcon

export const sidebarNavigation: readonly SidebarNavigationGroup[] = [
  {
    id: 'operations-management',
    label: '运营管理',
    items: [
      {
        id: 'data-dashboard',
        label: '数据看板',
        icon: ChartNoAxesCombinedIcon,
        to: { name: 'data-dashboard' },
      },
      {
        id: 'data-screen',
        label: '数据大屏',
        icon: LayoutDashboardIcon,
        to: { name: 'data-screen' },
      },
      {
        id: 'content-management',
        label: '内容管理',
        icon: BookOpenTextIcon,
        to: { name: 'content-management' },
        trailingIcon: managementArrow,
      },
      {
        id: 'traffic-control',
        label: '交通管制',
        icon: TrafficConeIcon,
        to: { name: 'area-control' },
        trailingIcon: managementArrow,
      },
    ],
  },
  {
    id: 'venue-management',
    label: '场地管理',
    items: [
      {
        id: 'venue-seats',
        label: '座位规划管理',
        icon: ArmchairIcon,
        to: { name: 'seat-management' },
        trailingIcon: managementArrow,
      },
      {
        id: 'ticket-gates',
        label: '检票口管理',
        icon: CircleDotIcon,
        to: { name: 'ticket-gate-management' },
        trailingIcon: managementArrow,
      },
      {
        id: 'parking-areas',
        label: '停车区管理',
        icon: CarFrontIcon,
        to: { name: 'parking-management' },
        trailingIcon: managementArrow,
      },
      {
        id: 'shuttle-buses',
        label: '接驳车管理',
        icon: BusFrontIcon,
        to: { name: 'shuttle-point-management' },
        trailingIcon: managementArrow,
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
        icon: UserRoundIcon,
        to: { name: 'user-management' },
        trailingIcon: managementArrow,
      },
      {
        id: 'roles',
        label: '角色管理',
        icon: UsersRoundIcon,
        to: { name: 'role-management' },
        trailingIcon: managementArrow,
      },
      {
        id: 'external-data',
        label: '外部数据对接',
        icon: ShieldIcon,
        to: { name: 'external-data-integration' },
        trailingIcon: managementArrow,
      },
      {
        id: 'operation-logs',
        label: '操作日志',
        icon: FileTextIcon,
        to: { name: 'operation-logs' },
        trailingIcon: managementArrow,
      },
      {
        id: 'user-services',
        label: '用户服务管理',
        icon: MessageSquareIcon,
        to: { name: 'user-service-management' },
        trailingIcon: managementArrow,
      },
    ],
  },
] as const
