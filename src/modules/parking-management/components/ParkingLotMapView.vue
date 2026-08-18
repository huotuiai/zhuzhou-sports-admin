<script setup lang="ts">
import type { MapTheme } from '@/components/map'
import type { ParkingLot } from '../types'
import { computed, ref, watch } from 'vue'
import { Clock3, MapPin, MapPinOff, MapPinned, Navigation, ParkingSquare } from '@lucide/vue'
import { AMapCanvas, AMapMarkerLayer } from '@/components/map'
import { Badge } from '@/components/ui/badge'
import {
  PARKING_AVAILABILITY_COLORS,
  createParkingMapItems,
  formatParkingFee,
  parkingAvailabilityLabel,
} from '../lib/map-items'
import { parkingOpenStatusLabel } from '../types'

const props = withDefaults(defineProps<{
  records: readonly ParkingLot[]
  theme?: MapTheme
}>(), { theme: 'light' })

const selectedId = ref<string | null>(null)
const selected = computed(() => props.records.find((record) => record.id === selectedId.value) ?? null)
const mapItems = computed(() => createParkingMapItems(props.records, selectedId.value))

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

watch(() => props.records, (records) => {
  if (selectedId.value && !records.some((record) => record.id === selectedId.value)) selectedId.value = null
}, { deep: true })
</script>

<template>
  <div class="relative h-[min(64svh,720px)] min-h-[440px] overflow-hidden rounded-xl border bg-card/70">
    <AMapCanvas :theme="theme" :controls="true" min-height="100%" aria-label="停车场点位地图总览">
      <AMapMarkerLayer :markers="mapItems.markers" fit-on-change @select="selectedId = $event" />
    </AMapCanvas>

    <div class="pointer-events-none absolute left-3 top-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-col items-start gap-2">
      <div class="pointer-events-auto flex max-w-full flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-background/92 px-3 py-2 text-xs shadow-sm backdrop-blur">
        <span class="flex items-center gap-1.5"><span class="size-2.5 rounded-full" :style="{ backgroundColor: PARKING_AVAILABILITY_COLORS.ample }" aria-hidden="true" />空位充足（&gt;30%）</span>
        <span class="flex items-center gap-1.5"><span class="size-2.5 rounded-full" :style="{ backgroundColor: PARKING_AVAILABILITY_COLORS.tight }" aria-hidden="true" />空位紧张（10%–30%）</span>
        <span class="flex items-center gap-1.5"><span class="size-2.5 rounded-full" :style="{ backgroundColor: PARKING_AVAILABILITY_COLORS['nearly-full'] }" aria-hidden="true" />即将满位（≤10%）</span>
        <span class="flex items-center gap-1.5"><span class="size-2.5 rounded-full" :style="{ backgroundColor: PARKING_AVAILABILITY_COLORS.inactive }" aria-hidden="true" />关闭或停用</span>
      </div>
      <Badge v-if="mapItems.missingCount" variant="outline" class="pointer-events-auto h-9 bg-background/92 px-3 shadow-sm backdrop-blur">
        <MapPinOff class="size-3.5" aria-hidden="true" />
        {{ mapItems.missingCount }} 个停车场未配置坐标
      </Badge>
    </div>

    <div v-if="records.length === 0 || mapItems.mappedCount === 0" class="pointer-events-none absolute inset-0 z-10 grid place-items-center">
      <div class="rounded-xl border bg-background/92 px-6 py-5 text-center shadow-sm backdrop-blur">
        <MapPinned class="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
        <p class="mt-3 font-medium">{{ records.length ? '暂无可展示的停车场坐标' : '暂无停车场' }}</p>
        <p class="mt-1 text-sm text-muted-foreground">{{ records.length ? '请在停车场编辑抽屉中手动录入经纬度。' : '新增停车场后将在此显示点位。' }}</p>
      </div>
    </div>

    <div v-if="selected" class="absolute bottom-4 left-1/2 z-10 w-[min(540px,calc(100%-2rem))] -translate-x-1/2 rounded-xl border bg-background/94 p-4 shadow-xl backdrop-blur">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <span class="font-mono text-xs font-semibold text-primary">{{ selected.code }}</span>
            <p class="truncate font-semibold">{{ selected.name }}</p>
          </div>
          <p class="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin class="size-3.5 shrink-0" aria-hidden="true" />
            {{ selected.locationDescription || selected.navigationAddress || '未填写位置描述' }}
          </p>
        </div>
        <Badge variant="outline" :class="selected.enabled && selected.openStatus === 'open' ? 'border-success/30 bg-success/10 text-success' : 'border-border bg-muted text-muted-foreground'">
          {{ !selected.enabled ? '已停用' : parkingOpenStatusLabel(selected.openStatus) }}
        </Badge>
      </div>
      <div class="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
        <span class="flex items-center gap-1.5"><ParkingSquare class="size-3.5" aria-hidden="true" />余 {{ selected.availableSpaces }} / 总 {{ selected.totalSpaces }} · {{ parkingAvailabilityLabel(selected) }}</span>
        <span class="flex items-center gap-1.5"><Navigation class="size-3.5" aria-hidden="true" />{{ formatParkingFee(selected) }}</span>
        <span class="col-span-2 flex items-center gap-1.5"><Clock3 class="size-3.5" aria-hidden="true" />余位更新于 {{ formatDateTime(selected.availabilityUpdatedAt) }}</span>
      </div>
    </div>
  </div>
</template>
