<script setup lang="ts">
import type {
  AreaControlMapHandle,
  ControlZoneGeometry,
  ControlZoneWriteInput,
  LngLatTuple,
} from '@/modules/area-control/types'
import { useEventListener } from '@vueuse/core'
import { AlertTriangle, DatabaseIcon } from '@lucide/vue'
import { computed, nextTick, onMounted, ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { toast } from 'vue-sonner'
import AreaControlMap from '@/modules/area-control/components/AreaControlMap.vue'
import ControlZonePanel from '@/modules/area-control/components/ControlZonePanel.vue'
import ControlZoneToolbar from '@/modules/area-control/components/ControlZoneToolbar.vue'
import { calculateGeometryAreaSquareMeters, cloneGeometry } from '@/modules/area-control/lib/geometry'
import { useControlZoneStore } from '@/modules/area-control/stores/control-zone-store'
import { useThemeStore } from '@/stores/theme'

type BoundaryRings = readonly (readonly LngLatTuple[])[]

const DISCARD_MESSAGE = '当前有未保存的区域修改，确定放弃吗？'
const zoneStore = useControlZoneStore()
const themeStore = useThemeStore()
const mapRef = ref<AreaControlMapHandle | null>(null)
const mapReady = ref(false)
const mapErrorMessage = ref('')
const drawingType = ref<ControlZoneGeometry['type'] | null>(null)
const isDeleting = ref(false)

const mapUnavailable = computed(() => Boolean(mapErrorMessage.value) || !mapReady.value)
const interactionReadonly = computed(() => mapUnavailable.value)
const toolbarDisabled = computed(() => !mapReady.value || zoneStore.isLoading || zoneStore.isSaving)

const formValue = computed<ControlZoneWriteInput | null>(() => {
  const draft = zoneStore.draft
  if (!draft?.geometry) return null
  return {
    name: draft.name,
    description: draft.description,
    enabled: draft.enabled,
    coordinateSystem: 'GCJ-02',
    geometry: cloneGeometry(draft.geometry),
    areaSquareMeters: calculateGeometryAreaSquareMeters(draft.geometry),
  }
})

function confirmDiscard(): boolean {
  return !zoneStore.hasUnsavedChanges || window.confirm(DISCARD_MESSAGE)
}

function handleBoundariesReady(boundaries: BoundaryRings) {
  zoneStore.setBoundaries(boundaries)
  mapReady.value = true
  mapErrorMessage.value = ''
}

function handleMapError(message: string) {
  zoneStore.setBoundaries([])
  mapReady.value = false
  mapErrorMessage.value = message
}

function handleDrawingChange(value: ControlZoneGeometry['type'] | null) {
  drawingType.value = value
}

function startCreate(type: ControlZoneGeometry['type']) {
  if (interactionReadonly.value) return
  if (!confirmDiscard()) return
  if (zoneStore.hasUnsavedChanges) {
    zoneStore.cancel()
    mapRef.value?.finishEditing(false)
  }
  zoneStore.select(null)
  if (!mapRef.value?.startDrawing(type)) {
    toast.error('地图尚未准备好，请稍后重试。')
  }
}

function handleDraftCreated(geometry: ControlZoneGeometry) {
  zoneStore.beginCreate(geometry)
}

function handleGeometryChange(id: string, geometry: ControlZoneGeometry) {
  if (zoneStore.mode === 'edit' && zoneStore.draft?.id === id) {
    zoneStore.updateDraft({ geometry })
  }
}

function selectZone(id: string) {
  if (zoneStore.selectedId === id && zoneStore.mode === 'detail') {
    mapRef.value?.focusZone(id)
    return
  }
  if (!confirmDiscard()) return
  if (zoneStore.hasUnsavedChanges) {
    zoneStore.cancel()
    mapRef.value?.finishEditing(false)
  }
  zoneStore.select(id)
  void nextTick(() => mapRef.value?.focusZone(id))
}

function backToList() {
  zoneStore.select(null)
}

function beginEdit(id: string) {
  if (interactionReadonly.value) return
  if (!zoneStore.beginEdit(id)) {
    toast.error(zoneStore.error ?? '未能打开区域编辑。')
    return
  }
  void nextTick(() => {
    if (!mapRef.value?.beginEditing(id)) {
      zoneStore.cancel()
      toast.error('地图编辑器启动失败，请重新加载地图后再试。')
    }
  })
}

function updateFormValue(value: ControlZoneWriteInput) {
  zoneStore.updateDraft({
    name: value.name,
    description: value.description,
    enabled: value.enabled,
    geometry: value.geometry,
  })
}

async function saveZone() {
  const saved = await zoneStore.save()
  if (!saved) {
    toast.error(zoneStore.error ?? '保存失败，已保留当前草稿。')
    return
  }
  mapRef.value?.finishEditing(false)
  toast.success('管制区域已保存。')
}

function cancelForm() {
  if (!confirmDiscard()) return
  const editedId = zoneStore.draft?.id
  const originalGeometry = zoneStore.originalDraft?.geometry
  if (editedId && originalGeometry) {
    mapRef.value?.finishEditing(false)
    mapRef.value?.restoreGeometry(editedId, originalGeometry)
  }
  else {
    mapRef.value?.cancelDrawing()
  }
  zoneStore.cancel()
}

async function removeZone(id: string) {
  if (interactionReadonly.value) return
  isDeleting.value = true
  const removed = await zoneStore.remove(id)
  isDeleting.value = false
  if (removed) {
    toast.success('管制区域已删除。')
  }
  else {
    toast.error(zoneStore.error ?? '删除失败，区域已保留。')
  }
}

function handleEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  if (drawingType.value) {
    mapRef.value?.cancelDrawing()
    return
  }
  if (zoneStore.hasUnsavedChanges) cancelForm()
}

