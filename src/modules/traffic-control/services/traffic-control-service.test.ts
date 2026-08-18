import type { TrafficControlWriteInput } from '../types'
import { describe, expect, it } from 'vitest'
import { LEGACY_AREA_CONTROL_STORAGE_KEY, LocalTrafficControlService, TRAFFIC_CONTROL_STORAGE_KEY, validateTrafficControlInput } from './traffic-control-service'

class MemoryStorage implements Storage {
  private values = new Map<string, string>()
  get length(): number { return this.values.size }
  clear(): void { this.values.clear() }
  getItem(key: string): string | null { return this.values.get(key) ?? null }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null }
  removeItem(key: string): void { this.values.delete(key) }
  setItem(key: string, value: string): void { this.values.set(key, value) }
}

function input(overrides: Partial<TrafficControlWriteInput> = {}): TrafficControlWriteInput {
  return {
    title: '东门道路管制',
    type: 'road-closure',
    areaName: '体育中心东门',
    startAt: '2026-08-18T12:00',
    endAt: '2026-08-18T18:00',
    detourInstructions: '请绕行南门',
    geometry: null,
    pinned: false,
    sortOrder: 10,
    ...overrides,
  }
}

describe('LocalTrafficControlService', () => {
  it('persists CRUD with monotonic codes and permits an empty geometry', async () => {
    const storage = new MemoryStorage()
    let id = 0
    const service = new LocalTrafficControlService({ storage, createId: () => `id-${++id}`, now: () => new Date('2026-08-18T00:00:00+08:00') })
    const first = await service.create(input())
    expect(first).toMatchObject({ code: 'GZ-001', geometry: null, areaSquareMeters: null, coordinateSystem: 'GCJ-02' })
    const second = await service.create(input({ title: '西门限行', type: 'restriction' }))
    expect(second.code).toBe('GZ-002')
    await service.remove(second.id)
    const third = await service.create(input({ title: '北门绕行', type: 'detour' }))
    expect(third.code).toBe('GZ-003')
    const updated = await service.update(first.id, input({ title: '东门历史管制', startAt: '2025-01-01T08:00', endAt: '2025-01-01T09:00' }))
    expect(updated).toMatchObject({ id: first.id, code: 'GZ-001', title: '东门历史管制' })
  })

  it('uses only the new versioned key and never reads or deletes legacy areas', async () => {
    const storage = new MemoryStorage()
    storage.setItem(LEGACY_AREA_CONTROL_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, records: [{ name: '旧区域' }] }))
    const service = new LocalTrafficControlService({ storage, now: () => new Date('2026-08-18T00:00:00+08:00') })
    expect(await service.list()).toEqual([])
    await service.create(input())
    expect(storage.getItem(TRAFFIC_CONTROL_STORAGE_KEY)).not.toBeNull()
    expect(storage.getItem(LEGACY_AREA_CONTROL_STORAGE_KEY)).toContain('旧区域')
  })

  it('continues from the greatest existing code when stored sequence metadata is behind', async () => {
    const storage = new MemoryStorage()
    const service = new LocalTrafficControlService({ storage, now: () => new Date('2026-08-18T00:00:00+08:00') })
    await service.create(input())
    const envelope = JSON.parse(storage.getItem(TRAFFIC_CONTROL_STORAGE_KEY)!) as { lastSequence: number, records: Array<{ code: string }> }
    envelope.lastSequence = 1
    envelope.records[0]!.code = 'GZ-012'
    storage.setItem(TRAFFIC_CONTROL_STORAGE_KEY, JSON.stringify(envelope))
    expect((await service.create(input({ title: '新增管制' }))).code).toBe('GZ-013')
  })

  it('rejects damaged storage and validates time, sort and geometry rules', async () => {
    const storage = new MemoryStorage()
    storage.setItem(TRAFFIC_CONTROL_STORAGE_KEY, '{broken')
    await expect(new LocalTrafficControlService({ storage }).list()).rejects.toThrow('无法解析')

    const result = validateTrafficControlInput(input({ title: 'A', areaName: '', startAt: '2026-08-18T18:00', endAt: '2026-08-18T12:00', sortOrder: -1 }), { now: new Date('2026-08-18T00:00:00+08:00') })
    expect(result.issues.map((item) => item.field)).toEqual(['title', 'areaName', 'dateRange', 'sortOrder'])
    expect(validateTrafficControlInput(input({ geometry: { type: 'circle', center: { lng: 113.1, lat: 27.8 }, radiusMeters: 0 } })).issues.some((item) => item.field === 'geometry')).toBe(true)
  })
})
