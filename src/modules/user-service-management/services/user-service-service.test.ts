import type { AxiosResponse } from 'axios'
import type { SignedRequestConfig } from '@/lib/http'
import type { FeedbackQuery } from '../types'
import { AxiosHeaders } from 'axios'
import { describe, expect, it } from 'vitest'
import {
  createUserService,
  feedbackExportFilename,
  mapApiContact,
  mapApiFeedback,
} from './user-service-service'
import type {
  ApiContactPhone,
  ApiFeedbackVO,
  UserServiceDataRequester,
  UserServiceFileRequester,
} from './user-service-service'

const timestamp = '2026-08-26T08:00:00+08:00'

function apiFeedback(overrides: Partial<ApiFeedbackVO> = {}): ApiFeedbackVO {
  return {
    id: '9007199254740993',
    create_at: timestamp,
    update_at: timestamp,
    code: 'FK-20260826-001',
    feedback_type: 'suggest',
    content: '建议增加路线提醒。',
    contact: '13800138000',
    handle_status: 0,
    handler_id: null,
    handled_at: null,
    handle_remark: null,
    type_label: '建议',
    handler_name: '',
    ...overrides,
  }
}

function apiContact(overrides: Partial<ApiContactPhone> = {}): ApiContactPhone {
  return {
    id: 8,
    create_at: timestamp,
    update_at: timestamp,
    name: '服务热线',
    phone: '0731-22286666',
    sort_order: 2,
    visible: 1,
    status: 1,
    ...overrides,
  }
}

const defaultQuery: FeedbackQuery = { type: 'all', status: 'all', startDate: '', endDate: '' }

function queuedRequester(responses: unknown[]) {
  const configs: SignedRequestConfig[] = []
  const request: UserServiceDataRequester = async <T, D = unknown>(config: SignedRequestConfig<D>): Promise<T> => {
    configs.push(config as SignedRequestConfig)
    return responses.shift() as T
  }
  return { configs, request }
}

describe('user service API service', () => {
  it('maps feedback enums, nullable fields and int64 identifiers', () => {
    expect(mapApiFeedback(apiFeedback())).toEqual({
      id: '9007199254740993',
      code: 'FK-20260826-001',
      type: 'suggestion',
      content: '建议增加路线提醒。',
      contact: '13800138000',
      submittedAt: timestamp,
      status: 'pending',
      handlerId: null,
      handlerName: null,
      handledAt: null,
      handlingRemark: '',
    })
    expect(mapApiFeedback(apiFeedback({
      feedback_type: 'complain', handle_status: 1, handler_id: '9007199254740995',
      handler_name: '管理员', handled_at: timestamp, handle_remark: '已回访',
    }))).toMatchObject({
      type: 'complaint', status: 'processed', handlerId: '9007199254740995',
      handlerName: '管理员', handledAt: timestamp, handlingRemark: '已回访',
    })
  })

  it('maps contact fields including visibility and backend status', () => {
    expect(mapApiContact(apiContact({ visible: 0, status: 0 }))).toEqual({
      id: '8', name: '服务热线', phone: '0731-22286666', sort: 2,
      displayEnabled: false, enabled: false, createdAt: timestamp, updatedAt: timestamp,
    })
  })

  it('serializes feedback filters and server pagination', async () => {
    const { configs, request } = queuedRequester([{
      list: [apiFeedback()], total: '41', page: 2, page_size: 20,
    }])
    const service = createUserService(request)
    const result = await service.listFeedbacks({
      type: 'error', status: 'processed', startDate: '2026-08-01', endDate: '2026-08-26',
    }, 2, 20)

    expect(result).toMatchObject({ total: 41, page: 2, pageSize: 20 })
    expect(configs[0]).toMatchObject({
      method: 'GET', url: 'api/v1/admin/feedbacks',
      params: { page: 2, page_size: 20, feedback_type: 'bug', handle_status: 1, from: '2026-08-01', to: '2026-08-26' },
    })
  })

  it('requests feedback detail and submits only the normalized handle remark', async () => {
    const { configs, request } = queuedRequester([apiFeedback(), apiFeedback({ handle_status: 1 })])
    const service = createUserService(request)

    await service.getFeedback('9007199254740993')
    await service.handleFeedback('9007199254740993', { remark: '  已处理  ' })

    expect(configs[0]).toMatchObject({ method: 'GET', url: 'api/v1/admin/feedbacks/9007199254740993' })
    expect(configs[1]).toMatchObject({
      method: 'POST', url: 'api/v1/admin/feedbacks/9007199254740993/handle', data: { handle_remark: '已处理' },
    })
  })

  it('creates, updates and deletes contacts with the documented request bodies', async () => {
    const { configs, request } = queuedRequester([apiContact(), apiContact({ visible: 0 }), { deleted: true }])
    const service = createUserService(request)
    const input = { name: ' 咨询热线 ', phone: ' 400-123-4567 ', sort: 3, displayEnabled: false }

    await service.createContact(input)
    await service.updateContact('8', input)
    await service.deleteContact('8')

    expect(configs[0]).toMatchObject({
      method: 'POST', url: 'api/v1/admin/contacts',
      data: { name: '咨询热线', phone: '400-123-4567', sort_order: 3, visible: 0, status: 1 },
    })
    expect(configs[1]).toMatchObject({
      method: 'PATCH', url: 'api/v1/admin/contacts/8',
      data: { name: '咨询热线', phone: '400-123-4567', sort_order: 3, visible: 0 },
    })
    expect(configs[1]?.data).not.toHaveProperty('status')
    expect(configs[2]).toMatchObject({ method: 'DELETE', url: 'api/v1/admin/contacts/8' })
  })

  it('downloads the server CSV using current filters and a safe response filename', async () => {
    const { request } = queuedRequester([])
    const fileConfigs: SignedRequestConfig[] = []
    const csv = new Blob(['\uFEFF反馈编号,类型'], { type: 'text/csv;charset=utf-8' })
    const requestFile: UserServiceFileRequester = async (config): Promise<AxiosResponse<Blob>> => {
      fileConfigs.push(config)
      return {
        data: csv,
        status: 200,
        statusText: 'OK',
        headers: new AxiosHeaders({ 'content-disposition': "attachment; filename*=UTF-8''feedback%20list.csv" }),
        config: { ...config, headers: new AxiosHeaders() },
      }
    }
    const service = createUserService(request, requestFile)
    const file = await service.exportFeedbacks({ ...defaultQuery, status: 'pending' })

    expect(file).toEqual({ content: csv, filename: 'feedback list.csv' })
    expect(fileConfigs[0]).toMatchObject({
      method: 'GET', url: 'api/v1/admin/feedbacks/export', params: { handle_status: 0 }, responseType: 'blob',
    })
    expect(feedbackExportFilename('attachment; filename="../feedbacks.csv"')).toBe('.._feedbacks.csv')
    expect(feedbackExportFilename(null)).toBe('feedbacks.csv')
  })
})
