import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { ControlZone, ControlZoneService, ControlZoneWriteInput } from '../types'
import { createControlZoneStore } from './control-zone-store'

const boundary = [
  [112, 26],
  [114, 26],
  [114, 28],
  [112, 28],
] as const

function record(overrides: Partial<ControlZone> = {}): ControlZone {
  return {
    id: 'zone-1',
    name: '已有区域',
    description: '',
    enabled: true,
    coordinateSystem: 'GCJ-02',
    geometry: {
      type: 'rectangle',
      southWest: [113, 27],
      northEast: [113.1, 27.1],
    },
    areaSquareMeters: 100,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

class StubService implements ControlZoneService {
  records: ControlZone[] = []
  failSave = false

  async list(): Promise<ControlZone[]> {
    return structuredClone(this.records)
  }

  async create(input: ControlZoneWriteInput): Promise<ControlZone> {
    if (this.failSave) throw new Error('存储空间不足')
    const created = record({ ...input, id: 'created-zone', name: input.name })
    this.records.push(created)
    return structuredClone(created)
  }

  async update(id: string, input: ControlZoneWriteInput): Promise<ControlZone> {
    if (this.failSave) throw new Error('存储空间不足')
    const index = this.records.findIndex((item) => item.id === id)
    if (index < 0) throw new Error('未找到区域')
    const updated = { ...this.records[index]!, ...input, updatedAt: '2026-01-02T00:00:00.000Z' }
    this.records[index] = updated
    return structuredClone(updated)
  }

  async remove(id: string): Promise<void> {
    this.records = this.records.filter((item) => item.id !== id)
  }
}

describe('control zone store', () => {
  let service: StubService

  beforeEach(() => {
    setActivePinia(createPinia())
    service = new StubService()
  })

  it('loads and selects records', async () => {
    service.records = [record()]
    const store = createControlZoneStore(service, 'test-load')()
    await expect(store.load()).resolves.toBe(true)
    store.select('zone-1')
    expect(store.mode).toBe('detail')
    expect(store.selectedZone?.name).toBe('已有区域')
  })

  it('validates name, boundary availability, and overlap warnings', async () => {
    service.records = [record()]
    const store = createControlZoneStore(service, 'test-validation')()
    await store.load()
    store.beginCreate({
      type: 'rectangle',
      southWest: [113.05, 27.05],
      northEast: [113.2, 27.2],
    })
    expect(store.validation.issues.some((issue) => issue.code === 'required')).toBe(true)
    expect(store.validation.issues.some((issue) => issue.code === 'boundary_unavailable')).toBe(true)

    store.setBoundaries([boundary])
    store.updateDraft({ name: 'ｅｘｉｓｔｉｎｇ ＺＯＮＥ' })
    expect(store.validation.issues.some((issue) => issue.code === 'duplicate')).toBe(false)
    expect(store.overlappingZones.map((zone) => zone.id)).toEqual(['zone-1'])
  })

  it('restores the edit snapshot on cancel', async () => {
    service.records = [record()]
    const store = createControlZoneStore(service, 'test-cancel')()
    await store.load()
    store.select('zone-1')
    expect(store.beginEdit()).toBe(true)
    store.updateDraft({ name: '更改后', enabled: false })
    expect(store.hasUnsavedChanges).toBe(true)
    store.cancel()
    expect(store.mode).toBe('detail')
    expect(store.draft?.name).toBe('已有区域')
    expect(store.draft?.enabled).toBe(true)
  })

  it('retains a create draft when persistence fails', async () => {
    service.failSave = true
    const store = createControlZoneStore(service, 'test-failure')()
    store.setBoundaries([boundary])
    store.beginCreate({
      type: 'rectangle',
      southWest: [113.2, 27.2],
      northEast: [113.3, 27.3],
    })
    store.updateDraft({ name: '新增区域' })

    await expect(store.save()).resolves.toBeNull()
    expect(store.mode).toBe('create')
    expect(store.draft?.name).toBe('新增区域')
    expect(store.error).toBe('存储空间不足')
  })

  it('blocks geometry outside the administrative boundary', () => {
    const store = createControlZoneStore(service, 'test-boundary')()
    store.setBoundaries([boundary])
    store.beginCreate({
      type: 'rectangle',
      southWest: [111.9, 27],
      northEast: [112.1, 27.2],
    })
    store.updateDraft({ name: '越界区域' })
    expect(store.validation.valid).toBe(false)
    expect(store.validation.issues.some((issue) => issue.code === 'outside_boundary')).toBe(true)
  })
})
