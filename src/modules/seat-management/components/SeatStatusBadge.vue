<script setup lang="ts">
import type { SeatZoneStatus } from '../types'
import { Ban, CircleCheck } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'

defineProps<{ status: SeatZoneStatus }>()
</script>

<template>
  <Badge
    variant="outline"
    :class="status === 'enabled'
      ? 'gap-1.5 border-success/30 bg-success/10 text-success'
      : 'gap-1.5 border-muted-foreground/25 bg-muted/50 text-muted-foreground'"
  >
    <CircleCheck v-if="status === 'enabled'" class="size-3.5" aria-hidden="true" />
    <Ban v-else class="size-3.5" aria-hidden="true" />
    {{ status === 'enabled' ? '启用' : '停用' }}
  </Badge>
</template>
