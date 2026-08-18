<script setup lang="ts">
import type { UserPasswordResetInput, ValidationIssue } from '../types'
import { computed, nextTick, ref } from 'vue'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import FormError from './FormError.vue'

const props = withDefaults(defineProps<{
  value: UserPasswordResetInput
  issues?: readonly ValidationIssue<keyof UserPasswordResetInput>[]
  saving?: boolean
}>(), { issues: () => [], saving: false })
const emit = defineEmits<{ 'update:value': [value: UserPasswordResetInput] }>()
const fieldsRef = ref<HTMLDivElement | null>(null)
const issueMap = computed(() => new Map(props.issues.map(issue => [issue.field, issue.message])))
function patch(value: Partial<UserPasswordResetInput>): void { emit('update:value', { ...props.value, ...value }) }
function validateAndFocus(): boolean {
  const issue = props.issues[0]
  if (issue) nextTick(() => fieldsRef.value?.querySelector<HTMLElement>(`[data-field="${issue.field}"]`)?.focus())
  return !issue && !props.saving
}
defineExpose({ validateAndFocus })
</script>

<template>
  <div ref="fieldsRef" class="grid gap-5 sm:grid-cols-2">
    <div class="space-y-2">
      <Label for="reset-user-password">新密码 <span class="text-destructive">*</span></Label>
      <Input id="reset-user-password" data-field="password" type="password" :model-value="value.password" class="h-11" placeholder="8–32 位，包含字母和数字" autocomplete="new-password" :disabled="saving" :aria-invalid="Boolean(issueMap.get('password'))" @update:model-value="patch({ password: String($event) })" />
      <FormError :message="issueMap.get('password')" />
    </div>
    <div class="space-y-2">
      <Label for="reset-user-confirm-password">确认新密码 <span class="text-destructive">*</span></Label>
      <Input id="reset-user-confirm-password" data-field="confirmPassword" type="password" :model-value="value.confirmPassword" class="h-11" placeholder="再次输入新密码" autocomplete="new-password" :disabled="saving" :aria-invalid="Boolean(issueMap.get('confirmPassword'))" @update:model-value="patch({ confirmPassword: String($event) })" />
      <FormError :message="issueMap.get('confirmPassword')" />
    </div>
    <div class="rounded-xl border border-warning/25 bg-warning/5 p-4 text-sm leading-6 text-muted-foreground sm:col-span-2">
      保存后该用户会被标记为“下次登录需修改密码”。当前 mock 登录不执行真实认证拦截，密码内容也不会写入 localStorage。
    </div>
  </div>
</template>
