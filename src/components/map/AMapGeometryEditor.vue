<script setup lang="ts">
import type { MapGeometry, MapTheme } from './types'
import { Circle, ClipboardPaste, Pentagon, RotateCcw, Square, Trash2, Undo2 } from '@lucide/vue'
import { useEventListener } from '@vueuse/core'
import { computed, ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import AMapCanvas from './AMapCanvas.vue'
import AMapGeometryController from './AMapGeometryController.vue'
import { calculateGeometryAreaSquareMeters, cloneGeometry, parseCoordinateInput, serializePolygonCoordinates } from './geometry'

const props = withDefaults(defineProps<{
  modelValue: MapGeometry | null
  color?: string
  theme?: MapTheme
  height?: string
  disabled?: boolean
}>(), {
  color: '#ef4444',
  theme: 'light',
  height: '20rem',
  disabled: false,
})
const emit = defineEmits<{
  'update:modelValue': [geometry: MapGeometry | null]
}>()
const controller = ref<InstanceType<typeof AMapGeometryController> | null>(null)
const drawingType = ref<MapGeometry['type'] | null>(null)
const selectedType = ref<MapGeometry['type']>(props.modelValue?.type ?? 'polygon')
const coordinateInput = ref(props.modelValue ? serializePolygonCoordinates(props.modelValue) : '')
const coordinateError = ref('')
const history = ref<Array<MapGeometry | null>>([])
const area = computed(() => props.modelValue ? calculateGeometryAreaSquareMeters(props.modelValue) : null)

function pushHistory(geometry: MapGeometry | null): void {
  const snapshot = geometry ? cloneGeometry(geometry) : null
  const latest = history.value.at(-1)
  if (JSON.stringify(latest) !== JSON.stringify(snapshot)) history.value.push(snapshot)
  if (history.value.length > 30) history.value.shift()
}

function updateGeometry(geometry: MapGeometry | null): void {
  selectedType.value = geometry?.type ?? selectedType.value
  coordinateInput.value = geometry ? serializePolygonCoordinates(geometry) : ''
  coordinateError.value = ''
  emit('update:modelValue', geometry ? cloneGeometry(geometry) : null)
}

function startDrawing(type = selectedType.value): void {
  selectedType.value = type
  if (!controller.value?.startDrawing(type)) coordinateError.value = '地图尚未就绪，可继续使用手动坐标导入。'
}

function clearGeometry(): void {
  if (!props.modelValue) return
  pushHistory(props.modelValue)
  updateGeometry(null)
}

function undo(): void {
  const previous = history.value.pop()
  if (previous === undefined) return
  updateGeometry(previous)
}

function importCoordinates(): void {
  try {
    const next = parseCoordinateInput(coordinateInput.value)
    pushHistory(props.modelValue)
    selectedType.value = 'polygon'
    updateGeometry(next)
  }
  catch (error) {
    coordinateError.value = error instanceof Error ? error.message : '坐标格式不正确'
  }
}

function handleEscape(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !drawingType.value) return
  event.preventDefault()
  event.stopImmediatePropagation()
  controller.value?.cancelDrawing()
}

useEventListener(window, 'keydown', handleEscape, { capture: true })
</script>

<template>
  <div class="space-y-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex flex-wrap gap-2" aria-label="区域绘制类型">
        <Button type="button" :variant="selectedType === 'polygon' ? 'default' : 'outline'" size="sm" :disabled="disabled" @click="startDrawing('polygon')"><Pentagon aria-hidden="true" />多边形</Button>
        <Button type="button" :variant="selectedType === 'rectangle' ? 'default' : 'outline'" size="sm" :disabled="disabled" @click="startDrawing('rectangle')"><Square aria-hidden="true" />矩形</Button>
        <Button type="button" :variant="selectedType === 'circle' ? 'default' : 'outline'" size="sm" :disabled="disabled" @click="startDrawing('circle')"><Circle aria-hidden="true" />圆形</Button>
      </div>
      <div class="flex gap-1">
        <Button type="button" variant="ghost" size="sm" :disabled="disabled || history.length === 0" @click="undo"><Undo2 aria-hidden="true" />撤销</Button>
        <Button type="button" variant="ghost" size="sm" :disabled="disabled" @click="startDrawing()"><RotateCcw aria-hidden="true" />重绘</Button>
        <Button type="button" variant="ghost" size="sm" class="text-destructive hover:text-destructive" :disabled="disabled || !modelValue" @click="clearGeometry"><Trash2 aria-hidden="true" />清空</Button>
      </div>
    </div>

    <div class="relative overflow-hidden rounded-xl border bg-muted/20" :style="{ height }">
      <AMapCanvas :theme="theme" :controls="false" min-height="100%" :plugins="['AMap.MouseTool', 'AMap.PolygonEditor', 'AMap.RectangleEditor', 'AMap.CircleEditor']" aria-label="交通管制区域编辑地图">
        <AMapGeometryController ref="controller" :geometry="modelValue" :color="color" @update:geometry="updateGeometry" @history-snapshot="pushHistory" @drawing-change="drawingType = $event" />
        <div v-if="drawingType" class="pointer-events-none absolute inset-x-3 top-3 z-10 rounded-lg border border-primary/25 bg-background/92 px-3 py-2 text-xs text-foreground shadow-sm backdrop-blur">
          正在绘制{{ drawingType === 'polygon' ? '多边形，单击加点、双击完成' : drawingType === 'rectangle' ? '矩形，拖动完成' : '圆形，拖动完成' }}；按 Esc 取消并保留原区域。
        </div>
      </AMapCanvas>
    </div>

    <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <span>{{ area === null ? '未配置区域，可直接保存' : `预估面积 ${area.toLocaleString('zh-CN', { maximumFractionDigits: 0 })} ㎡` }}</span>
      <span>坐标系：GCJ-02</span>
    </div>

    <div class="space-y-2">
      <Textarea v-model="coordinateInput" class="min-h-24 resize-y font-mono text-xs" :disabled="disabled" placeholder="[[113.10,27.84],[113.11,27.84],[113.11,27.85]]&#10;或 113.10,27.84;113.11,27.84;113.11,27.85" aria-label="手动坐标" />
      <div class="flex items-start justify-between gap-3">
        <p :class="['text-xs leading-5', coordinateError ? 'text-destructive' : 'text-muted-foreground']" aria-live="polite">
          {{ coordinateError || '支持数组、对象数组或 lng,lat;…；导入后会替换为多边形。' }}
        </p>
        <Button type="button" variant="outline" size="sm" class="shrink-0" :disabled="disabled || !coordinateInput.trim()" @click="importCoordinates"><ClipboardPaste aria-hidden="true" />导入坐标</Button>
      </div>
    </div>
  </div>
</template>
