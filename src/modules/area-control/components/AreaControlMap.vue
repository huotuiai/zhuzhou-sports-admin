<script setup lang="ts">
import type { ControlZone, ControlZoneGeometry, LngLatTuple } from '../types'
import type {
  AMapDistrictResult,
  AMapEditorLike,
  AMapEventHandler,
  AMapLngLatLike,
  AMapMapLike,
  AMapMouseToolLike,
  AMapOverlayLike,
  AMapRuntime,
} from '../composables/use-amap'
import { AlertTriangle, MapPinned, RefreshCw } from '@lucide/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { useDelayedLoading } from '@/composables/use-delayed-loading'
import { useAmap } from '../composables/use-amap'

type BoundaryRings = readonly (readonly LngLatTuple[])[]
type DrawingType = ControlZoneGeometry['type']

interface Props {
  zones: readonly ControlZone[]
  selectedId?: string | null
  theme?: 'dark' | 'light'
  readonly?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  selectedId: null,
  theme: 'dark',
  readonly: false,
})

const emit = defineEmits<{
  ready: [boundaries: BoundaryRings]
  'map-error': [message: string]
  select: [id: string]
  'draft-created': [geometry: ControlZoneGeometry]
  'geometry-change': [id: string, geometry: ControlZoneGeometry]
  'drawing-change': [drawing: DrawingType | null]
}>()

interface ManagedOverlay {
  overlay: AMapOverlayLike
  clickHandler: AMapEventHandler
}

/** 株洲体育中心场馆群中心点（高德 GCJ-02）。 */
const SPORTS_CENTER: LngLatTuple = [113.1106, 27.841]
const SPORTS_CENTER_RADIUS_METERS = 3_000
const SPORTS_CENTER_VIEW_PADDING = [96, 64, 64, 64] as const
const ZHUZHOU_FALLBACK_CENTER: LngLatTuple = [113.134, 27.828]
const VIEW_PADDING = [72, 392, 72, 72] as const
const ZONE_COLOR = '#ef4444'
const INACTIVE_ZONE_COLOR = '#9f5f65'
const BOUNDARY_COLOR = '#22d3ee'

const containerRef = ref<HTMLDivElement | null>(null)
const loading = ref(true)
const showMapLoading = useDelayedLoading(loading, {
  delay: 120,
  minimumVisible: 320,
})
const errorMessage = ref('')
const drawing = ref<DrawingType | null>(null)

let runtime: AMapRuntime | null = null
let map: AMapMapLike | null = null
let mouseTool: AMapMouseToolLike | null = null
let drawHandler: AMapEventHandler | null = null
let editor: AMapEditorLike | null = null
let editingId: string | null = null
let editorOpening = false
let editorHandlers: Array<{ event: string, handler: AMapEventHandler }> = []
let boundaryCenter: LngLatTuple = ZHUZHOU_FALLBACK_CENTER
let boundaryOverlays: AMapOverlayLike[] = []
let boundaryRings: LngLatTuple[][] = []
let selectedLabel: AMapOverlayLike | null = null
let draftOverlay: AMapOverlayLike | null = null
const zoneOverlays = new Map<string, ManagedOverlay>()
let initVersion = 0
let destroyed = false

const overlayStatusText = computed(() => {
  if (errorMessage.value) return errorMessage.value
  if (drawing.value === 'rectangle') return '正在绘制矩形区域，按 Esc 取消。'
  if (drawing.value === 'polygon') return '正在绘制多边形，单击添加顶点，双击完成，按 Esc 取消。'
  return loading.value ? '正在加载高德地图与株洲市边界…' : '地图已就绪'
})

function toTuple(point: AMapLngLatLike): LngLatTuple {
  return [point.getLng(), point.getLat()]
}

