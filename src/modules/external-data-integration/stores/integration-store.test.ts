import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type {
  IntegrationService,
  IntegrationSource,
  IntegrationSourcePage,
  IntegrationSourceQuery,
  IntegrationSourceWriteInput,
  IntegrationSyncLogPage,
  IntegrationSyncLogQuery,
  IntegrationSyncResult,
} from '../types'
import {
  createIntegrationStore,
  DEFAULT_INTEGRATION_SOURCE_QUERY,
  INTEGRATION_LOG_PAGE_SIZE,
} from './integration-store'

function source(overrides: Partial<IntegrationSource> = {}): IntegrationSource {
  return {
    id: '1', code: 'SRC-01', name: '停车场系统', sourceType: 'parking',
    apiUrl: 'https://park.example.com/v1', intervalMinutes: 15,
    lastSyncAt: null, lastSyncStatus: 'none', consecutiveFailures: 0,
    enabled: true, remark: '', apiKeyMasked: '****abcd',
    createdAt: '2026-08-20T08:00:00+08:00', updatedAt: '2026-08-27T10:00:00+08:00',
    ...overrides,
  }
}

function writeInput(overrides: Partial<IntegrationSourceWriteInput> = {}): IntegrationSourceWriteInput {
  return {
    name: '停车场系统', sourceType: 'parking', apiUrl: 'https://park.example.com/v1',
    apiKey: '', intervalMinutes: 15, enabled: true, remark: '', ...overrides,
  }
}

class StubIntegrationService implements IntegrationService {
  sourceData = [
    source(),
    source({ id: '2', code: 'SRC-02', name: '720 云', sourceType: 'yun720', enabled: false }),
  ]
  listCalls: Array<{ query: IntegrationSourceQuery, page: number, pageSize: number }> = []
  detailCalls: string[] = []
  createCalls: IntegrationSourceWriteInput[] = []
  updateCalls: Array<{ id: string, input: IntegrationSourceWriteInput }> = []
  syncCalls: string[] = []
  logCalls: Array<{ query: IntegrationSyncLogQuery, page: number, pageSize: number }> = []
  syncResult: IntegrationSyncResult = { sourceId: '1', result: 'success', summary: '同步完成', disabled: false }

  async listSources(query: IntegrationSourceQuery, page: number, pageSize: number): Promise<IntegrationSourcePage> {
    this.listCalls.push({ query: { ...query }, page, pageSize })
    const keyword = query.keyword.trim()
    const filtered = this.sourceData.filter(item =>
      (query.sourceType === 'all' || item.sourceType === query.sourceType)
      && (!keyword || item.name.includes(keyword) || item.code.includes(keyword)),
    )
    const start = (page - 1) * pageSize
    return { items: filtered.slice(start, start + pageSize), total: filtered.length, page, pageSize }
  }

  async getSource(id: string): Promise<IntegrationSource> {
    this.detailCalls.push(id)
    const item = this.sourceData.find(source => source.id === id)
    if (!item) throw new Error('对接源不存在')
    return { ...item }
  }

  async createSource(input: IntegrationSourceWriteInput): Promise<IntegrationSource> {
    this.createCalls.push({ ...input })
    const created = source({ id: '3', code: 'SRC-03', name: input.name, sourceType: input.sourceType, apiUrl: input.apiUrl, enabled: input.enabled })
    this.sourceData.unshift(created)
    return created
  }

  async updateSource(id: string, input: IntegrationSourceWriteInput): Promise<IntegrationSource> {
    this.updateCalls.push({ id, input: { ...input } })
    const index = this.sourceData.findIndex(source => source.id === id)
    if (index < 0) throw new Error('对接源不存在')
    const updated = { ...this.sourceData[index]!, ...input, apiKeyMasked: this.sourceData[index]!.apiKeyMasked, updatedAt: '2026-08-27T11:00:00+08:00' }
    this.sourceData[index] = updated
    return { ...updated }
  }

  async syncSource(id: string): Promise<IntegrationSyncResult> {
    this.syncCalls.push(id)
    if (this.syncResult.disabled) {
      const item = this.sourceData.find(source => source.id === id)
      if (item) item.enabled = false
    }
    return this.syncResult
  }

  async listSyncLogs(query: IntegrationSyncLogQuery, page: number, pageSize: number): Promise<IntegrationSyncLogPage> {
    this.logCalls.push({ query: { ...query }, page, pageSize })
    return {
      items: [{
        id: `log-${page}`, sourceId: '1', startedAt: '2026-08-27T10:00:00+08:00',
        finishedAt: '2026-08-27T10:00:02+08:00', result: query.result === 'fail' ? 'fail' : 'success',
        summary: query.result === 'fail' ? null : '同步完成', failureReason: query.result === 'fail' ? '连接超时' : null,
        durationMs: 2000, createdAt: '2026-08-27T10:00:02+08:00', updatedAt: '2026-08-27T10:00:02+08:00',
      }],
      total: 41, page, pageSize,
    }
  }
}

