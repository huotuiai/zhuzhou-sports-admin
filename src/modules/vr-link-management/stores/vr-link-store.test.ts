import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type {
  VrLink,
  VrLinkPage,
  VrLinkQuery,
  VrLinkService,
  VrLinkStatus,
  VrLinkWriteInput,
  VrPlaceOption,
  VrPlaceType,
} from '../types'
import { createVrLinkStore } from './vr-link-store'

function link(id: string, overrides: Partial<VrLink> = {}): VrLink {
  return {
    id,
    title: `VR 绑定 ${id}`,
    vrUrl: `https://example.com/vr/${id}`,
    placeType: 'gate',
    placeId: `place-${id}`,
    status: 'enabled',
    remark: '',
    placeName: `检票口 ${id}`,
    placeTypeLabel: '检票口',
    createdAt: '2026-08-30T12:00:00+08:00',
    updatedAt: '2026-08-30T12:00:00+08:00',
    ...overrides,
  }
}

function input(overrides: Partial<VrLinkWriteInput> = {}): VrLinkWriteInput {
  return {
    title: '东门 VR',
    vrUrl: 'https://example.com/vr/east',
    placeType: 'gate',
    placeId: 'gate-1',
    status: 'enabled',
    remark: '',
    ...overrides,
  }
}

class StubVrLinkService implements VrLinkService {
  records: VrLink[] = []
  options: Record<VrPlaceType, VrPlaceOption[]> = {
    gate: [{ id: 'gate-1', name: '东门入口', extra: '', available: true }],
    parking: [{ id: 'parking-1', name: '一号停车场', extra: '', available: true }],
    shuttle_stop: [{ id: 'stop-1', name: '体育馆站', extra: '内环线', available: true }],
  }
  failCreate = false
  failDelete = false
  failOptions = false
  listCalls: Array<{ page: number, pageSize: number, query: VrLinkQuery }> = []
  optionCalls: VrPlaceType[] = []
  private nextId = 20

  private filtered(query: VrLinkQuery): VrLink[] {
    const keyword = query.keyword.toLocaleLowerCase('zh-CN')
    return this.records.filter((record) => {
      if (keyword && ![record.title, record.vrUrl].some(value => value.toLocaleLowerCase('zh-CN').includes(keyword))) return false
      if (query.placeType !== 'all' && record.placeType !== query.placeType) return false
      if (query.status !== 'all' && record.status !== query.status) return false
      return true
    })
  }

  async listPage(page: number, pageSize: number, query: VrLinkQuery): Promise<VrLinkPage> {
    this.listCalls.push({ page, pageSize, query: { ...query } })
    const records = this.filtered(query)
    const start = (page - 1) * pageSize
    return { records: structuredClone(records.slice(start, start + pageSize)), total: records.length, page, pageSize }
  }

  async listPlaceOptions(placeType: VrPlaceType): Promise<VrPlaceOption[]> {
    this.optionCalls.push(placeType)
    if (this.failOptions) throw new Error('地点列表加载失败')
    return structuredClone(this.options[placeType])
  }

  async get(id: string): Promise<VrLink> {
    const record = this.records.find(item => item.id === id)
    if (!record) throw new Error('未找到 VR 绑定')
    return structuredClone(record)
  }

  async create(value: VrLinkWriteInput): Promise<VrLink> {
    if (this.failCreate) throw new Error('该地点已绑定 VR')
    const created = link(String(++this.nextId), {
      title: value.title,
      vrUrl: value.vrUrl,
      placeType: value.placeType,
      placeId: value.placeId,
      status: value.status,
      remark: value.remark,
      placeName: this.options[value.placeType].find(option => option.id === value.placeId)?.name ?? '未知地点',
      placeTypeLabel: value.placeType === 'gate' ? '检票口' : value.placeType === 'parking' ? '停车场' : '接驳站点',
    })
    this.records.push(created)
    return structuredClone(created)
  }

