import type {
  ContactNumberValidationField,
  ContactNumberWriteInput,
  FeedbackHandleInput,
  FeedbackHandleValidationField,
  ValidationIssue,
} from '../types'

function normalizeText(value: string): string {
  return value.trim().normalize('NFKC')
}

export function sanitizeContactNumberInput(input: ContactNumberWriteInput): ContactNumberWriteInput {
  return {
    name: normalizeText(input.name),
    phone: normalizeText(input.phone).replace(/\s+/g, ''),
    sort: Number(input.sort),
    displayEnabled: Boolean(input.displayEnabled),
  }
}

export function validateContactNumberInput(
  input: ContactNumberWriteInput,
): ValidationIssue<ContactNumberValidationField>[] {
  const value = sanitizeContactNumberInput(input)
  const issues: ValidationIssue<ContactNumberValidationField>[] = []
  const validPhone = /^(?:1\d{10}|0\d{2,3}-?\d{7,8}|(?:400|800)-?\d{3}-?\d{4})$/
  if (!value.name) issues.push({ field: 'name', code: 'required', message: '请输入号码名称' })
  if (!value.phone) issues.push({ field: 'phone', code: 'required', message: '请输入联系电话' })
  else if (!validPhone.test(value.phone)) {
    issues.push({ field: 'phone', code: 'invalid', message: '请输入正确的手机号、固定电话或 400/800 电话' })
  }
  if (!Number.isInteger(value.sort) || value.sort <= 0) {
    issues.push({ field: 'sort', code: 'positive_integer', message: '排序必须是大于 0 的整数' })
  }
  return issues
}

export function sanitizeFeedbackHandleInput(input: FeedbackHandleInput): FeedbackHandleInput {
  return { remark: normalizeText(input.remark) }
}

export function validateFeedbackHandleInput(
  input: FeedbackHandleInput,
): ValidationIssue<FeedbackHandleValidationField>[] {
  return sanitizeFeedbackHandleInput(input).remark
    ? []
    : [{ field: 'remark', code: 'required', message: '请填写处理备注' }]
}
