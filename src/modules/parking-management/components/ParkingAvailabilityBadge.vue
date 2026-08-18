<script setup lang="ts">
import type { ParkingLot } from '../types'
import { CircleAlert, CircleCheck, CircleGauge } from '@lucide/vue'
import { computed } from 'vue'
import { Badge } from '@/components/ui/badge'
import { deriveParkingAvailabilityLevel, parkingAvailabilityLabel } from '../lib/map-items'

const props = defineProps<{ record: ParkingLot }>()
const level = computed(() => deriveParkingAvailabilityLevel(props.record))
const label = computed(() => parkingAvailabilityLabel(props.record))
const badgeClass = computed(() => {
  if (level.value === 'ample') return 'border-success/30 bg-success/10 text-success'
  if (level.value === 'tight') return 'border-warning/30 bg-warning/10 text-warning'
  return 'border-destructive/30 bg-destructive/10 text-destructive'
})
</script>

<template>
  <Badge variant="outline" class="h-7 gap-1.5 whitespace-nowrap" :class="badgeClass">
    <CircleCheck v-if="level === 'ample'" class="size-3.5" aria-hidden="true" />
    <CircleGauge v-else-if="level === 'tight'" class="size-3.5" aria-hidden="true" />
    <CircleAlert v-else class="size-3.5" aria-hidden="true" />
    {{ label }}
  </Badge>
</template>
