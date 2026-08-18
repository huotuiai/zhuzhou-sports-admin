<script setup lang="ts">
import { computed } from 'vue'
import { Check, ChevronDown } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

const props = withDefaults(defineProps<{
  label: string
  placeholder: string
  items: readonly { id: string; label: string; disabled?: boolean }[]
  modelValue: readonly string[]
  disabled?: boolean
}>(), { disabled: false })
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()
const summary = computed(() => {
  if (!props.modelValue.length) return props.placeholder
  if (props.modelValue.length === 1) return props.items.find(item => item.id === props.modelValue[0])?.label ?? '已选择 1 项'
  return `已选择 ${props.modelValue.length} 项`
})
function update(id: string, checked: boolean): void {
  const next = new Set(props.modelValue)
  if (checked) next.add(id)
  else next.delete(id)
  emit('update:modelValue', [...next])
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button type="button" variant="outline" class="h-11 w-full justify-between px-3 font-normal" :disabled="disabled">
        <span class="truncate" :class="modelValue.length ? 'text-foreground' : 'text-muted-foreground'">{{ summary }}</span>
        <ChevronDown class="size-4 shrink-0 opacity-60" aria-hidden="true" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent class="max-h-72 min-w-64 overflow-y-auto" align="start">
      <DropdownMenuLabel class="flex items-center justify-between gap-4"><span>{{ label }}</span><span class="text-xs font-normal text-muted-foreground">可多选</span></DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuCheckboxItem
        v-for="item in items"
        :key="item.id"
        :model-value="modelValue.includes(item.id)"
        :disabled="item.disabled"
        class="min-h-10"
        @select.prevent
        @update:model-value="update(item.id, Boolean($event))"
      >
        <template #indicator-icon><Check /></template>
        <span class="truncate">{{ item.label }}</span>
      </DropdownMenuCheckboxItem>
      <p v-if="items.length === 0" class="px-3 py-6 text-center text-sm text-muted-foreground">暂无选项</p>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
