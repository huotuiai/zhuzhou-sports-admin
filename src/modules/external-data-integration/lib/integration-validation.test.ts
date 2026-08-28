import { describe, expect, it } from 'vitest'
import type { IntegrationSourceWriteInput } from '../types'
import { validateIntegrationSourceInput } from './integration-validation'

function input(overrides: Partial<IntegrationSourceWriteInput> = {}): IntegrationSourceWriteInput {
  return {
    name: '停车场系统',
    sourceType: 'parking',
    apiUrl: 'https://park.example.com/v1',
    apiKey: 'secret',
    intervalMinutes: 15,
    enabled: true,
    remark: '',
    ...overrides,
  }
}

describe('integration source validation', () => {
  it('requires the prototype fields when creating a source', () => {
    const issues = validateIntegrationSourceInput(input({
      name: '', apiUrl: 'ftp://example.com', apiKey: '', intervalMinutes: 0,
    }), 'create')
    expect(issues.map(issue => issue.field)).toEqual(['name', 'apiUrl', 'apiKey', 'intervalMinutes'])
  })

  it('allows an empty key when editing but rejects legacy source types', () => {
    expect(validateIntegrationSourceInput(input({ apiKey: '' }), 'edit')).toEqual([])
    expect(validateIntegrationSourceInput(input({ sourceType: 'shuttle' }), 'edit'))
      .toEqual([{ field: 'sourceType', message: '新建和编辑仅支持停车场或 720 云 VR 类型。' }])
  })
})
