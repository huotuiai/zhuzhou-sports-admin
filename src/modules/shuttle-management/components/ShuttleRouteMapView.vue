<script setup lang="ts">
import type { MapTheme } from '@/components/map'
import type { ShuttleRoute } from '../types'
import { computed, ref, watch } from 'vue'
import { BusFront, Clock3, MapPinOff, MapPinned } from '@lucide/vue'
import { AMapCanvas, AMapMarkerLayer, AMapRouteLayer } from '@/components/map'
import { Badge } from '@/components/ui/badge'
import { createShuttleMapItems, shuttleRouteColor } from '../lib/map-items'
import { shuttleDirectionLabel, shuttleOperatingStatusLabel } from '../types'

const props = withDefaults(defineProps<{
  records: readonly ShuttleRoute[]
  theme?: MapTheme
}>(), { theme: 'light' })

const selectedId = ref<string | null>(null)

const selected = computed(() => props.records.find((item) => item.id === selectedId.value) ?? null)
const mapItems = computed(() => createShuttleMapItems(props.records, selectedId.value))

function selectMarker(id: string): void {
  selectedId.value = id.split('::', 1)[0] ?? null
}

function operatingClass(route: ShuttleRoute): string {
  if (route.operatingStatus === 'operating') return 'border-success/30 bg-success/10 text-success'
  if (route.operatingStatus === 'partial') return 'border-warning/30 bg-warning/10 text-warning'
  return 'border-border bg-muted text-muted-foreground'
}

watch(() => props.records, (records) => {
  if (selectedId.value && !records.some((item) => item.id === selectedId.value)) selectedId.value = null
}, { deep: true })
</script>

<template>
  <div class="relative h-[min(64svh,720px)] min-h-[440px] overflow-hidden rounded-xl border bg-card/70">
    <AMapCanvas :theme="theme" :controls="true" min-height="100%" aria-label="接驳线路站点地图总览">
      <AMapRouteLayer :routes="mapItems.routes" @select="selectedId = $event" />
      <AMapMarkerLayer :markers="mapItems.markers" fit-on-change @select="selectMarker" />
    </AMapCanvas>

    <div class="pointer-events-none absolute left-3 top-3 z-10 flex max-h-[calc(100%-1.5rem)] max-w-[calc(100%-1.5rem)] flex-col items-start gap-2">
      <div v-if="records.length" class="pointer-events-auto flex max-w-full flex-wrap items-center gap-2 overflow-y-auto rounded-xl border bg-background/92 px-3 py-2 text-xs shadow-sm backdrop-blur">
        <button v-for="route in records" :key="route.id" type="button" :aria-pressed="selectedId === route.id" :class="['flex min-h-8 cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1 transition-colors', selectedId === route.id ? 'border-primary bg-primary/10 text-foreground' : 'border-transparent hover:bg-muted']" @click="selectedId = selectedId === route.id ? null : route.id">
          <span class="h-1 w-4 rounded-full" :style="{ backgroundColor: shuttleRouteColor(route) }" aria-hidden="true" />
          <span class="font-mono font-semibold">{{ route.code }}</span>
          <span>{{ route.name }}</span>
          <span class="text-muted-foreground">（{{ shuttleDirectionLabel(route.direction) }}）</span>
        </button>
      </div>
      <Badge v-if="mapItems.missingCount" variant="outline" class="pointer-events-auto h-9 bg-background/92 px-3 shadow-sm backdrop-blur"><MapPinOff class="size-3.5" aria-hidden="true" />{{ mapItems.missingCount }} 个站点未配置坐标</Badge>
    </div>

    <div v-if="records.length === 0 || mapItems.mappedCount === 0" class="pointer-events-none absolute inset-0 z-10 grid place-items-center">
      <div class="rounded-xl border bg-background/92 px-6 py-5 text-center shadow-sm backdrop-blur">
        <MapPinned class="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
        <p class="mt-3 font-medium">{{ records.length ? '暂无可展示的站点坐标' : '暂无接驳线路' }}</p>
        <p class="mt-1 text-sm text-muted-foreground">{{ records.length ? '请在线路的站点配置中手动录入经纬度。' : '新增线路并配置站点后将在此显示。' }}</p>
      </div>
    </div>

    <div v-if="selected" class="absolute bottom-4 left-1/2 z-10 w-[min(480px,calc(100%-2rem))] -translate-x-1/2 rounded-xl border bg-background/94 p-4 shadow-xl backdrop-blur">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0"><div class="flex items-center gap-2"><span class="font-mono text-xs font-semibold text-primary">{{ selected.code }}</span><p class="truncate font-semibold">{{ selected.name }}</p></div><p class="mt-1 text-sm text-muted-foreground">{{ shuttleDirectionLabel(selected.direction) }} · {{ selected.stations.length }} 个站点</p></div>
        <Badge variant="outline" :class="operatingClass(selected)">{{ shuttleOperatingStatusLabel(selected.operatingStatus) }}</Badge>
      </div>
      <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span class="flex items-center gap-1.5"><Clock3 class="size-3.5" aria-hidden="true" />{{ selected.firstDeparture }}–{{ selected.lastDeparture }} · 每 {{ selected.departureIntervalMinutes }} 分钟</span>
        <span class="flex items-center gap-1.5"><BusFront class="size-3.5" aria-hidden="true" />全程约 {{ selected.durationMinutes }} 分钟</span>
      </div>
    </div>
  </div>
</template>
