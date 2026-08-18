<script setup lang="ts">
import type { RolePermissionInput, SystemPermission, ValidationIssue } from '../types'
import { computed, nextTick, ref } from 'vue'
import { LockKeyhole } from '@lucide/vue'
import FormError from './FormError.vue'
import PermissionTreeSelector from './PermissionTreeSelector.vue'

const props = withDefaults(defineProps<{
  value: RolePermissionInput
  permissions: readonly SystemPermission[]
  issues?: readonly ValidationIssue<keyof RolePermissionInput>[]
  saving?: boolean
  locked?: boolean
}>(), {
  issues: () => [],
  saving: false,
  locked: false,
})

const emit = defineEmits<{
  'update:value': [value: RolePermissionInput]
}>()

const rootRef = ref<HTMLDivElement | null>(null)
const issue = computed(() => props.issues.find((item) => item.field === 'permissionIds'))

function validateAndFocus(): boolean {
  if (!issue.value) return !props.saving
  nextTick(() => rootRef.value?.focus())
  return false
}

defineExpose({ validateAndFocus })
</script>

<template>
  <div ref="rootRef" class="space-y-3" tabindex="-1">
    <div v-if="locked" class="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning" role="status">
      <LockKeyhole class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p>超级管理员权限锁定为全部，只读展示且不允许修改。</p>
    </div>
    <PermissionTreeSelector
      :permissions="permissions"
      :model-value="value.permissionIds"
      :disabled="saving || locked"
      @update:model-value="emit('update:value', { permissionIds: $event })"
    />
    <FormError :message="issue?.message" />
  </div>
</template>
