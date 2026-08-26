import type { AxiosResponse } from 'axios'
import type { SignedRequestConfig } from '@/lib/http'
import type { OperationLogQuery } from '../types'
import { AxiosHeaders } from 'axios'
import { describe, expect, it } from 'vitest'
import {
  auditExportFilename,
  createOperationLogService,
  mapApiAuditLog,
} from './operation-log-service'
import type {
  ApiAuditLogVO,
  OperationLogDataRequester,
  OperationLogFileRequester,
} from './operation-log-service'

const timestamp = '2026-08-26T08:00:00+08:00'

function apiAudit(overrides: Partial<ApiAuditLogVO> = {}): ApiAuditLogVO {
  return {
    id: '9007199254740993',
    create_at: timestamp,
    update_at: timestamp,
    user_id: 31,
    operator_name: '场馆管理员',
    dept_name: '场馆运营部',
    module: 'control',
    action: 'update',
    resource_type: 'traffic_control',
    resource_id: 51,
    result: 'success',
    detail_json: '{"status":"published"}',
    ip: '10.0.0.8',
    ...overrides,
  }
}

const defaultQuery: OperationLogQuery = {
  keyword: '', module: '', action: '', result: 'all', from: '', to: '',
}

function queuedDataRequester(responses: unknown[]) {
  const configs: SignedRequestConfig[] = []
  const request: OperationLogDataRequester = async <T>(config: SignedRequestConfig): Promise<T> => {
    configs.push(config)
    return responses.shift() as T
  }
  return { configs, request }
}

describe('operation log API service', () => {
  it('maps API fields, int64 identifiers and parsed detail JSON', () => {
    expect(mapApiAuditLog(apiAudit())).toEqual({
      id: '9007199254740993',
      operatorId: '31',
      operatorName: '场馆管理员',
      departmentName: '场馆运营部',
      module: 'control',
      action: 'update',
      targetType: 'traffic_control',
      targetId: '51',
      performedAt: timestamp,
      ipAddress: '10.0.0.8',
      result: 'success',
      detailJson: '{"status":"published"}',
      details: { status: 'published' },
    })
  })

  it('keeps malformed detail text and maps nullable system audit fields', () => {
    expect(mapApiAuditLog(apiAudit({
      id: 2,
      user_id: null,
      operator_name: null,
      dept_name: null,
      module: null,
      resource_type: null,
      resource_id: null,
      result: 'fail',
      detail_json: '{invalid',
      ip: null,
    }))).toMatchObject({
      id: '2', operatorId: null, operatorName: '系统任务', departmentName: '', module: '',
      targetType: '', targetId: null, result: 'failure', details: '{invalid', ipAddress: '',
    })
  })

  it('serializes server pagination and every supported filter', async () => {
    const { configs, request } = queuedDataRequester([{ list: [apiAudit()], total: '41', page: 2, page_size: 20 }])
    const service = createOperationLogService(request)
    const query: OperationLogQuery = {
      keyword: ' 管理员 ', module: ' control ', action: ' update ', result: 'failure',
      from: '2026-08-01', to: '2026-08-26',
    }

    const result = await service.listLogs(query, 2, 20)

    expect(result).toMatchObject({ total: 41, page: 2, pageSize: 20 })
    expect(configs[0]).toMatchObject({
      method: 'GET',
      url: 'api/v1/admin/audits',
      params: {
        page: 2, page_size: 20, keyword: '管理员', module: 'control', action: 'update',
        result: 'fail', from: '2026-08-01', to: '2026-08-26',
      },
    })
  })

  it('omits empty filters and downloads the server CSV with its filename', async () => {
    const { configs, request } = queuedDataRequester([{ list: [], total: 0, page: 1, page_size: 20 }])
    const fileConfigs: SignedRequestConfig[] = []
    const csv = new Blob(['\uFEFF操作时间,操作者'], { type: 'text/csv;charset=utf-8' })
    const requestFile: OperationLogFileRequester = async (config): Promise<AxiosResponse<Blob>> => {
      fileConfigs.push(config)
      return {
        data: csv,
        status: 200,
        statusText: 'OK',
        headers: new AxiosHeaders({ 'content-disposition': "attachment; filename*=UTF-8''audit%20logs.csv" }),
        config: { ...config, headers: new AxiosHeaders() },
      }
    }
    const service = createOperationLogService(request, requestFile)

    await service.listLogs(defaultQuery, 1, 20)
    const file = await service.exportLogs(defaultQuery)

    expect(configs[0]?.params).toEqual({ page: 1, page_size: 20 })
    expect(file).toEqual({ content: csv, filename: 'audit logs.csv' })
    expect(fileConfigs[0]).toMatchObject({
      method: 'GET', url: 'api/v1/admin/audits/export', params: {}, responseType: 'blob',
    })
  })

  it('uses a safe fallback for absent or unsafe response filenames', () => {
    expect(auditExportFilename(null)).toBe('audit_logs.csv')
    expect(auditExportFilename('attachment; filename="../audit.csv"')).toBe('.._audit.csv')
  })
})
