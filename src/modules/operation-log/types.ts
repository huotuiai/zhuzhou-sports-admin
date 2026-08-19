export type OperationLogModule =
  | 'user-management'
  | 'role-management'
  | 'content-management'
  | 'traffic-control'
  | 'parking-management'
  | 'shuttle-management'
  | 'seat-management'
  | 'ticket-gate-management'
  | 'external-data'
  | 'user-service'

export type OperationLogAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'publish'
  | 'revoke'
  | 'pin'
  | 'sync'
  | 'bind'
  | 'status-change'
  | 'login'

export type OperationLogResult = 'success' | 'failure'

export interface OperationLog {
  id: string
  code: string
  operatorId: string
  operatorUsername: string
  operatorName: string
  departmentId: string | null
  departmentName: string
  module: OperationLogModule
  action: OperationLogAction
  targetType: string
  targetId: string
  targetLabel: string
  performedAt: string
  ipAddress: string
  result: OperationLogResult
  details: Record<string, unknown>
}

export interface OperationLogQuery {
  module: 'all' | OperationLogModule
  action: 'all' | OperationLogAction
  result: 'all' | OperationLogResult
  startDate: string
  endDate: string
  operatorKeyword: string
}

export interface OperationLogViewerScope {
  mode: 'all' | 'departments' | 'self'
  userId: string
  username: string
  departmentIds: string[]
  label: string
}

export interface OperationLogService {
  load(): Promise<OperationLog[]>
}

export const OPERATION_LOG_MODULE_LABELS: Readonly<Record<OperationLogModule, string>> = {
  'user-management': '用户管理',
  'role-management': '角色管理',
  'content-management': '内容管理',
  'traffic-control': '交通管制',
  'parking-management': '停车区',
  'shuttle-management': '接驳车管理',
  'seat-management': '座位规划',
  'ticket-gate-management': '检票口管理',
  'external-data': '外部数据对接',
  'user-service': '用户服务管理',
}

export const OPERATION_LOG_ACTION_LABELS: Readonly<Record<OperationLogAction, string>> = {
  create: '新增',
  update: '修改',
  delete: '删除',
  publish: '发布',
  revoke: '撤销',
  pin: '置顶',
  sync: '同步',
  bind: '绑定',
  'status-change': '状态变更',
  login: '登录',
}

export const OPERATION_LOG_RESULT_LABELS: Readonly<Record<OperationLogResult, string>> = {
  success: '成功',
  failure: '失败',
}
