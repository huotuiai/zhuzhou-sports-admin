import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type {
  TicketGate,
  TicketGatePage,
  TicketGateQuery,
  TicketGateService,
  TicketGateStatusInput,
  TicketGateWriteInput,
} from '../types'
import { createTicketGateStore } from './ticket-gate-store'

function gate(id: string, overrides: Partial<TicketGate> = {}): TicketGate {
  return {
    id,
    code: id.toUpperCase(),
    name: `检票口 ${id}`,
    floorId: 'floor-1',
    floorName: '一层',
    locationDescription: '',
    point: { lng: 113.1, lat: 27.8 },
    navigationAddress: '株洲体育中心',
    sortOrder: 1,
    status: 'open',
    statusRemark: '',
    enabled: true,
    zoneIds: [],
    zoneNames: [],
    matchOpen: true,
    createdAt: '2026-08-14T00:00:00.000Z',
    updatedAt: '2026-08-14T00:00:00.000Z',
    ...overrides,
  }
}

function input(overrides: Partial<TicketGateWriteInput> = {}): TicketGateWriteInput {
  return {
    code: 'G-9',
    name: '西门入口',
    floorId: 'floor-1',
    locationDescription: '西侧',
    mapCoordinates: '113.1, 27.8',
    navigationAddress: '',
    sortOrder: 9,
    status: 'open',
    statusRemark: '',
    ...overrides,
  }
}

class StubGateService implements TicketGateService {
  records: TicketGate[] = []
  failDelete = false
  private nextId = 20

  private filtered(query: TicketGateQuery): TicketGate[] {
    const keyword = query.keyword.toLocaleLowerCase('zh-CN')
    return this.records.filter((record) => {
      if (keyword && ![record.code, record.name].some((value) => value.toLocaleLowerCase('zh-CN').includes(keyword))) return false
      if (query.status !== 'all' && record.status !== query.status) return false
      if (query.floorId !== 'all' && record.floorId !== query.floorId) return false
      return true
    })
  }

  async list(query: TicketGateQuery = { keyword: '', status: 'all', floorId: 'all' }): Promise<TicketGate[]> {
    return structuredClone(this.filtered(query))
  }

  async listPage(page: number, pageSize: number, query: TicketGateQuery): Promise<TicketGatePage> {
    const records = this.filtered(query)
    const start = (page - 1) * pageSize
    return { records: structuredClone(records.slice(start, start + pageSize)), total: records.length, page, pageSize }
  }

  async listFloors() {
    return [
      { id: 'floor-1', name: '一层', enabled: true, sortOrder: 1 },
      { id: 'floor-2', name: '二层', enabled: true, sortOrder: 2 },
    ]
  }

  async get(id: string): Promise<TicketGate> {
    const record = this.records.find((item) => item.id === id)
    if (!record) throw new Error('未找到检票口')
    return structuredClone(record)
  }

  async create(value: TicketGateWriteInput): Promise<TicketGate> {
    const created = gate(String(++this.nextId), {
      code: value.code,
      name: value.name,
      floorId: value.floorId,
      floorName: value.floorId === 'floor-2' ? '二层' : '一层',
      sortOrder: value.sortOrder,
      status: value.status,
    })
    this.records.push(created)
    return structuredClone(created)
  }

  async update(id: string, value: TicketGateWriteInput): Promise<TicketGate> {
    const index = this.records.findIndex((item) => item.id === id)
    const updated = { ...this.records[index]!, name: value.name, sortOrder: value.sortOrder, status: value.status }
    this.records[index] = updated
    return structuredClone(updated)
  }

  async updateStatus(id: string, value: TicketGateStatusInput): Promise<TicketGate> {
    const index = this.records.findIndex((item) => item.id === id)
    const updated = { ...this.records[index]!, ...value }
    this.records[index] = updated
    return structuredClone(updated)
  }

  async remove(id: string): Promise<void> {
    if (this.failDelete) throw new Error('该检票口仍被业务数据引用')
    this.records = this.records.filter((item) => item.id !== id)
  }
}

describe('ticket gate store', () => {
  let service: StubGateService

  beforeEach(() => {
    setActivePinia(createPinia())
    service = new StubGateService()
  })

  it('loads floors and server pages, then applies keyword, status and floor queries', async () => {
    service.records = [
      gate('G-1', { name: '东门入口', zoneNames: ['A-01', 'A-02'] }),
      gate('G-2', { name: '东侧门', floorId: 'floor-2', floorName: '二层', status: 'closed' }),
      gate('G-3', { name: '南门入口', status: 'restricted' }),
    ]
    const store = createTicketGateStore(service, 'ticket-gate-query')()

    expect(await store.load()).toBe(true)
    expect(store.floors.map((floor) => floor.name)).toEqual(['一层', '二层'])
    expect(await store.setQuery({ keyword: '东', status: 'closed', floorId: 'floor-2' })).toBe(true)
    expect(store.records.map((record) => record.id)).toEqual(['G-2'])
    expect(store.total).toBe(1)
    expect(await store.resetQuery()).toBe(true)
    expect(store.total).toBe(3)
  })

  it('loads detail and refreshes the list after create, edit and three-state updates', async () => {
    service.records = [gate('G-1')]
    const store = createTicketGateStore(service, 'ticket-gate-mutations')()
    await store.load()

    expect((await store.get('G-1'))?.id).toBe('G-1')
    expect(await store.create(input())).toMatchObject({ code: 'G-9' })
    expect(store.total).toBe(2)
    expect(await store.update('G-1', input({ code: 'G-1', name: '东门主入口' }))).toMatchObject({ name: '东门主入口' })
    expect(await store.updateStatus('G-1', { status: 'restricted', statusRemark: '临时管制' }))
      .toMatchObject({ status: 'restricted', statusRemark: '临时管制' })
  })

  it('delegates delete validation to the backend and surfaces its error unchanged', async () => {
    service.records = [gate('G-1', { zoneNames: ['A-01'] })]
    const store = createTicketGateStore(service, 'ticket-gate-delete')()
    await store.load()

    service.failDelete = true
    await expect(store.remove('G-1')).resolves.toBe(false)
    expect(store.error).toBe('该检票口仍被业务数据引用')
    expect(store.records).toHaveLength(1)

    service.failDelete = false
    await expect(store.remove('G-1')).resolves.toBe(true)
    expect(store.records).toEqual([])
  })

  it('exports every record matching the active server query', async () => {
    service.records = [
      gate('G-1', { name: '东门入口' }),
      gate('G-2', { name: '东侧门', status: 'closed' }),
      gate('G-3', { name: '南门入口' }),
    ]
    const store = createTicketGateStore(service, 'ticket-gate-export')()
    await store.load()
    await store.setQuery({ keyword: '东' })

    expect((await store.exportCurrent())?.map((record) => record.id)).toEqual(['G-1', 'G-2'])
  })
})
