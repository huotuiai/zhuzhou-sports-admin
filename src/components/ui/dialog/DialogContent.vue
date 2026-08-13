<script setup lang="ts">
import type { DialogContentEmits, DialogContentProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import {
  DialogContent,
  DialogOverlay,
  DialogPortal,
  useForwardPropsEmits,
} from 'reka-ui'
import { cn } from '@/lib/utils'

defineOptions({ inheritAttrs: false })

const props = defineProps<DialogContentProps & { class?: HTMLAttributes['class'] }>()
const emits = defineEmits<DialogContentEmits>()
const delegatedProps = reactiveOmit(props, 'class')
const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <DialogPortal>
    <DialogOverlay
      data-slot="dialog-overlay"
      class="fixed inset-0 z-50 bg-black/35 duration-150 supports-backdrop-filter:backdrop-blur-xs data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 motion-reduce:animate-none"
    />
    <DialogContent
      data-slot="dialog-content"
      v-bind="{ ...$attrs, ...forwarded }"
      :class="cn(
        'fixed left-1/2 top-1/2 z-50 w-full -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl outline-none duration-150 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 motion-reduce:animate-none',
        props.class,
      )"
    >
      <slot />
    </DialogContent>
  </DialogPortal>
</template>
