import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type {
  SeatFloor,
  SeatFloorWriteInput,
  SeatPlanningAuditLog,
  SeatPlanningService,
  SeatPlanningSnapshot,
  SeatZone,
  SeatZoneStatus,
} from '../types'
import type { TicketGate } from '@/modules/ticket-gate-management/types'
import { createSeatPlanningStore } from './venue-seat-store'

const timestamp = '2026-08-14T00:00:00.000Z'
const floors: SeatFloor[] = [
  { id: 'floor-1', name: '一层', sortOrder: 1, createdAt: timestamp, updatedAt: timestamp },
  { id: 'floor-2', name: '二层', sortOrder: 2, createdAt: timestamp, updatedAt: timestamp },
]

function gate(id: string, code: string): TicketGate {
  return {
    id, code, name: code, floor: '一层', locationDescription: '', mapPoints: [], navigationAddress: '地址',
    navigationPoint: null, sortOrder: 1, status: 'open', statusRemark: '', createdAt: timestamp, updatedAt: timestamp,
  }
}

function zone(index: number): SeatZone {
  return {
    id: `zone-${index}`, code: `A-${String(index).padStart(2, '0')}`, name: index % 2 ? `东看台 ${index}` : `西看台 ${index}`,
    floorId: index <= 12 ? 'floor-1' : 'floor-2', rowStart: 1, rowEnd: 20, sortOrder: index,
    status: index % 3 ? 'enabled' : 'disabled', remark: '', createdAt: timestamp, updatedAt: timestamp,
  }
}

class FakeService implements SeatPlanningService {
  snapshot: SeatPlanningSnapshot = {
    floors: floors.map((item) => ({ ...item })),
    zones: Array.from({ length: 25 }, (_, index) => zone(index + 1)),
    bindings: Array.from({ length: 25 }, (_, index) => ({ id: `binding-${index + 1}`, zoneCode: zone(index + 1).code, gateId: index % 2 ? 'gate-2' : 'gate-1' })),
    ticketGates: [gate('gate-1', 'G-1'), gate('gate-2', 'G-2')],
  }
  async load(): Promise<SeatPlanningSnapshot> { return structuredClone(this.snapshot) }
  async listAuditLogs(): Promise<SeatPlanningAuditLog[]> { return [] }
  async createFloor(input: SeatFloorWriteInput): Promise<SeatFloor> {
    const floor: SeatFloor = { id: 'floor-3', name: input.name.trim(), sortOrder: 3, createdAt: timestamp, updatedAt: timestamp }
    this.snapshot.floors.push(floor)
    return { ...floor }
  }
  async removeFloor(id: string): Promise<void> { this.snapshot.floors = this.snapshot.floors.filter((item) => item.id !== id) }
  async createZone(): Promise<SeatPlanningSnapshot> { return structuredClone(this.snapshot) }
  async updateZone(): Promise<SeatPlanningSnapshot> { return structuredClone(this.snapshot) }
  async updateZoneStatus(id: string, status: SeatZoneStatus): Promise<SeatZone> {
    const item = this.snapshot.zones.find((entry) => entry.id === id)!
    item.status = status
    return { ...item }
  }
  async removeZone(id: string): Promise<SeatPlanningSnapshot> {
    const code = this.snapshot.zones.find((item) => item.id === id)?.code
    this.snapshot.zones = this.snapshot.zones.filter((item) => item.id !== id)
    this.snapshot.bindings = this.snapshot.bindings.filter((item) => item.zoneCode !== code)
    return structuredClone(this.snapshot)
  }
}

describe('seat planning store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('paginates by zones and filters multi-gate selections with OR semantics', async () => {
    const useStore = createSeatPlanningStore(new FakeService(), `seat-planning-${Math.random()}`)
    const store = useStore()
    expect(await store.load()).toBe(true)
    expect(store.pageSize).toBe(20)
    expect(store.total).toBe(25)
    expect(store.paginatedZones).toHaveLength(20)

    store.setQuery({ gateIds: ['gate-1'] })
    expect(store.filteredZones.every((item) => Number(item.code.slice(2)) % 2 === 1)).toBe(true)
    store.setQuery({ gateIds: ['gate-1', 'gate-2'] })
    expect(store.total).toBe(25)
    store.setQuery({ keyword: '东看台', floorId: 'floor-1', status: 'enabled', gateIds: [] })
    expect(store.filteredZones.every((item) => item.name.includes('东看台') && item.floorId === 'floor-1' && item.status === 'enabled')).toBe(true)
  })

  it('updates counts, status and relationship-backed removals', async () => {
    const useStore = createSeatPlanningStore(new FakeService(), `seat-planning-${Math.random()}`)
    const store = useStore()
    await store.load()
    expect(store.totalZoneCount('floor-1')).toBe(12)
    expect(store.nextSortOrder('floor-1')).toBe(13)
    expect(store.zoneGateIds('A-01')).toEqual(['gate-1'])
    expect((await store.updateStatus('zone-1', 'disabled'))?.status).toBe('disabled')
    expect(await store.removeZone('zone-1')).toBe(true)
    expect(store.totalZoneCount('floor-1')).toBe(11)
    expect(store.zoneGateIds('A-01')).toEqual([])
  })
})
