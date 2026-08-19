import type { OperationLog } from '../types'
import {
  OPERATION_LOG_ACTION_LABELS,
  OPERATION_LOG_MODULE_LABELS,
  OPERATION_LOG_RESULT_LABELS,
} from '../types'

export const OPERATION_LOG_EXPORT_LIMIT = 50_000

export type OperationLogExportBlockReason = 'empty' | 'too-many' | null

export interface OperationLogExport {
  filename: string
  content: string
  mimeType: 'text/csv;charset=utf-8'
}

const CSV_HEADERS = [
  '日志编号',
  '操作时间',
  '操作人',
  '登录账号',
  '所属部门',
  '操作模块',
  '操作类型',
  '操作对象类型',
  '操作对象编号',
  '操作对象',
  'IP 地址',
  '操作结果',
  '操作详情',
] as const

function formatShanghaiDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`
}

function safeSpreadsheetValue(value: unknown): string {
  const text = String(value ?? '')
  return /^[=+\-@]/.test(text) ? `'${text}` : text
}

function csvCell(value: unknown): string {
  return `"${safeSpreadsheetValue(value).replaceAll('"', '""')}"`
}

function filenameTimestamp(date: Date): string {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${values.year}${values.month}${values.day}-${values.hour}${values.minute}${values.second}`
}

export function operationLogExportBlockReason(
  logs: readonly OperationLog[],
): OperationLogExportBlockReason {
  if (!logs.length) return 'empty'
  if (logs.length > OPERATION_LOG_EXPORT_LIMIT) return 'too-many'
  return null
}

export function serializeOperationLogsCsv(logs: readonly OperationLog[]): string {
  const rows = logs.map(log => [
    log.code,
    formatShanghaiDateTime(log.performedAt),
    log.operatorName,
    log.operatorUsername,
    log.departmentName,
    OPERATION_LOG_MODULE_LABELS[log.module],
    OPERATION_LOG_ACTION_LABELS[log.action],
    log.targetType,
    log.targetId,
    log.targetLabel,
    log.ipAddress,
    OPERATION_LOG_RESULT_LABELS[log.result],
    JSON.stringify(log.details),
  ])
  return `\uFEFF${[CSV_HEADERS, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n')}`
}

export function createOperationLogExport(
  logs: readonly OperationLog[],
  now = new Date(),
): OperationLogExport {
  return {
    filename: `操作日志-${filenameTimestamp(now)}.csv`,
    content: serializeOperationLogsCsv(logs),
    mimeType: 'text/csv;charset=utf-8',
  }
}
