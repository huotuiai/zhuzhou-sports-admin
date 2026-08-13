<script setup lang="ts">
import { LoaderCircle, RotateCcw, Search } from '@lucide/vue'
import { Button } from '@/components/ui/button'

const props = withDefaults(defineProps<{
  loading?: boolean
  disabled?: boolean
  queryLabel?: string
  resetLabel?: string
}>(), {
  loading: false,
  disabled: false,
  queryLabel: '查询',
  resetLabel: '重置',
})

const emit = defineEmits<{
  query: []
  reset: []
}>()

function handleSubmit() {
  if (props.loading || props.disabled) return
  emit('query')
}

function handleReset() {
  if (props.loading || props.disabled) return
  emit('reset')
}
</script>

<template>
  <form
    class="glass-panel rounded-xl border p-4"
    role="search"
    :aria-busy="loading"
    @submit.prevent="handleSubmit"
    @reset.prevent="handleReset"
  >
    <div class="flex items-end gap-4">
      <div class="grid min-w-0 flex-1 grid-cols-3 gap-4 xl:grid-cols-4">
        <slot />
      </div>

      <div class="flex shrink-0 items-center justify-end gap-2">
        <slot name="actions-before" />

        <Button
          type="reset"
          variant="outline"
          size="lg"
          class="h-11 min-w-24"
          :disabled="disabled || loading"
        >
          <RotateCcw aria-hidden="true" />
          {{ resetLabel }}
        </Button>

        <Button
          type="submit"
          size="lg"
          class="h-11 min-w-24"
          :disabled="disabled || loading"
        >
          <LoaderCircle v-if="loading" class="animate-spin motion-reduce:animate-none" aria-hidden="true" />
          <Search v-else aria-hidden="true" />
          {{ loading ? '查询中' : queryLabel }}
        </Button>

        <slot name="actions-after" />
      </div>
    </div>

    <p class="sr-only" aria-live="polite">{{ loading ? '正在查询数据' : '' }}</p>
  </form>
</template>
