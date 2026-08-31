import type { AxiosResponse } from 'axios'
import type { SignedRequestConfig } from '@/lib/http'
import type { BannerWriteInput, ContentWriteInput, PriorityHintWriteInput, RemoteFileAsset } from '../types'
import { describe, expect, it } from 'vitest'
import {
  contentExportFilename,
  createContentManagementService,
  formatContentRequestDateTime,
  getActivityStatus,
  isWithinValidity,
  mapApiBanner,
  mapApiContent,
  mapApiPriorityHint,
  sortContents,
  validateBannerInput,
  validateContentInput,
  validatePriorityHintInput,
  type ApiBannerVO,
  type ApiContentVO,
  type ApiHighlightVO,
} from './content-management-service'

function apiContent(overrides: Partial<ApiContentVO> = {}): ApiContentVO {
  return {
    id: '9007199254740995',
    create_at: '2026-08-20T08:00:00+08:00',
    update_at: '2026-08-20T09:00:00+08:00',
    code: 'CT-001',
    title: '体育中心开放通知',
    content_type: 'news',
    body: '<p>正文</p>',
    cover_url: 'https://cdn.example.com/cover.jpg',
    activity_start_at: null,
    activity_end_at: null,
    location: null,
    nav_address: null,
    nav_lng: null,
    nav_lat: null,
    publish_status: 'draft',
    publish_at: null,
    is_pinned: 1,
    priority: '10',
    valid_start_at: null,
    valid_end_at: null,
    data_source: 'sync',
    sync_status: 'success',
    last_sync_at: '2026-08-20T09:00:00+08:00',
    external_id: 'external-1',
    click_pv: '12',
    click_uv: 9,
    view_pv: 30,
    view_uv: '20',
    status: 1,
    attachments: [{
      id: '9007199254740997', file_name: '须知.pdf', file_url: 'https://cdn.example.com/notice.pdf',
      file_type: 'application/pdf', file_size: '2048', sort_order: 2,
    }],
    ...overrides,
  }
}

function apiBanner(overrides: Partial<ApiBannerVO> = {}): ApiBannerVO {
  return {
    id: '9007199254740998',
    create_at: '2026-08-20T08:00:00+08:00',
    update_at: '2026-08-20T09:00:00+08:00',
    code: 'BN-001',
    title: '主活动 Banner',
    image_url: 'https://cdn.example.com/banner.jpg',
    jump_type: 'control',
    jump_target_id: '9007199254740999',
    priority: 5,
    valid_start_at: '2026-08-21T00:00:00+08:00',
    valid_end_at: '2026-08-31T23:59:59+08:00',
    click_pv: 8,
    click_uv: 6,
    status: 1,
    jump_title: '东门交通管制',
    ...overrides,
  }
}

function apiHint(overrides: Partial<ApiHighlightVO> = {}): ApiHighlightVO {
  return {
    id: '9007199254741000',
    create_at: '2026-08-20T08:00:00+08:00',
    update_at: '2026-08-20T09:00:00+08:00',
    code: 'HI-001',
    title: '请从东门入场',
    ref_type: 'control',
    ref_id: '9007199254740999',
    priority: 1,
    valid_start_at: null,
    valid_end_at: null,
    click_pv: 3,
    click_uv: 2,
    status: 1,
    ref_title: '东门交通管制',
    ...overrides,
  }
}

function asset(overrides: Partial<RemoteFileAsset> = {}): RemoteFileAsset {
  return {
    id: 'asset-1', name: 'remote.jpg', url: 'https://cdn.example.com/remote.jpg',
    mimeType: 'image/jpeg', size: 1024, sortOrder: 0, ...overrides,
  }
}

function contentInput(overrides: Partial<ContentWriteInput> = {}): ContentWriteInput {
  return {
    type: 'news', title: '新的场馆资讯', bodyHtml: '<p>正文</p>', cover: null, attachments: [],
    publishAt: null, pinned: false, priority: 50, enabled: true, validStartAt: null, validEndAt: null,
    activityStartAt: null, activityEndAt: null,
    activityLocation: '', navigationLocation: '', ...overrides,
  }
}

