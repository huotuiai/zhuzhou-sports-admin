<script setup lang="ts">
import type { PermissionTreeNode, SystemPermission } from '../types'
import { ChevronDown, ChevronRight, Folder, KeyRound, Menu } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { getDescendantPermissionIds, PERMISSION_TYPE_LABELS } from '../lib/rbac'

defineOptions({ name: 'PermissionTreeBranch' })

const props = defineProps<{
  nodes: readonly PermissionTreeNode[]
  permissions: readonly SystemPermission[]
  modelValue: readonly string[]
  expandedIds: ReadonlySet<string>
  disabled?: boolean
}>()

const emit = defineEmits<{
  toggle: [node: PermissionTreeNode, checked: boolean | 'indeterminate']
  'toggle-expanded': [id: string]
}>()

function checkboxState(node: PermissionTreeNode): boolean | 'indeterminate' {
  const descendants = getDescendantPermissionIds(node.id, props.permissions)
  const selectedDescendantCount = descendants.filter((id) => props.modelValue.includes(id)).length
  if (selectedDescendantCount === 0) return props.modelValue.includes(node.id)
  if (selectedDescendantCount === descendants.length && props.modelValue.includes(node.id)) return true
  return 'indeterminate'
}

function iconFor(type: SystemPermission['type']) {
  if (type === 'directory') return Folder
  if (type === 'menu') return Menu
  return KeyRound
}
</script>

<template>
  <div v-for="node in nodes" :key="node.id">
    <div
      class="flex min-h-10 items-center gap-2 rounded-lg px-2 transition-colors hover:bg-muted/50"
      role="treeitem"
      :aria-level="node.depth + 1"
      :aria-expanded="node.children.length ? expandedIds.has(node.id) : undefined"
    >
      <Button
        v-if="node.children.length"
        type="button"
        variant="ghost"
        size="icon-sm"
        class="size-7 shrink-0"
        :aria-label="`${expandedIds.has(node.id) ? '收起' : '展开'}${node.name}`"
        @click="emit('toggle-expanded', node.id)"
      >
        <ChevronDown v-if="expandedIds.has(node.id)" aria-hidden="true" />
        <ChevronRight v-else aria-hidden="true" />
      </Button>
      <span v-else class="size-7 shrink-0" aria-hidden="true" />
      <Checkbox
        :model-value="checkboxState(node)"
        :disabled="disabled"
        :aria-label="`选择权限：${node.name}`"
        @update:model-value="emit('toggle', node, $event)"
      />
      <component :is="iconFor(node.type)" class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span class="min-w-0 flex-1 truncate text-sm font-medium">{{ node.name }}</span>
      <Badge variant="outline" class="h-5 px-1.5 text-[10px]">{{ PERMISSION_TYPE_LABELS[node.type] }}</Badge>
      <code class="hidden text-[11px] text-muted-foreground xl:block">{{ node.code }}</code>
    </div>

    <div v-if="node.children.length && expandedIds.has(node.id)" class="ml-5 border-l pl-2" role="group">
      <PermissionTreeBranch
        :nodes="node.children"
        :permissions="permissions"
        :model-value="modelValue"
        :expanded-ids="expandedIds"
        :disabled="disabled"
        @toggle="(child, checked) => emit('toggle', child, checked)"
        @toggle-expanded="emit('toggle-expanded', $event)"
      />
    </div>
  </div>
</template>