function flattenedPath(overlay: AMapOverlayLike): AMapLngLatLike[] {
  const path = overlay.getPath?.() ?? []
  if (path.length === 0) return []
  const first = path[0]
  return Array.isArray(first)
    ? (path as AMapLngLatLike[][]).flat()
    : (path as AMapLngLatLike[])
}

function overlayToGeometry(
  overlay: AMapOverlayLike,
  type: DrawingType,
): ControlZoneGeometry | null {
  if (type === 'rectangle') {
    const bounds = overlay.getBounds?.()
    if (!bounds) return null
    return {
      type: 'rectangle',
      southWest: toTuple(bounds.getSouthWest()),
      northEast: toTuple(bounds.getNorthEast()),
    }
  }

  const path = flattenedPath(overlay).map(toTuple)
  return path.length >= 3 ? { type: 'polygon', path } : null
}

function geometryCenter(geometry: ControlZoneGeometry): LngLatTuple {
  if (geometry.type === 'rectangle') {
    return [
      (geometry.southWest[0] + geometry.northEast[0]) / 2,
      (geometry.southWest[1] + geometry.northEast[1]) / 2,
    ]
  }

  const path = geometry.path
  if (path.length === 0) return boundaryCenter
  return [
    path.reduce((sum, point) => sum + point[0], 0) / path.length,
    path.reduce((sum, point) => sum + point[1], 0) / path.length,
  ]
}

function zoneStyle(zone: Pick<ControlZone, 'enabled'>, selected: boolean) {
  return {
    bubble: false,
    cursor: 'pointer',
    fillColor: zone.enabled ? ZONE_COLOR : INACTIVE_ZONE_COLOR,
    fillOpacity: zone.enabled ? (selected ? 0.32 : 0.2) : (selected ? 0.2 : 0.1),
    strokeColor: zone.enabled ? ZONE_COLOR : INACTIVE_ZONE_COLOR,
    strokeDasharray: zone.enabled ? [0, 0, 0] : [10, 8],
    strokeOpacity: selected ? 1 : 0.78,
    strokeStyle: zone.enabled ? 'solid' : 'dashed',
    strokeWeight: selected ? 4 : 2,
  }
}

function drawingStyle() {
  return {
    bubble: false,
    fillColor: ZONE_COLOR,
    fillOpacity: 0.26,
    strokeColor: ZONE_COLOR,
    strokeOpacity: 1,
    strokeWeight: 3,
    zIndex: 150,
  }
}

function createZoneOverlay(zone: ControlZone): AMapOverlayLike | null {
  if (!runtime) return null
  const options = {
    ...zoneStyle(zone, zone.id === props.selectedId),
    extData: { id: zone.id },
  }

  if (zone.geometry.type === 'rectangle') {
    return new runtime.Rectangle({
      ...options,
      bounds: new runtime.Bounds(zone.geometry.southWest, zone.geometry.northEast),
      zIndex: zone.id === props.selectedId ? 120 : 80,
    })
  }

  return new runtime.Polygon({
    ...options,
    path: zone.geometry.path,
    zIndex: zone.id === props.selectedId ? 120 : 80,
  })
}

function removeSelectedLabel() {
  if (map && selectedLabel) map.remove(selectedLabel)
  selectedLabel = null
}

function removeDraftOverlay() {
  if (map && draftOverlay) map.remove(draftOverlay)
  draftOverlay = null
}

function syncSelectedLabel() {
  removeSelectedLabel()
  if (!runtime || !map || !props.selectedId) return
  const zone = props.zones.find((item) => item.id === props.selectedId)
  if (!zone) return

  selectedLabel = new runtime.Text({
    anchor: 'bottom-center',
    bubble: false,
    clickable: false,
    position: geometryCenter(zone.geometry),
    text: zone.name,
    zIndex: 180,
    style: {
      'background-color': props.theme === 'dark' ? 'rgba(2, 6, 23, 0.9)' : 'rgba(255, 255, 255, 0.94)',
      'border': `1px solid ${ZONE_COLOR}`,
      'border-radius': '7px',
      'box-shadow': '0 8px 20px rgba(2, 6, 23, 0.2)',
      'color': props.theme === 'dark' ? '#f8fafc' : '#0f172a',
      'font-size': '13px',
      'font-weight': '600',
      'padding': '6px 9px',
      'white-space': 'nowrap',
    },
  })
  map.add(selectedLabel)
}

