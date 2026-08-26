<script setup lang="ts">
import type { ShuttleStation } from '../types'
import type { TicketGate } from '@/modules/ticket-gate-management/types'
import { computed, reactive, ref, watch } from 'vue'
import { AlertTriangle, ArrowDown, ArrowUp, Check, LoaderCircle, MapPin, PencilLine, Plus, Trash2, X } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClientId } from '@/lib/id'
import { parseGeoPointInput, serializeGeoPoint } from '@/components/map/geometry'
import { validateShuttleStations } from '../services/shuttle-route-service'

const props = withDefaults(defineProps<{
  value: readonly ShuttleStation[]
  routeId: string
  ticketGates?: readonly TicketGate[]
  ticketGatesLoading?: boolean
  ticketGatesError?: string
  saving?: boolean
}>(), { ticketGates: () => [], ticketGatesLoading: false, ticketGatesError: '', saving: false })

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
  arrivalGateIds: string[]
}

const emptyEditor = (): StationEditor => ({ name: '', coordinate: '', navigationAddress: '', arrivalOffsetMinutes: '', arrivalGateIds: [] })
const editorMode = ref<EditorMode | null>(null)
const editingId = ref<string | null>(null)
const editor = reactive<StationEditor>(emptyEditor())
const editorInitial = ref<StationEditor>(emptyEditor())
const editorError = ref('')
const editorErrorField = ref<keyof StationEditor | ''>('')
const editorDirty = computed(() => editorMode.value !== null && JSON.stringify(editor) !== JSON.stringify(editorInitial.value))
const missingCoordinateCount = computed(() => props.value.filter((station) => !station.point).length)
const ticketGateById = computed(() => new Map(props.ticketGates.map((gate) => [gate.id, gate])))
const unavailableArrivalGateIds = computed(() => editor.arrivalGateIds.filter((id) => !ticketGateById.value.has(id)))

function cloneEditor(value: StationEditor): StationEditor {
  return { ...value, arrivalGateIds: [...value.arrivalGateIds] }
}

function cloneStation(station: ShuttleStation): ShuttleStation {
  return { ...station, point: station.point ? { ...station.point } : null, arrivalGateIds: [...station.arrivalGateIds] }
}

function gateLabel(id: string): string {
  const gate = ticketGateById.value.get(id)
  return gate ? `${gate.code} ${gate.name}` : `检票口 ${id}`
}

function setEditor(value: StationEditor): void {
  Object.assign(editor, cloneEditor(value))
  editorInitial.value = cloneEditor(value)
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
    arrivalGateIds: [...station.arrivalGateIds],
  })
}

function toggleArrivalGate(gateId: string, checked: boolean | 'indeterminate'): void {
  const next = new Set(editor.arrivalGateIds)
  if (checked === true) next.add(gateId)
  else next.delete(gateId)
  editor.arrivalGateIds = [...next]
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
  if (!editor.coordinate.trim()) {
    editorError.value = '请输入站点定位经纬度'
    editorErrorField.value = 'coordinate'
    return false
  }
  let point
  try {
    point = parseGeoPointInput(editor.coordinate)
  }
  catch (error) {
    editorError.value = error instanceof Error ? error.message : '请输入合法的经度,纬度'
    editorErrorField.value = 'coordinate'
    return false
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
    arrivalGateIds: [...editor.arrivalGateIds],
  }
  const next = editorMode.value === 'edit'
    ? props.value.map((item) => item.id === editingId.value ? station : cloneStation(item))
    : [...props.value.map(cloneStation), station]
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
  const next = props.value.map(cloneStation)
  const current = next[index]!
  next[index] = next[target]!
  next[target] = current
  emit('update:value', next)
}

function remove(station: ShuttleStation): void {
  emit('update:value', props.value.filter((item) => item.id !== station.id).map(cloneStation))
  if (editingId.value === station.id) cancelEditor()
}

