import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type {
  SeatFloor,
  SeatFloorCreateInput,
  SeatGateOption,
  SeatPlanningQuery,
  SeatPlanningService,
  SeatZone,
  SeatZonePage,
  SeatZoneWriteInput,
} from '../types'
import { createSeatPlanningStore } from './venue-seat-store'

const timestamp = '2026-08-26T08:00:00+08:00'

function cloneZone(value: SeatZone): SeatZone {
  return {
    ...value,
    gateIds: [...value.gateIds],
    gateNames: [...value.gateNames],
    openGateIds: [...value.openGateIds],
    openGateNames: [...value.openGateNames],
  }
}

function zone(index: number): SeatZone {
  const gateId = index % 2 ? 'gate-1' : 'gate-2'
  return {
    id: `zone-${index}`,
    code: `A-${String(index).padStart(3, '0')}`,
    name: index % 2 ? `东看台 ${index}` : `西看台 ${index}`,
    floorId: index <= 60 ? 'floor-1' : 'floor-2',
    rowStart: 1,
    rowEnd: 20,
    gateIds: [gateId],
    gateNames: [gateId === 'gate-1' ? '东检票口' : '南检票口'],
    openGateIds: [gateId],
    openGateNames: [gateId === 'gate-1' ? '东检票口' : '南检票口'],
    sortOrder: index,
    status: index % 3 ? 'enabled' : 'disabled',
    remark: '',
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

const gates: SeatGateOption[] = [
  { id: 'gate-1', code: 'G-01', name: '东检票口', openStatus: 'open', enabled: true, matchOpen: true },
  { id: 'gate-2', code: 'G-02', name: '南检票口', openStatus: 'restricted', enabled: true, matchOpen: false },
]

class FakeService implements SeatPlanningService {
  readonly listZoneCalls: Array<[number, number]> = []
  readonly createZoneInputs: SeatZoneWriteInput[] = []
  readonly updateZoneInputs: Array<{ id: string, input: SeatZoneWriteInput }> = []
  readonly detailCalls: string[] = []
  failNextZoneList = false
  gateOptions = gates.map(item => ({ ...item }))
  private nextZoneId = 1000
  private nextFloorId = 10
  private floors: SeatFloor[] = [
    { id: 'floor-2', name: '二层', sortOrder: 2, status: 'enabled', zoneCount: 0, createdAt: timestamp, updatedAt: timestamp },
    { id: 'floor-1', name: '一层', sortOrder: 1, status: 'enabled', zoneCount: 0, createdAt: timestamp, updatedAt: timestamp },
  ]
  private zones: SeatZone[]

  constructor(zoneCount = 125) {
    this.zones = Array.from({ length: zoneCount }, (_, index) => zone(index + 1)).reverse()
  }

  async listFloors(): Promise<SeatFloor[]> {
    return this.floors.map(floor => ({
      ...floor,
      zoneCount: this.zones.filter(item => item.floorId === floor.id).length,
    }))
  }

  async createFloor(input: SeatFloorCreateInput): Promise<SeatFloor> {
    const floor: SeatFloor = {
      id: `floor-${++this.nextFloorId}`,
      name: input.name,
      sortOrder: input.sortOrder,
      status: input.status,
      zoneCount: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    this.floors.push(floor)
    return { ...floor }
  }

  async deleteFloor(id: string): Promise<void> {
    this.floors = this.floors.filter(item => item.id !== id)
  }

  async listZones(page: number, pageSize: number): Promise<SeatZonePage> {
    this.listZoneCalls.push([page, pageSize])
    if (this.failNextZoneList) {
      this.failNextZoneList = false
      throw new Error('分区列表加载失败')
    }
    const start = (page - 1) * pageSize
    return {
      zones: this.zones.slice(start, start + pageSize).map(cloneZone),
      total: this.zones.length,
      page,
      pageSize,
    }
  }

  async getZone(id: string): Promise<SeatZone> {
    this.detailCalls.push(id)
    const found = this.zones.find(item => item.id === id)
    if (!found) throw new Error('分区不存在')
    return cloneZone(found)
  }

  async createZone(input: SeatZoneWriteInput): Promise<SeatZone> {
    this.createZoneInputs.push({ ...input, gateIds: [...input.gateIds] })
    const created: SeatZone = {
      id: `zone-${++this.nextZoneId}`,
      ...input,
      gateIds: [...input.gateIds],
      gateNames: input.gateIds.map(id => gates.find(item => item.id === id)?.name ?? id),
      openGateIds: [...input.gateIds],
      openGateNames: input.gateIds.map(id => gates.find(item => item.id === id)?.name ?? id),
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    this.zones.push(created)
    return cloneZone(created)
  }

  async updateZone(id: string, input: SeatZoneWriteInput): Promise<SeatZone> {
    this.updateZoneInputs.push({ id, input: { ...input, gateIds: [...input.gateIds] } })
    const index = this.zones.findIndex(item => item.id === id)
    if (index < 0) throw new Error('分区不存在')
    const current = this.zones[index]!
    const updated: SeatZone = {
      ...current,
      ...input,
      code: current.code,
      gateIds: [...input.gateIds],
      gateNames: input.gateIds.map(gateId => gates.find(item => item.id === gateId)?.name ?? gateId),
      openGateIds: [...input.gateIds],
      openGateNames: input.gateIds.map(gateId => gates.find(item => item.id === gateId)?.name ?? gateId),
      updatedAt: timestamp,
    }
    this.zones[index] = updated
    return cloneZone(updated)
  }

  async deleteZone(id: string): Promise<void> {
    this.zones = this.zones.filter(item => item.id !== id)
  }

  async listGateOptions(): Promise<SeatGateOption[]> {
    return this.gateOptions.map(item => ({ ...item }))
  }
}

function query(overrides: Partial<SeatPlanningQuery> = {}): SeatPlanningQuery {
  return { keyword: '', floorId: 'all', status: 'all', gateIds: [], ...overrides }
}

function zoneInput(overrides: Partial<SeatZoneWriteInput> = {}): SeatZoneWriteInput {
  return {
    code: ' b-01 ', name: ' 新增区域 ', floorId: 'floor-1', rowStart: 1, rowEnd: 25,
    gateIds: ['gate-1'], sortOrder: 130, status: 'enabled', remark: '', ...overrides,
  }
}

describe('seat planning store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('loads every server page, sorts globally and filters multiple gates with OR semantics', async () => {
    const service = new FakeService()
    const useStore = createSeatPlanningStore(service, `seat-planning-${Math.random()}`)
    const store = useStore()

    expect(await store.initialize()).toBe(true)
    expect(service.listZoneCalls).toEqual([[1, 100], [2, 100]])
    expect(store.zones).toHaveLength(125)
    expect(store.zones[0]?.id).toBe('zone-1')
    expect(store.total).toBe(125)
    expect(store.paginatedZones).toHaveLength(20)

    await store.queryZones(query({ gateIds: ['gate-1'] }))
    expect(store.filteredZones.every(item => item.gateIds.includes('gate-1'))).toBe(true)
    await store.queryZones(query({ gateIds: ['gate-1', 'gate-2'] }))
    expect(store.total).toBe(125)
    await store.queryZones(query({ keyword: '东看台', floorId: 'floor-1', status: 'enabled' }))
    expect(store.filteredZones.every(item =>
      item.name.includes('东看台') && item.floorId === 'floor-1' && item.status === 'enabled',
    )).toBe(true)

    store.setPageSize(50)
    expect(store.pageSize).toBe(50)
    expect(store.currentPage).toBe(1)
  })

  it('refreshes changed gate options on re-entry while preserving filters and the current page', async () => {
    const service = new FakeService()
    const useStore = createSeatPlanningStore(service, `seat-refresh-${Math.random()}`)
    const store = useStore()
    await store.initialize()
    await store.queryZones(query({ keyword: '看台', gateIds: ['gate-1'] }))
    store.setPage(2)

    service.gateOptions = [
      { ...service.gateOptions[0]!, openStatus: 'closed', matchOpen: false },
      ...service.gateOptions.slice(1),
      { id: 'gate-3', code: 'G-03', name: '北检票口', openStatus: 'open', enabled: true, matchOpen: true },
    ]
    service.failNextZoneList = true
    expect(await store.refresh()).toBe(false)
    expect(store.ticketGates).toEqual(gates)

    expect(await store.refresh()).toBe(true)
    expect(store.ticketGates.map(item => item.id)).toEqual(['gate-1', 'gate-2', 'gate-3'])
    expect(store.gateById.get('gate-1')).toMatchObject({ openStatus: 'closed', matchOpen: false })
    expect(store.query).toEqual(query({ keyword: '看台', gateIds: ['gate-1'] }))
    expect(store.page).toBe(2)
    expect(service.listZoneCalls).toHaveLength(7)
    expect(service.listZoneCalls.slice(-3)).toEqual([[1, 100], [1, 100], [2, 100]])
  })

  it('uses detail and CRUD APIs while preserving immutable codes and authoritative floor counts', async () => {
    const service = new FakeService(4)
    const useStore = createSeatPlanningStore(service, `seat-planning-${Math.random()}`)
    const store = useStore()
    await store.initialize()

    expect(store.totalZoneCount('floor-1')).toBe(4)
    expect((await store.getZone('zone-1'))?.id).toBe('zone-1')
    expect(service.detailCalls).toEqual(['zone-1'])

    const created = await store.createZone(zoneInput())
    expect(created?.code).toBe('B-01')
    expect(service.createZoneInputs[0]).toMatchObject({ code: 'B-01', name: '新增区域' })
    expect(store.totalZoneCount('floor-1')).toBe(5)

    const updated = await store.updateZone(created!.id, zoneInput({ code: 'C-99', name: '调整后' }))
    expect(updated).toMatchObject({ code: 'B-01', name: '调整后' })
    expect(await store.removeZone(created!.id)).toBe(false)
    expect(store.error).toContain('先停用')
    expect((await store.updateStatus(created!.id, 'disabled'))?.status).toBe('disabled')
    expect(await store.removeZone(created!.id)).toBe(true)
    expect(store.totalZoneCount('floor-1')).toBe(4)

    const floor = await store.createFloor({ name: ' 三层 ' })
    expect(floor).toMatchObject({ name: '三层', sortOrder: 3, status: 'enabled' })
    expect(await store.removeFloor(floor!.id)).toBe(true)
  })

  it('retains the current list and applied filters when a server refresh fails', async () => {
    const service = new FakeService(4)
    const useStore = createSeatPlanningStore(service, `seat-planning-${Math.random()}`)
    const store = useStore()
    await store.initialize()
    const beforeIds = store.zones.map(item => item.id)

    service.failNextZoneList = true
    expect(await store.queryZones(query({ keyword: '东看台' }))).toBe(false)
    expect(store.zones.map(item => item.id)).toEqual(beforeIds)
    expect(store.query.keyword).toBe('')
    expect(store.error).toBe('分区列表加载失败')
  })
})
