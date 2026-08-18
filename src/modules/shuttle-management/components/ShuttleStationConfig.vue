<script setup lang="ts">
import type { ShuttleStation } from '../types'
import { computed, reactive, ref, watch } from 'vue'
import { AlertTriangle, ArrowDown, ArrowUp, Check, MapPin, PencilLine, Plus, Trash2, X } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClientId } from '@/lib/id'
import { parseGeoPointInput, serializeGeoPoint } from '@/components/map/geometry'
import { validateShuttleStations } from '../services/shuttle-route-service'

const props = withDefaults(defineProps<{
  value: readonly ShuttleStation[]
  routeId: string
  saving?: boolean
}>(), { saving: false })

const emit = defineEmits<{
  'update:value': [value: ShuttleStation[]]
  'editor-dirty': [dirty: boolean]
}>()

type EditorMode = 'create' | 'edit'
interface StationEditor {
  name: string
  coordinate: string
  navigationAddress: string
  arrivalOffsetMinutes: string
}

const emptyEditor = (): StationEditor => ({ name: '', coordinate: '', navigationAddress: '', arrivalOffsetMinutes: '' })
const editorMode = ref<EditorMode | null>(null)
const editingId = ref<string | null>(null)
const editor = reactive<StationEditor>(emptyEditor())
const editorInitial = ref<StationEditor>(emptyEditor())
const editorError = ref('')
const editorErrorField = ref<keyof StationEditor | ''>('')
const editorDirty = computed(() => editorMode.value !== null && JSON.stringify(editor) !== JSON.stringify(editorInitial.value))
const missingCoordinateCount = computed(() => props.value.filter((station) => !station.point).length)

function setEditor(value: StationEditor): void {
  Object.assign(editor, value)
  editorInitial.value = { ...value }
  editorError.value = ''
  editorErrorField.value = ''
}

function beginCreate(): void {
  if (props.value.length >= 20) return
  editorMode.value = 'create'
  editingId.value = null
  setEditor(emptyEditor())
}

function beginEdit(station: ShuttleStation): void {
  editorMode.value = 'edit'
  editingId.value = station.id
  setEditor({
    name: station.name,
    coordinate: station.point ? serializeGeoPoint(station.point) : '',
    navigationAddress: station.navigationAddress,
    arrivalOffsetMinutes: station.arrivalOffsetMinutes === null ? '' : String(station.arrivalOffsetMinutes),
  })
}

function cancelEditor(): void {
  editorMode.value = null
  editingId.value = null
  setEditor(emptyEditor())
}

function commitEditor(): boolean {
  editorError.value = ''
  editorErrorField.value = ''
  const name = editor.name.trim()
  if (!name) {
    editorError.value = '请输入站点名称'
    editorErrorField.value = 'name'
    return false
  }
  let point = null
  if (editor.coordinate.trim()) {
    try {
      point = parseGeoPointInput(editor.coordinate)
    }
    catch (error) {
      editorError.value = error instanceof Error ? error.message : '请输入合法的经度,纬度'
      editorErrorField.value = 'coordinate'
      return false
    }
  }
  const offsetSource = editor.arrivalOffsetMinutes.trim()
  const offset = offsetSource ? Number(offsetSource) : null
  if (offset !== null && (!Number.isInteger(offset) || offset < 0)) {
    editorError.value = '到达偏移必须是非负整数'
    editorErrorField.value = 'arrivalOffsetMinutes'
    return false
  }
  const station: ShuttleStation = {
    id: editingId.value ?? createClientId(),
    name,
    point,
    navigationAddress: editor.navigationAddress.trim(),
    arrivalOffsetMinutes: offset,
  }
  const next = editorMode.value === 'edit'
    ? props.value.map((item) => item.id === editingId.value ? station : { ...item, point: item.point ? { ...item.point } : null })
    : [...props.value.map((item) => ({ ...item, point: item.point ? { ...item.point } : null })), station]
  const validation = validateShuttleStations(next)
  if (!validation.valid) {
    editorError.value = validation.issues[0]!.message
    return false
  }
  emit('update:value', next)
  cancelEditor()
  return true
}

function move(index: number, offset: -1 | 1): void {
  const target = index + offset
  if (target < 0 || target >= props.value.length) return
  const next = props.value.map((station) => ({ ...station, point: station.point ? { ...station.point } : null }))
  const current = next[index]!
  next[index] = next[target]!
  next[target] = current
  emit('update:value', next)
}

function remove(station: ShuttleStation): void {
  emit('update:value', props.value.filter((item) => item.id !== station.id).map((item) => ({ ...item, point: item.point ? { ...item.point } : null })))
  if (editingId.value === station.id) cancelEditor()
}

function validateAndCommit(): boolean {
  if (editorMode.value && editorDirty.value && !commitEditor()) return false
  if (editorMode.value && !editorDirty.value) cancelEditor()
  const result = validateShuttleStations(props.value)
  if (!result.valid) {
    editorError.value = result.issues[0]!.message
    return false
  }
  return true
}

defineExpose({ validateAndCommit })
watch(editorDirty, (dirty) => emit('editor-dirty', dirty), { immediate: true })
watch(() => props.routeId, cancelEditor)
</script>

