import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  calculateGeometryAreaSquareMeters,
  cloneGeometry,
  geometriesOverlapOrTouch,
  isGeometryInsideBoundary,
  validateGeometry,
  type BoundaryRings,
} from '../lib/geometry'
import {
  controlZoneNameIdentity,
  controlZoneService,
  normalizeControlZoneName,
} from '../services/control-zone-service'
import type {
  ControlZone,
  ControlZoneDraft,
  ControlZoneDraftPatch,
  ControlZoneDraftValidation,
  ControlZoneMode,
  ControlZoneService,
  ControlZoneValidationIssue,
} from '../types'

function cloneDraft(draft: ControlZoneDraft | null): ControlZoneDraft | null {
  if (!draft) return null
  return {
    ...draft,
    geometry: draft.geometry ? cloneGeometry(draft.geometry) : null,
  }
}

function draftFromRecord(record: ControlZone): ControlZoneDraft {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    enabled: record.enabled,
    geometry: cloneGeometry(record.geometry),
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败，请稍后重试'
}

export function createControlZoneStore(service: ControlZoneService, storeId = 'control-zone') {
  return defineStore(storeId, () => {
    const records = ref<ControlZone[]>([])
    const selectedId = ref<string | null>(null)
    const mode = ref<ControlZoneMode>('list')
    const draft = ref<ControlZoneDraft | null>(null)
    const originalDraft = ref<ControlZoneDraft | null>(null)
    const boundaries = ref<BoundaryRings>([])
    const isLoading = ref(false)
    const isSaving = ref(false)
    const error = ref<string | null>(null)

    const selectedZone = computed(
      () => records.value.find((record) => record.id === selectedId.value) ?? null,
    )

    const validation = computed<ControlZoneDraftValidation>(() => {
      const issues: ControlZoneValidationIssue[] = []
      const candidate = draft.value
      if (!candidate) return { valid: false, issues }

      const normalizedName = normalizeControlZoneName(candidate.name)
      if (!normalizedName) {
        issues.push({ field: 'name', code: 'required', message: '请输入管制区域名称' })
      } else {
        const identity = controlZoneNameIdentity(normalizedName)
        if (
          records.value.some(
            (record) => record.id !== candidate.id && controlZoneNameIdentity(record.name) === identity,
          )
        ) {
          issues.push({ field: 'name', code: 'duplicate', message: '管制区域名称不能重复' })
        }
      }

      if (Array.from(candidate.description).length > 300) {
        issues.push({ field: 'description', code: 'too_long', message: '说明不能超过 300 个字符' })
      }

      if (!candidate.geometry) {
        issues.push({ field: 'geometry', code: 'required', message: '请先在地图上绘制管制区域' })
      } else {
        const geometryValidation = validateGeometry(candidate.geometry)
        if (!geometryValidation.valid) {
          issues.push({
            field: 'geometry',
            code: 'invalid_geometry',
            message: geometryValidation.reason ?? '管制区域几何数据无效',
          })
        } else if (boundaries.value.length === 0) {
          issues.push({
            field: 'boundary',
            code: 'boundary_unavailable',
            message: '株洲市行政边界尚未加载，暂时无法保存',
          })
        } else if (!isGeometryInsideBoundary(candidate.geometry, boundaries.value)) {
          issues.push({
            field: 'boundary',
            code: 'outside_boundary',
            message: '管制区域必须完全位于株洲市行政边界内',
          })
        }
      }

      return { valid: issues.length === 0, issues }
    })

    const overlappingZones = computed(() => {
      const geometry = draft.value?.geometry
      if (!geometry || !validateGeometry(geometry).valid) return []
      return records.value.filter(
        (record) => record.id !== draft.value?.id && geometriesOverlapOrTouch(geometry, record.geometry),
      )
    })

    const hasUnsavedChanges = computed(() => {
      if (!draft.value) return false
      if (mode.value === 'create') return true
      return JSON.stringify(draft.value) !== JSON.stringify(originalDraft.value)
    })

    function setBoundaries(nextBoundaries: BoundaryRings): void {
      boundaries.value = nextBoundaries.map((ring) =>
        ring.map((point) => [point[0], point[1]] as const),
      )
    }

    async function load(): Promise<boolean> {
      isLoading.value = true
      error.value = null
      try {
        records.value = await service.list()
        if (selectedId.value && !records.value.some((record) => record.id === selectedId.value)) {
          selectedId.value = null
          mode.value = 'list'
        }
        return true
      } catch (cause) {
        error.value = errorMessage(cause)
        return false
      } finally {
        isLoading.value = false
      }
    }

    function select(id: string | null): void {
      selectedId.value = id
      mode.value = id ? 'detail' : 'list'
      draft.value = null
      originalDraft.value = null
      error.value = null
    }

    function beginCreate(geometry: ControlZoneDraft['geometry'] = null): void {
      selectedId.value = null
      mode.value = 'create'
      originalDraft.value = null
      draft.value = {
        name: '',
        description: '',
        enabled: true,
        geometry: geometry ? cloneGeometry(geometry) : null,
      }
      error.value = null
    }

    function beginEdit(id = selectedId.value): boolean {
      const record = records.value.find((item) => item.id === id)
      if (!record) {
        error.value = '未找到要编辑的管制区域'
        return false
      }
      selectedId.value = record.id
      mode.value = 'edit'
      originalDraft.value = draftFromRecord(record)
      draft.value = cloneDraft(originalDraft.value)
      error.value = null
      return true
    }

    function updateDraft(patch: ControlZoneDraftPatch): void {
      if (!draft.value) return
      draft.value = {
        ...draft.value,
        ...patch,
        ...(patch.geometry !== undefined
          ? { geometry: patch.geometry ? cloneGeometry(patch.geometry) : null }
          : {}),
      }
    }

    function cancel(): void {
      if (mode.value === 'edit' && originalDraft.value) {
        draft.value = cloneDraft(originalDraft.value)
        mode.value = 'detail'
      } else {
        draft.value = null
        originalDraft.value = null
        mode.value = selectedId.value ? 'detail' : 'list'
      }
      error.value = null
    }

    async function save(): Promise<ControlZone | null> {
      if (!draft.value || !draft.value.geometry || !validation.value.valid) {
        error.value = validation.value.issues[0]?.message ?? '请完善管制区域信息'
        return null
      }

      isSaving.value = true
      error.value = null
      const candidate = draft.value
      const geometry = draft.value.geometry
      if (!geometry) return null
      try {
        const writeInput = {
          name: normalizeControlZoneName(candidate.name),
          description: candidate.description,
          enabled: candidate.enabled,
          coordinateSystem: 'GCJ-02' as const,
          geometry: cloneGeometry(geometry),
          areaSquareMeters: calculateGeometryAreaSquareMeters(geometry),
        }
        const saved = candidate.id
          ? await service.update(candidate.id, writeInput)
          : await service.create(writeInput)
        records.value = (await service.list()).slice()
        selectedId.value = saved.id
        mode.value = 'detail'
        originalDraft.value = draftFromRecord(saved)
        draft.value = cloneDraft(originalDraft.value)
        return saved
      } catch (cause) {
        error.value = errorMessage(cause)
        return null
      } finally {
        isSaving.value = false
      }
    }

    async function remove(id: string): Promise<boolean> {
      isSaving.value = true
      error.value = null
      try {
        await service.remove(id)
        records.value = records.value.filter((record) => record.id !== id)
        if (selectedId.value === id) {
          selectedId.value = null
          draft.value = null
          originalDraft.value = null
          mode.value = 'list'
        }
        return true
      } catch (cause) {
        error.value = errorMessage(cause)
        return false
      } finally {
        isSaving.value = false
      }
    }

    function resetError(): void {
      error.value = null
    }

    return {
      records,
      selectedId,
      mode,
      draft,
      originalDraft,
      boundaries,
      isLoading,
      isSaving,
      error,
      selectedZone,
      validation,
      overlappingZones,
      hasUnsavedChanges,
      setBoundaries,
      load,
      select,
      beginCreate,
      beginEdit,
      updateDraft,
      cancel,
      save,
      remove,
      resetError,
    }
  })
}

export const useControlZoneStore = createControlZoneStore(controlZoneService)
