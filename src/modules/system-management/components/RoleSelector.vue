<script setup lang="ts">
import type { SystemRole } from '../types'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { ROLE_KIND_LABELS } from '../lib/rbac'

const props = withDefaults(defineProps<{
  roles: readonly SystemRole[]
  modelValue: readonly string[]
  disabled?: boolean
  protectedRoleIds?: readonly string[]
}>(), { protectedRoleIds: () => [] })

const emit = defineEmits<{
  'update:modelValue': [value: string[]]
}>()

function toggleRole(roleId: string, checked: boolean | 'indeterminate'): void {
  if (props.protectedRoleIds.includes(roleId) && checked !== true) return
  const next = new Set(props.modelValue)
  if (checked === true) next.add(roleId)
  else next.delete(roleId)
  emit('update:modelValue', [...next])
}
</script>

<template>
  <div class="grid grid-cols-1 gap-2 rounded-xl border bg-muted/15 p-3 sm:grid-cols-2" role="group" aria-label="用户角色">
    <label
      v-for="role in roles"
      :key="role.id"
      class="flex min-h-14 cursor-pointer items-start gap-3 rounded-lg border bg-background/70 p-3 transition-colors hover:border-primary/35 hover:bg-primary/5"
      :class="disabled ? 'cursor-not-allowed opacity-60' : ''"
    >
      <Checkbox
        :model-value="modelValue.includes(role.id)"
        :disabled="disabled || (protectedRoleIds.includes(role.id) && modelValue.includes(role.id))"
        :aria-label="`分配角色：${role.name}`"
        @update:model-value="toggleRole(role.id, $event)"
      />
      <span class="min-w-0 flex-1">
        <span class="flex items-center gap-2">
          <span class="truncate text-sm font-medium">{{ role.name }}</span>
          <Badge variant="outline" class="h-5 px-1.5 text-[10px]">{{ ROLE_KIND_LABELS[role.kind] }}</Badge>
          <Badge v-if="role.enabled === false" variant="outline" class="h-5 px-1.5 text-[10px]">已停用</Badge>
        </span>
        <span class="mt-1 block truncate text-[11px] text-muted-foreground">{{ role.description || '暂无描述' }}</span>
      </span>
    </label>
    <p v-if="roles.length === 0" class="py-4 text-center text-sm text-muted-foreground sm:col-span-2">
      暂无可分配角色
    </p>
  </div>
</template>
