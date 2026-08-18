<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { Check, ChevronsUpDown, Search } from '@lucide/vue'
import type { SelectableReference } from '../types'
import { Input } from '@/components/ui/input'
import { useEventListener } from '@vueuse/core'

const props = withDefaults(defineProps<{
  modelValue: string | null
  options: readonly SelectableReference[]
  placeholder?: string
  disabled?: boolean
  invalid?: boolean
}>(), {
  placeholder: '输入编号或标题搜索',
  disabled: false,
  invalid: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string | null]
}>()

const rootRef = ref<HTMLElement | null>(null)
const open = ref(false)
const query = ref('')
const activeIndex = ref(0)
const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, '')
const listboxId = `reference-list-${instanceId}`
const selected = computed(() => props.options.find((option) => option.id === props.modelValue) ?? null)
const filteredOptions = computed(() => {
  const keyword = query.value.trim().normalize('NFKC').toLocaleLowerCase('zh-CN')
  if (!keyword) return props.options
  return props.options.filter((option) => `${option.code} ${option.title}`.normalize('NFKC').toLocaleLowerCase('zh-CN').includes(keyword))
})

watch([selected, open], ([value, isOpen]) => {
  if (!isOpen) query.value = value ? `${value.code} ${value.title}` : ''
}, { immediate: true })

watch(filteredOptions, () => { activeIndex.value = 0 })

function show(): void {
  if (props.disabled) return
  open.value = true
  query.value = ''
}

function choose(option: SelectableReference): void {
  if (!option.valid) return
  emit('update:modelValue', option.id)
  query.value = `${option.code} ${option.title}`
  open.value = false
}

function handleInput(value: string | number): void {
  query.value = String(value)
  open.value = true
}

function handleKeydown(event: KeyboardEvent): void {
  if (!open.value && ['ArrowDown', 'ArrowUp'].includes(event.key)) show()
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    activeIndex.value = Math.min(activeIndex.value + 1, Math.max(filteredOptions.value.length - 1, 0))
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    activeIndex.value = Math.max(activeIndex.value - 1, 0)
  }
  if (event.key === 'Enter' && open.value) {
    event.preventDefault()
    const option = filteredOptions.value[activeIndex.value]
    if (option) choose(option)
  }
  if (event.key === 'Escape') open.value = false
}

useEventListener(document, 'pointerdown', (event) => {
  if (rootRef.value && !rootRef.value.contains(event.target as Node)) open.value = false
})
</script>

<template>
  <div ref="rootRef" class="relative">
    <div class="relative">
      <Search class="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input
        :model-value="query"
        class="h-11 pl-9 pr-9"
        :class="invalid ? 'border-destructive' : ''"
        role="combobox"
        autocomplete="off"
        :placeholder="placeholder"
        :disabled="disabled"
        :aria-expanded="open"
        :aria-controls="listboxId"
        :aria-activedescendant="open && filteredOptions[activeIndex] ? `${listboxId}-${filteredOptions[activeIndex]!.id}` : undefined"
        @focus="show"
        @update:model-value="handleInput"
        @keydown="handleKeydown"
      />
      <ChevronsUpDown class="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
    </div>

    <div
      v-if="open"
      :id="listboxId"
      role="listbox"
      class="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-xl"
    >
      <p v-if="filteredOptions.length === 0" class="px-3 py-6 text-center text-sm text-muted-foreground">没有匹配的引用目标</p>
      <button
        v-for="(option, index) in filteredOptions"
        :id="`${listboxId}-${option.id}`"
        :key="option.id"
        type="button"
        role="option"
        class="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors"
        :class="[
          index === activeIndex ? 'bg-muted' : 'hover:bg-muted/65',
          option.valid ? '' : 'cursor-not-allowed opacity-55',
        ]"
        :aria-selected="option.id === modelValue"
        :aria-disabled="!option.valid"
        @mouseenter="activeIndex = index"
        @click="choose(option)"
      >
        <span class="min-w-0 flex-1">
          <span class="block truncate text-sm font-medium">{{ option.code }} · {{ option.title }}</span>
          <span class="mt-0.5 block text-xs" :class="option.valid ? 'text-muted-foreground' : 'text-destructive'">{{ option.description }}</span>
        </span>
        <Check v-if="option.id === modelValue" class="size-4 shrink-0 text-primary" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>
