import type { RbacSnapshot, SystemDepartment, SystemPermission, SystemRole } from './types'

const TIMESTAMP = '2026-08-01T08:00:00.000Z'

function permission(
  id: string,
  parentId: string | null,
  name: string,
  code: string,
  type: SystemPermission['type'],
  sort: number,
): SystemPermission {
  return { id, parentId, name, code, type, sort }
}

/**
 * 权限定义是代码内的唯一数据源，后台不提供增删改入口。
 * group/page 只用于树结构，真正的授权粒度是 action。
 */
export const DEFAULT_PERMISSIONS: readonly SystemPermission[] = [
  permission('permission-home', null, '数据看板', 'home', 'page', 10),
  permission('permission-home-view', 'permission-home', '查看', 'home:view', 'action', 10),
  permission('permission-home-operate', 'permission-home', '操作', 'home:operate', 'action', 20),
  permission('permission-home-export', 'permission-home', '导出', 'home:export', 'action', 30),

  permission('permission-application', null, '应用管理', 'application', 'group', 20),
  permission('permission-area', 'permission-application', '管制区域', 'area', 'page', 10),
  permission('permission-area-view', 'permission-area', '查看', 'area:view', 'action', 10),
  permission('permission-area-operate', 'permission-area', '操作', 'area:operate', 'action', 20),
  permission('permission-parking', 'permission-application', '停车场列表', 'parking', 'page', 20),
  permission('permission-parking-view', 'permission-parking', '查看', 'parking:view', 'action', 10),
  permission('permission-parking-operate', 'permission-parking', '操作', 'parking:operate', 'action', 20),
  permission('permission-ticket-gate', 'permission-application', '检票口管理', 'ticket-gate', 'page', 30),
  permission('permission-ticket-gate-view', 'permission-ticket-gate', '查看', 'ticket-gate:view', 'action', 10),
  permission('permission-ticket-gate-operate', 'permission-ticket-gate', '操作', 'ticket-gate:operate', 'action', 20),
  permission('permission-shuttle', 'permission-application', '接驳线路管理', 'shuttle', 'page', 40),
  permission('permission-shuttle-view', 'permission-shuttle', '查看', 'shuttle:view', 'action', 10),
  permission('permission-shuttle-operate', 'permission-shuttle', '操作', 'shuttle:operate', 'action', 20),
  permission('permission-seat', 'permission-application', '座位规划管理', 'seat', 'page', 50),
  permission('permission-seat-view', 'permission-seat', '查看', 'seat:view', 'action', 10),
  permission('permission-seat-operate', 'permission-seat', '操作', 'seat:operate', 'action', 20),

  permission('permission-operations', null, '运营管理', 'operations', 'group', 60),
  permission('permission-content', 'permission-operations', '内容管理', 'operations:content', 'group', 10),
  permission('permission-content-activity', 'permission-content', '活动管理', 'operations:content:activity', 'page', 10),
  permission('permission-content-activity-view', 'permission-content-activity', '查看', 'operations:content:activity:view', 'action', 10),
  permission('permission-content-activity-operate', 'permission-content-activity', '操作', 'operations:content:activity:operate', 'action', 20),
  permission('permission-content-activity-export', 'permission-content-activity', '导出', 'operations:content:activity:export', 'action', 30),
  permission('permission-content-news', 'permission-content', '资讯通知管理', 'operations:content:news', 'page', 20),
  permission('permission-content-news-view', 'permission-content-news', '查看', 'operations:content:news:view', 'action', 10),
  permission('permission-content-news-operate', 'permission-content-news', '操作', 'operations:content:news:operate', 'action', 20),
  permission('permission-content-news-export', 'permission-content-news', '导出', 'operations:content:news:export', 'action', 30),
  permission('permission-content-banner', 'permission-content', 'Banner 图窗', 'operations:content:banner', 'page', 30),
  permission('permission-content-banner-view', 'permission-content-banner', '查看', 'operations:content:banner:view', 'action', 10),
  permission('permission-content-banner-operate', 'permission-content-banner', '操作', 'operations:content:banner:operate', 'action', 20),
  permission('permission-content-banner-export', 'permission-content-banner', '导出', 'operations:content:banner:export', 'action', 30),
  permission('permission-content-hint', 'permission-content', '高优提示', 'operations:content:hint', 'page', 40),
  permission('permission-content-hint-view', 'permission-content-hint', '查看', 'operations:content:hint:view', 'action', 10),
  permission('permission-content-hint-operate', 'permission-content-hint', '操作', 'operations:content:hint:operate', 'action', 20),
  permission('permission-content-hint-export', 'permission-content-hint', '导出', 'operations:content:hint:export', 'action', 30),

  permission('permission-system', null, '系统管理', 'system', 'group', 90),
  permission('permission-user', 'permission-system', '用户管理', 'system:user', 'page', 10),
  permission('permission-user-view', 'permission-user', '查看', 'system:user:view', 'action', 10),
  permission('permission-user-operate', 'permission-user', '操作', 'system:user:operate', 'action', 20),
  permission('permission-role', 'permission-system', '角色管理', 'system:role', 'page', 20),
  permission('permission-role-view', 'permission-role', '查看', 'system:role:view', 'action', 10),
  permission('permission-role-operate', 'permission-role', '操作', 'system:role:operate', 'action', 20),
  permission('permission-role-export', 'permission-role', '导出', 'system:role:export', 'action', 30),
] as const

