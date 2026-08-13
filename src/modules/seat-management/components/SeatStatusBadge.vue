<script setup lang="ts">
import type { SeatStatus } from '../types'
import { CircleOff, CircleCheck, Wrench } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'

defineProps<{ status: SeatStatus }>()
</script>

<template>
  <Badge
    variant="outline"
    class="h-7 gap-1.5 whitespace-nowrap"
    :class="status === 'available'
      ? 'border-success/30 bg-success/10 text-success'
      : status === 'maintenance'
        ? 'border-warning/30 bg-warning/10 text-warning'
        : 'border-border bg-muted text-muted-foreground'"
  >
    <CircleCheck v-if="status === 'available'" class="size-3.5" />
    <Wrench v-else-if="status === 'maintenance'" class="size-3.5" />
    <CircleOff v-else class="size-3.5" />
    {{ status === 'available' ? '可用' : status === 'maintenance' ? '维护中' : '停用' }}
  </Badge>
</template>
