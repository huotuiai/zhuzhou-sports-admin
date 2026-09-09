<script setup lang="ts">
import type { ShuttleStation } from '../types'
import type { TicketGate } from '@/modules/ticket-gate-management/types'
import { computed, reactive, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
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
  vrUrl: string
  inboundCoordinate: string
  inboundNavigationAddress: string
  outboundCoordinate: string
  outboundNavigationAddress: string
  arrivalGateIds: string[]
}

const emptyEditor = (): StationEditor => ({ name: '', vrUrl: '', inboundCoordinate: '', inboundNavigationAddress: '', outboundCoordinate: '', outboundNavigationAddress: '', arrivalGateIds: [] })
const editorMode = ref<EditorMode | null>(null)
const editingId = ref<string | null>(null)
const editor = reactive<StationEditor>(emptyEditor())
const editorInitial = ref<StationEditor>(emptyEditor())
const editorError = ref('')
const editorErrorField = ref<keyof StationEditor | ''>('')
const editorDirty = computed(() => editorMode.value !== null && JSON.stringify(editor) !== JSON.stringify(editorInitial.value))
const missingCoordinateCount = computed(() => props.value.filter((station) => !station.point || !station.outboundPoint).length)
const ticketGateById = computed(() => new Map(props.ticketGates.map((gate) => [gate.id, gate])))
const unavailableArrivalGateIds = computed(() => editor.arrivalGateIds.filter((id) => !ticketGateById.value.has(id)))

function cloneEditor(value: StationEditor): StationEditor {
  return { ...value, arrivalGateIds: [...value.arrivalGateIds] }
}