function clearZoneOverlays() {
  finishEditing(false)
  for (const managed of zoneOverlays.values()) {
    managed.overlay.off('click', managed.clickHandler)
    map?.remove(managed.overlay)
  }
  zoneOverlays.clear()
  removeSelectedLabel()
}

function renderZones() {
  if (!map || !runtime) return
  const activeEditingId = editingId
  removeDraftOverlay()
  clearZoneOverlays()

  for (const zone of props.zones) {
    const overlay = createZoneOverlay(zone)
    if (!overlay) continue
    const clickHandler: AMapEventHandler = () => emit('select', zone.id)
    overlay.on('click', clickHandler)
    zoneOverlays.set(zone.id, { overlay, clickHandler })
    map.add(overlay)
  }

  syncSelectedLabel()
  if (activeEditingId && !props.readonly) beginEditing(activeEditingId)
}

function applyMapStyle() {
  map?.setMapStyle(`amap://styles/${props.theme === 'dark' ? 'darkblue' : 'whitesmoke'}`)
  syncSelectedLabel()
}

function districtSearch(): Promise<{ boundaries: LngLatTuple[][], center: LngLatTuple }> {
  if (!runtime) return Promise.reject(new Error('高德地图 SDK 尚未就绪。'))

  const district = new runtime.DistrictSearch({
    extensions: 'all',
    level: 'city',
    subdistrict: 0,
  })

  return new Promise((resolve, reject) => {
    district.search('株洲市', (status, result) => {
      if (status !== 'complete' || typeof result === 'string') {
        reject(new Error('未能获取株洲市行政边界，请稍后重试。'))
        return
      }
      const districtResult = result as AMapDistrictResult
      const item = districtResult.districtList?.[0]
      const boundaries = (item?.boundaries ?? [])
        .map((ring) => ring.map(toTuple))
        .filter((ring) => ring.length >= 3)

      if (boundaries.length === 0) {
        reject(new Error('高德地图未返回有效的株洲市行政边界。'))
        return
      }

      resolve({
        boundaries,
        center: item?.center ? toTuple(item.center) : ZHUZHOU_FALLBACK_CENTER,
      })
    })
  })
}

function renderBoundaries() {
  if (!runtime || !map) return
  boundaryOverlays = boundaryRings.map((path) => new runtime!.Polygon({
    bubble: false,
    clickable: false,
    fillColor: BOUNDARY_COLOR,
    fillOpacity: 0.018,
    path,
    strokeColor: BOUNDARY_COLOR,
    strokeOpacity: 0.86,
    strokeStyle: 'solid',
    strokeWeight: 2,
    zIndex: 40,
  }))
  map.add(boundaryOverlays)
}

function cleanMap() {
  cancelDrawing()
  removeDraftOverlay()
  clearZoneOverlays()
  if (map && boundaryOverlays.length) map.remove(boundaryOverlays)
  boundaryOverlays = []
  boundaryRings = []
  map?.destroy()
  mouseTool = null
  map = null
  runtime = null
}

function errorText(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message
  return '高德地图加载失败，请检查网络和 Key 配置。'
}

