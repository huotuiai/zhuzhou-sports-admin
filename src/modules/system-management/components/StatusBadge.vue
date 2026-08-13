<script setup lang="ts">
import { CheckCircle2, CircleOff } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'

defineProps<{ enabled: boolean }>()
</script>

<template>
  <Badge
    variant="outline"
    class="h-7 gap-1.5 whitespace-nowrap"
    :class="enabled
      ? 'border-success/30 bg-success/10 text-success'
      : 'border-border bg-muted text-muted-foreground'"
  >
    <CheckCircle2 v-if="enabled" class="size-3.5" aria-hidden="true" />
    <CircleOff v-else class="size-3.5" aria-hidden="true" />
    {{ enabled ? '启用' : '停用' }}
  </Badge>
</template>