export const ALL_PERMISSION_IDS = DEFAULT_PERMISSIONS.map((item) => item.id)

function idsForCodes(codes: readonly string[]): string[] {
  const wanted = new Set(codes)
  const permissionById = new Map(DEFAULT_PERMISSIONS.map((item) => [item.id, item]))
  const ids = new Set<string>()
  for (const permission of DEFAULT_PERMISSIONS) {
    if (!wanted.has(permission.code)) continue
    ids.add(permission.id)
    let current = permission
    while (current.parentId) {
      ids.add(current.parentId)
      current = permissionById.get(current.parentId)!
    }
  }
  return DEFAULT_PERMISSIONS.map((item) => item.id).filter((id) => ids.has(id))
}

const VIEW_CODES = DEFAULT_PERMISSIONS
  .filter((item) => item.type === 'action' && item.code.endsWith(':view'))
  .map((item) => item.code)

export const DEFAULT_ROLES: readonly SystemRole[] = [
  {
    id: 'role-super-admin',
    name: '超级管理员',
    kind: 'super-admin',
    permissionIds: [...ALL_PERMISSION_IDS],
    description: '系统内置角色，拥有平台全部权限',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: TIMESTAMP,
  },
  {
    id: 'role-traffic-admin',
    name: '交警管理员',
    kind: 'preset',
    permissionIds: idsForCodes([
      'home:view',
      'area:view', 'area:operate',
      'parking:view', 'parking:operate',
      'ticket-gate:view', 'ticket-gate:operate',
      'shuttle:view', 'shuttle:operate',
    ]),
    description: '交通管制发布与现场数据维护',
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: TIMESTAMP,
  },
  {
    id: 'role-operator',
    name: '场馆管理员',
    kind: 'preset',
    permissionIds: idsForCodes([
      'home:view', 'home:operate', 'home:export',
      'area:view', 'area:operate',
      'parking:view', 'parking:operate',
      'ticket-gate:view', 'ticket-gate:operate',
      'shuttle:view', 'shuttle:operate',
      'seat:view', 'seat:operate',
      'operations:content:activity:view', 'operations:content:activity:operate', 'operations:content:activity:export',
      'operations:content:news:view', 'operations:content:news:operate', 'operations:content:news:export',
      'operations:content:banner:view', 'operations:content:banner:operate', 'operations:content:banner:export',
      'operations:content:hint:view', 'operations:content:hint:operate', 'operations:content:hint:export',
    ]),
    description: '场地数据与内容配置',
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: TIMESTAMP,
  },
  {
    id: 'role-auditor',
    name: '数据查看员',
    kind: 'preset',
    permissionIds: idsForCodes(VIEW_CODES),
    description: '仅查看当前已上线页面，不可执行业务操作',
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: TIMESTAMP,
  },
] as const

