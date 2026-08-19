import type { AuthUser } from '@/types/auth'
import type { OperationLog, OperationLogService, OperationLogViewerScope } from '../types'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDefaultOperationLogs } from '../services/operation-log-service'
import { createDefaultRbacSnapshot } from '@/modules/system-management/default-data'
import {
  createOperationLogStore,
  filterOperationLogsByScope,
  OPERATION_LOG_PAGE_SIZE,
  resolveOperationLogViewerScope,
  toShanghaiDateKey,
  validateOperationLogQuery,
} from './operation-log-store'

class StubOperationLogService implements OperationLogService {
  private readonly logs: OperationLog[]

  constructor(logs: OperationLog[]) {
    this.logs = logs
  }

  async load(): Promise<OperationLog[]> {
    return this.logs.map(log => JSON.parse(JSON.stringify(log)) as OperationLog)
  }
}

function allScope(): OperationLogViewerScope {
  return { mode: 'all', userId: 'user-admin', username: 'admin', departmentIds: [], label: '全部日志' }
}

describe('operation log viewer scope', () => {
  it('resolves the authenticated admin by username and grants the super-admin full scope', () => {
    const snapshot = createDefaultRbacSnapshot()
    const authUser: AuthUser = { id: 'u-001', username: 'admin', name: '平台管理员' }

    expect(resolveOperationLogViewerScope(authUser, snapshot)).toEqual({
      mode: 'all',
      userId: 'user-admin',
      username: 'admin',
      departmentIds: [],
      label: '全部日志',
    })
  })

  it('unions multiple managed departments and all of their descendants', () => {
    const snapshot = createDefaultRbacSnapshot()
    const source = snapshot.users.find(user => user.id === 'user-venue-admin')!
    snapshot.users.push({
      ...source,
      id: 'user-multi-manager',
      username: 'multi-manager',
      name: '多部门主管',
      departmentIds: ['department-operations', 'department-command'],
      roleIds: ['role-operator'],
    })
    snapshot.departments.find(item => item.id === 'department-operations')!.ownerUserId = 'user-multi-manager'
    snapshot.departments.find(item => item.id === 'department-command')!.ownerUserId = 'user-multi-manager'
    const scope = resolveOperationLogViewerScope({
      id: 'auth-manager',
      username: 'multi-manager',
      name: '多部门主管',
    }, snapshot)

    expect(scope).toMatchObject({ mode: 'departments', label: '所管部门及下级部门' })
    expect(new Set(scope.departmentIds)).toEqual(new Set(['department-operations', 'department-command']))
  })

  it('limits ordinary and unknown users to their own records', () => {
    const snapshot = createDefaultRbacSnapshot()
    const ordinary = resolveOperationLogViewerScope({
      id: 'user-data-viewer',
      username: 'wangsi',
      name: '王数据',
    }, snapshot)
    const unknown = resolveOperationLogViewerScope({
      id: 'external-user',
      username: 'outside',
      name: '外部用户',
    }, snapshot)

    expect(ordinary).toMatchObject({ mode: 'self', userId: 'user-data-viewer', username: 'wangsi' })
    expect(unknown).toMatchObject({ mode: 'self', userId: 'external-user', username: 'outside' })
  })

  it('includes department descendants and the manager own records without exposing other departments', () => {
    const logs = createDefaultOperationLogs()
    const commandLog: OperationLog = {
      ...logs[0]!,
      id: 'operation-command',
      code: 'LOG-COMMAND',
      operatorId: 'user-command',
      operatorUsername: 'command',
      departmentId: 'department-command',
      departmentName: '交通指挥中心',
    }
    const scope: OperationLogViewerScope = {
      mode: 'departments',
      userId: 'user-traffic-admin',
      username: 'zhangjing',
      departmentIds: ['department-police', 'department-command'],
      label: '本部门及下级部门',
    }

    expect(filterOperationLogsByScope([...logs, commandLog], scope).map(log => log.code)).toEqual([
      'LOG-003',
      'LOG-COMMAND',
    ])
  })
})

describe('operation log store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('combines module, action, result, operator, and inclusive Shanghai dates', async () => {
    const useStore = createOperationLogStore(
      new StubOperationLogService(createDefaultOperationLogs()),
      'operation-log-filter-test',
    )
    const store = useStore()
    store.setViewerScope(allScope())
    expect(await store.load()).toBe(true)

    expect(store.setQuery({
      module: 'content-management',
      action: 'pin',
      result: 'success',
      startDate: '2026-08-13',
      endDate: '2026-08-13',
      operatorKeyword: ' ADMIN ',
    })).toBe(true)
    expect(store.filteredLogs.map(log => log.code)).toEqual(['LOG-001'])

    store.resetQuery()
    expect(store.filteredLogs).toHaveLength(6)
    expect(store.currentPage).toBe(1)
  })

  it('rejects a reversed date range without replacing the active query', async () => {
    const useStore = createOperationLogStore(
      new StubOperationLogService(createDefaultOperationLogs()),
      'operation-log-date-test',
    )
    const store = useStore()
    store.setViewerScope(allScope())
    await store.load()
    const previous = { ...store.query }

    expect(store.setQuery({
      ...previous,
      startDate: '2026-08-14',
      endDate: '2026-08-13',
    })).toBe(false)
    expect(store.queryError).toBe('开始日期不能晚于结束日期')
    expect(store.query).toEqual(previous)
    expect(validateOperationLogQuery(previous)).toBeNull()
  })

  it('paginates with a fixed page size of 20 and clamps invalid pages', async () => {
    const sample = createDefaultOperationLogs()[0]!
    const logs = Array.from({ length: 25 }, (_, index): OperationLog => ({
      ...sample,
      id: `operation-log-${index + 1}`,
      code: `LOG-${String(index + 1).padStart(3, '0')}`,
      performedAt: new Date(Date.UTC(2026, 7, 18, 1, 0, 25 - index)).toISOString(),
      details: { index },
    }))
    const useStore = createOperationLogStore(
      new StubOperationLogService(logs),
      'operation-log-pagination-test',
    )
    const store = useStore()
    store.setViewerScope(allScope())
    await store.load()

    expect(store.paginatedLogs).toHaveLength(OPERATION_LOG_PAGE_SIZE)
    expect(store.pageCount).toBe(2)
    store.setPage(2)
    expect(store.paginatedLogs).toHaveLength(5)
    store.setPage(99)
    expect(store.currentPage).toBe(2)
  })

  it('converts UTC timestamps to fixed Asia/Shanghai calendar days', () => {
    expect(toShanghaiDateKey('2026-08-12T16:30:00.000Z')).toBe('2026-08-13')
    expect(toShanghaiDateKey('2026-08-12T15:59:59.999Z')).toBe('2026-08-12')
    expect(toShanghaiDateKey('invalid')).toBe('')
  })
})