describe('external data integration store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('initializes, queries and pages the server source list', async () => {
    const service = new StubIntegrationService()
    const store = createIntegrationStore(service, 'integration-list-test')()

    expect(await store.initialize()).toBe(true)
    expect(store.sources).toHaveLength(2)
    expect(store.sourceLabel('1')).toBe('SRC-01 停车场系统')
    await store.querySources({ keyword: '720', sourceType: 'yun720' })
    expect(store.sources.map(item => item.id)).toEqual(['2'])
    await store.changePageSize(50)
    expect(service.listCalls.at(-1)).toMatchObject({ page: 1, pageSize: 50 })
    await store.resetQuery()
    expect(store.query).toEqual(DEFAULT_INTEGRATION_SOURCE_QUERY)
  })

  it('loads details, creates, edits and refreshes the current list', async () => {
    const service = new StubIntegrationService()
    const store = createIntegrationStore(service, 'integration-crud-test')()
    await store.initialize()

    await expect(store.getSource('1')).resolves.toMatchObject({ code: 'SRC-01', apiKeyMasked: '****abcd' })
    await expect(store.createSource(writeInput({ name: '新停车源', apiKey: 'new-secret' }))).resolves.toMatchObject({ id: '3' })
    expect(service.createCalls[0]?.apiKey).toBe('new-secret')
    await expect(store.updateSource('1', writeInput({ name: '停车源（更新）' }))).resolves.toMatchObject({ name: '停车源（更新）' })
    expect(store.sources.find(item => item.id === '1')?.name).toBe('停车源（更新）')
  })

  it('reads the latest detail before toggling and blocks legacy configuration changes', async () => {
    const service = new StubIntegrationService()
    service.sourceData.push(source({ id: '4', code: 'SRC-04', sourceType: 'shuttle', name: '存量接驳源' }))
    const store = createIntegrationStore(service, 'integration-toggle-test')()
    await store.initialize()

    await expect(store.toggleSource('1')).resolves.toMatchObject({ enabled: false })
    expect(service.detailCalls).toContain('1')
    expect(service.updateCalls.at(-1)).toMatchObject({ id: '1', input: { apiKey: '', enabled: false } })
    await expect(store.toggleSource('4')).resolves.toBeNull()
    expect(store.mutationError).toContain('存量类型仅支持只读展示')
  })

  it('blocks stopped sources and exposes backend sync failure and auto-disable results', async () => {
    const service = new StubIntegrationService()
    const store = createIntegrationStore(service, 'integration-sync-test')()
    await store.initialize()

    await expect(store.syncSource('2')).resolves.toBeNull()
    expect(store.mutationError).toBe('停用中的对接源不可同步。')
    service.syncResult = { sourceId: '1', result: 'fail', summary: '连续失败 3 次', disabled: true }
    await expect(store.syncSource('1')).resolves.toEqual(service.syncResult)
    expect(service.syncCalls).toEqual(['1'])
    expect(store.sources.find(item => item.id === '1')?.enabled).toBe(false)
    expect(store.mutationError).toBe('连续失败 3 次')
  })

  it('loads and filters server-paged sync logs', async () => {
    const service = new StubIntegrationService()
    const store = createIntegrationStore(service, 'integration-log-test')()
    await store.initialize()

    expect(await store.openLogs()).toBe(true)
    expect(store.logOpen).toBe(true)
    expect(store.logs[0]?.summary).toBe('同步完成')
    await store.queryLogs({ sourceId: '', result: 'fail' })
    expect(service.logCalls.at(-1)).toEqual({ query: { sourceId: '', result: 'fail' }, page: 1, pageSize: INTEGRATION_LOG_PAGE_SIZE })
    await store.changeLogPage(2)
    expect(store.logPage).toBe(2)
    expect(store.logs[0]?.failureReason).toBe('连接超时')
    store.closeLogs()
    expect(store.logOpen).toBe(false)
  })

  it('keeps the newest source response when requests resolve out of order', async () => {
    const service = new StubIntegrationService()
    const store = createIntegrationStore(service, 'integration-race-test')()
    await store.initialize()
    const pending = new Map<string, (value: IntegrationSourcePage) => void>()
    service.listSources = query => new Promise((resolve) => {
      pending.set(query.keyword, resolve)
    })

    const older = store.querySources({ keyword: '旧', sourceType: 'all' })
    const latest = store.querySources({ keyword: '新', sourceType: 'all' })
    pending.get('新')?.({ items: [source({ id: 'new', name: '新结果' })], total: 1, page: 1, pageSize: 20 })
    await expect(latest).resolves.toBe(true)
    pending.get('旧')?.({ items: [source({ id: 'old', name: '旧结果' })], total: 1, page: 1, pageSize: 20 })
    await expect(older).resolves.toBe(false)

    expect(store.sources.map(item => item.id)).toEqual(['new'])
    expect(store.query.keyword).toBe('新')
    expect(store.isLoading).toBe(false)
  })
})
