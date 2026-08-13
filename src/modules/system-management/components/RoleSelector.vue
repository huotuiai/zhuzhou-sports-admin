<script setup lang="ts">
import type { SystemRole } from '../types'
import { computed } from 'vue'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'

const props = defineProps<{
  roles: readonly SystemRole[]
  modelValue: readonly string[]
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string[]]
}>()

const enabledRoles = computed(() => props.roles.filter((role) => (
  role.enabled || props.modelValue.includes(role.id)
)))

function toggleRole(roleId: string, checked: boolean | 'indeterminate'): void {
  const next = new Set(props.modelValue)
  if (checked === true) next.add(roleId)
  else next.delete(roleId)
  emit('update:modelValue', [...next])
}
</script>

<template>
  <div class="grid grid-cols-2 gap-2 rounded-xl border bg-muted/15 p-3" role="group" aria-label="用户角色">
    <label
      v-for="role in enabledRoles"
      :key="role.id"
      class="flex min-h-14 cursor-pointer items-start gap-3 rounded-lg border bg-background/70 p-3 transition-colors hover:border-primary/35 hover:bg-primary/5"
    >
      <Checkbox
        :model-value="modelValue.includes(role.id)"
        :disabled="disabled"
        :aria-label="`分配角色：${role.name}`"
        @update:model-value="toggleRole(role.id, $event)"
      />
      <span class="min-w-0 flex-1">
        <span class="flex items-center gap-2">
          <span class="truncate text-sm font-medium">{{ role.name }}</span>
          <Badge v-if="role.builtIn" variant="outline" class="h-5 px-1.5 text-[10px]">内置</Badge>
          <Badge v-else-if="!role.enabled" variant="outline" class="h-5 px-1.5 text-[10px] text-muted-foreground">已停用</Badge>
        </span>
        <span class="mt-1 block truncate font-mono text-[11px] text-muted-foreground">{{ role.code }}</span>
      </span>
    </label>
    <p v-if="enabledRoles.length === 0" class="col-span-2 py-4 text-center text-sm text-muted-foreground">
      暂无可分配的启用角色
    </p>
  </div>
</template>