function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (!zoneStore.hasUnsavedChanges) return
  event.preventDefault()
  event.returnValue = ''
}

onBeforeRouteLeave(() => confirmDiscard())
useEventListener(window, 'keydown', handleEscape)
useEventListener(window, 'beforeunload', handleBeforeUnload)

onMounted(async () => {
  const loaded = await zoneStore.load()
  if (!loaded) toast.error(zoneStore.error ?? '本地管制区域加载失败。')
})
</script>

<template>
  <section class="relative h-[calc(100svh-4rem)] min-h-[36rem] overflow-hidden bg-background" aria-labelledby="area-control-title">
    <h1 id="area-control-title" class="sr-only">管制区域</h1>

    <div class="flex size-full min-w-0">
      <div class="relative min-w-0 flex-1 overflow-hidden">
        <AreaControlMap
          ref="mapRef"
          :zones="zoneStore.records"
          :selected-id="zoneStore.selectedId"
          :theme="themeStore.mode"
          :readonly="interactionReadonly"
          @ready="handleBoundariesReady"
          @map-error="handleMapError"
          @select="selectZone"
          @draft-created="handleDraftCreated"
          @geometry-change="handleGeometryChange"
          @drawing-change="handleDrawingChange"
        />

        <div class="pointer-events-none absolute left-3 top-3 z-20 sm:left-4 sm:top-4">
          <div class="pointer-events-auto">
            <ControlZoneToolbar
              :readonly="false"
              :disabled="toolbarDisabled"
              :has-zones="zoneStore.records.length > 0"
              :drawing="Boolean(drawingType)"
              :show-panel-button="false"
              @create="startCreate"
              @return-to-zhuzhou="mapRef?.focusZhuzhou()"
              @fit-all="mapRef?.fitAll()"
            />
          </div>
        </div>

      </div>

      <ControlZonePanel
        :mode="zoneStore.mode"
        :zones="zoneStore.records"
        :selected-zone="zoneStore.selectedZone"
        :form-value="formValue"
        :form-errors="zoneStore.validation.issues"
        :overlap-warnings="zoneStore.overlappingZones"
        :map-unavailable="mapUnavailable"
        :map-error-message="mapErrorMessage || '地图与株洲市边界尚未准备完成。'"
        :saving="zoneStore.isSaving"
        :deleting="isDeleting"
        @select="selectZone"
        @back="backToList"
        @edit="beginEdit"
        @remove="removeZone"
        @update:form-value="updateFormValue"
        @save="saveZone"
        @cancel="cancelForm"
      />
    </div>

    <div
      v-if="zoneStore.error && !zoneStore.isSaving"
      class="sr-only"
      role="alert"
      aria-live="assertive"
    >
      <AlertTriangle aria-hidden="true" />
      <DatabaseIcon aria-hidden="true" />
      {{ zoneStore.error }}
    </div>
  </section>
</template>