function cloneStation(station: ShuttleStation): ShuttleStation {
  return {
    ...station,
    point: station.point ? { ...station.point } : null,
    navigationAddress: station.navigationAddress,
    outboundPoint: station.outboundPoint ? { ...station.outboundPoint } : null,
    outboundNavigationAddress: station.outboundNavigationAddress ?? '',
    arrivalGateIds: [...station.arrivalGateIds],
  }
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
    vrUrl: station.vrUrl ?? '',
    inboundCoordinate: station.point ? serializeGeoPoint(station.point) : '',
    inboundNavigationAddress: station.navigationAddress,
    outboundCoordinate: station.outboundPoint ? serializeGeoPoint(station.outboundPoint) : '',
    outboundNavigationAddress: station.outboundNavigationAddress ?? '',
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

function commitEditor(): ShuttleStation[] | null {
  editorError.value = ''
  editorErrorField.value = ''
  const name = editor.name.trim()
  if (!name) {
    editorError.value = '请输入站点名称'
    editorErrorField.value = 'name'
    return null
  }
  const points: Pick<ShuttleStation, 'point' | 'outboundPoint'> = { point: null, outboundPoint: null }
  for (const [field, pointField, label] of [
    ['inboundCoordinate', 'point', '入场'],
    ['outboundCoordinate', 'outboundPoint', '离场'],
  ] as const) {
    if (!editor[field].trim()) {
      editorError.value = `请输入${label}定位经纬度`
      editorErrorField.value = field
      return null
    }
    try {
      points[pointField] = parseGeoPointInput(editor[field])
    }
    catch (error) {
      editorError.value = `${label}定位：${error instanceof Error ? error.message : '请输入合法的经度,纬度'}`
      editorErrorField.value = field
      return null
    }
  }
  const station: ShuttleStation = {
    ...props.value.find((item) => item.id === editingId.value),
    id: editingId.value ?? createClientId(),
    name,
    ...points,
    navigationAddress: editor.inboundNavigationAddress.trim(),
    vrUrl: editor.vrUrl.trim(),
    outboundNavigationAddress: editor.outboundNavigationAddress.trim(),
    arrivalGateIds: [...editor.arrivalGateIds],
  }
  const next = editorMode.value === 'edit'
    ? props.value.map((item) => item.id === editingId.value ? station : cloneStation(item))
    : [...props.value.map(cloneStation), station]
  const validation = validateShuttleStations([station])
  if (!validation.valid) {
    editorError.value = validation.issues[0]!.message
    if (validation.issues[0]!.field === 'vrUrl') editorErrorField.value = 'vrUrl'
    return null
  }
  emit('update:value', next)
  cancelEditor()
  return next
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
  if (props.value.length <= 1) {
    toast.error('每条线路至少保留 1 个站点')
    return
  }
  emit('update:value', props.value.filter((item) => item.id !== station.id).map(cloneStation))
  if (editingId.value === station.id) cancelEditor()
}

function validateAndCommit(): boolean {
  let stations = props.value
  if (editorMode.value && editorDirty.value) {
    const committed = commitEditor()
    if (!committed) return false
    stations = committed
  }
  else if (editorMode.value) cancelEditor()
  const result = validateShuttleStations(stations)
  if (!result.valid) {
    const issue = result.issues[0]!
    const station = issue.stationId ? stations.find((item) => item.id === issue.stationId) : null
    if (station) {
      beginEdit(station)
      editorError.value = issue.message
      editorErrorField.value = issue.field === 'point' ? 'inboundCoordinate' : issue.field === 'outboundPoint' ? 'outboundCoordinate' : issue.field === 'vrUrl' ? 'vrUrl' : 'name'
    }
    else {
      editorError.value = issue.message
      toast.error(issue.message)
    }
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
          <p class="mt-1 text-xs text-muted-foreground">通过上移、下移调整地图连线顺序，请按入场方向配置站点顺序。</p>
        </div>
        <Button type="button" variant="outline" class="h-11" :disabled="saving || value.length >= 20" @click="beginCreate"><Plus aria-hidden="true" />新增站点</Button>
      </div>

      <div class="space-y-2">
        <div v-if="!value.length" class="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">暂未配置站点，可先保存空线路，稍后补充。</div>
        <article v-for="(station, index) in value" :key="station.id" :class="['flex flex-col gap-3 rounded-xl border p-3 transition-colors sm:flex-row sm:items-center', editingId === station.id ? 'border-primary/45 bg-primary/5' : 'bg-card/70 hover:bg-muted/25']">
          <span class="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold tabular-nums text-primary">{{ index + 1 }}</span>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2"><p class="font-medium">{{ station.name }}</p><Badge v-if="station.point && station.outboundPoint" variant="outline" class="text-success">已定位</Badge><Badge v-else variant="secondary">缺少坐标</Badge></div>
            <p class="mt-1 break-all text-xs text-muted-foreground">入场定位：{{ station.point ? serializeGeoPoint(station.point) : '未配置坐标' }} · 入场导航：{{ station.navigationAddress || '未配置' }}</p>
            <p class="mt-1 break-all text-xs text-muted-foreground">离场定位：{{ station.outboundPoint ? serializeGeoPoint(station.outboundPoint) : '未配置坐标' }} · 离场导航：{{ station.outboundNavigationAddress || '未配置' }}</p>
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
        {{ missingCoordinateCount ? `${missingCoordinateCount} 个站点未完整配置入场、离场坐标，请补齐后保存。` : '全部站点均已配置坐标。' }}
      </div>
    </section>

    <section v-if="editorMode" class="rounded-xl border border-primary/25 bg-primary/4 p-4" aria-labelledby="station-editor-heading">
      <div class="mb-4 flex items-center justify-between gap-3">
        <div><h3 id="station-editor-heading" class="font-semibold">{{ editorMode === 'create' ? '新增站点' : '编辑站点' }}</h3><p class="mt-1 text-xs text-muted-foreground">入场、离场定位均为必填项，使用“经度,纬度”格式。</p></div>
        <Button type="button" variant="ghost" size="icon-lg" class="h-11 w-11" aria-label="关闭站点编辑区" @click="cancelEditor"><X aria-hidden="true" /></Button>
      </div>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div class="space-y-2 sm:col-span-2"><Label for="station-name">站点名称 <span class="text-destructive">*</span></Label><Input id="station-name" v-model="editor.name" class="h-11" placeholder="例如：体育中心东门站" :disabled="saving" :aria-invalid="editorErrorField === 'name'" /></div>
        <div class="space-y-2"><Label for="station-inbound-coordinate">入场定位（经度,纬度） <span class="text-destructive">*</span></Label><Input id="station-inbound-coordinate" v-model="editor.inboundCoordinate" class="h-11 font-mono" placeholder="例如：113.1462,27.8165" :disabled="saving" :aria-invalid="editorErrorField === 'inboundCoordinate'" /></div>
        <div class="space-y-2"><Label for="station-inbound-address">入场导航地址（选填）</Label><Input id="station-inbound-address" v-model="editor.inboundNavigationAddress" class="h-11" placeholder="请输入导航地址" :disabled="saving" /></div>
        <div class="space-y-2"><Label for="station-outbound-coordinate">离场定位（经度,纬度） <span class="text-destructive">*</span></Label><Input id="station-outbound-coordinate" v-model="editor.outboundCoordinate" class="h-11 font-mono" placeholder="例如：113.1462,27.8165" :disabled="saving" :aria-invalid="editorErrorField === 'outboundCoordinate'" /></div>
        <div class="space-y-2"><Label for="station-outbound-address">离场导航地址（选填）</Label><Input id="station-outbound-address" v-model="editor.outboundNavigationAddress" class="h-11" placeholder="选填导航链接" :disabled="saving" /></div>
        <div class="space-y-2 sm:col-span-2">
          <Label for="station-vr-url">VR 链接（选填）</Label>
          <Input id="station-vr-url" v-model="editor.vrUrl" data-field="vrUrl" type="url" class="h-11" placeholder="https://" :disabled="saving" :aria-invalid="editorErrorField === 'vrUrl'" />
          <p class="text-xs text-muted-foreground">填写此位置的 HTTP 或 HTTPS 链接；留空不配置，清空后保存可移除已有链接。</p>
        </div>
        <div class="space-y-2 sm:col-span-2">
          <Label>可达检票口</Label>
          <p class="text-xs text-muted-foreground">可多选，作为 H5 从接驳站前往检票口的路线依据。</p>
          <div v-if="ticketGatesLoading" class="flex items-center gap-2 rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground"><LoaderCircle class="size-4 animate-spin" aria-hidden="true" />检票口加载中</div>
          <div v-else-if="ticketGatesError" class="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-3 text-sm text-destructive" role="alert">{{ ticketGatesError }}</div>
          <div v-else-if="!ticketGates.length" class="rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">暂无可选检票口，可先保存站点。</div>
          <div v-else class="grid max-h-48 grid-cols-1 gap-2 overflow-y-auto rounded-lg border bg-background/70 p-3 sm:grid-cols-2">
            <label v-for="gate in ticketGates" :key="gate.id" class="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 hover:bg-muted/40">
              <Checkbox :model-value="editor.arrivalGateIds.includes(gate.id)" :disabled="saving" :aria-label="`选择可达检票口：${gate.code} ${gate.name}`" @update:model-value="toggleArrivalGate(gate.id, $event)" />
              <span class="min-w-0"><span class="block truncate text-sm font-medium">{{ gate.code }} · {{ gate.name }}</span><span class="block text-xs text-muted-foreground">{{ gate.floorName }} · {{ gate.status === 'open' ? '开放' : gate.status === 'restricted' ? '受限' : '关闭' }}</span></span>
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
