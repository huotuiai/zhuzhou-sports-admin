import type { AuthUser } from '@/types/auth'
import type { RbacSnapshot, SystemDepartment } from '@/modules/system-management/types'
import type {
  OperationLog,
  OperationLogQuery,
  OperationLogService,
  OperationLogViewerScope,
} from '../types'
import { computed, reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import { operationLogService } from '../services/operation-log-service'

export const OPERATION_LOG_PAGE_SIZE = 20

export const DEFAULT_OPERATION_LOG_QUERY: Readonly<OperationLogQuery> = {
  module: 'all',
  action: 'all',
  result: 'all',
  startDate: '',
  endDate: '',
  operatorKeyword: '',
}

const DEFAULT_VIEWER_SCOPE: OperationLogViewerScope = {
  mode: 'self',
  userId: '',
  username: '',
  departmentIds: [],
  label: '仅本人日志',
}

function normalizeIdentity(value: string): string {
  return value.trim().normalize('NFKC').toLocaleLowerCase('zh-CN')
}

function getDepartmentDescendantIds(
  rootIds: readonly string[],
  departments: readonly SystemDepartment[],
): string[] {
  const result = new Set(rootIds)
  let changed = true
  while (changed) {
    changed = false
    for (const department of departments) {
      if (department.parentId && result.has(department.parentId) && !result.has(department.id)) {
        result.add(department.id)
        changed = true
      }
    }
  }
  return [...result]
}

export function resolveOperationLogViewerScope(
  authUser: AuthUser | null,
  snapshot: RbacSnapshot | null,
): OperationLogViewerScope {
  if (!authUser) return { ...DEFAULT_VIEWER_SCOPE, departmentIds: [] }
  const fallback: OperationLogViewerScope = {
    mode: 'self',
    userId: authUser.id,
    username: authUser.username,
    departmentIds: [],
    label: '仅本人日志',
  }
  if (!snapshot) return fallback

  const username = normalizeIdentity(authUser.username)
  const user = snapshot.users.find(item => normalizeIdentity(item.username) === username) ??
    snapshot.users.find(item => item.id === authUser.id)
  if (!user) return fallback

  const isSuperAdmin = snapshot.roles.some(role =>
    role.kind === 'super-admin' && user.roleIds.includes(role.id),
  )
  if (isSuperAdmin) {
    return {
      mode: 'all',
      userId: user.id,
      username: user.username,
      departmentIds: [],
      label: '全部日志',
    }
  }

  const managedRootIds = snapshot.departments
    .filter(department => department.ownerUserId === user.id)
    .map(department => department.id)
  if (managedRootIds.length) {
    const departmentIds = getDepartmentDescendantIds(managedRootIds, snapshot.departments)
    return {
      mode: 'departments',
      userId: user.id,
      username: user.username,
      departmentIds,
      label: managedRootIds.length > 1 ? '所管部门及下级部门' : '本部门及下级部门',
    }
  }

  return {
    mode: 'self',
    userId: user.id,
    username: user.username,
    departmentIds: [],
    label: '仅本人日志',
  }
}

function isOwnLog(log: OperationLog, scope: OperationLogViewerScope): boolean {
  return Boolean(scope.userId && log.operatorId === scope.userId) ||
    Boolean(scope.username && normalizeIdentity(log.operatorUsername) === normalizeIdentity(scope.username))
}

export function filterOperationLogsByScope(
  logs: readonly OperationLog[],
  scope: OperationLogViewerScope,
): OperationLog[] {
  if (scope.mode === 'all') return [...logs]
  if (scope.mode === 'departments') {
    const departments = new Set(scope.departmentIds)
    return logs.filter(log => isOwnLog(log, scope) || Boolean(log.departmentId && departments.has(log.departmentId)))
  }
  return logs.filter(log => isOwnLog(log, scope))
}

export function toShanghaiDateKey(value: string): string {
  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) return ''
  return new Date(timestamp + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export function validateOperationLogQuery(query: OperationLogQuery): string | null {
  if (query.startDate && query.endDate && query.startDate > query.endDate) {
    return '开始日期不能晚于结束日期'
  }
  return null
}

export function filterOperationLogs(
  logs: readonly OperationLog[],
  query: OperationLogQuery,
): OperationLog[] {
  const keyword = normalizeIdentity(query.operatorKeyword)
  return [...logs]
    .filter((log) => {
      if (query.module !== 'all' && log.module !== query.module) return false
      if (query.action !== 'all' && log.action !== query.action) return false
      if (query.result !== 'all' && log.result !== query.result) return false
      if (keyword && ![log.operatorName, log.operatorUsername].some(value => normalizeIdentity(value).includes(keyword))) {
        return false
      }
      const dateKey = toShanghaiDateKey(log.performedAt)
      if (query.startDate && dateKey < query.startDate) return false
      if (query.endDate && dateKey > query.endDate) return false
      return true
    })
    .sort((first, second) =>
      second.performedAt.localeCompare(first.performedAt) || second.code.localeCompare(first.code),
    )
}

function cloneQuery(query: OperationLogQuery): OperationLogQuery {
  return { ...query, operatorKeyword: query.operatorKeyword.trim().normalize('NFKC') }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作日志加载失败，请稍后重试'
}

export function createOperationLogStore(
  service: OperationLogService,
  storeId = 'operation-log',
) {
  return defineStore(storeId, () => {
    const logs = ref<OperationLog[]>([])
    const query = reactive<OperationLogQuery>({ ...DEFAULT_OPERATION_LOG_QUERY })
    const viewerScope = ref<OperationLogViewerScope>({ ...DEFAULT_VIEWER_SCOPE, departmentIds: [] })
    const page = ref(1)
    const isLoading = ref(false)
    const error = ref<string | null>(null)
    const queryError = ref<string | null>(null)

    const scopedLogs = computed(() => filterOperationLogsByScope(logs.value, viewerScope.value))
    const filteredLogs = computed(() => filterOperationLogs(scopedLogs.value, query))
    const total = computed(() => filteredLogs.value.length)
    const pageCount = computed(() => Math.max(1, Math.ceil(total.value / OPERATION_LOG_PAGE_SIZE)))
    const currentPage = computed(() => Math.min(Math.max(page.value, 1), pageCount.value))
    const paginatedLogs = computed(() => {
      const start = (currentPage.value - 1) * OPERATION_LOG_PAGE_SIZE
      return filteredLogs.value.slice(start, start + OPERATION_LOG_PAGE_SIZE)
    })

    function setViewerScope(scope: OperationLogViewerScope): void {
      viewerScope.value = { ...scope, departmentIds: [...scope.departmentIds] }
      page.value = 1
    }

    function setQuery(next: OperationLogQuery): boolean {
      const validation = validateOperationLogQuery(next)
      queryError.value = validation
      if (validation) return false
      Object.assign(query, cloneQuery(next))
      page.value = 1
      return true
    }

    function resetQuery(): void {
      Object.assign(query, DEFAULT_OPERATION_LOG_QUERY)
      queryError.value = null
      page.value = 1
    }

    function setPage(next: number): void {
      if (!Number.isFinite(next)) return
      page.value = Math.min(Math.max(Math.trunc(next), 1), pageCount.value)
    }

    async function load(): Promise<boolean> {
      isLoading.value = true
      error.value = null
      try {
        logs.value = await service.load()
        return true
      } catch (cause) {
        error.value = errorMessage(cause)
        return false
      } finally {
        isLoading.value = false
      }
    }

    return {
      logs,
      query,
      viewerScope,
      page,
      isLoading,
      error,
      queryError,
      scopedLogs,
      filteredLogs,
      total,
      pageCount,
      currentPage,
      paginatedLogs,
      setViewerScope,
      setQuery,
      resetQuery,
      setPage,
      load,
    }
  })
}

export const useOperationLogStore = createOperationLogStore(operationLogService)