async function initialize() {
  const version = ++initVersion
  loading.value = true
  errorMessage.value = ''
  cleanMap()
  await nextTick()

  try {
    if (!containerRef.value) throw new Error('地图容器未就绪。')
    runtime = await useAmap().loadAmap()
    if (destroyed || version !== initVersion || !containerRef.value) return

    map = new runtime.Map(containerRef.value, {
      center: SPORTS_CENTER,
      mapStyle: `amap://styles/${props.theme === 'dark' ? 'darkblue' : 'whitesmoke'}`,
      resizeEnable: true,
      showIndoorMap: false,
      viewMode: '3D',
      zoom: 14,
      pitch: 0,
      rotation: 0,
      pitchEnable: true,
      rotateEnable: true,
      showBuildingBlock: true,
      features: ['bg', 'road', 'point', 'building'],
      zooms: [7, 20],
    })
    map.addControl(new runtime.Scale())
    map.addControl(new runtime.ToolBar({ position: 'LB', liteStyle: true }))
    mouseTool = new runtime.MouseTool(map)

    const district = await districtSearch()
    if (destroyed || version !== initVersion) return
    boundaryRings = district.boundaries
    boundaryCenter = district.center
    renderBoundaries()
    renderZones()
    focusSportsCenter()
    loading.value = false
    emit('ready', boundaryRings.map((ring) => ring.map((point) => [...point] as LngLatTuple)))
  }
  catch (error) {
    if (destroyed || version !== initVersion) return
    loading.value = false
    errorMessage.value = errorText(error)
    emit('map-error', errorMessage.value)
    cleanMap()
  }
}

function startDrawing(type: DrawingType): boolean {
  if (props.readonly || !map || !mouseTool || errorMessage.value || loading.value) return false
  finishEditing()
  cancelDrawing()
  drawing.value = type
  emit('drawing-change', type)
  drawHandler = (event: unknown) => {
    const overlay = (event as { obj?: AMapOverlayLike }).obj
    if (!overlay) return
    const geometry = overlayToGeometry(overlay, type)
    mouseTool?.close(false)
    drawing.value = null
    emit('drawing-change', null)
    if (drawHandler) mouseTool?.off('draw', drawHandler)
    drawHandler = null
    if (geometry) {
      draftOverlay = overlay
      draftOverlay.setOptions(drawingStyle())
      emit('draft-created', geometry)
    }
    else {
      map?.remove(overlay)
    }
  }
  mouseTool.on('draw', drawHandler)
  mouseTool[type](drawingStyle())
  return true
}

function cancelDrawing() {
  if (mouseTool && drawHandler) mouseTool.off('draw', drawHandler)
  mouseTool?.close(true)
  removeDraftOverlay()
  drawHandler = null
  if (drawing.value) emit('drawing-change', null)
  drawing.value = null
}

function emitEditedGeometry() {
  if (!editingId) return
  const managed = zoneOverlays.get(editingId)
  const zone = props.zones.find((item) => item.id === editingId)
  if (!managed || !zone) return
  const geometry = overlayToGeometry(managed.overlay, zone.geometry.type)
  if (!geometry) return
  emit('geometry-change', editingId, geometry)
  if (selectedLabel) selectedLabel.setPosition?.(geometryCenter(geometry))
}

function beginEditing(id: string): boolean {
  if (props.readonly || !runtime || !map || editorOpening) return false
  const managed = zoneOverlays.get(id)
  const zone = props.zones.find((item) => item.id === id)
  if (!managed || !zone) return false

  try {
    editorOpening = true
    cancelDrawing()
    finishEditing()
    editingId = id
    editor = zone.geometry.type === 'rectangle'
      ? new runtime.RectangleEditor(map, managed.overlay)
      : new runtime.PolygonEditor(map, managed.overlay)

    const events = zone.geometry.type === 'rectangle'
      ? ['adjust', 'move', 'end']
      : ['addnode', 'adjust', 'removenode', 'move', 'end']
    editorHandlers = events.map((event) => {
      const handler: AMapEventHandler = emitEditedGeometry
      editor!.on(event, handler)
      return { event, handler }
    })
    editor.open()
    return true
  }
  finally {
    editorOpening = false
  }
}

