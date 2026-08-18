<script setup lang="ts">
import type { AMapEventHandler, AMapOverlayLike } from './amap-runtime'
import type { MapMarkerItem } from './types'
import { onBeforeUnmount, watch } from 'vue'
import { toLngLatTuple } from './amap-runtime'
import { useAmapContext } from './map-context'

const props = withDefaults(defineProps<{
  markers: readonly MapMarkerItem[]
  fitOnChange?: boolean
  maxZoom?: number
}>(), { fitOnChange: false, maxZoom: 17 })
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

function markerContent(item: MapMarkerItem): HTMLElement {
  const dotSize = item.selected ? 20 : 16
  const root = document.createElement('div')
  root.style.cssText = `position:relative;width:${dotSize}px;height:${dotSize}px;white-space:nowrap;`
  const dot = document.createElement('span')
  dot.style.cssText = `position:absolute;inset:0;display:block;width:${dotSize}px;height:${dotSize}px;border:${item.selected ? 4 : 3}px solid white;border-radius:50%;background:${item.color ?? '#2563eb'};box-shadow:0 2px 8px rgba(15,23,42,.35);transition:width .2s,height .2s;`
  const label = document.createElement('span')
  label.style.cssText = `position:absolute;left:calc(100% + 6px);top:50%;transform:translateY(-50%);padding:4px 7px;border-radius:6px;background:${item.selected ? item.color ?? '#2563eb' : 'rgba(15,23,42,.88)'};color:white;font-size:12px;font-weight:${item.selected ? 600 : 400};box-shadow:0 2px 8px rgba(15,23,42,.22);`
  label.textContent = item.description ? `${item.label} · ${item.description}` : item.label
  root.append(dot, label)
  return root
}

function render(): void {
  clear()
  if (!ready.value || !runtime.value || !map.value) return
  for (const item of props.markers) {
    const marker = new runtime.value.Marker({
      position: toLngLatTuple(item.point),
      content: markerContent(item),
      anchor: 'center',
      offset: [0, 0],
      zIndex: item.selected ? 70 : 50,
    })
    const handleSelect = () => emit('select', item.id)
    marker.on('click', handleSelect)
    listeners.push({ target: marker, handler: handleSelect })
    managed.push(marker)
  }
  if (managed.length) map.value.add(managed)
  if (props.fitOnChange && managed.length) map.value.setFitView(managed, false, [72, 72, 72, 72], props.maxZoom)
}

watch([ready, () => props.markers], render, { deep: true, immediate: true })
onBeforeUnmount(clear)
</script>

<template><span class="hidden" aria-hidden="true" /></template>