function validateAndCommit(): boolean {
  if (editorMode.value && editorDirty.value && !commitEditor()) return false
  if (editorMode.value && !editorDirty.value) cancelEditor()
  const result = validateShuttleStations(props.value)
  if (!result.valid) {
    const issue = result.issues[0]!
    const station = issue.stationId ? props.value.find((item) => item.id === issue.stationId) : null
    if (station) {
      beginEdit(station)
      editorError.value = issue.message
      editorErrorField.value = issue.field === 'point' ? 'coordinate' : issue.field === 'arrivalOffsetMinutes' ? 'arrivalOffsetMinutes' : 'name'
    }
    else editorError.value = issue.message
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
            <p class="mt-1 truncate text-xs text-muted-foreground" :title="station.arrivalGateIds.map(gateLabel).join('、')">到达检票口：{{ station.arrivalGateIds.length ? station.arrivalGateIds.map(gateLabel).join('、') : '未绑定' }}</p>
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
        <div><h3 id="station-editor-heading" class="font-semibold">{{ editorMode === 'create' ? '新增站点' : '编辑站点' }}</h3><p class="mt-1 text-xs text-muted-foreground">定位必填，使用“经度,纬度”格式。</p></div>
        <Button type="button" variant="ghost" size="icon-lg" class="h-11 w-11" aria-label="关闭站点编辑区" @click="cancelEditor"><X aria-hidden="true" /></Button>
      </div>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div class="space-y-2 sm:col-span-2"><Label for="station-name">站点名称 <span class="text-destructive">*</span></Label><Input id="station-name" v-model="editor.name" class="h-11" placeholder="例如：体育中心东门站" :disabled="saving" :aria-invalid="editorErrorField === 'name'" /></div>
        <div class="space-y-2 sm:col-span-2"><Label for="station-coordinate">定位（经度,纬度） <span class="text-destructive">*</span></Label><Input id="station-coordinate" v-model="editor.coordinate" class="h-11 font-mono" placeholder="例如：113.1462,27.8165" :disabled="saving" :aria-invalid="editorErrorField === 'coordinate'" /><p class="text-xs text-muted-foreground">坐标系为 GCJ-02，用于地图点位、距离计算和导航。</p></div>
        <div class="space-y-2"><Label for="station-address">导航地址</Label><Input id="station-address" v-model="editor.navigationAddress" class="h-11" placeholder="选填导航位置说明" :disabled="saving" /></div>
        <div class="space-y-2"><Label for="station-offset">到达偏移（分钟）</Label><Input id="station-offset" v-model="editor.arrivalOffsetMinutes" type="number" min="0" step="1" class="h-11 tabular-nums" placeholder="选填" :disabled="saving" :aria-invalid="editorErrorField === 'arrivalOffsetMinutes'" /></div>
        <div class="space-y-2 sm:col-span-2">
          <Label>到达检票口</Label>
          <p class="text-xs text-muted-foreground">可多选，作为 H5 从接驳站前往检票口的路线依据。</p>
          <div v-if="ticketGatesLoading" class="flex items-center gap-2 rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground"><LoaderCircle class="size-4 animate-spin" aria-hidden="true" />检票口加载中</div>
          <div v-else-if="ticketGatesError" class="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-3 text-sm text-destructive" role="alert">{{ ticketGatesError }}</div>
          <div v-else-if="!ticketGates.length" class="rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">暂无可选检票口，可先保存站点。</div>
          <div v-else class="grid max-h-48 grid-cols-1 gap-2 overflow-y-auto rounded-lg border bg-background/70 p-3 sm:grid-cols-2">
            <label v-for="gate in ticketGates" :key="gate.id" class="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 hover:bg-muted/40">
              <Checkbox :model-value="editor.arrivalGateIds.includes(gate.id)" :disabled="saving" :aria-label="`选择到达检票口：${gate.code} ${gate.name}`" @update:model-value="toggleArrivalGate(gate.id, $event)" />
              <span class="min-w-0"><span class="block truncate text-sm font-medium">{{ gate.code }} · {{ gate.name }}</span><span class="block text-xs text-muted-foreground">{{ gate.floor }} · {{ gate.status === 'open' ? '开放' : gate.status === 'restricted' ? '受限' : '关闭' }}</span></span>
            </label>
          </div>
          <p v-if="unavailableArrivalGateIds.length" class="text-xs text-warning">已保留 {{ unavailableArrivalGateIds.length }} 个当前不可选的历史检票口关联。</p>
        </div>
      </div>
      <p v-if="editorError" class="mt-3 flex items-center gap-2 text-xs text-destructive" role="alert"><AlertTriangle class="size-4 shrink-0" aria-hidden="true" />{{ editorError }}</p>
      <div class="mt-4 flex justify-end gap-2"><Button type="button" variant="outline" class="h-11" :disabled="saving" @click="cancelEditor">取消编辑</Button><Button type="button" class="h-11" :disabled="saving" @click="commitEditor"><Check aria-hidden="true" />{{ editorMode === 'create' ? '添加到列表' : '更新站点' }}</Button></div>
    </section>
  </div>
</template>