function finishEditing(emitFinalGeometry = true) {
  if (editor) {
    if (emitFinalGeometry) emitEditedGeometry()
    for (const { event, handler } of editorHandlers) editor.off(event, handler)
    editor.close()
  }
  editorHandlers = []
  editor = null
  editingId = null
}

function restoreGeometry(id: string, geometry: ControlZoneGeometry): boolean {
  const managed = zoneOverlays.get(id)
  if (!runtime || !managed) return false
  if (geometry.type === 'rectangle') {
    managed.overlay.setBounds?.(new runtime.Bounds(geometry.southWest, geometry.northEast))
  }
  else {
    managed.overlay.setPath?.(geometry.path)
  }
  if (id === props.selectedId) syncSelectedLabel()
  return true
}

function focusZhuzhou() {
  if (!map) return
  if (boundaryOverlays.length) {
    map.setFitView(boundaryOverlays, false, VIEW_PADDING, 12)
    return
  }
  map.setCenter(boundaryCenter)
  map.setZoom(10)
}

/**
 * 使用不可见圆形覆盖物计算视野，保证不同屏幕都能展示
 * 以株洲体育中心为中心的 3 公里半径范围。
 */
function focusSportsCenter() {
  if (!map || !runtime) return

  const range = new runtime.Circle({
    center: SPORTS_CENTER,
    radius: SPORTS_CENTER_RADIUS_METERS,
    strokeOpacity: 0,
    fillOpacity: 0,
  })

  map.add(range)
  map.setFitView([range], false, SPORTS_CENTER_VIEW_PADDING, 17)
  map.remove(range)
}

function fitAll() {
  if (!map) return
  const overlays = [...zoneOverlays.values()].map((managed) => managed.overlay)
  if (overlays.length === 0) {
    focusZhuzhou()
    return
  }
  map.setFitView(overlays, false, VIEW_PADDING, 15)
}

function focusZone(id: string): boolean {
  if (!map) return false
  const managed = zoneOverlays.get(id)
  if (!managed) return false
  map.setFitView([managed.overlay], false, VIEW_PADDING, 17)
  return true
}

async function retry() {
  useAmap().resetAmapLoader()
  await initialize()
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && drawing.value) cancelDrawing()
}

watch(() => props.theme, applyMapStyle)
watch(
  () => props.zones,
  renderZones,
  { deep: true },
)
watch(() => props.selectedId, () => {
  for (const zone of props.zones) {
    zoneOverlays.get(zone.id)?.overlay.setOptions({
      ...zoneStyle(zone, zone.id === props.selectedId),
      zIndex: zone.id === props.selectedId ? 120 : 80,
    })
  }
  syncSelectedLabel()
})
watch(() => props.readonly, (readonly) => {
  if (!readonly) return
  cancelDrawing()
  finishEditing()
})

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  void initialize()
})

onBeforeUnmount(() => {
  destroyed = true
  initVersion += 1
  window.removeEventListener('keydown', onKeydown)
  cleanMap()
})

defineExpose({
  startDrawing,
  cancelDrawing,
  beginEditing,
  finishEditing,
  restoreGeometry,
  focusZone,
  focusZhuzhou,
  fitAll,
  retry,
})
</script>

