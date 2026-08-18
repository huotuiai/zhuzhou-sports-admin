<script setup lang="ts">
import type { ParkingOpenStatus } from '../types'
import { CircleCheck, CircleX } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { parkingOpenStatusLabel } from '../types'

defineProps<{ status: ParkingOpenStatus }>()
</script>

<template>
  <Badge
    variant="outline"
    class="h-7 gap-1.5 whitespace-nowrap"
    :class="status === 'open'
      ? 'border-success/30 bg-success/10 text-success'
      : 'border-border bg-muted text-muted-foreground'"
  >
    <CircleCheck v-if="status === 'open'" class="size-3.5" aria-hidden="true" />
    <CircleX v-else class="size-3.5" aria-hidden="true" />
    {{ parkingOpenStatusLabel(status) }}
  </Badge>
</template>
