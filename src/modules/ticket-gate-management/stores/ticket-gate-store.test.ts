import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type {
  GateParkingRelation,
  GateShuttleRelation,
  SeatZoneGateBinding,
  TicketGate,
  TicketGateRelationService,
  TicketGateService,
  TicketGateStatusInput,
} from '../types'
import { createTicketGateStore } from './ticket-gate-store'

function gate(id: string, overrides: Partial<TicketGate> = {}): TicketGate {
  return {
    id,
    code: id.toUpperCase(),
    name: `检票口 ${id}`,
    floor: '一层',
    locationDescription: '',
    mapPoints: [],
    navigationAddress: '株洲体育中心',
    navigationPoint: null,
    sortOrder: 1,
    status: 'open',
    statusRemark: '',
    createdAt: '2026-08-14T00:00:00.000Z',
    updatedAt: '2026-08-14T00:00:00.000Z',
    ...overrides,
  }
}

class StubGateService implements TicketGateService {
  records: TicketGate[] = []
  async list(): Promise<TicketGate[]> { return structuredClone(this.records) }
  async create(): Promise<TicketGate> { throw new Error('not used') }
  async update(): Promise<TicketGate> { throw new Error('not used') }
  async updateStatus(id: string, input: TicketGateStatusInput): Promise<TicketGate> {
    const index = this.records.findIndex((item) => item.id === id)
    const updated = { ...this.records[index]!, ...input }
    this.records[index] = updated
    return structuredClone(updated)
  }
  async remove(id: string): Promise<void> { this.records = this.records.filter((item) => item.id !== id) }
  async listAuditLogs(): Promise<[]> { return [] }
}

class StubRelationService implements TicketGateRelationService {
  bindings: SeatZoneGateBinding[] = []
  cleanedGateId: string | null = null
  async listSeatZoneBindings(): Promise<SeatZoneGateBinding[]> { return structuredClone(this.bindings) }
  async countSeatZoneBindings(gateId: string): Promise<number> { return this.bindings.filter((item) => item.gateId === gateId).length }
  async listRelations(): Promise<{ parkingRelations: [], shuttleRelations: [] }> { return { parkingRelations: [], shuttleRelations: [] } }
  async listParkingLotRelations(): Promise<GateParkingRelation[]> { return [] }
  async listShuttleRouteRelations(): Promise<GateShuttleRelation[]> { return [] }
  async replaceParkingLotRelations(): Promise<GateParkingRelation[]> { return [] }
  async bindParking(): Promise<GateParkingRelation> { throw new Error('not used') }
  async unbindParking(): Promise<void> {}
  async bindShuttle(): Promise<GateShuttleRelation> { throw new Error('not used') }
  async unbindShuttle(): Promise<void> {}
  async cleanupGate(gateId: string): Promise<void> { this.cleanedGateId = gateId }
  async cleanupParkingLot(): Promise<void> {}
  async cleanupShuttleRoute(): Promise<void> {}
  async reconcile(): Promise<void> {}
}

describe('ticket gate store', () => {
  let service: StubGateService
  let relations: StubRelationService

  beforeEach(() => {
    setActivePinia(createPinia())
    service = new StubGateService()
    relations = new StubRelationService()
  })

  it('filters by keyword, status and floor, paginates and resolves covered zones', async () => {
    service.records = [
      gate('G-1', { name: '东门入口', sortOrder: 1 }),
      gate('G-2', { name: '东侧门', floor: '二层', status: 'closed', sortOrder: 2 }),
      gate('G-3', { name: '南门入口', status: 'restricted', sortOrder: 3 }),
    ]
    relations.bindings = [
      { id: 'b-2', zoneCode: 'A-02', gateId: 'G-1' },
      { id: 'b-1', zoneCode: 'A-01', gateId: 'G-1' },
    ]
    const store = createTicketGateStore(service, relations, 'ticket-gate-filter')()
    await store.load()
    expect(store.coveredZones('G-1')).toEqual(['A-01', 'A-02'])
    store.setQuery({ keyword: '东', status: 'closed', floor: '二层' })
    expect(store.filteredRecords.map((item) => item.id)).toEqual(['G-2'])
    store.resetQuery()
    store.setPageSize(1)
    store.setPage(2)
    expect(store.paginatedRecords.map((item) => item.id)).toEqual(['G-2'])
  })

  it('updates three-state status and clears status errors', async () => {
    service.records = [gate('G-1')]
    const store = createTicketGateStore(service, relations, 'ticket-gate-status')()
    await store.load()
    const updated = await store.updateStatus('G-1', { status: 'restricted', statusRemark: '临时管制' })
    expect(updated).toMatchObject({ status: 'restricted', statusRemark: '临时管制' })
    expect(store.records[0]).toMatchObject({ status: 'restricted' })
  })

  it('blocks deletion with seat-zone bindings and cleans nearby relations after deletion', async () => {
    service.records = [gate('G-1')]
    relations.bindings = [{ id: 'b-1', zoneCode: 'A-01', gateId: 'G-1' }]
    const store = createTicketGateStore(service, relations, 'ticket-gate-delete')()
    await store.load()
    await expect(store.remove('G-1')).resolves.toBe(false)
    expect(store.error).toContain('已绑定 1 个座位分区')
    expect(store.records).toHaveLength(1)

    relations.bindings = []
    await expect(store.remove('G-1')).resolves.toBe(true)
    expect(store.records).toEqual([])
    expect(relations.cleanedGateId).toBe('G-1')
  })
})
