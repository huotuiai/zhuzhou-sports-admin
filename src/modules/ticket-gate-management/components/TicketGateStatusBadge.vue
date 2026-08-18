<script setup lang="ts">
import type { TicketGateStatus } from '../types'
import { computed } from 'vue'
import { CircleCheck, CirclePause, ShieldAlert } from '@lucide/vue'

const props = withDefaults(defineProps<{
  status: TicketGateStatus
  interactive?: boolean
}>(), { interactive: false })

const emit = defineEmits<{ click: [] }>()
const config = computed(() => ({
  open: { label: '开放', class: 'border-success/30 bg-success/10 text-success', icon: CircleCheck },
  closed: { label: '关闭', class: 'border-border bg-muted text-muted-foreground', icon: CirclePause },
  restricted: { label: '管制', class: 'border-destructive/30 bg-destructive/10 text-destructive', icon: ShieldAlert },
})[props.status])
</script>

<template>
  <button
    v-if="interactive"
    type="button"
    :class="['inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors hover:ring-2 hover:ring-ring/20 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50', config.class]"
    :aria-label="`配置检票口状态，当前${config.label}`"
    @click="emit('click')"
  >
    <component :is="config.icon" class="size-3.5" aria-hidden="true" />
    {{ config.label }}
  </button>
  <span v-else :class="['inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium', config.class]">
    <component :is="config.icon" class="size-3.5" aria-hidden="true" />
    {{ config.label }}
  </span>
</template>
