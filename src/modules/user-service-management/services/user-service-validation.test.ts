import type { ContactNumberWriteInput } from '../types'
import { describe, expect, it } from 'vitest'
import { sanitizeContactNumberInput, validateContactNumberInput, validateFeedbackHandleInput } from './user-service-validation'

function contactInput(overrides: Partial<ContactNumberWriteInput> = {}): ContactNumberWriteInput {
  return { name: '服务热线', phone: '0731-22286666', sort: 1, displayEnabled: true, ...overrides }
}

describe('user service validation', () => {
  it('normalizes contact input and validates required fields and sort order', () => {
    expect(sanitizeContactNumberInput(contactInput({ name: ' 服务热线 ', phone: ' 0731-2228 6666 ' }))).toEqual({
      name: '服务热线', phone: '0731-22286666', sort: 1, displayEnabled: true,
    })
    expect(validateContactNumberInput(contactInput({ name: '', phone: '12345', sort: 0 }))).toEqual([
      { field: 'name', code: 'required', message: '请输入号码名称' },
      { field: 'phone', code: 'invalid', message: '请输入正确的手机号、固定电话或 400/800 电话' },
      { field: 'sort', code: 'positive_integer', message: '排序必须是大于 0 的整数' },
    ])
  })

  it.each(['13800138000', '0731-22286666', '073122286666', '400-123-4567', '8001234567'])(
    'accepts documented phone format %s',
    (phone) => expect(validateContactNumberInput(contactInput({ phone }))).toEqual([]),
  )

  it('requires a normalized feedback handling remark', () => {
    expect(validateFeedbackHandleInput({ remark: '  ' })).toEqual([
      { field: 'remark', code: 'required', message: '请填写处理备注' },
    ])
    expect(validateFeedbackHandleInput({ remark: ' 已回访 ' })).toEqual([])
  })
})
