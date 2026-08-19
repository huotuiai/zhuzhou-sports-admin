import type { OperationLog } from '../types'
import { describe, expect, it } from 'vitest'
import { createDefaultOperationLogs } from '../services/operation-log-service'
import {
  createOperationLogExport,
  OPERATION_LOG_EXPORT_LIMIT,
  operationLogExportBlockReason,
  serializeOperationLogsCsv,
} from './export'

describe('operation log export', () => {
  it('serializes all audit fields as an Excel-compatible UTF-8 CSV', () => {
    const log: OperationLog = {
      ...createDefaultOperationLogs()[0]!,
      operatorName: '=HYPERLINK("https://example.test")',
      targetLabel: '体育场 "A" 区',
      details: { line: '第一行\n第二行' },
    }
    const csv = serializeOperationLogsCsv([log])

    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('"日志编号","操作时间","操作人","登录账号"')
    expect(csv).toContain('"体育场 ""A"" 区"')
    expect(csv).toContain('"操作详情"')
    expect(csv).toContain('"\'=HYPERLINK')
    expect(csv.split('\r\n')).toHaveLength(2)
  })

  it('uses a second-precision Asia/Shanghai timestamp in the filename', () => {
    const file = createOperationLogExport(
      createDefaultOperationLogs(),
      new Date('2026-08-19T06:05:04.000Z'),
    )

    expect(file.filename).toBe('操作日志-20260819-140504.csv')
    expect(file.mimeType).toBe('text/csv;charset=utf-8')
  })

  it('blocks empty exports and results beyond 50,000 rows', () => {
    const sample = createDefaultOperationLogs()[0]!
    expect(operationLogExportBlockReason([])).toBe('empty')
    expect(operationLogExportBlockReason([sample])).toBeNull()
    expect(operationLogExportBlockReason(
      Array.from({ length: OPERATION_LOG_EXPORT_LIMIT + 1 }, () => sample),
    )).toBe('too-many')
  })
})
