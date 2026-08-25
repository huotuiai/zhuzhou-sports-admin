import { describe, expect, it } from 'vitest'
import type { TicketGateWriteInput } from '../types'
import {
  LEGACY_TICKET_GATE_STORAGE_KEY,
  LocalTicketGateService,
  TICKET_GATE_STORAGE_KEY,
  formatMapCoordinates,
  parseMapCoordinates,
  sortTicketGates,
  validateTicketGateInput,
} from './ticket-gate-service'

class MemoryStorage implements Storage {
  private values = new Map<string, string>()
  get length(): number { return this.values.size }
  clear(): void { this.values.clear() }
  getItem(key: string): string | null { return this.values.get(key) ?? null }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null }
  removeItem(key: string): void { this.values.delete(key) }
  setItem(key: string, value: string): void { this.values.set(key, value) }
}

function input(overrides: Partial<TicketGateWriteInput> = {}): TicketGateWriteInput {
  return {
    code: 'G-1',
    name: '东门入口',
    floor: '一层',
    locationDescription: '场馆东侧主入口',
    mapCoordinates: '113.1462, 27.8165',
    navigationAddress: '株洲体育中心东门',
    navigationLongitude: null,
    navigationLatitude: null,
    sortOrder: 1,
    status: 'open',
    statusRemark: '',
    ...overrides,
  }
}

describe('LocalTicketGateService', () => {
  it('persists CRUD, keeps code immutable and records audit events', async () => {
    const storage = new MemoryStorage()
    let id = 0
    const service = new LocalTicketGateService({ storage, createId: () => `id-${++id}`, now: () => new Date('2026-08-14T00:00:00.000Z') })
    const created = await service.create(input({ code: ' g-1 ', name: ' 东门入口 ' }))
    expect(created).toMatchObject({ code: 'G-1', name: '东门入口', status: 'open', sortOrder: 1 })
    expect(created.mapPoints).toEqual([{ lng: 113.1462, lat: 27.8165 }])
    await expect(service.create(input({ code: 'g-1', name: '其他入口' }))).rejects.toThrow('编号不能重复')
    await expect(service.create(input({ code: 'G-2' }))).rejects.toThrow('名称不能重复')

    const updated = await service.update(created.id, input({ code: 'G-9', name: '东门主入口', sortOrder: 2 }))
    expect(updated).toMatchObject({ code: 'G-1', name: '东门主入口', sortOrder: 2 })
    const closed = await service.updateStatus(created.id, { status: 'closed', statusRemark: ' 临时关闭 ' })
    expect(closed).toMatchObject({ status: 'closed', statusRemark: '临时关闭' })
    const reopened = await service.updateStatus(created.id, { status: 'open', statusRemark: '不应保留' })
    expect(reopened.statusRemark).toBe('')

    await service.remove(created.id)
    expect(await service.list()).toEqual([])
    expect((await service.listAuditLogs()).map((item) => item.action)).toEqual(['create', 'update', 'status-update', 'status-update', 'delete'])
  })

  it('requires one positioning coordinate, validates navigation pairing and positive sort order', () => {
    const issues = validateTicketGateInput(input({
      code: 'G_1',
      mapCoordinates: '[{"lng":200,"lat":27}]',
      navigationAddress: '',
      navigationLongitude: 113.1,
      navigationLatitude: null,
      sortOrder: 0,
    })).issues
    expect(issues.map((item) => item.field)).toEqual(['code', 'mapCoordinates', 'navigationLatitude', 'sortOrder'])
    expect(validateTicketGateInput(input({ mapCoordinates: '', navigationAddress: '' })).issues.map((item) => item.field)).toEqual(['mapCoordinates'])
    expect(validateTicketGateInput(input({ navigationAddress: '', navigationLongitude: null, navigationLatitude: null })).valid).toBe(true)
  })

  it('parses the prototype coordinate format while retaining legacy JSON compatibility', () => {
    const points = parseMapCoordinates('113.1, 27.8')
    expect(points).toEqual([{ lng: 113.1, lat: 27.8 }])
    expect(parseMapCoordinates('[{"lng":113.1,"lat":27.8}]')).toEqual(points)
    expect(formatMapCoordinates(points)).toBe('113.1, 27.8')
    expect(() => parseMapCoordinates('{}')).toThrow('经度, 纬度')
    expect(() => parseMapCoordinates('113.1,')).toThrow('经度, 纬度')
  })

  it('sorts by order then natural code', () => {
    const base = {
      id: 'gate', name: '入口', floor: '一层' as const, locationDescription: '', mapPoints: [], navigationAddress: '地址', navigationPoint: null,
      status: 'open' as const, statusRemark: '', createdAt: '2026-01-01', updatedAt: '2026-01-01',
    }
    expect(sortTicketGates([
      { ...base, id: '3', code: 'G-10', sortOrder: 1 },
      { ...base, id: '2', code: 'G-2', sortOrder: 1 },
      { ...base, id: '1', code: 'G-1', sortOrder: 2 },
    ]).map((item) => item.code)).toEqual(['G-2', 'G-10', 'G-1'])
  })

  it('migrates v1 records into v2 without deleting the legacy key', async () => {
    const storage = new MemoryStorage()
    storage.setItem(LEGACY_TICKET_GATE_STORAGE_KEY, JSON.stringify({
      schemaVersion: 1,
      records: [{
        id: 'legacy-1', name: '二层西入口', code: 'g-5', venueArea: '二层', location: '西侧楼梯口', direction: 'entry',
        laneCount: 2, deviceCount: 2, enabled: false, remark: '设备维护', createdAt: '2026-08-01', updatedAt: '2026-08-02',
      }],
    }))
    const service = new LocalTicketGateService({ storage })
    expect(await service.list()).toEqual([expect.objectContaining({ id: 'legacy-1', code: 'G-5', floor: '二层', status: 'closed', statusRemark: '设备维护', navigationPoint: null })])
    expect(storage.getItem(LEGACY_TICKET_GATE_STORAGE_KEY)).not.toBeNull()
    expect(storage.getItem(TICKET_GATE_STORAGE_KEY)).not.toBeNull()
  })
})
