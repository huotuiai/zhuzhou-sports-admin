import { describe, expect, it } from 'vitest'
import type {
  TicketGate,
  TicketGateAuditLog,
  TicketGateService,
} from '@/modules/ticket-gate-management/types'
import type { SeatFloor, SeatZoneWriteInput } from '../types'
import { LocalTicketGateRelationService, SEAT_ZONE_GATE_BINDING_STORAGE_KEY } from '@/modules/ticket-gate-management/services/ticket-gate-relation-service'
import {
  LEGACY_VENUE_SEAT_STORAGE_KEY,
  LocalSeatPlanningService,
  SEAT_PLANNING_STORAGE_KEY,
  validateSeatFloorInput,
  validateSeatZoneInput,
} from './venue-seat-service'

class MemoryStorage implements Storage {
  protected values = new Map<string, string>()
  get length(): number { return this.values.size }
  clear(): void { this.values.clear() }
  getItem(key: string): string | null { return this.values.get(key) ?? null }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null }
  removeItem(key: string): void { this.values.delete(key) }
  setItem(key: string, value: string): void { this.values.set(key, value) }
}

class FailingStorage extends MemoryStorage {
  failNextKey: string | null = null
  override setItem(key: string, value: string): void {
    if (this.failNextKey === key) {
      this.failNextKey = null
      throw new Error('quota exceeded')
    }
    super.setItem(key, value)
  }
}

class FakeTicketGateService implements TicketGateService {
  private readonly gates: TicketGate[]
  constructor(gates: TicketGate[]) { this.gates = gates }
  async list(): Promise<TicketGate[]> { return this.gates.map((item) => ({ ...item, mapPoints: [], navigationPoint: null })) }
  async create(): Promise<TicketGate> { throw new Error('not implemented') }
  async update(): Promise<TicketGate> { throw new Error('not implemented') }
  async updateStatus(): Promise<TicketGate> { throw new Error('not implemented') }
  async remove(): Promise<void> { throw new Error('not implemented') }
  async listAuditLogs(): Promise<TicketGateAuditLog[]> { return [] }
}

function gate(id: string, code: string): TicketGate {
  return {
    id, code, name: `${code} 检票口`, floor: '一层', locationDescription: '', mapPoints: [],
    navigationAddress: '株洲体育中心', navigationPoint: null, sortOrder: 1, status: 'open', statusRemark: '',
    createdAt: '2026-08-14T00:00:00.000Z', updatedAt: '2026-08-14T00:00:00.000Z',
  }
}

const gates = [gate('gate-1', 'G-1'), gate('gate-2', 'G-2'), gate('gate-3', 'G-3')]

function input(floorId: string, overrides: Partial<SeatZoneWriteInput> = {}): SeatZoneWriteInput {
  return {
    code: 'a-01', name: ' A 区 · 主看台 ', floorId, rowStart: 1, rowEnd: 30,
    gateIds: ['gate-1', 'gate-2'], sortOrder: 1, status: 'enabled', remark: '', ...overrides,
  }
}

function service(storage: Storage = new MemoryStorage()): LocalSeatPlanningService {
  let id = 0
  return new LocalSeatPlanningService({
    storage,
    gateService: new FakeTicketGateService(gates),
    createId: () => `generated-${++id}`,
    now: () => new Date('2026-08-14T00:00:00.000Z'),
  })
}

describe('seat planning validation', () => {
  const floors: SeatFloor[] = [{
    id: 'floor-1', name: '一层', sortOrder: 1,
    createdAt: '2026-08-14T00:00:00.000Z', updatedAt: '2026-08-14T00:00:00.000Z',
  }]

  it('normalizes and validates floor names', () => {
    expect(validateSeatFloorInput({ name: ' 一层 ' }, floors).issues[0]?.code).toBe('duplicate')
    expect(validateSeatFloorInput({ name: '' }, floors).issues[0]?.code).toBe('required')
  })

  it('validates zone code, range, order, floor and gate references', () => {
    const result = validateSeatZoneInput(input('missing-floor', {
      code: '!', rowStart: 0, rowEnd: 0, sortOrder: 0, gateIds: ['missing-gate'],
    }), [], floors, gates)
    expect(result.issues.map((item) => item.field)).toEqual(['code', 'floorId', 'rowStart', 'rowEnd', 'sortOrder', 'gateIds'])
  })

  it('rejects duplicate codes case-insensitively and requires ascending rows', () => {
    const existing = {
      id: 'zone-1', code: 'A-01', name: 'A 区', floorId: 'floor-1', rowStart: 1, rowEnd: 20,
      sortOrder: 1, status: 'enabled' as const, remark: '',
      createdAt: '2026-08-14T00:00:00.000Z', updatedAt: '2026-08-14T00:00:00.000Z',
    }
    const result = validateSeatZoneInput(input('floor-1', { code: 'a-01', rowStart: 20, rowEnd: 20 }), [existing], floors, gates)
    expect(result.issues.map((item) => item.message)).toEqual(expect.arrayContaining(['分区编号不能重复', '结束排号必须大于起始排号']))
  })
})

