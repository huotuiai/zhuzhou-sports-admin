<script setup lang="ts">
import type { VrLinkStatus } from '../types'
import { computed } from 'vue'
import { CircleCheck, CirclePause, LoaderCircle } from '@lucide/vue'

const props = withDefaults(defineProps<{
  status: VrLinkStatus
  interactive?: boolean
  loading?: boolean
}>(), { interactive: false, loading: false })

const emit = defineEmits<{ click: [] }>()
const config = computed(() => props.status === 'enabled'
  ? { label: '启用', class: 'border-success/30 bg-success/10 text-success', icon: CircleCheck }
  : { label: '停用', class: 'border-border bg-muted text-muted-foreground', icon: CirclePause })
</script>

<template>
  <button
    v-if="interactive"
    type="button"
    :disabled="loading"
    :class="[
      'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors duration-200 hover:ring-2 hover:ring-ring/20 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-wait disabled:opacity-70 motion-reduce:transition-none',
      config.class,
    ]"
    :aria-label="`${status === 'enabled' ? '停用' : '启用'}该 VR 绑定，当前${config.label}`"
    :aria-busy="loading"
    @click="emit('click')"
  >
    <LoaderCircle v-if="loading" class="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
    <component :is="config.icon" v-else class="size-3.5" aria-hidden="true" />
    {{ loading ? '更新中' : config.label }}
  </button>
  <span v-else :class="['inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium', config.class]">
    <component :is="config.icon" class="size-3.5" aria-hidden="true" />
    {{ config.label }}
  </span>
</template>