function bannerInput(overrides: Partial<BannerWriteInput> = {}): BannerWriteInput {
  return {
    title: '主活动 Banner', image: asset(), jumpType: 'traffic-control', targetId: '21',
    priority: 5, displayEnabled: true, validFrom: '2026-08-21', validTo: '2026-08-31', ...overrides,
  }
}

function hintInput(overrides: Partial<PriorityHintWriteInput> = {}): PriorityHintWriteInput {
  return {
    title: '入场提醒', referenceType: 'traffic-control', targetId: '21', priority: 1,
    displayEnabled: true, validFrom: null, validTo: null, ...overrides,
  }
}

describe('content management API service', () => {
  it('maps content snake-case fields, int64 IDs, nullable values and remote media', () => {
    const record = mapApiContent(apiContent())
    expect(record).toMatchObject({
      id: '9007199254740995', type: 'news', pinned: true, enabled: true, priority: 10,
      navAddress: '', navLng: null, navLat: null, dataSource: 'sync', syncStatus: 'success',
      externalId: 'external-1', metrics: { clickPv: 12, clickUv: 9, viewPv: 30, viewUv: 20 },
    })
    expect(record.cover).toMatchObject({ url: 'https://cdn.example.com/cover.jpg' })
    expect(record.attachments[0]).toMatchObject({
      id: '9007199254740997', name: '须知.pdf', url: 'https://cdn.example.com/notice.pdf', size: 2048, sortOrder: 2,
    })
  })

  it('maps Banner and high-priority control references to UI enums and preserves target titles', () => {
    expect(mapApiBanner(apiBanner())).toMatchObject({
      id: '9007199254740998', jumpType: 'traffic-control', targetId: '9007199254740999',
      targetTitle: '东门交通管制', validFrom: '2026-08-21', validTo: '2026-08-31',
    })
    expect(mapApiPriorityHint(apiHint())).toMatchObject({
      id: '9007199254741000', referenceType: 'traffic-control', targetId: '9007199254740999', targetTitle: '东门交通管制',
    })
  })

  it('validates unavailable media, activity fields, references and prototype priority sorting', () => {
    const activityIssues = validateContentInput(contentInput({
      type: 'activity', title: 'A', priority: 10_000, activityStartAt: '2026-08-22T20:00',
      activityEndAt: '2026-08-22T19:00', navigationLocation: '300, 120',
    }))
    expect(activityIssues.map(item => item.field)).toEqual(expect.arrayContaining([
      'title', 'priority', 'cover', 'activityEndAt', 'activityLocation', 'navigationLocation',
    ]))
    expect(validateBannerInput(bannerInput({ image: null, targetId: null, validTo: null })).map(item => item.field))
      .toEqual(expect.arrayContaining(['image', 'targetId', 'validTo']))
    expect(validatePriorityHintInput(hintInput({ targetId: '' })).map(item => item.field)).toContain('targetId')

    const first = mapApiContent(apiContent({ id: 1, code: 'CT-001', priority: 20, is_pinned: 0 }))
    const second = mapApiContent(apiContent({ id: 2, code: 'CT-002', priority: 5, is_pinned: 0 }))
    const pinned = mapApiContent(apiContent({ id: 3, code: 'CT-003', priority: 99, is_pinned: 1 }))
    expect(sortContents([first, second, pinned]).map(item => item.id)).toEqual(['3', '1', '2'])
  })

  it('derives activity/effective state and formats supported local times', () => {
    const activity = mapApiContent(apiContent({
      content_type: 'activity', activity_start_at: '2026-08-22T10:00:00+08:00', activity_end_at: '2026-08-22T12:00:00+08:00',
    }))
    expect(getActivityStatus(activity, new Date('2026-08-22T09:00:00+08:00'))).toBe('not-started')
    expect(isWithinValidity('2026-08-21', '2026-08-31', new Date('2026-08-25T12:00:00+08:00'))).toBe(true)
    expect(formatContentRequestDateTime('2026-08-22T10:20')).toBe('2026-08-22 10:20:00')
  })

  it('sends supported list filters and automatically reads all matching pages', async () => {
    const configs: SignedRequestConfig[] = []
    const requester = async <T, D = unknown>(config: SignedRequestConfig<D>): Promise<T> => {
      configs.push(config as SignedRequestConfig)
      const requestedPage = Number((config.params as Record<string, unknown>).page)
      return { list: [apiContent({ id: requestedPage, code: `CT-00${requestedPage}` })], total: 101, page: requestedPage, page_size: 100 } as T
    }
    const service = createContentManagementService(requester)
    const records = await service.listContents({ keyword: ' 通知 ', contentType: ['news', 'notice'], publishStatus: 'draft' })
    expect(records.map(item => item.id)).toEqual(['1', '2'])
    expect(configs).toEqual([
      { method: 'GET', url: 'api/v1/admin/contents', params: { page: 1, page_size: 100, content_type: 'news,notice', keyword: '通知', publish_status: 'draft' } },
      { method: 'GET', url: 'api/v1/admin/contents', params: { page: 2, page_size: 100, content_type: 'news,notice', keyword: '通知', publish_status: 'draft' } },
    ])
  })

  it('maps Banner and high-priority list filters and automatically reads every page', async () => {
    const configs: SignedRequestConfig[] = []
    const requester = async <T, D = unknown>(config: SignedRequestConfig<D>): Promise<T> => {
      configs.push(config as SignedRequestConfig)
      const requestedPage = Number((config.params as Record<string, unknown>).page)
      const record = config.url === 'api/v1/admin/banners'
        ? apiBanner({ id: requestedPage, code: `BN-00${requestedPage}` })
        : apiHint({ id: requestedPage, code: `HI-00${requestedPage}` })
      return { list: [record], total: 101, page: requestedPage, page_size: 100 } as T
    }
    const service = createContentManagementService(requester)
    await expect(service.listBanners({ keyword: ' 赛事 ', jumpType: 'traffic-control' })).resolves.toHaveLength(2)
    await expect(service.listPriorityHints({ keyword: ' 入场 ', referenceType: 'traffic-control' })).resolves.toHaveLength(2)
    expect(configs).toEqual([
      { method: 'GET', url: 'api/v1/admin/banners', params: { page: 1, page_size: 100, keyword: '赛事', jump_type: 'control' } },
      { method: 'GET', url: 'api/v1/admin/banners', params: { page: 2, page_size: 100, keyword: '赛事', jump_type: 'control' } },
      { method: 'GET', url: 'api/v1/admin/highlights', params: { page: 1, page_size: 100, keyword: '入场', ref_type: 'control' } },
      { method: 'GET', url: 'api/v1/admin/highlights', params: { page: 2, page_size: 100, keyword: '入场', ref_type: 'control' } },
    ])
  })

  it('creates a draft, publishes it, updates published content without republishing, and explicitly withdraws it', async () => {
    const configs: SignedRequestConfig[] = []
    const responses = [
      apiContent({ id: 21, code: 'CT-021' }),
      apiContent({ id: 21, code: 'CT-021', publish_at: '2026-08-28T10:00:00+08:00' }),
      apiContent({ id: 21, code: 'CT-021', publish_status: 'published', publish_at: '2026-08-28T10:00:00+08:00' }),
      apiContent({ id: 21, code: 'CT-021', publish_status: 'draft', publish_at: null }),
    ]
    const requester = async <T, D = unknown>(config: SignedRequestConfig<D>): Promise<T> => {
      configs.push(config as SignedRequestConfig)
      return responses.shift() as T
    }
    const service = createContentManagementService(requester)
    await service.createContent(contentInput({
      publishAt: '2026-08-28T10:00', attachments: [asset({ name: 'guide.pdf', url: 'https://cdn.example.com/guide.pdf', mimeType: 'application/pdf' })],
    }))
    await service.updateContent('21', contentInput(), {
      publishStatus: 'published',
      publishAt: '2026-08-28T10:00:00+08:00',
    })
    await service.unpublishContent('21')

    expect(configs[0]).toMatchObject({ method: 'POST', url: 'api/v1/admin/contents', data: { title: '新的场馆资讯', content_type: 'news', attachments: [{ file_name: 'guide.pdf', file_url: 'https://cdn.example.com/guide.pdf' }] } })
    expect(configs[0]?.data).not.toHaveProperty('code')
    expect(configs[0]?.data).not.toHaveProperty('publish_at')
    expect(configs[1]).toEqual({ method: 'POST', url: 'api/v1/admin/contents/21/publish', data: { publish_at: '2026-08-28 10:00:00' } })
    expect(configs[2]).toMatchObject({ method: 'PATCH', url: 'api/v1/admin/contents/21', data: { title: '新的场馆资讯', content_type: 'news' } })
    expect(configs[3]).toEqual({ method: 'POST', url: 'api/v1/admin/contents/21/unpublish', data: {} })
  })

  it('maps navigation input and reads latest detail before quick content toggles', async () => {
    const configs: SignedRequestConfig[] = []
    const responses = [
      apiContent({ id: 21, code: 'CT-021', content_type: 'activity', cover_url: 'https://cdn.example.com/activity.jpg' }),
      apiContent({ id: 21, code: 'CT-021', content_type: 'activity' }),
      apiContent({ id: 21, code: 'CT-021', content_type: 'activity', status: 0 }),
    ]
    const requester = async <T, D = unknown>(config: SignedRequestConfig<D>): Promise<T> => {
      configs.push(config as SignedRequestConfig)
      return responses.shift() as T
    }
    const service = createContentManagementService(requester)
    await service.createContent(contentInput({
      type: 'activity', cover: asset(), activityStartAt: '2026-08-28T10:00', activityEndAt: '2026-08-28T12:00',
      activityLocation: '体育场', navigationLocation: '113.1462, 27.8165', enabled: false,
      validStartAt: '2026-08-28T08:00', validEndAt: '2026-08-28T23:00',
    }))
    await service.setContentEnabled('21', false)
    expect(configs[0]?.data).toMatchObject({
      cover_url: 'https://cdn.example.com/remote.jpg', nav_address: null, nav_lng: 113.1462, nav_lat: 27.8165,
      status: 0, valid_start_at: '2026-08-28 08:00:00', valid_end_at: '2026-08-28 23:00:00',
    })
    expect(configs[1]).toEqual({ method: 'GET', url: 'api/v1/admin/contents/21' })
    expect(configs[2]).toEqual({ method: 'PATCH', url: 'api/v1/admin/contents/21', data: { title: '体育中心开放通知', content_type: 'activity', status: 0 } })
  })

  it('keeps the original publication state when PATCH omits it and does not publish again', async () => {
    const configs: SignedRequestConfig[] = []
    const requester = async <T, D = unknown>(config: SignedRequestConfig<D>): Promise<T> => {
      configs.push(config as SignedRequestConfig)
      return apiContent({ id: 21, code: 'CT-021', publish_status: 'draft', publish_at: null }) as T
    }
    const service = createContentManagementService(requester)

    const updated = await service.updateContent('21', contentInput({ publishAt: '2026-08-28T10:01' }), {
      publishStatus: 'published',
      publishAt: '2026-08-28T10:00:37+08:00',
    })

    expect(configs).toHaveLength(1)
    expect(configs[0]).toMatchObject({ method: 'PATCH', url: 'api/v1/admin/contents/21' })
    expect(updated).toMatchObject({ publishStatus: 'published', publishAt: '2026-08-28T10:00:37+08:00' })
  })

  it('uses Banner/highlight enum mappings, date boundaries and latest-detail status updates', async () => {
    const configs: SignedRequestConfig[] = []
    const responses = [apiBanner(), apiBanner(), apiBanner({ status: 0 }), apiHint(), apiHint(), apiHint({ status: 0 })]
    const requester = async <T, D = unknown>(config: SignedRequestConfig<D>): Promise<T> => {
      configs.push(config as SignedRequestConfig)
      return responses.shift() as T
    }
    const service = createContentManagementService(requester)
    await service.createBanner(bannerInput())
    await service.setBannerEnabled('22', false)
    await service.createPriorityHint(hintInput())
    await service.setPriorityHintEnabled('23', false)

    expect(configs[0]?.data).toMatchObject({ jump_type: 'control', jump_target_id: 21, valid_start_at: '2026-08-21 00:00:00', valid_end_at: '2026-08-31 23:59:59' })
    expect(configs[1]).toEqual({ method: 'GET', url: 'api/v1/admin/banners/22' })
    expect(configs[2]).toMatchObject({ method: 'PATCH', url: 'api/v1/admin/banners/22', data: { title: '主活动 Banner', image_url: 'https://cdn.example.com/banner.jpg', status: 0 } })
    expect(configs[3]?.data).toMatchObject({ ref_type: 'control', ref_id: 21 })
    expect(configs[4]).toEqual({ method: 'GET', url: 'api/v1/admin/highlights/23' })
    expect(configs[5]).toMatchObject({ method: 'PATCH', url: 'api/v1/admin/highlights/23', data: { title: '请从东门入场', ref_type: 'control', ref_id: '9007199254740999', status: 0 } })
  })

  it('loads paginated reference options from the unified ref-options API', async () => {
    const configs: SignedRequestConfig[] = []
    const requester = async <T, D = unknown>(config: SignedRequestConfig<D>): Promise<T> => {
      configs.push(config as SignedRequestConfig)
      const requestedPage = Number((config.params as Record<string, unknown>).page)
      return {
        list: [{
          id: requestedPage === 1 ? '9007199254740995' : '9007199254740996',
          name: requestedPage === 1 ? '已发布资讯' : '第二页资讯',
        }],
        total: 101,
        page: requestedPage,
        page_size: 100,
      } as T
    }
    const service = createContentManagementService(requester)
    await expect(service.listReferenceOptions('news')).resolves.toEqual([
      { id: '9007199254740995', code: '', title: '已发布资讯', type: 'news', valid: true, description: '可引用' },
      { id: '9007199254740996', code: '', title: '第二页资讯', type: 'news', valid: true, description: '可引用' },
    ])
    expect(configs).toEqual([
      { method: 'GET', url: 'api/v1/admin/contents/ref-options', params: { page: 1, page_size: 100, ref_type: 'news' } },
      { method: 'GET', url: 'api/v1/admin/contents/ref-options', params: { page: 2, page_size: 100, ref_type: 'news' } },
    ])
  })

  it('maps traffic-control reference options to ref_type control', async () => {
    const configs: SignedRequestConfig[] = []
    const service = createContentManagementService(async <T, D = unknown>(config: SignedRequestConfig<D>): Promise<T> => {
      configs.push(config as SignedRequestConfig)
      return { list: [{ id: 21, name: '东门交通管制' }], total: 1, page: 1, page_size: 100 } as T
    })
    await expect(service.listReferenceOptions('traffic-control')).resolves.toMatchObject([
      { id: '21', title: '东门交通管制', type: 'traffic-control', valid: true },
    ])
    expect(configs).toEqual([
      { method: 'GET', url: 'api/v1/admin/contents/ref-options', params: { page: 1, page_size: 100, ref_type: 'control' } },
    ])
  })

  it('wraps the raw server CSV response', async () => {
    const configs: SignedRequestConfig[] = []
    const blob = new Blob(['csv'], { type: 'text/csv' })
    const service = createContentManagementService(
      async () => { throw new Error('unexpected data request') },
      async config => {
        configs.push(config)
        return { data: blob, headers: { 'content-disposition': "attachment; filename*=UTF-8''content%20all.csv" } } as unknown as AxiosResponse<Blob>
      },
    )
    await expect(service.exportContents()).resolves.toEqual({ content: blob, filename: 'content all.csv' })
    expect(configs).toEqual([
      { method: 'GET', url: 'api/v1/admin/contents/export', responseType: 'blob', headers: { Accept: 'text/csv' } },
    ])
    expect(contentExportFilename('attachment; filename="../../bad.csv"')).toBe('.._.._bad.csv')
  })
})
