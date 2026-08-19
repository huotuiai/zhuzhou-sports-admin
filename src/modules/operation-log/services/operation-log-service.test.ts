import { describe, expect, it } from 'vitest'
import {
  LocalOperationLogService,
  OPERATION_LOG_SCHEMA_VERSION,
  OPERATION_LOG_STORAGE_KEY,
} from './operation-log-service'

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()

  get length(): number { return this.values.size }
  clear(): void { this.values.clear() }
  getItem(key: string): string | null { return this.values.get(key) ?? null }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null }
  removeItem(key: string): void { this.values.delete(key) }
  setItem(key: string, value: string): void { this.values.set(key, value) }
}

describe('LocalOperationLogService', () => {
  it('seeds, versions, persists, and sorts the P13 demonstration logs', async () => {
    const storage = new MemoryStorage()
    const service = new LocalOperationLogService({ storage })

    const logs = await service.load()
    expect(logs).toHaveLength(6)
    expect(logs.map(log => log.code)).toEqual([
      'LOG-001',
      'LOG-002',
      'LOG-003',
      'LOG-004',
      'LOG-005',
      'LOG-006',
    ])
    expect(logs[4]).toMatchObject({ action: 'sync', result: 'failure' })

    const stored = JSON.parse(storage.getItem(OPERATION_LOG_STORAGE_KEY) ?? '{}') as {
      schemaVersion?: number
      logs?: unknown[]
    }
    expect(stored.schemaVersion).toBe(OPERATION_LOG_SCHEMA_VERSION)
    expect(stored.logs).toHaveLength(6)
    expect(await new LocalOperationLogService({ storage }).load()).toEqual(logs)
  })

  it('returns defensive copies of nested operation details', async () => {
    const storage = new MemoryStorage()
    const service = new LocalOperationLogService({ storage })
    const firstLoad = await service.load()
    firstLoad[0]!.operatorName = '被修改的名称'
    const details = firstLoad[0]!.details as { changes: Array<{ to: boolean }> }
    details.changes[0]!.to = false

    const secondLoad = await service.load()
    expect(secondLoad[0]!.operatorName).toBe('管理员')
    expect((secondLoad[0]!.details as { changes: Array<{ to: boolean }> }).changes[0]!.to).toBe(true)
  })

  it('reports malformed JSON and invalid schema without overwriting storage', async () => {
    const storage = new MemoryStorage()
    storage.setItem(OPERATION_LOG_STORAGE_KEY, '{invalid')
    await expect(new LocalOperationLogService({ storage }).load()).rejects.toMatchObject({
      code: 'storage_corrupted',
      message: '本地操作日志数据无法解析',
    })
    expect(storage.getItem(OPERATION_LOG_STORAGE_KEY)).toBe('{invalid')

    storage.setItem(OPERATION_LOG_STORAGE_KEY, JSON.stringify({ schemaVersion: 99, logs: [] }))
    await expect(new LocalOperationLogService({ storage }).load()).rejects.toMatchObject({
      code: 'storage_corrupted',
    })
  })
})
