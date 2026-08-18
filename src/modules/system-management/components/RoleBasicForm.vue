<script setup lang="ts">
import type { RoleBasicInfoInput, ValidationIssue } from '../types'
import { computed, nextTick, ref } from 'vue'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import FormError from './FormError.vue'

const props = withDefaults(defineProps<{
  value: RoleBasicInfoInput
  issues?: readonly ValidationIssue<keyof RoleBasicInfoInput>[]
  saving?: boolean
  superAdmin?: boolean
}>(), {
  issues: () => [],
  saving: false,
  superAdmin: false,
})

const emit = defineEmits<{
  'update:value': [value: RoleBasicInfoInput]
}>()

const fieldsRef = ref<HTMLDivElement | null>(null)
const issueMap = computed(() => new Map(props.issues.map((issue) => [issue.field, issue.message])))

function patch(value: Partial<RoleBasicInfoInput>): void {
  emit('update:value', { ...props.value, ...value })
}

function validateAndFocus(): boolean {
  const issue = props.issues[0]
  if (!issue) return !props.saving
  nextTick(() => fieldsRef.value?.querySelector<HTMLElement>(`[data-field="${issue.field}"]`)?.focus())
  return false
}

defineExpose({ validateAndFocus })
</script>

<template>
  <div ref="fieldsRef" class="grid gap-5">
    <div class="space-y-2">
      <div class="flex items-center justify-between gap-3">
        <Label for="role-edit-name">角色名称 <span class="text-destructive" aria-hidden="true">*</span></Label>
        <span class="text-xs tabular-nums text-muted-foreground">{{ Array.from(value.name).length }}/20</span>
      </div>
      <Input
        id="role-edit-name"
        data-field="name"
        :model-value="value.name"
        class="h-11"
        maxlength="20"
        :disabled="saving || superAdmin"
        :aria-invalid="Boolean(issueMap.get('name'))"
        @update:model-value="patch({ name: String($event) })"
      />
      <p v-if="superAdmin" class="text-xs text-warning">超级管理员角色名称为系统安全标识，不可修改。</p>
      <FormError :message="issueMap.get('name')" />
    </div>

    <div class="space-y-2">
      <div class="flex items-center justify-between gap-3">
        <Label for="role-edit-description">描述</Label>
        <span class="text-xs tabular-nums text-muted-foreground">{{ Array.from(value.description).length }}/300</span>
      </div>
      <Textarea
        id="role-edit-description"
        data-field="description"
        :model-value="value.description"
        class="min-h-24"
        maxlength="300"
        placeholder="选填，填写角色职责说明"
        :disabled="saving"
        :aria-invalid="Boolean(issueMap.get('description'))"
        @update:model-value="patch({ description: String($event) })"
      />
      <FormError :message="issueMap.get('description')" />
    </div>

    <p class="rounded-xl border bg-muted/25 px-3 py-2.5 text-xs leading-5 text-muted-foreground">
      权限调整请使用列表中的“权限分配”入口，基本信息与授权分开保存。
    </p>
  </div>
</template>