export const DEFAULT_DEPARTMENTS: readonly SystemDepartment[] = [
  {
    id: 'department-venue', parentId: null, name: '体育中心管理方', ownerUserId: 'user-admin',
    sort: 10, status: 'enabled', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: TIMESTAMP,
  },
  {
    id: 'department-operations', parentId: 'department-venue', name: '场馆运营部', ownerUserId: 'user-venue-admin',
    sort: 10, status: 'enabled', createdAt: '2026-01-02T00:00:00.000Z', updatedAt: TIMESTAMP,
  },
  {
    id: 'department-police', parentId: null, name: '交警大队', ownerUserId: 'user-traffic-admin',
    sort: 20, status: 'enabled', createdAt: '2026-02-01T00:00:00.000Z', updatedAt: TIMESTAMP,
  },
  {
    id: 'department-command', parentId: 'department-police', name: '交通指挥中心', ownerUserId: null,
    sort: 10, status: 'enabled', createdAt: '2026-02-02T00:00:00.000Z', updatedAt: TIMESTAMP,
  },
  {
    id: 'department-security', parentId: null, name: '安保部', ownerUserId: null,
    sort: 30, status: 'enabled', createdAt: '2026-02-10T00:00:00.000Z', updatedAt: TIMESTAMP,
  },
] as const

export function createDefaultRbacSnapshot(): RbacSnapshot {
  return {
    permissions: DEFAULT_PERMISSIONS.map((item) => ({ ...item })),
    roles: DEFAULT_ROLES.map((item) => ({ ...item, permissionIds: [...item.permissionIds] })),
    departments: DEFAULT_DEPARTMENTS.map((item) => ({ ...item })),
    users: [
      {
        id: 'user-admin',
        username: 'admin',
        name: '管理员',
        phone: '13800000000',
        departmentIds: ['department-venue'],
        roleIds: ['role-super-admin'],
        status: 'enabled',
        builtIn: true,
        mustChangePassword: false,
        passwordUpdatedAt: '2026-01-01T00:00:00.000Z',
        lastLoginAt: '2026-08-13T01:58:00.000Z',
        lockedAt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: TIMESTAMP,
      },
      {
        id: 'user-traffic-admin',
        username: 'zhangjing',
        name: '张警官',
        phone: '13900001234',
        departmentIds: ['department-police'],
        roleIds: ['role-traffic-admin'],
        status: 'enabled',
        builtIn: false,
        mustChangePassword: false,
        passwordUpdatedAt: '2026-03-12T00:00:00.000Z',
        lastLoginAt: '2026-08-13T01:12:00.000Z',
        lockedAt: null,
        createdAt: '2026-03-12T00:00:00.000Z',
        updatedAt: TIMESTAMP,
      },
      {
        id: 'user-venue-admin',
        username: 'changwu',
        name: '场馆管理员',
        phone: '13700005678',
        departmentIds: ['department-venue', 'department-operations'],
        roleIds: ['role-operator'],
        status: 'enabled',
        builtIn: false,
        mustChangePassword: false,
        passwordUpdatedAt: '2026-04-01T00:00:00.000Z',
        lastLoginAt: '2026-08-12T09:30:00.000Z',
        lockedAt: null,
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: TIMESTAMP,
      },
      {
        id: 'user-operator',
        username: 'lijing',
        name: '李运营',
        phone: '13600009012',
        departmentIds: ['department-operations'],
        roleIds: ['role-operator'],
        status: 'disabled',
        builtIn: false,
        mustChangePassword: false,
        passwordUpdatedAt: '2026-05-20T00:00:00.000Z',
        lastLoginAt: '2026-08-10T03:20:00.000Z',
        lockedAt: null,
        createdAt: '2026-05-20T00:00:00.000Z',
        updatedAt: TIMESTAMP,
      },
      {
        id: 'user-data-viewer',
        username: 'wangsi',
        name: '王数据',
        phone: '13500003456',
        departmentIds: ['department-venue'],
        roleIds: ['role-auditor'],
        status: 'locked',
        builtIn: false,
        mustChangePassword: false,
        passwordUpdatedAt: '2026-06-02T00:00:00.000Z',
        lastLoginAt: '2026-08-09T08:40:00.000Z',
        lockedAt: '2026-08-13T02:30:00.000Z',
        createdAt: '2026-06-02T00:00:00.000Z',
        updatedAt: TIMESTAMP,
      },
    ],
  }
}
