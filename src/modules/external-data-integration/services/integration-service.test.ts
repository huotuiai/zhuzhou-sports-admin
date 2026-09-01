import type { SignedRequestConfig } from '@/lib/http'
import type { IntegrationSourceWriteInput } from '../types'
import { describe, expect, it } from 'vitest'
import {
  createIntegrationService,
  mapApiIntegrationSource,
  mapApiIntegrationSyncLog,
  mapApiIntegrationSyncResult,
  type ApiIntegrationSource,
  type ApiIntegrationSyncLog,
} from './integration-service'

function apiSource(overrides: Partial<ApiIntegrationSource> = {}): ApiIntegrationSource {
  return {
    id: '9007199254740999',
    create_at: '2026-08-20T08:00:00+08:00',
    update_at: '2026-08-27T10:00:00+08:00',
    code: 'SRC-03',
    name: '停车场系统',
    source_type: 'parking',
    api_url: 'https://park.example.com/v1',
    interval_minutes: '15',
    last_sync_at: null,
    last_sync_status: null,
    consecutive_fail: '0',
    status: 1,
    remark: null,
    api_key_masked: '****abcd',
    ...overrides,
  }
}

function apiLog(overrides: Partial<ApiIntegrationSyncLog> = {}): ApiIntegrationSyncLog {
  return {
    id: '9007199254741001',
    create_at: '2026-08-27T10:00:02+08:00',
    update_at: '2026-08-27T10:00:02+08:00',
    source_id: '9007199254740999',
    started_at: '2026-08-27T10:00:00+08:00',
    finished_at: '2026-08-27T10:00:02+08:00',
    result: 'success',
    summary: '新增 1 / 变更 2',
    fail_reason: null,
    duration_ms: '2100',
    ...overrides,
  }
}

function writeInput(overrides: Partial<IntegrationSourceWriteInput> = {}): IntegrationSourceWriteInput {
  return {
    name: '停车场系统', sourceType: 'parking', apiUrl: 'https://park.example.com/v1',
    apiKey: 'secret', intervalMinutes: 15, enabled: true, remark: '生产源', ...overrides,
  }
}

describe('integration API service', () => {
  it('maps source DTOs, nullable status and int64 IDs', () => {
    expect(mapApiIntegrationSource(apiSource())).toMatchObject({
      id: '9007199254740999', sourceType: 'parking', intervalMinutes: 15,
      lastSyncAt: null, lastSyncStatus: 'none', consecutiveFailures: 0,
      enabled: true, remark: '', apiKeyMasked: '****abcd',
    })
    expect(mapApiIntegrationSource(apiSource({ source_type: 'host_activity', last_sync_status: 'fail', consecutive_fail: 3, status: 0 })))
      .toMatchObject({ sourceType: 'host_activity', lastSyncStatus: 'fail', consecutiveFailures: 3, enabled: false })
  })

  it('maps sync logs and sync results', () => {
    expect(mapApiIntegrationSyncLog(apiLog())).toMatchObject({
      id: '9007199254741001', sourceId: '9007199254740999', result: 'success',
      summary: '新增 1 / 变更 2', failureReason: null, durationMs: 2100,
    })
    expect(mapApiIntegrationSyncResult({ source_id: '9007199254740999', result: 'fail', summary: '连接超时', disabled: true }))
      .toEqual({ sourceId: '9007199254740999', result: 'fail', summary: '连接超时', disabled: true })
  })

  it('uses server pagination, keyword and source type filters', async () => {
    const configs: SignedRequestConfig[] = []
    const service = createIntegrationService(async <T, D = unknown>(config: SignedRequestConfig<D>): Promise<T> => {
      configs.push(config as SignedRequestConfig)
      return { list: [apiSource()], total: '1', page: 2, page_size: 50 } as T
    })

    await expect(service.listSources({ keyword: '  SRC-03  ', sourceType: 'parking' }, 2, 50))
      .resolves.toMatchObject({ total: 1, page: 2, pageSize: 50 })
    expect(configs[0]).toEqual({
      method: 'GET', url: 'api/v1/admin/integrations',
      params: { page: 2, page_size: 50, keyword: 'SRC-03', source_type: 'parking' },
    })
  })

  it('creates without a code and omits an empty key when editing', async () => {
    const configs: SignedRequestConfig[] = []
    const service = createIntegrationService(async <T, D = unknown>(config: SignedRequestConfig<D>): Promise<T> => {
      configs.push(config as SignedRequestConfig)
      return apiSource() as T
    })

    await service.createSource(writeInput())
    await service.updateSource('9007199254740999', writeInput({ apiKey: '', enabled: false, remark: '' }))
    expect(configs[0]).toEqual({
      method: 'POST', url: 'api/v1/admin/integrations',
      data: {
        name: '停车场系统', source_type: 'parking', api_url: 'https://park.example.com/v1',
        api_key: 'secret', interval_minutes: 15, status: 1, remark: '生产源',
      },
    })
    expect(configs[1]).toEqual({
      method: 'PATCH', url: 'api/v1/admin/integrations/9007199254740999',
      data: {
        name: '停车场系统', source_type: 'parking', api_url: 'https://park.example.com/v1',
        interval_minutes: 15, status: 0, remark: '',
      },
    })
  })

  it('reads details, syncs and deletes sources, then pages logs by result', async () => {
    const configs: SignedRequestConfig[] = []
    const service = createIntegrationService(async <T, D = unknown>(config: SignedRequestConfig<D>): Promise<T> => {
      configs.push(config as SignedRequestConfig)
      if (config.url?.endsWith('/sync')) return { source_id: '12', result: 'success', summary: '同步完成', disabled: false } as T
      if (config.url === 'api/v1/admin/integrations/logs') return { list: [apiLog()], total: 1, page: 1, page_size: 20 } as T
      return apiSource({ id: '12' }) as T
    })

    await service.getSource('12')
    await service.syncSource('12')
    await service.syncSourceType('parking')
    await service.deleteSource('12')
    await service.listSyncLogs({ sourceId: '12', result: 'fail' }, 1, 20)
    expect(configs).toEqual([
      { method: 'GET', url: 'api/v1/admin/integrations/12' },
      { method: 'POST', url: 'api/v1/admin/integrations/12/sync', data: {} },
      { method: 'POST', url: 'api/v1/admin/integrations/sync', data: { source_type: 'parking' } },
      { method: 'DELETE', url: 'api/v1/admin/integrations/12' },
      { method: 'GET', url: 'api/v1/admin/integrations/logs', params: { page: 1, page_size: 20, source_id: '12', result: 'fail' } },
    ])
  })
})