<template>
  <section class="area-map" aria-label="株洲市管制区域地图">
    <div ref="containerRef" class="area-map__canvas" aria-hidden="true" />

    <div
      v-if="showMapLoading"
      class="area-map__state"
      role="status"
      aria-live="polite"
    >
      <span class="map-loader" aria-hidden="true">
        <span class="map-loader__ring map-loader__ring--outer" />
        <span class="map-loader__ring map-loader__ring--inner" />
        <span class="map-loader__core">
          <MapPinned class="size-6" />
        </span>
      </span>
      <p class="font-medium">正在加载地图</p>
      <p class="text-sm text-muted-foreground">获取株洲市行政边界与本地管制区域…</p>
    </div>

    <div
      v-else-if="errorMessage"
      class="area-map__state"
      role="alert"
    >
      <span class="grid size-11 place-items-center rounded-xl bg-destructive/12 text-destructive">
        <AlertTriangle class="size-6" aria-hidden="true" />
      </span>
      <p class="font-semibold">地图暂时不可用</p>
      <p class="max-w-md text-center text-sm leading-6 text-muted-foreground">{{ errorMessage }}</p>
      <Button variant="outline" class="mt-1 gap-2" @click="retry">
        <RefreshCw class="size-4" aria-hidden="true" />
        重新加载地图
      </Button>
    </div>

    <p class="sr-only" aria-live="polite">{{ overlayStatusText }}</p>
    <div v-if="drawing" class="area-map__drawing-hint" role="status">
      <span class="size-2 rounded-full bg-red-500" />
      {{ overlayStatusText }}
    </div>
  </section>
</template>

<style scoped>
.area-map {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 28rem;
  overflow: hidden;
  background:
    radial-gradient(circle at 38% 28%, color-mix(in srgb, var(--primary) 13%, transparent), transparent 38%),
    var(--background);
}

.area-map__canvas {
  position: absolute;
  inset: 0;
}

.area-map__state {
  position: absolute;
  z-index: 20;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 0.65rem;
  padding: 2rem;
  background: color-mix(in srgb, var(--background) 88%, transparent);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
}

.map-loader {
  position: relative;
  display: grid;
  width: 5.5rem;
  height: 5.5rem;
  place-items: center;
  margin-bottom: 0.25rem;
}

.map-loader__ring {
  position: absolute;
  border: 1px solid color-mix(in srgb, var(--primary) 58%, transparent);
  border-radius: 9999px;
  animation: map-radar-pulse 1.8s ease-out infinite;
}

.map-loader__ring--outer {
  inset: 0;
}

.map-loader__ring--inner {
  inset: 0.75rem;
  animation-delay: 0.55s;
}

.map-loader__core {
  position: relative;
  z-index: 1;
  display: grid;
  width: 2.9rem;
  height: 2.9rem;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--primary) 36%, transparent);
  border-radius: 1rem;
  background: color-mix(in srgb, var(--primary) 12%, var(--background));
  box-shadow:
    0 12px 30px color-mix(in srgb, var(--primary) 18%, transparent),
    inset 0 0 18px color-mix(in srgb, var(--primary) 8%, transparent);
  color: var(--primary);
}

@keyframes map-radar-pulse {
  0% {
    opacity: 0;
    transform: scale(0.58);
  }

  25% {
    opacity: 0.72;
  }

  100% {
    opacity: 0;
    transform: scale(1);
  }
}

.area-map__drawing-hint {
  position: absolute;
  z-index: 12;
  top: 1rem;
  left: 50%;
  display: flex;
  min-height: 44px;
  max-width: calc(100% - 2rem);
  align-items: center;
  gap: 0.55rem;
  transform: translateX(-50%);
  border: 1px solid color-mix(in srgb, var(--destructive) 36%, transparent);
  border-radius: 0.75rem;
  background: color-mix(in srgb, var(--background) 91%, transparent);
  padding: 0.65rem 0.9rem;
  box-shadow: 0 12px 32px rgb(2 6 23 / 20%);
  color: var(--foreground);
  font-size: 0.8125rem;
  font-weight: 600;
  white-space: nowrap;
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
}

@media (prefers-reduced-motion: reduce) {
  .map-loader__ring {
    animation: none;
  }

  .map-loader__ring--outer {
    opacity: 0.55;
  }

  .map-loader__ring--inner {
    opacity: 0.35;
  }
}

@supports not ((-webkit-backdrop-filter: blur(1px)) or (backdrop-filter: blur(1px))) {
  .area-map__state,
  .area-map__drawing-hint {
    background: var(--background);
  }
}
</style>
