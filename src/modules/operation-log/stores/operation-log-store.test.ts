import type {
  OperationLog,
  OperationLogExportFile,
  OperationLogPage,
  OperationLogQuery,
  OperationLogService,
} from '../types'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  createOperationLogStore,
  DEFAULT_OPERATION_LOG_QUERY,
  validateOperationLogQuery,
} from './operation-log-store'

const timestamp = '2026-08-26T08:00:00+08:00'

function log(id: number, overrides: Partial<OperationLog> = {}): OperationLog {
  return {
    id: String(id), operatorId: '31', operatorName: `用户 ${id}`, departmentName: '场馆运营部',
    module: 'user', action: 'update', targetType: 'user', targetId: String(100 + id),
    performedAt: timestamp, ipAddress: '10.0.0.8', result: 'success', detailJson: '{}', details: {},
    ...overrides,
  }
}

class StubOperationLogService implements OperationLogService {
  logs: OperationLog[] = []
  listCalls: Array<{ query: OperationLogQuery; page: number; pageSize: number }> = []
  exportCalls: OperationLogQuery[] = []
  fail = false

  async listLogs(query: OperationLogQuery, page: number, pageSize: number): Promise<OperationLogPage> {
    if (this.fail) throw new Error('日志接口失败')
    this.listCalls.push({ query: { ...query }, page, pageSize })
    const filtered = this.logs.filter((item) => {
      if (query.keyword && ![item.operatorName, item.module, item.action, JSON.stringify(item.details)].join(' ').includes(query.keyword)) return false
      if (query.module && item.module !== query.module) return false
      if (query.action && item.action !== query.action) return false
      if (query.result !== 'all' && item.result !== query.result) return false
      return true
    })
    const start = (page - 1) * pageSize
    return { logs: structuredClone(filtered.slice(start, start + pageSize)), total: filtered.length, page, pageSize }
  }

  async exportLogs(query: OperationLogQuery): Promise<OperationLogExportFile> {
    if (this.fail) throw new Error('日志导出失败')
    this.exportCalls.push({ ...query })
    return { content: new Blob(['csv']), filename: 'audit_logs.csv' }
  }
}

describe('operation log store', () => {
  let service: StubOperationLogService

  beforeEach(() => {
    setActivePinia(createPinia())
    service = new StubOperationLogService()
  })

  it('initializes and paginates with the server total', async () => {
    service.logs = Array.from({ length: 45 }, (_, index) => log(index + 1))
    const store = createOperationLogStore(service, 'audit-init')()

    await expect(store.initialize()).resolves.toBe(true)
    expect(store.logs).toHaveLength(20)
    expect(store.total).toBe(45)
    expect(store.pageCount).toBe(3)

    await expect(store.changePage(3)).resolves.toBe(true)
    expect(store.page).toBe(3)
    expect(store.logs).toHaveLength(5)
    expect(service.listCalls.at(-1)).toMatchObject({ page: 3, pageSize: 20 })

    await expect(store.changePageSize(50)).resolves.toBe(true)
    expect(store.page).toBe(1)
    expect(store.pageSize).toBe(50)
    expect(store.logs).toHaveLength(45)
    expect(service.listCalls.at(-1)).toMatchObject({ page: 1, pageSize: 50 })
  })

  it('refreshes the current filtered page instead of reusing initialized data', async () => {
    service.logs = Array.from({ length: 45 }, (_, index) => log(index + 1))
    const store = createOperationLogStore(service, 'audit-refresh')()
    await store.initialize()
    await store.queryLogs({ ...DEFAULT_OPERATION_LOG_QUERY, module: 'user' })
    await store.changePage(2)
    service.logs[20] = log(21, { operatorName: '最新操作人' })

    await expect(store.refresh()).resolves.toBe(true)
    expect(store.logs[0]).toMatchObject({ id: '21', operatorName: '最新操作人' })
    expect(service.listCalls.at(-1)).toMatchObject({
      query: { ...DEFAULT_OPERATION_LOG_QUERY, module: 'user' },
      page: 2,
      pageSize: 20,
    })
  })

  it('normalizes and delegates every filter, then resets through the API', async () => {
    service.logs = [
      log(1, { operatorName: '管理员', module: 'control', action: 'publish', result: 'failure' }),
      log(2),
    ]
    const store = createOperationLogStore(service, 'audit-query')()
    await store.initialize()
    const query: OperationLogQuery = {
      keyword: ' 管理员 ', module: ' control ', action: ' publish ', result: 'failure',
      from: '2026-08-01', to: '2026-08-26',
    }

    await expect(store.queryLogs(query)).resolves.toBe(true)
    expect(store.logs.map(item => item.id)).toEqual(['1'])
    expect(service.listCalls.at(-1)).toMatchObject({
      query: { keyword: '管理员', module: 'control', action: 'publish', result: 'failure', from: '2026-08-01', to: '2026-08-26' },
      page: 1,
    })

    await expect(store.resetQuery()).resolves.toBe(true)
    expect(store.query).toEqual(DEFAULT_OPERATION_LOG_QUERY)
    expect(store.total).toBe(2)
  })

  it('rejects reversed dates without requesting or replacing the active query', async () => {
    service.logs = [log(1)]
    const store = createOperationLogStore(service, 'audit-date')()
    await store.initialize()
    const previousCalls = service.listCalls.length

    await expect(store.queryLogs({
      ...DEFAULT_OPERATION_LOG_QUERY,
      from: '2026-08-27',
      to: '2026-08-26',
    })).resolves.toBe(false)

    expect(store.queryError).toBe('开始日期不能晚于结束日期')
    expect(validateOperationLogQuery(store.query)).toBeNull()
    expect(service.listCalls).toHaveLength(previousCalls)
  })

  it('retains the current page when a later list request fails', async () => {
    service.logs = [log(1)]
    const store = createOperationLogStore(service, 'audit-error')()
    await store.initialize()
    service.fail = true

    await expect(store.queryLogs({ ...DEFAULT_OPERATION_LOG_QUERY, keyword: '失败' })).resolves.toBe(false)
    expect(store.logs.map(item => item.id)).toEqual(['1'])
    expect(store.query.keyword).toBe('')
    expect(store.error).toBe('日志接口失败')
  })

  it('exports the currently applied query and exposes export failures', async () => {
    const store = createOperationLogStore(service, 'audit-export')()
    await store.initialize()
    await store.queryLogs({ ...DEFAULT_OPERATION_LOG_QUERY, module: 'user' })

    await expect(store.exportLogs()).resolves.toMatchObject({ filename: 'audit_logs.csv' })
    expect(service.exportCalls).toEqual([{ ...DEFAULT_OPERATION_LOG_QUERY, module: 'user' }])

    service.fail = true
    await expect(store.exportLogs()).resolves.toBeNull()
    expect(store.error).toBe('日志导出失败')
    expect(store.isExporting).toBe(false)
  })
})