describe('LocalSeatPlanningService', () => {
  it('initializes default floors while preserving the legacy per-seat key', async () => {
    const storage = new MemoryStorage()
    const legacy = JSON.stringify({ schemaVersion: 1, records: [{ old: true }] })
    storage.setItem(LEGACY_VENUE_SEAT_STORAGE_KEY, legacy)
    const snapshot = await service(storage).load()
    expect(snapshot.floors.map((item) => item.name)).toEqual(['一层', '二层'])
    expect(snapshot.zones).toEqual([])
    expect(storage.getItem(LEGACY_VENUE_SEAT_STORAGE_KEY)).toBe(legacy)
    expect(storage.getItem(SEAT_PLANNING_STORAGE_KEY)).not.toBeNull()
  })

  it('persists floor CRUD and blocks deletion while zones exist', async () => {
    const subject = service()
    const snapshot = await subject.load()
    const floor = await subject.createFloor({ name: '三层' })
    expect(floor).toMatchObject({ name: '三层', sortOrder: 3 })
    await subject.createZone(input(snapshot.floors[0]!.id))
    await expect(subject.removeFloor(snapshot.floors[0]!.id)).rejects.toThrow('已绑定 1 个座位分区')
    await subject.removeFloor(floor.id)
    expect((await subject.load()).floors.map((item) => item.name)).toEqual(['一层', '二层'])
  })

  it('keeps zone codes immutable, diffs gate bindings and exposes them to the ticket gate adapter', async () => {
    const storage = new MemoryStorage()
    const subject = service(storage)
    const floorId = (await subject.load()).floors[0]!.id
    const created = await subject.createZone(input(floorId))
    const zone = created.zones[0]!
    expect(zone).toMatchObject({ code: 'A-01', name: 'A 区 · 主看台' })
    expect(created.bindings.map((item) => item.gateId).sort()).toEqual(['gate-1', 'gate-2'])

    const updated = await subject.updateZone(zone.id, input(floorId, { code: 'B-99', gateIds: ['gate-2', 'gate-3'], name: '调整后分区' }))
    expect(updated.zones[0]).toMatchObject({ code: 'A-01', name: '调整后分区' })
    expect(updated.bindings.map((item) => item.gateId).sort()).toEqual(['gate-2', 'gate-3'])

    const relationService = new LocalTicketGateRelationService({ storage })
    expect(await relationService.countSeatZoneBindings('gate-2')).toBe(1)
    expect(await relationService.countSeatZoneBindings('gate-1')).toBe(0)
  })

  it('requires a zone to be disabled before deletion and cleans all relationships', async () => {
    const subject = service()
    const floorId = (await subject.load()).floors[0]!.id
    const created = await subject.createZone(input(floorId))
    const zone = created.zones[0]!
    await expect(subject.removeZone(zone.id)).rejects.toThrow('需先停用')
    await subject.updateZoneStatus(zone.id, 'disabled')
    const removed = await subject.removeZone(zone.id)
    expect(removed.zones).toEqual([])
    expect(removed.bindings).toEqual([])
    const actions = (await subject.listAuditLogs()).map((item) => item.action)
    expect(actions).toEqual(expect.arrayContaining(['create-zone', 'bind-gate', 'status-update', 'unbind-gate', 'delete-zone']))
  })

  it('reconciles orphaned and duplicate bindings after gates load successfully', async () => {
    const storage = new MemoryStorage()
    const subject = service(storage)
    const floorId = (await subject.load()).floors[0]!.id
    await subject.createZone(input(floorId, { gateIds: ['gate-1'] }))
    storage.setItem(SEAT_ZONE_GATE_BINDING_STORAGE_KEY, JSON.stringify({
      schemaVersion: 1,
      records: [
        { id: 'valid', zoneCode: 'A-01', gateId: 'gate-1' },
        { id: 'duplicate', zoneCode: 'A-01', gateId: 'gate-1' },
        { id: 'missing-gate', zoneCode: 'A-01', gateId: 'gone' },
        { id: 'missing-zone', zoneCode: 'Z-99', gateId: 'gate-1' },
      ],
    }))
    const reconciled = await subject.load()
    expect(reconciled.bindings).toEqual([{ id: 'valid', zoneCode: 'A-01', gateId: 'gate-1' }])
    expect((await subject.listAuditLogs()).filter((item) => item.action === 'unbind-gate')).toHaveLength(3)
  })

  it('rolls back the main record when relationship persistence fails', async () => {
    const storage = new FailingStorage()
    const subject = service(storage)
    const floorId = (await subject.load()).floors[0]!.id
    const beforeMain = storage.getItem(SEAT_PLANNING_STORAGE_KEY)
    storage.failNextKey = SEAT_ZONE_GATE_BINDING_STORAGE_KEY
    await expect(subject.createZone(input(floorId))).rejects.toThrow('原数据已恢复')
    expect(storage.getItem(SEAT_PLANNING_STORAGE_KEY)).toBe(beforeMain)
    expect(storage.getItem(SEAT_ZONE_GATE_BINDING_STORAGE_KEY)).toBeNull()
  })
})
