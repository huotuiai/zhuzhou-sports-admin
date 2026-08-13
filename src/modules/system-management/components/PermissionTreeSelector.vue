<script setup lang="ts">
import type { PermissionTreeNode, SystemPermission } from '../types'
import { computed, ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import {
  buildPermissionTree,
  getAncestorPermissionIds,
  getDescendantPermissionIds,
} from '../lib/rbac'
import PermissionTreeBranch from './PermissionTreeBranch.vue'

const props = withDefaults(defineProps<{
  permissions: readonly SystemPermission[]
  modelValue: readonly string[]
  disabled?: boolean
}>(), {
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string[]]
}>()

const expandedIds = ref(new Set<string>())
const enabledPermissions = computed(() => props.permissions.filter((item) => item.enabled))
const tree = computed(() => buildPermissionTree(enabledPermissions.value))
const allIds = computed(() => enabledPermissions.value.map((item) => item.id))

watch(() => props.permissions, (permissions) => {
  const next = new Set(expandedIds.value)
  for (const permission of permissions) {
    if (permission.type !== 'button') next.add(permission.id)
  }
  expandedIds.value = next
}, { immediate: true })

function toggle(node: PermissionTreeNode, checked: boolean | 'indeterminate'): void {
  const next = new Set(props.modelValue)
  const descendants = getDescendantPermissionIds(node.id, props.permissions)
  if (checked === true) {
    next.add(node.id)
    descendants.forEach((id) => next.add(id))
    getAncestorPermissionIds(node.id, props.permissions).forEach((id) => next.add(id))
  } else {
    next.delete(node.id)
    descendants.forEach((id) => next.delete(id))
  }
  emit('update:modelValue', allIds.value.filter((id) => next.has(id)))
}

function toggleExpanded(id: string): void {
  const next = new Set(expandedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedIds.value = next
}
</script>

<template>
  <div class="overflow-hidden rounded-xl border bg-muted/10">
    <div class="flex min-h-12 items-center justify-between gap-3 border-b bg-muted/35 px-3">
      <p class="text-xs text-muted-foreground">
        已选择 <strong class="font-semibold text-foreground">{{ modelValue.length }}</strong> / {{ allIds.length }} 项
      </p>
      <div class="flex items-center gap-1">
        <Button type="button" variant="ghost" size="sm" :disabled="disabled" @click="emit('update:modelValue', [...allIds])">全选</Button>
        <Button type="button" variant="ghost" size="sm" :disabled="disabled" @click="emit('update:modelValue', [])">清空</Button>
      </div>
    </div>
    <div class="max-h-80 overflow-y-auto p-2" role="tree" aria-label="权限树">
      <PermissionTreeBranch
        :nodes="tree"
        :permissions="permissions"
        :model-value="modelValue"
        :expanded-ids="expandedIds"
        :disabled="disabled"
        @toggle="toggle"
        @toggle-expanded="toggleExpanded"
      />
      <p v-if="tree.length === 0" class="py-8 text-center text-sm text-muted-foreground">暂无可授权权限</p>
    </div>
  </div>
</template>
