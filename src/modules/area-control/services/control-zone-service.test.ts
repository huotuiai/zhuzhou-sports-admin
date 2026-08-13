import { describe, expect, it } from 'vitest'
import type { ControlZoneWriteInput } from '../types'
import {
  CONTROL_ZONE_STORAGE_KEY,
  ControlZoneServiceError,
  LocalControlZoneService,
} from './control-zone-service'

class MemoryStorage implements Storage {
  protected readonly values = new Map<string, string>()

  get length(): number {
    return this.values.size
  }

  clear(): void {
    this.values.clear()
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

class FailingStorage extends MemoryStorage {
  override setItem(): void {
    throw new DOMException('Quota exceeded', 'QuotaExceededError')
  }
}

function input(name: string): ControlZoneWriteInput {
  return {
    name,
    description: '',
    enabled: true,
    coordinateSystem: 'GCJ-02',
    geometry: {
      type: 'rectangle',
      southWest: [113, 27],
      northEast: [113.1, 27.1],
    },
    areaSquareMeters: 100,
  }
}

describe('LocalControlZoneService', () => {
  it('creates, updates, sorts, and removes records', async () => {
    const storage = new MemoryStorage()
    const timestamps = [
      new Date('2026-01-01T00:00:00.000Z'),
      new Date('2026-01-02T00:00:00.000Z'),
      new Date('2026-01-03T00:00:00.000Z'),
    ]
    let timeIndex = 0
    let idIndex = 0
    const service = new LocalControlZoneService({
      storage,
      createId: () => `zone-${++idIndex}`,
      now: () => timestamps[timeIndex++]!,
    })

    const first = await service.create(input(' 天元管制区 '))
    const second = await service.create(input('芦淞管制区'))
    expect(first.name).toBe('天元管制区')
    expect((await service.list()).map((zone) => zone.id)).toEqual([second.id, first.id])

    const updated = await service.update(first.id, { ...input('天元管制区'), enabled: false })
    expect(updated.enabled).toBe(false)
    expect(updated.createdAt).toBe(first.createdAt)
    expect((await service.list())[0]?.id).toBe(first.id)

    await service.remove(second.id)
    expect((await service.list()).map((zone) => zone.id)).toEqual([first.id])
    const envelope = JSON.parse(storage.getItem(CONTROL_ZONE_STORAGE_KEY) ?? '{}') as {
      schemaVersion?: number
    }
    expect(envelope.schemaVersion).toBe(1)
  })

  it('enforces normalized unique names while excluding the edited record', async () => {
    const service = new LocalControlZoneService({
      storage: new MemoryStorage(),
      createId: () => globalThis.crypto.randomUUID(),
    })
    const created = await service.create(input('Ａrea'))
    await expect(service.create(input('area'))).rejects.toMatchObject({
      code: 'duplicate_name',
    } satisfies Partial<ControlZoneServiceError>)
    await expect(service.update(created.id, input(' AREA '))).resolves.toMatchObject({ name: 'AREA' })
  })

  it('does not persist a record when storage quota is exceeded', async () => {
    const storage = new FailingStorage()
    const service = new LocalControlZoneService({ storage, createId: () => 'zone-1' })
    await expect(service.create(input('测试区域'))).rejects.toThrow('Quota exceeded')
    expect(storage.length).toBe(0)
  })

  it('rejects invalid fields and missing records', async () => {
    const service = new LocalControlZoneService({ storage: new MemoryStorage(), createId: () => 'zone-1' })
    await expect(service.create(input('  '))).rejects.toMatchObject({ code: 'invalid_name' })
    await expect(
      service.create({ ...input('过长说明'), description: '字'.repeat(301) }),
    ).rejects.toMatchObject({ code: 'description_too_long' })
    await expect(service.remove('missing')).rejects.toMatchObject({ code: 'not_found' })
  })
})
