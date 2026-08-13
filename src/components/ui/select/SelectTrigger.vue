<script setup lang="ts">
import type { SelectTriggerProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { ChevronDown } from '@lucide/vue'
import { reactiveOmit } from '@vueuse/core'
import {
  SelectIcon,
  SelectTrigger,
  useForwardProps,
} from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<SelectTriggerProps & { class?: HTMLAttributes['class'] }>()
const delegatedProps = reactiveOmit(props, 'class')
const forwarded = useForwardProps(delegatedProps)
</script>

<template>
  <SelectTrigger
    data-slot="select-trigger"
    v-bind="forwarded"
    :class="cn(
      'border-input data-[placeholder]:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 dark:bg-input/30 flex h-9 w-fit items-center justify-between gap-2 rounded-lg border bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs outline-none transition-colors focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-9 data-[size=sm]:h-8 [&_svg:not([class*=size-])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0',
      props.class,
    )"
  >
    <slot />
    <SelectIcon as-child>
      <ChevronDown class="size-4 opacity-50" aria-hidden="true" />
    </SelectIcon>
  </SelectTrigger>
</template>
