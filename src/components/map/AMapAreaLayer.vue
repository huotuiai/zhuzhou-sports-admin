<script setup lang="ts">
import type { AMapEventHandler, AMapOverlayLike } from './amap-runtime'
import type { MapAreaItem } from './types'
import { onBeforeUnmount, watch } from 'vue'
import { geometryCenter } from './geometry'
import { toLngLatTuple } from './amap-runtime'
import { useAmapContext } from './map-context'

const props = withDefaults(defineProps<{
  areas: readonly MapAreaItem[]
  fitOnChange?: boolean
  maxZoom?: number
}>(), {
  fitOnChange: false,
  maxZoom: 16,
})

const emit = defineEmits<{ select: [id: string] }>()
const { runtime, map, ready } = useAmapContext()
let managed: AMapOverlayLike[] = []
let listeners: Array<{ target: AMapOverlayLike, handler: AMapEventHandler }> = []

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  })[character]!)
}

function clear(): void {
  for (const { target, handler } of listeners) target.off('click', handler)
  if (managed.length) map.value?.remove(managed)
  listeners = []
  managed = []
}

function overlayFor(item: MapAreaItem): AMapOverlayLike {
  const common = {
    zIndex: item.selected ? 30 : 10,
    strokeColor: item.color,
    strokeWeight: item.selected ? 4 : 2,
    strokeOpacity: 1,
    fillColor: item.color,
    fillOpacity: item.selected ? 0.34 : 0.2,
    bubble: true,
  }
  const geometry = item.geometry
  if (geometry.type === 'circle') {
    return new runtime.value!.Circle({ ...common, center: toLngLatTuple(geometry.center), radius: geometry.radiusMeters })
  }
  if (geometry.type === 'rectangle') {
    return new runtime.value!.Rectangle({
      ...common,
      bounds: new runtime.value!.Bounds(toLngLatTuple(geometry.southWest), toLngLatTuple(geometry.northEast)),
    })
  }
  return new runtime.value!.Polygon({ path: geometry.path.map(toLngLatTuple), ...common })
}

function render(): void {
  clear()
  if (!ready.value || !runtime.value || !map.value) return

  const areaOverlays: AMapOverlayLike[] = []
  for (const item of props.areas) {
    const overlay = overlayFor(item)
    const handleSelect = () => emit('select', item.id)
    overlay.on('click', handleSelect)
    listeners.push({ target: overlay, handler: handleSelect })
    areaOverlays.push(overlay)

    const label = new runtime.value.Text({
      text: escapeHtml(item.label),
      position: toLngLatTuple(geometryCenter(item.geometry)),
      anchor: 'center',
      zIndex: item.selected ? 41 : 40,
      style: {
        padding: '5px 9px',
        borderRadius: '999px',
        border: `1px solid ${item.color}`,
        backgroundColor: 'rgba(15, 23, 42, .88)',
        color: '#fff',
        fontSize: '12px',
        whiteSpace: 'nowrap',
        boxShadow: '0 4px 12px rgba(15, 23, 42, .22)',
      },
    })
    label.on('click', handleSelect)
    listeners.push({ target: label, handler: handleSelect })
    managed.push(overlay, label)
  }
  if (managed.length) map.value.add(managed)
  if (props.fitOnChange && areaOverlays.length) {
    map.value.setFitView(areaOverlays, false, [72, 72, 72, 72], props.maxZoom)
  }
}

watch([ready, () => props.areas], render, { deep: true, immediate: true })
onBeforeUnmount(clear)
</script>

<template><span class="hidden" aria-hidden="true" /></template>
