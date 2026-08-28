import type { CrudDialogMode } from '@/components/common'
import type { IntegrationSourceWriteInput } from '../types'
import { isWritableIntegrationSourceType } from '../types'

export type IntegrationValidationField = 'name' | 'sourceType' | 'apiUrl' | 'apiKey' | 'intervalMinutes'

export interface IntegrationValidationIssue {
  field: IntegrationValidationField
  message: string
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  }
  catch {
    return false
  }
}

export function validateIntegrationSourceInput(
  input: IntegrationSourceWriteInput,
  mode: CrudDialogMode,
): IntegrationValidationIssue[] {
  const issues: IntegrationValidationIssue[] = []
  if (!input.name.trim()) issues.push({ field: 'name', message: '请输入对接源名称。' })
  if (!isWritableIntegrationSourceType(input.sourceType)) {
    issues.push({ field: 'sourceType', message: '新建和编辑仅支持停车场或 720 云 VR 类型。' })
  }
  if (!input.apiUrl.trim()) issues.push({ field: 'apiUrl', message: '请输入 API 地址。' })
  else if (!isHttpUrl(input.apiUrl.trim())) issues.push({ field: 'apiUrl', message: 'API 地址必须是有效的 HTTP 或 HTTPS 地址。' })
  if (mode === 'create' && !input.apiKey.trim()) issues.push({ field: 'apiKey', message: '请输入对接方提供的 API 密钥。' })
  if (!Number.isInteger(input.intervalMinutes) || input.intervalMinutes <= 0) {
    issues.push({ field: 'intervalMinutes', message: '同步频率必须是大于 0 的整数分钟。' })
  }
  return issues
}
