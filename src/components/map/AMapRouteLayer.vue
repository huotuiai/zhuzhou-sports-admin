<script setup lang="ts">
import type { AMapEventHandler, AMapOverlayLike } from './amap-runtime'
import type { MapRouteItem } from './types'
import { onBeforeUnmount, watch } from 'vue'
import { toLngLatTuple } from './amap-runtime'
import { useAmapContext } from './map-context'

const props = withDefaults(defineProps<{
  routes: readonly MapRouteItem[]
  fitOnChange?: boolean
  maxZoom?: number
}>(), { fitOnChange: false, maxZoom: 16 })
const emit = defineEmits<{ select: [id: string] }>()
const { runtime, map, ready } = useAmapContext()
let managed: AMapOverlayLike[] = []
let listeners: Array<{ target: AMapOverlayLike, handler: AMapEventHandler }> = []

function clear(): void {
  for (const { target, handler } of listeners) target.off('click', handler)
  if (managed.length) map.value?.remove(managed)
  managed = []
  listeners = []
}

function render(): void {
  clear()
  if (!ready.value || !runtime.value || !map.value) return
  for (const item of props.routes) {
    if (item.points.length < 2) continue
    const route = new runtime.value.Polyline({
      path: item.points.map(toLngLatTuple),
      strokeColor: item.color,
      strokeWeight: item.selected ? 8 : 5,
      strokeOpacity: item.selected ? 1 : 0.68,
      lineJoin: 'round',
      lineCap: 'round',
      showDir: true,
      zIndex: item.selected ? 35 : 20,
      extData: { id: item.id, label: item.label },
    })
    const handleSelect = () => emit('select', item.id)
    route.on('click', handleSelect)
    listeners.push({ target: route, handler: handleSelect })
    managed.push(route)
  }
  if (managed.length) map.value.add(managed)
  if (props.fitOnChange && managed.length) map.value.setFitView(managed, false, [72, 72, 72, 72], props.maxZoom)
}

watch([ready, () => props.routes], render, { deep: true, immediate: true })
onBeforeUnmount(clear)
</script>

<template><span class="hidden" aria-hidden="true" /></template>
