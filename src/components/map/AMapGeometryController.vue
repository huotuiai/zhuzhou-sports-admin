<script setup lang="ts">
import type { AMapEditorLike, AMapEventHandler, AMapMouseToolLike, AMapOverlayLike } from './amap-runtime'
import type { GeoPoint, MapGeometry } from './types'
import { onBeforeUnmount, watch } from 'vue'
import { cloneGeometry, normalizeGeometry } from './geometry'
import { toLngLatTuple } from './amap-runtime'
import { useAmapContext } from './map-context'

const props = defineProps<{
  geometry: MapGeometry | null
  color: string
}>()
const emit = defineEmits<{
  'update:geometry': [geometry: MapGeometry | null]
  'history-snapshot': [geometry: MapGeometry | null]
  'drawing-change': [type: MapGeometry['type'] | null]
}>()
const { runtime, map, ready } = useAmapContext()
let overlay: AMapOverlayLike | null = null
let editor: AMapEditorLike | null = null
let mouseTool: AMapMouseToolLike | null = null
let drawingType: MapGeometry['type'] | null = null
let lastEmittedFingerprint = ''
let editSnapshotTaken = false
let editorListeners: Array<{ event: string, handler: AMapEventHandler }> = []

function point(value: { getLng(): number, getLat(): number }): GeoPoint {
  return { lng: value.getLng(), lat: value.getLat() }
}

function geometryFromOverlay(target: AMapOverlayLike, type: MapGeometry['type']): MapGeometry | null {
  if (type === 'circle') {
    const center = target.getCenter?.()
    const radiusMeters = target.getRadius?.()
    return center && Number.isFinite(radiusMeters)
      ? normalizeGeometry({ type, center: point(center), radiusMeters: radiusMeters! })
      : null
  }
  if (type === 'rectangle') {
    const bounds = target.getBounds?.()
    return bounds
      ? normalizeGeometry({ type, southWest: point(bounds.getSouthWest()), northEast: point(bounds.getNorthEast()) })
      : null
  }
  const rawPath = target.getPath?.()
  if (!rawPath || !Array.isArray(rawPath) || !rawPath.length || Array.isArray(rawPath[0])) return null
  const flatPath = rawPath as Exclude<typeof rawPath, { getLng(): number, getLat(): number }[][]>
  return normalizeGeometry({ type, path: flatPath.map(point) })
}

function createOverlay(geometry: MapGeometry): AMapOverlayLike {
  const common = {
    zIndex: 30,
    strokeColor: props.color,
    strokeWeight: 3,
    strokeOpacity: 1,
    fillColor: props.color,
    fillOpacity: 0.24,
  }
  if (geometry.type === 'circle') {
    return new runtime.value!.Circle({ ...common, center: toLngLatTuple(geometry.center), radius: geometry.radiusMeters })
  }
  if (geometry.type === 'rectangle') {
    return new runtime.value!.Rectangle({
      ...common,
      bounds: new runtime.value!.Bounds(toLngLatTuple(geometry.southWest), toLngLatTuple(geometry.northEast)),
    })
  }
  return new runtime.value!.Polygon({ ...common, path: geometry.path.map(toLngLatTuple) })
}

function closeEditor(): void {
  if (editor) {
    for (const { event, handler } of editorListeners) editor.off(event, handler)
    editor.close()
  }
  editorListeners = []
  editor = null
  editSnapshotTaken = false
}

function clearOverlay(): void {
  closeEditor()
  if (overlay) map.value?.remove(overlay)
  overlay = null
}

function beginEditing(geometry: MapGeometry): void {
  if (!map.value || !runtime.value || !overlay) return
  editor = geometry.type === 'circle'
    ? new runtime.value.CircleEditor(map.value, overlay)
    : geometry.type === 'rectangle'
      ? new runtime.value.RectangleEditor(map.value, overlay)
      : new runtime.value.PolygonEditor(map.value, overlay)

  const sync = () => {
    if (!overlay) return
    if (!editSnapshotTaken) {
      emit('history-snapshot', props.geometry ? cloneGeometry(props.geometry) : null)
      editSnapshotTaken = true
    }
    const next = geometryFromOverlay(overlay, geometry.type)
    if (!next) return
    lastEmittedFingerprint = JSON.stringify(next)
    emit('update:geometry', next)
  }
  const resetSnapshot = () => { editSnapshotTaken = false }
  for (const event of ['adjust', 'move', 'addnode', 'removenode']) {
    editor.on(event, sync)
    editorListeners.push({ event, handler: sync })
  }
  editor.on('end', resetSnapshot)
  editorListeners.push({ event: 'end', handler: resetSnapshot })
  editor.open()
}

function renderGeometry(): void {
  if (!ready.value || !runtime.value || !map.value) return
  const fingerprint = JSON.stringify(props.geometry)
  if (fingerprint === lastEmittedFingerprint && overlay) {
    lastEmittedFingerprint = ''
    return
  }
  clearOverlay()
  if (!props.geometry) return
  const geometry = cloneGeometry(props.geometry)
  overlay = createOverlay(geometry)
  map.value.add(overlay)
  map.value.setFitView([overlay], false, [64, 64, 64, 64], 17)
  beginEditing(geometry)
}

function cancelDrawing(): void {
  if (!drawingType) return
  mouseTool?.close(true)
  drawingType = null
  emit('drawing-change', null)
  renderGeometry()
}

function startDrawing(type: MapGeometry['type']): boolean {
  if (!ready.value || !runtime.value || !map.value) return false
  cancelDrawing()
  closeEditor()
  drawingType = type
  emit('drawing-change', type)
  mouseTool = mouseTool ?? new runtime.value.MouseTool(map.value)
  const options = {
    strokeColor: props.color,
    strokeWeight: 3,
    fillColor: props.color,
    fillOpacity: 0.24,
  }
  if (type === 'circle') mouseTool.circle(options)
  else if (type === 'rectangle') mouseTool.rectangle(options)
  else mouseTool.polygon(options)
  return true
}

const handleDraw: AMapEventHandler = (event) => {
  if (!drawingType || !event || typeof event !== 'object') return
  const target = (event as { obj?: AMapOverlayLike }).obj
  if (!target) return
  const next = geometryFromOverlay(target, drawingType)
  mouseTool?.close(false)
  if (!next) {
    map.value?.remove(target)
    drawingType = null
    emit('drawing-change', null)
    renderGeometry()
    return
  }
  emit('history-snapshot', props.geometry ? cloneGeometry(props.geometry) : null)
  if (overlay && overlay !== target) map.value?.remove(overlay)
  overlay = target
  lastEmittedFingerprint = JSON.stringify(next)
  const completedType = drawingType
  drawingType = null
  emit('drawing-change', null)
  emit('update:geometry', next)
  closeEditor()
  beginEditing(next.type === completedType ? next : cloneGeometry(next))
}

watch(ready, (isReady) => {
  if (!isReady || !runtime.value || !map.value) return
  mouseTool = new runtime.value.MouseTool(map.value)
  mouseTool.on('draw', handleDraw)
  renderGeometry()
}, { immediate: true })
watch(() => props.geometry, renderGeometry, { deep: true })
watch(() => props.color, () => overlay?.setOptions({ strokeColor: props.color, fillColor: props.color }))

onBeforeUnmount(() => {
  mouseTool?.off('draw', handleDraw)
  mouseTool?.close(true)
  mouseTool = null
  clearOverlay()
})

defineExpose({ startDrawing, cancelDrawing })
</script>

<template><span class="hidden" aria-hidden="true" /></template>
