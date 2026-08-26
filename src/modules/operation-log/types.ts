export type OperationLogResult = 'success' | 'failure'
export type OperationLogResultFilter = 'all' | OperationLogResult

export interface OperationLog {
  id: string
  operatorId: string | null
  operatorName: string
  departmentName: string
  module: string
  action: string
  targetType: string
  targetId: string | null
  performedAt: string
  ipAddress: string
  result: OperationLogResult
  detailJson: string | null
  details: unknown
}

export interface OperationLogQuery {
  keyword: string
  module: string
  action: string
  result: OperationLogResultFilter
  from: string
  to: string
}

export interface OperationLogPage {
  logs: OperationLog[]
  total: number
  page: number
  pageSize: number
}

export interface OperationLogExportFile {
  content: Blob
  filename: string
}

export interface OperationLogService {
  listLogs(query: OperationLogQuery, page: number, pageSize: number): Promise<OperationLogPage>
  exportLogs(query: OperationLogQuery): Promise<OperationLogExportFile>
}

const MODULE_LABELS: Readonly<Record<string, string>> = {
  auth: '认证',
  user: '用户管理',
  dept: '部门管理',
  role: '角色管理',
  audit: '操作日志',
  content: '内容管理',
  cms: '内容管理',
  control: '交通管制',
  parking: '停车区',
  shuttle: '接驳车管理',
  seat: '座位规划',
  zone: '座位分区',
  gate: '检票口管理',
  integration: '外部数据对接',
  service: '用户服务管理',
}

const ACTION_LABELS: Readonly<Record<string, string>> = {
  create: '新增',
  update: '修改',
  delete: '删除',
  publish: '发布',
  unpublish: '撤回',
  revoke: '撤销',
  pin: '置顶',
  sync: '同步',
  bind: '绑定',
  status: '状态变更',
  'status-change': '状态变更',
  login: '登录',
  logout: '退出登录',
  refresh: '刷新 Token',
  reset_password: '重置密码',
  unlock: '解锁',
  import: '导入',
  export: '导出',
  handle: '处理',
}

export const OPERATION_LOG_RESULT_LABELS: Readonly<Record<OperationLogResult, string>> = {
  success: '成功',
  failure: '失败',
}

export function operationLogModuleLabel(value: string): string {
  if (!value) return '未标注'
  return MODULE_LABELS[value] ?? value
}

export function operationLogActionLabel(value: string): string {
  if (!value) return '未标注'
  return ACTION_LABELS[value] ?? value
}
