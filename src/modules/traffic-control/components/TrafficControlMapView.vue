<script setup lang="ts">
import type { MapAreaItem, MapTheme } from '@/components/map'
import type { TrafficControl } from '../types'
import { computed, ref } from 'vue'
import { Clock3, MapPinOff, MapPinned } from '@lucide/vue'
import { AMapAreaLayer, AMapCanvas } from '@/components/map'
import { Badge } from '@/components/ui/badge'
import { deriveTrafficControlTimeStatus } from '../stores/traffic-control-store'
import { TRAFFIC_CONTROL_TYPES, TRAFFIC_TIME_STATUS_LABELS, trafficControlTypeMeta } from '../types'

const props = withDefaults(defineProps<{
  records: readonly TrafficControl[]
  theme?: MapTheme
}>(), { theme: 'light' })
const selectedId = ref<string | null>(null)
const mappedRecords = computed(() => props.records.filter((item) => item.geometry))
const missingCount = computed(() => props.records.length - mappedRecords.value.length)
const selected = computed(() => props.records.find((item) => item.id === selectedId.value) ?? null)
const areas = computed<MapAreaItem[]>(() => mappedRecords.value.map((item) => ({
  id: item.id,
  geometry: item.geometry!,
  label: item.title,
  color: trafficControlTypeMeta(item.type).color,
  selected: item.id === selectedId.value,
})))

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))
}
</script>

<template>
  <div class="relative h-[min(64svh,720px)] min-h-[440px] overflow-hidden rounded-xl border bg-card/70">
    <AMapCanvas :theme="theme" :controls="true" min-height="100%" aria-label="交通管制地图总览">
      <AMapAreaLayer :areas="areas" fit-on-change @select="selectedId = $event" />
    </AMapCanvas>

    <div class="pointer-events-none absolute left-3 top-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-2">
      <div class="pointer-events-auto flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border bg-background/92 px-3 py-2 text-xs shadow-sm backdrop-blur">
        <span v-for="item in TRAFFIC_CONTROL_TYPES" :key="item.value" class="flex items-center gap-1.5"><span class="size-2.5 rounded-full" :style="{ backgroundColor: item.color }" />{{ item.label }}</span>
      </div>
      <Badge v-if="missingCount" variant="outline" class="pointer-events-auto h-9 bg-background/92 px-3 shadow-sm backdrop-blur"><MapPinOff class="size-3.5" />{{ missingCount }} 条管制未配置区域</Badge>
    </div>

    <div v-if="records.length === 0" class="pointer-events-none absolute inset-0 z-10 grid place-items-center">
      <div class="rounded-xl border bg-background/92 px-6 py-5 text-center shadow-sm backdrop-blur"><MapPinned class="mx-auto size-6 text-muted-foreground" /><p class="mt-3 font-medium">暂无管制记录</p><p class="mt-1 text-sm text-muted-foreground">新增记录并配置区域后将在此显示。</p></div>
    </div>

    <div v-if="selected" class="absolute bottom-4 left-1/2 z-10 w-[min(440px,calc(100%-2rem))] -translate-x-1/2 rounded-xl border bg-background/94 p-4 shadow-xl backdrop-blur">
      <div class="flex items-start justify-between gap-3"><div class="min-w-0"><p class="truncate font-semibold">{{ selected.title }}</p><p class="mt-1 text-sm text-muted-foreground">{{ selected.areaName }}</p></div><Badge variant="outline" :style="{ borderColor: `${trafficControlTypeMeta(selected.type).color}66`, color: trafficControlTypeMeta(selected.type).color }">{{ trafficControlTypeMeta(selected.type).label }}</Badge></div>
      <div class="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><Clock3 class="size-3.5" /><span>{{ formatDateTime(selected.startAt) }} – {{ formatDateTime(selected.endAt) }}</span><span class="ml-auto font-medium text-foreground">{{ TRAFFIC_TIME_STATUS_LABELS[deriveTrafficControlTimeStatus(selected)] }}</span></div>
    </div>
  </div>
</template>