<template>
  <div class="space-y-6">
    <section aria-labelledby="station-list-heading">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div class="flex items-center gap-2"><h3 id="station-list-heading" class="font-semibold">站点列表</h3><Badge variant="secondary">{{ value.length }}/20</Badge></div>
          <p class="mt-1 text-xs text-muted-foreground">站点方向跟随线路；通过上移、下移调整地图连线顺序。</p>
        </div>
        <Button type="button" variant="outline" class="h-11" :disabled="saving || value.length >= 20" @click="beginCreate"><Plus aria-hidden="true" />新增站点</Button>
      </div>

      <div class="space-y-2">
        <div v-if="!value.length" class="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">暂未配置站点，可先保存空线路，稍后补充。</div>
        <article v-for="(station, index) in value" :key="station.id" :class="['flex flex-col gap-3 rounded-xl border p-3 transition-colors sm:flex-row sm:items-center', editingId === station.id ? 'border-primary/45 bg-primary/5' : 'bg-card/70 hover:bg-muted/25']">
          <span class="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold tabular-nums text-primary">{{ index + 1 }}</span>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2"><p class="font-medium">{{ station.name }}</p><Badge v-if="station.point" variant="outline" class="text-success">已定位</Badge><Badge v-else variant="secondary">缺少坐标</Badge></div>
            <p class="mt-1 truncate font-mono text-xs text-muted-foreground">{{ station.point ? serializeGeoPoint(station.point) : '未配置坐标' }}<span v-if="station.navigationAddress" class="font-sans"> · {{ station.navigationAddress }}</span></p>
            <p v-if="station.arrivalOffsetMinutes !== null" class="mt-1 text-xs text-muted-foreground">从首发站约 {{ station.arrivalOffsetMinutes }} 分钟到达</p>
          </div>
          <div class="flex shrink-0 items-center justify-end gap-1">
            <Button type="button" variant="ghost" size="icon-lg" class="h-11 w-11" :disabled="saving || index === 0" :aria-label="`上移${station.name}`" @click="move(index, -1)"><ArrowUp aria-hidden="true" /></Button>
            <Button type="button" variant="ghost" size="icon-lg" class="h-11 w-11" :disabled="saving || index === value.length - 1" :aria-label="`下移${station.name}`" @click="move(index, 1)"><ArrowDown aria-hidden="true" /></Button>
            <Button type="button" variant="ghost" class="h-11 px-3" :disabled="saving" @click="beginEdit(station)"><PencilLine aria-hidden="true" />编辑</Button>
            <Button type="button" variant="ghost" size="icon-lg" class="h-11 w-11 text-destructive hover:text-destructive" :disabled="saving" :aria-label="`删除${station.name}`" @click="remove(station)"><Trash2 aria-hidden="true" /></Button>
          </div>
        </article>
      </div>

      <div v-if="value.length" class="mt-3 flex items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        <MapPin class="size-4 shrink-0" aria-hidden="true" />
        {{ missingCoordinateCount ? `${missingCoordinateCount} 个站点未配置坐标，不参与地图点位和连线。` : '全部站点均已配置坐标。' }}
      </div>
    </section>

    <section v-if="editorMode" class="rounded-xl border border-primary/25 bg-primary/4 p-4" aria-labelledby="station-editor-heading">
      <div class="mb-4 flex items-center justify-between gap-3">
        <div><h3 id="station-editor-heading" class="font-semibold">{{ editorMode === 'create' ? '新增站点' : '编辑站点' }}</h3><p class="mt-1 text-xs text-muted-foreground">坐标选填；填写时使用“经度,纬度”格式。</p></div>
        <Button type="button" variant="ghost" size="icon-lg" class="h-11 w-11" aria-label="关闭站点编辑区" @click="cancelEditor"><X aria-hidden="true" /></Button>
      </div>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div class="space-y-2 sm:col-span-2"><Label for="station-name">站点名称 <span class="text-destructive">*</span></Label><Input id="station-name" v-model="editor.name" class="h-11" placeholder="例如：体育中心东门站" :disabled="saving" :aria-invalid="editorErrorField === 'name'" /></div>
        <div class="space-y-2 sm:col-span-2"><Label for="station-coordinate">定位（经度,纬度）</Label><Input id="station-coordinate" v-model="editor.coordinate" class="h-11 font-mono" placeholder="例如：113.1462,27.8165" :disabled="saving" :aria-invalid="editorErrorField === 'coordinate'" /><p class="text-xs text-muted-foreground">坐标系为 GCJ-02；留空时站点仅在列表展示。</p></div>
        <div class="space-y-2"><Label for="station-address">导航地址</Label><Input id="station-address" v-model="editor.navigationAddress" class="h-11" placeholder="选填导航位置说明" :disabled="saving" /></div>
        <div class="space-y-2"><Label for="station-offset">到达偏移（分钟）</Label><Input id="station-offset" v-model="editor.arrivalOffsetMinutes" type="number" min="0" step="1" class="h-11 tabular-nums" placeholder="选填" :disabled="saving" :aria-invalid="editorErrorField === 'arrivalOffsetMinutes'" /></div>
      </div>
      <p v-if="editorError" class="mt-3 flex items-center gap-2 text-xs text-destructive" role="alert"><AlertTriangle class="size-4 shrink-0" aria-hidden="true" />{{ editorError }}</p>
      <div class="mt-4 flex justify-end gap-2"><Button type="button" variant="outline" class="h-11" :disabled="saving" @click="cancelEditor">取消编辑</Button><Button type="button" class="h-11" :disabled="saving" @click="commitEditor"><Check aria-hidden="true" />{{ editorMode === 'create' ? '添加到列表' : '更新站点' }}</Button></div>
    </section>
  </div>
</template>
