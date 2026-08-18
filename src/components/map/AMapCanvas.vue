<script setup lang="ts">
import type { GeoPoint, MapTheme } from './types'
import type { AMapMapLike, AMapRuntime } from './amap-runtime'
import { AlertTriangle, MapPinned, RefreshCw } from '@lucide/vue'
import { nextTick, onBeforeUnmount, onMounted, onUnmounted, provide, shallowRef, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { useDelayedLoading } from '@/composables/use-delayed-loading'
import { loadAmap, toLngLatTuple } from './amap-runtime'
import { amapContextKey } from './map-context'

const props = withDefaults(defineProps<{
  center?: GeoPoint
  zoom?: number
  theme?: MapTheme
  plugins?: readonly string[]
  controls?: boolean
  ariaLabel?: string
  minHeight?: string
}>(), {
  center: () => ({ lng: 113.1106, lat: 27.841 }),
  zoom: 14,
  theme: 'light',
  plugins: () => [],
  controls: true,
  ariaLabel: '高德地图',
  minHeight: '20rem',
})

const emit = defineEmits<{
  ready: []
  error: [message: string]
}>()

const container = shallowRef<HTMLDivElement | null>(null)
const runtime = shallowRef<AMapRuntime | null>(null)
const map = shallowRef<AMapMapLike | null>(null)
const ready = shallowRef(false)
const loading = shallowRef(true)
const errorMessage = shallowRef('')
const showLoading = useDelayedLoading(loading, { delay: 120, minimumVisible: 280 })
let version = 0
let destroyed = false
let resizeObserver: ResizeObserver | null = null
let resizeFrame = 0

provide(amapContextKey, { runtime, map, ready })

function errorText(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : '高德地图加载失败，请检查网络和 Key 配置。'
}

function destroyMap(): void {
  resizeObserver?.disconnect()
  resizeObserver = null
  if (resizeFrame) cancelAnimationFrame(resizeFrame)
  resizeFrame = 0
  ready.value = false
  map.value?.destroy()
  map.value = null
  runtime.value = null
}

function scheduleResize(): void {
  if (resizeFrame) cancelAnimationFrame(resizeFrame)
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0
      map.value?.resize?.()
    })
  })
}

async function initialize(): Promise<void> {
  const currentVersion = ++version
  loading.value = true
  errorMessage.value = ''
  destroyMap()
  await nextTick()
  try {
    if (!container.value) throw new Error('地图容器未就绪。')
    const requestedPlugins = props.controls
      ? [...props.plugins, 'AMap.Scale', 'AMap.ToolBar']
      : [...props.plugins]
    const loadedRuntime = await loadAmap(requestedPlugins)
    if (destroyed || currentVersion !== version || !container.value) return
    runtime.value = loadedRuntime
    map.value = new loadedRuntime.Map(container.value, {
      center: toLngLatTuple(props.center),
      zoom: props.zoom,
      mapStyle: `amap://styles/${props.theme === 'dark' ? 'darkblue' : 'whitesmoke'}`,
      resizeEnable: true,
      showIndoorMap: false,
      viewMode: '3D',
      pitch: 0,
      rotation: 0,
      features: ['bg', 'road', 'point', 'building'],
      zooms: [7, 20],
    })
    if (props.controls) {
      map.value.addControl(new loadedRuntime.Scale())
      map.value.addControl(new loadedRuntime.ToolBar({ position: 'LB', liteStyle: true }))
    }
    resizeObserver = new ResizeObserver(scheduleResize)
    resizeObserver.observe(container.value)
    scheduleResize()
    ready.value = true
    loading.value = false
    emit('ready')
  }
  catch (error) {
    if (destroyed || currentVersion !== version) return
    loading.value = false
    errorMessage.value = errorText(error)
    emit('error', errorMessage.value)
    destroyMap()
  }
}

watch(() => props.theme, (theme) => map.value?.setMapStyle(`amap://styles/${theme === 'dark' ? 'darkblue' : 'whitesmoke'}`))
watch(() => props.center, (center) => map.value?.setCenter(toLngLatTuple(center)), { deep: true })
watch(() => props.zoom, (zoom) => map.value?.setZoom(zoom))

onMounted(() => void initialize())
onBeforeUnmount(() => {
  destroyed = true
  version += 1
})
onUnmounted(() => {
  destroyMap()
})

defineExpose({ retry: initialize })
</script>

<template>
  <section class="amap-canvas" :style="{ minHeight }" :aria-label="ariaLabel">
    <div ref="container" class="amap-host" aria-hidden="true" />
    <slot />

    <div v-if="showLoading" class="amap-state" role="status" aria-live="polite">
      <span class="grid size-12 place-items-center rounded-2xl border border-primary/30 bg-primary/10 text-primary">
        <MapPinned class="size-6" aria-hidden="true" />
      </span>
      <p class="font-medium">正在加载地图</p>
      <p class="text-sm text-muted-foreground">正在连接高德地图服务…</p>
    </div>

    <div v-else-if="errorMessage" class="amap-state" role="alert">
      <span class="grid size-12 place-items-center rounded-2xl bg-destructive/10 text-destructive">
        <AlertTriangle class="size-6" aria-hidden="true" />
      </span>
      <p class="font-semibold">地图暂时不可用</p>
      <p class="max-w-md text-center text-sm leading-6 text-muted-foreground">{{ errorMessage }}</p>
      <Button type="button" variant="outline" class="mt-1 h-11" @click="initialize">
        <RefreshCw aria-hidden="true" />
        重新加载
      </Button>
    </div>
  </section>
</template>

<style scoped>
.amap-canvas {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--background);
}

/* AMap adds `.amap-container { position: relative }` to the host element. */
.amap-host {
  position: absolute !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
}

.amap-state {
  position: absolute;
  z-index: 20;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: .625rem;
  padding: 2rem;
  background: color-mix(in srgb, var(--background) 90%, transparent);
  backdrop-filter: blur(8px);
}
</style>
