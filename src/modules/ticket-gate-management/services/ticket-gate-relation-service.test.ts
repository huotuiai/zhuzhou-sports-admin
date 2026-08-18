import { describe, expect, it } from 'vitest'
import {
  LocalTicketGateRelationService,
  SEAT_ZONE_GATE_BINDING_STORAGE_KEY,
  estimateWalkingMinutes,
} from './ticket-gate-relation-service'

class MemoryStorage implements Storage {
  private values = new Map<string, string>()
  get length(): number { return this.values.size }
  clear(): void { this.values.clear() }
  getItem(key: string): string | null { return this.values.get(key) ?? null }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null }
  removeItem(key: string): void { this.values.delete(key) }
  setItem(key: string, value: string): void { this.values.set(key, value) }
}

describe('LocalTicketGateRelationService', () => {
  it('reads seat-zone bindings and protects the count contract', async () => {
    const storage = new MemoryStorage()
    storage.setItem(SEAT_ZONE_GATE_BINDING_STORAGE_KEY, JSON.stringify({
      schemaVersion: 1,
      records: [
        { id: 'b-1', zoneCode: 'A-01', gateId: 'gate-1' },
        { id: 'b-2', zoneCode: 'A-02', gateId: 'gate-1' },
      ],
    }))
    const service = new LocalTicketGateRelationService({ storage })
    expect(await service.countSeatZoneBindings('gate-1')).toBe(2)
    expect(await service.listSeatZoneBindings()).toHaveLength(2)
  })

  it('persists, deduplicates and cleans parking and shuttle relations', async () => {
    const storage = new MemoryStorage()
    let id = 0
    const service = new LocalTicketGateRelationService({ storage, createId: () => `rel-${++id}`, now: () => new Date('2026-08-14T00:00:00.000Z') })
    const parking = await service.bindParking({ gateId: 'gate-1', parkingLotId: 'parking-1', walkingMinutes: null })
    await expect(service.bindParking({ gateId: 'gate-1', parkingLotId: 'parking-1', walkingMinutes: 5 })).rejects.toThrow('已绑定')
    const shuttle = await service.bindShuttle({ gateId: 'gate-1', shuttlePointId: 'line-1', stationId: 'station-1', direction: 'entry', walkingMinutes: 3 })
    await expect(service.bindShuttle({ gateId: 'gate-1', shuttlePointId: 'line-1', stationId: 'station-1', direction: 'entry', walkingMinutes: 4 })).rejects.toThrow('已绑定')
    expect((await service.listRelations('gate-1')).parkingRelations).toHaveLength(1)
    await service.unbindParking(parking.id)
    await service.unbindShuttle(shuttle.id)
    expect(await service.listRelations('gate-1')).toEqual({ parkingRelations: [], shuttleRelations: [] })
  })

  it('reconciles deleted targets and cleans all relations for a gate', async () => {
    const service = new LocalTicketGateRelationService({ storage: new MemoryStorage() })
    await service.bindParking({ gateId: 'gate-1', parkingLotId: 'parking-1', walkingMinutes: 5 })
    await service.bindShuttle({ gateId: 'gate-1', shuttlePointId: 'line-1', stationId: 'station-1', direction: 'bidirectional', walkingMinutes: null })
    await service.reconcile([], [])
    expect(await service.listRelations('gate-1')).toEqual({ parkingRelations: [], shuttleRelations: [] })
    await service.bindParking({ gateId: 'gate-1', parkingLotId: 'parking-2', walkingMinutes: 8 })
    await service.cleanupGate('gate-1')
    expect((await service.listRelations('gate-1')).parkingRelations).toEqual([])
  })

  it('estimates walking time using 80 metres per minute', () => {
    expect(estimateWalkingMinutes(null, { lng: 113, lat: 27 })).toBeNull()
    const minutes = estimateWalkingMinutes({ lng: 113.1462, lat: 27.8165 }, { lng: 113.147, lat: 27.8165 })
    expect(minutes).toBeGreaterThanOrEqual(1)
  })
})
