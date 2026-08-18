<script setup lang="ts">
import type { SystemDepartment } from '../types'
import { computed } from 'vue'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { buildDepartmentTree, flattenDepartmentTree } from '../lib/rbac'

const props = withDefaults(defineProps<{
  departments: readonly SystemDepartment[]
  modelValue: readonly string[]
  disabled?: boolean
  allowDisabledSelected?: boolean
}>(), {
  disabled: false,
  allowDisabledSelected: true,
})

const emit = defineEmits<{
  'update:modelValue': [value: string[]]
}>()

const rows = computed(() => flattenDepartmentTree(buildDepartmentTree(props.departments)))

function isOptionDisabled(department: SystemDepartment): boolean {
  if (props.disabled) return true
  if (department.status === 'enabled') return false
  return !(props.allowDisabledSelected && props.modelValue.includes(department.id))
}

function toggle(department: SystemDepartment, checked: boolean | 'indeterminate'): void {
  if (isOptionDisabled(department)) return
  const next = new Set(props.modelValue)
  if (checked === true) next.add(department.id)
  else next.delete(department.id)
  emit('update:modelValue', [...next])
}
</script>

<template>
  <div class="max-h-64 space-y-1 overflow-y-auto rounded-xl border bg-muted/15 p-2" role="group" aria-label="所属部门">
    <label
      v-for="department in rows"
      :key="department.id"
      class="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-primary/5"
      :class="isOptionDisabled(department) ? 'cursor-not-allowed opacity-55' : 'cursor-pointer'"
      :style="{ paddingLeft: `${12 + department.depth * 20}px` }"
    >
      <Checkbox
        :model-value="modelValue.includes(department.id)"
        :disabled="isOptionDisabled(department)"
        :aria-label="`选择部门：${department.name}`"
        @update:model-value="toggle(department, $event)"
      />
      <span class="min-w-0 flex-1 truncate text-sm">{{ department.name }}</span>
      <Badge v-if="department.status === 'disabled'" variant="outline" class="shrink-0 text-[10px]">已停用</Badge>
    </label>
    <p v-if="rows.length === 0" class="px-3 py-8 text-center text-sm text-muted-foreground">暂无部门</p>
  </div>
</template>
