<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { PanelLeftClose, PanelLeftOpen } from '@lucide/vue'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useSidebar } from './utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()

const { state, toggleSidebar } = useSidebar()
</script>

<template>
  <Button
    data-sidebar="trigger"
    data-slot="sidebar-trigger"
    variant="ghost"
    size="icon-sm"
    :class="cn('text-muted-foreground hover:text-foreground', props.class)"
    :aria-label="state === 'collapsed' ? '展开导航栏' : '收起导航栏'"
    :title="`${state === 'collapsed' ? '展开' : '收起'}导航栏（Ctrl/⌘ + B）`"
    @click="toggleSidebar"
  >
    <PanelLeftOpen v-if="state === 'collapsed'" class="cn-rtl-flip" aria-hidden="true" />
    <PanelLeftClose v-else class="cn-rtl-flip" aria-hidden="true" />
  </Button>
</template>