  async update(id: string, value: VrLinkWriteInput): Promise<VrLink> {
    const index = this.records.findIndex(item => item.id === id)
    const updated = { ...this.records[index]!, ...value }
    this.records[index] = updated
    return structuredClone(updated)
  }

  async updateStatus(id: string, status: VrLinkStatus): Promise<VrLink> {
    const index = this.records.findIndex(item => item.id === id)
    const updated = { ...this.records[index]!, status }
    this.records[index] = updated
    return structuredClone(updated)
  }

  async remove(id: string): Promise<void> {
    if (this.failDelete) throw new Error('无权删除该绑定')
    this.records = this.records.filter(item => item.id !== id)
  }
}

describe('VR link store', () => {
  let service: StubVrLinkService

  beforeEach(() => {
    setActivePinia(createPinia())
    service = new StubVrLinkService()
  })

  it('loads server pages and applies keyword, place type and status filters', async () => {
    service.records = [
      link('1', { title: '东门 VR' }),
      link('2', { title: '停车场 VR', placeType: 'parking', placeTypeLabel: '停车场', status: 'disabled' }),
      link('3', { title: '西门 VR' }),
    ]
    const store = createVrLinkStore(service, 'vr-link-query')()

    expect(await store.load()).toBe(true)
    expect(store.total).toBe(3)
    expect(await store.setQuery({ keyword: '停车', placeType: 'parking', status: 'disabled' })).toBe(true)
    expect(store.records.map(record => record.id)).toEqual(['2'])
    expect(service.listCalls.at(-1)?.query).toEqual({ keyword: '停车', placeType: 'parking', status: 'disabled' })
    expect(await store.resetQuery()).toBe(true)
    expect(store.total).toBe(3)
  })

  it('loads type-specific options and keeps option errors separate from list errors', async () => {
    const store = createVrLinkStore(service, 'vr-link-options')()

    expect(await store.loadPlaceOptions('shuttle_stop')).toBe(true)
    expect(store.placeOptions).toEqual([{ id: 'stop-1', name: '体育馆站', extra: '内环线', available: true }])
    expect(store.placeOptionsType).toBe('shuttle_stop')

    service.failOptions = true
    expect(await store.loadPlaceOptions('parking')).toBe(false)
    expect(store.placeOptions).toEqual([])
    expect(store.placeOptionsError).toBe('地点列表加载失败')
    expect(store.error).toBeNull()
  })

  it('loads detail and refreshes after create, edit and status-only updates', async () => {
    service.records = [link('1')]
    const store = createVrLinkStore(service, 'vr-link-mutations')()
    await store.load()

    expect((await store.get('1'))?.id).toBe('1')
    expect(await store.create(input())).toMatchObject({ title: '东门 VR' })
    expect(store.total).toBe(2)
    expect(await store.update('1', input({ title: '东门主入口 VR' }))).toMatchObject({ title: '东门主入口 VR' })
    expect(await store.updateStatus('1', 'disabled')).toMatchObject({ status: 'disabled' })
    expect(store.updatingStatusId).toBeNull()
  })

  it('surfaces conflicts without changing records and preserves deletion failures', async () => {
    service.records = [link('1')]
    const store = createVrLinkStore(service, 'vr-link-errors')()
    await store.load()

    service.failCreate = true
    expect(await store.create(input())).toBeNull()
    expect(store.error).toBe('该地点已绑定 VR')
    expect(store.records).toHaveLength(1)

    service.failDelete = true
    expect(await store.remove('1')).toBe(false)
    expect(store.error).toBe('无权删除该绑定')
    expect(store.records).toHaveLength(1)
  })

  it('falls back one page after deleting the last record on a later page', async () => {
    service.records = Array.from({ length: 21 }, (_, index) => link(String(index + 1)))
    const store = createVrLinkStore(service, 'vr-link-delete-page')()
    await store.load()
    await store.setPage(2)
    expect(store.records).toHaveLength(1)

    expect(await store.remove('21')).toBe(true)
    expect(store.page).toBe(1)
    expect(store.total).toBe(20)
    expect(store.records).toHaveLength(20)
  })
})
