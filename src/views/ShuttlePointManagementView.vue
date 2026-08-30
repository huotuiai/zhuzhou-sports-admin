<script setup lang="ts">
import type { CrudDialogCloseRequest, CrudDialogMode, DataTableColumn } from '@/components/common'
import type {
  ShuttleRoute,
  ShuttleRouteCreateInput,
  ShuttleRouteQuery,
  ShuttleRouteUpdateInput,
  ShuttleRouteValidationIssue,
  ShuttleStation,
} from '@/modules/shuttle-management/types'
import type { TicketGate } from '@/modules/ticket-gate-management/types'
import { AlertTriangle, BusFront, Clock3, Download, List, LoaderCircle, Map as MapIcon, MapPin, PencilLine, Plus, RotateCcw, Trash2, X } from '@lucide/vue'
import { useEventListener } from '@vueuse/core'
import { computed, nextTick, onMounted, ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { toast } from 'vue-sonner'
import { CrudSheet, DataTable, PaginationBar, QueryPanel } from '@/components/common'
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import ShuttleRouteForm from '@/modules/shuttle-management/components/ShuttleRouteForm.vue'
import ShuttleRouteMapView from '@/modules/shuttle-management/components/ShuttleRouteMapView.vue'
import ShuttleStationConfig from '@/modules/shuttle-management/components/ShuttleStationConfig.vue'
import { useShuttleRouteStore } from '@/modules/shuttle-management/stores/shuttle-route-store'
import { shuttleDirectionLabel, shuttleOperatingStatusLabel } from '@/modules/shuttle-management/types'
import { ticketGateService } from '@/modules/ticket-gate-management/services/ticket-gate-service'
import { useThemeStore } from '@/stores/theme'

type ViewMode = 'list' | 'map'
type DiscardKind = 'route' | 'stations'

const columns: readonly DataTableColumn<ShuttleRoute>[] = [
  { key: 'code', label: '线路编号', width: '112px' },
  { key: 'name', label: '线路名称', minWidth: '190px' },
  { key: 'direction', label: '方向', width: '92px', align: 'center' },
  { key: 'stations', label: '站点数', width: '104px', align: 'center' },
  { key: 'schedule', label: '首末班', minWidth: '150px' },
  { key: 'interval', label: '发车间隔', width: '110px', align: 'center' },
  { key: 'duration', label: '全程时长', width: '110px', align: 'center' },
  { key: 'operatingStatus', label: '运营状态', width: '112px', align: 'center' },
  { key: 'sortOrder', label: '排序', width: '82px', align: 'center' },
  { key: 'actions', label: '操作', width: '244px', align: 'right' },
]

const store = useShuttleRouteStore()
const themeStore = useThemeStore()
const viewMode = ref<ViewMode>('list')
const queryDraft = ref<ShuttleRouteQuery>({ ...store.query })
const routeOpen = ref(false)
const routeMode = ref<CrudDialogMode>('create')
const editingId = ref<string | null>(null)
const routeValue = ref<ShuttleRouteCreateInput>(emptyRoute())
const routeInitial = ref<ShuttleRouteCreateInput>(emptyRoute())
const routeIssues = ref<readonly ShuttleRouteValidationIssue[]>([])
const routeFormRef = ref<{ validateAndFocus(): boolean } | null>(null)
const stationOpen = ref(false)
const stationRouteId = ref<string | null>(null)
const stationValue = ref<ShuttleStation[]>([])
const stationInitial = ref<ShuttleStation[]>([])
const stationEditorDirty = ref(false)
const stationFormRef = ref<{ validateAndCommit(): boolean } | null>(null)
const discardKind = ref<DiscardKind | null>(null)
const directionConfirmOpen = ref(false)
const deleteTarget = ref<ShuttleRoute | null>(null)
const ticketGates = ref<TicketGate[]>([])
const ticketGatesLoading = ref(false)
const ticketGatesError = ref('')
const loadError = ref('')

const routeDirty = computed(() => JSON.stringify(routeValue.value) !== JSON.stringify(routeInitial.value))
const stationDirty = computed(() => stationEditorDirty.value || JSON.stringify(stationValue.value) !== JSON.stringify(stationInitial.value))
const stationRoute = computed(() => store.records.find((item) => item.id === stationRouteId.value) ?? null)
const hasQuery = computed(() => Boolean(store.query.keyword || store.query.direction !== 'all' || store.query.operatingStatus !== 'all'))

function emptyRoute(): ShuttleRouteCreateInput {
  return {
    code: '',
    name: '',
    direction: 'inbound',
    description: '',
    firstDeparture: '08:00',
    lastDeparture: '22:00',
    departureIntervalMinutes: 10,
    durationMinutes: 45,
    operatingStatus: 'operating',
    sortOrder: 0,
    enabled: true,
  }
}

function cloneRouteInput(value: ShuttleRouteCreateInput): ShuttleRouteCreateInput {
  return { ...value }
}

function cloneStations(stations: readonly ShuttleStation[]): ShuttleStation[] {
  return stations.map((station) => ({ ...station, point: station.point ? { ...station.point } : null, arrivalGateIds: [...station.arrivalGateIds] }))
}

function toRouteInput(route: ShuttleRoute): ShuttleRouteCreateInput {
  return {
    code: route.code,
    name: route.name,
    direction: route.direction,
    description: route.description,
    firstDeparture: route.firstDeparture,
    lastDeparture: route.lastDeparture,
    departureIntervalMinutes: route.departureIntervalMinutes,
    durationMinutes: route.durationMinutes,
    operatingStatus: route.operatingStatus,
    sortOrder: route.sortOrder,
    enabled: route.enabled,
  }
}

function toUpdateInput(value: ShuttleRouteCreateInput): ShuttleRouteUpdateInput {
  return {
    name: value.name,
    direction: value.direction,
    description: value.description,
    firstDeparture: value.firstDeparture,
    lastDeparture: value.lastDeparture,
    departureIntervalMinutes: value.departureIntervalMinutes,
    durationMinutes: value.durationMinutes,
    operatingStatus: value.operatingStatus,
    sortOrder: value.sortOrder,
    enabled: value.enabled,
  }
}

function operatingClass(route: ShuttleRoute): string {
  if (route.operatingStatus === 'operating') return 'border-success/30 bg-success/10 text-success'
  if (route.operatingStatus === 'partial') return 'border-warning/30 bg-warning/10 text-warning'
  return 'border-border bg-muted text-muted-foreground'
}

function nextSortOrder(): number {
  return store.records.reduce((maximum, route) => Math.max(maximum, route.sortOrder), 0) + 1
}

function openCreate(): void {
  store.resetError()
  routeMode.value = 'create'
  editingId.value = null
  const value = { ...emptyRoute(), sortOrder: nextSortOrder() }
  routeValue.value = cloneRouteInput(value)
  routeInitial.value = cloneRouteInput(value)
  routeIssues.value = []
  routeOpen.value = true
}

function openEdit(route: ShuttleRoute): void {
  store.resetError()
  routeMode.value = 'edit'
  editingId.value = route.id
  const value = toRouteInput(route)
  routeValue.value = cloneRouteInput(value)
  routeInitial.value = cloneRouteInput(value)
  routeIssues.value = []
  routeOpen.value = true
}

function updateRoute(value: ShuttleRouteCreateInput): void {
  routeValue.value = value
  routeIssues.value = []
  store.resetError()
}

function closeRoute(): void {
  routeOpen.value = false
  editingId.value = null
  routeIssues.value = []
  directionConfirmOpen.value = false
  if (discardKind.value === 'route') discardKind.value = null
}

function requestRouteClose(request: CrudDialogCloseRequest): void {
  if (request.dirty) discardKind.value = 'route'
  else closeRoute()
}

function openStations(route: ShuttleRoute): void {
  store.resetError()
  stationRouteId.value = route.id
  stationValue.value = cloneStations(route.stations)
  stationInitial.value = cloneStations(route.stations)
  stationEditorDirty.value = false
  stationOpen.value = true
}

function closeStations(): void {
  stationOpen.value = false
  stationRouteId.value = null
  stationValue.value = []
  stationInitial.value = []
  stationEditorDirty.value = false
  if (discardKind.value === 'stations') discardKind.value = null
}

function requestStationClose(request: CrudDialogCloseRequest): void {
  if (request.dirty) discardKind.value = 'stations'
  else closeStations()
}

function discardChanges(): void {
  if (discardKind.value === 'route') closeRoute()
  else if (discardKind.value === 'stations') closeStations()
  discardKind.value = null
}

async function persistRoute(): Promise<void> {
  const created = routeMode.value === 'create'
  const saved = created
    ? await store.create(routeValue.value)
    : editingId.value ? await store.update(editingId.value, toUpdateInput(routeValue.value)) : null
  if (!saved) {
    toast.error(store.error ?? '接驳线路保存失败，当前填写内容已保留。')
    return
  }
  closeRoute()
  toast.success(created ? '接驳线路已新增，可继续配置站点。' : '接驳线路已更新。')
}

async function saveRoute(): Promise<void> {
  routeIssues.value = routeMode.value === 'create'
    ? store.validateCreate(routeValue.value).issues
    : store.validateUpdate(toUpdateInput(routeValue.value)).issues
  await nextTick()
  if (!routeFormRef.value?.validateAndFocus() || routeIssues.value.length) return
  const current = editingId.value ? store.records.find((item) => item.id === editingId.value) : null
  if (current && routeValue.value.direction !== routeInitial.value.direction) {
    directionConfirmOpen.value = true
    return
  }
  await persistRoute()
}

async function confirmDirectionSave(): Promise<void> {
  directionConfirmOpen.value = false
  await persistRoute()
}

async function saveStations(): Promise<void> {
  if (!stationRouteId.value || !stationFormRef.value?.validateAndCommit()) return
  await nextTick()
  const validation = store.validateStations(stationValue.value)
  if (!validation.valid) {
    toast.error(validation.issues[0]!.message)
    return
  }
  const saved = await store.replaceStations(stationRouteId.value, stationValue.value)
  if (!saved) {
    toast.error(store.error ?? '站点配置保存失败，当前修改已保留。')
    return
  }
  closeStations()
  toast.success('站点配置已保存。')
}

function requestDelete(route: ShuttleRoute): void {
  deleteTarget.value = route
}

function closeDelete(): void {
  deleteTarget.value = null
}

async function remove(): Promise<void> {
  if (!deleteTarget.value) return
  const target = deleteTarget.value
  if (await store.remove(target.id)) {
    closeDelete()
    toast.success('接驳线路已删除。')
  }
  else toast.error(store.error ?? '删除失败，请稍后重试。')
}

function applyQuery(): void {
  store.setQuery({ ...queryDraft.value })
}

function resetQuery(): void {
  store.resetQuery()
  queryDraft.value = { ...store.query }
}

function downloadCsv(content: Blob, filename: string): void {
  const url = URL.createObjectURL(content)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

async function exportCurrent(): Promise<void> {
  const file = await store.exportCurrent()
  if (!file) {
    toast.error(store.error ?? '接驳线路导出失败。')
    return
  }
  downloadCsv(file.content, file.filename)
  if (file.truncated) {
    const count = file.count ?? 5000
    const total = file.total === null ? '未知' : String(file.total)
    toast.warning(`已导出前 ${count} 条，共 ${total} 条，请缩小筛选范围。`)
  }
  else if (file.count !== null) toast.success(`已导出当前筛选结果，共 ${file.count} 条。`)
  else toast.success('已导出当前筛选结果。')
}

function confirmLeave(): boolean {
  const unsaved = (routeOpen.value && routeDirty.value) || (stationOpen.value && stationDirty.value)
  return !unsaved || window.confirm('当前有未保存的接驳线路或站点修改，确定放弃吗？')
}

function beforeUnload(event: BeforeUnloadEvent): void {
  if (!((routeOpen.value && routeDirty.value) || (stationOpen.value && stationDirty.value))) return
  event.preventDefault()
  event.returnValue = ''
}

async function load(): Promise<void> {
  loadError.value = ''
  ticketGatesLoading.value = true
  ticketGatesError.value = ''
  const [routesLoaded, gateResult] = await Promise.all([
    store.load(),
    ticketGateService.list()
      .then((records) => ({ records, error: '' }))
      .catch((cause: unknown) => ({ records: [] as TicketGate[], error: cause instanceof Error && cause.message ? cause.message : '检票口数据加载失败' })),
  ])
  ticketGates.value = gateResult.records
  ticketGatesError.value = gateResult.error
  ticketGatesLoading.value = false
  if (!routesLoaded) {
    loadError.value = store.error ?? '接驳线路数据加载失败'
    toast.error(loadError.value)
  }
}

onMounted(load)
onBeforeRouteLeave(() => confirmLeave())
useEventListener(window, 'beforeunload', beforeUnload)
</script>

<template>
  <section class="tech-grid min-h-[calc(100svh-4rem)] p-4 sm:p-6" aria-labelledby="shuttle-route-title">
    <div class="mx-auto flex w-full max-w-[1680px] flex-col gap-4">
      <header class="flex flex-wrap items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <span class="grid size-11 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary"><BusFront class="size-5" aria-hidden="true" /></span>
          <div><h1 id="shuttle-route-title" class="text-2xl font-semibold tracking-tight">接驳车管理</h1><p class="mt-1 text-sm text-muted-foreground">接驳线路 / 站点 / 排班</p></div>
        </div>
        <div class="flex items-center gap-2">
          <Button variant="outline" size="lg" class="h-11 px-4" :disabled="store.isLoading || store.isExporting" @click="exportCurrent"><LoaderCircle v-if="store.isExporting" class="animate-spin motion-reduce:animate-none" aria-hidden="true" /><Download v-else aria-hidden="true" />{{ store.isExporting ? '导出中' : '导出' }}</Button>
          <div class="flex rounded-lg border bg-card p-1" role="group" aria-label="视图切换">
            <Button :variant="viewMode === 'list' ? 'secondary' : 'ghost'" size="sm" class="h-9" @click="viewMode = 'list'"><List aria-hidden="true" />列表</Button>
            <Button :variant="viewMode === 'map' ? 'secondary' : 'ghost'" size="sm" class="h-9" @click="viewMode = 'map'"><MapIcon aria-hidden="true" />地图</Button>
          </div>
          <Button size="lg" class="h-11 px-4" @click="openCreate"><Plus aria-hidden="true" />新增线路</Button>
        </div>
      </header>

      <QueryPanel :loading="store.isLoading" @query="applyQuery" @reset="resetQuery">
        <div class="space-y-2"><Label for="shuttle-keyword">关键字</Label><Input id="shuttle-keyword" v-model="queryDraft.keyword" class="h-11" placeholder="线路编号或名称" autocomplete="off" /></div>
        <div class="space-y-2"><Label for="shuttle-direction">线路方向</Label><Select v-model="queryDraft.direction"><SelectTrigger id="shuttle-direction" class="h-11 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部方向</SelectItem><SelectItem value="inbound">进场</SelectItem><SelectItem value="outbound">出场</SelectItem></SelectContent></Select></div>
        <div class="space-y-2"><Label for="shuttle-operating-status">运营状态</Label><Select v-model="queryDraft.operatingStatus"><SelectTrigger id="shuttle-operating-status" class="h-11 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部运营状态</SelectItem><SelectItem value="operating">运营中</SelectItem><SelectItem value="suspended">停运</SelectItem><SelectItem value="partial">部分运营</SelectItem></SelectContent></Select></div>
      </QueryPanel>

      <div v-if="loadError && !store.isLoading" class="flex items-center gap-3 rounded-xl border border-destructive/35 bg-destructive/8 p-4" role="alert"><AlertTriangle class="size-5 shrink-0 text-destructive" aria-hidden="true" /><p class="flex-1 text-sm text-destructive">{{ loadError }}</p><Button variant="outline" class="h-11" @click="load"><RotateCcw aria-hidden="true" />重新加载</Button></div>

      <template v-if="viewMode === 'list'">
        <DataTable :columns="columns" :rows="store.paginatedRecords" row-key="id" :loading="store.isLoading" :empty-text="hasQuery ? '当前查询条件下暂无接驳线路' : '暂无接驳线路，请新增'" caption="接驳线路列表">
          <template #cell-code="{ row }"><span class="rounded-md border bg-muted/35 px-2 py-1 font-mono text-xs font-semibold">{{ row.code }}</span></template>
          <template #cell-name="{ row }"><p class="max-w-52 truncate font-medium" :title="row.name">{{ row.name }}</p><p v-if="row.description" class="mt-1 max-w-52 truncate text-xs text-muted-foreground" :title="row.description">{{ row.description }}</p></template>
          <template #cell-direction="{ row }"><Badge variant="outline" :class="row.direction === 'inbound' ? 'border-primary/30 bg-primary/10 text-primary' : 'border-warning/30 bg-warning/10 text-warning'">{{ shuttleDirectionLabel(row.direction) }}</Badge></template>
          <template #cell-stations="{ row }"><div class="flex flex-col items-center"><span class="font-semibold tabular-nums">{{ row.stations.length }} 站</span><span v-if="row.stations.some((station) => !station.point)" class="mt-1 text-[11px] text-warning">{{ row.stations.filter((station) => !station.point).length }} 个缺坐标</span><span v-else-if="row.stations.length" class="mt-1 text-[11px] text-success">坐标完整</span></div></template>
          <template #cell-schedule="{ row }"><div class="flex items-center gap-1.5 whitespace-nowrap font-medium tabular-nums"><Clock3 class="size-4 text-primary" aria-hidden="true" />{{ row.firstDeparture }}–{{ row.lastDeparture }}</div></template>
          <template #cell-interval="{ row }"><span class="tabular-nums">{{ row.departureIntervalMinutes }} 分钟</span></template>
          <template #cell-duration="{ row }"><span class="tabular-nums">{{ row.durationMinutes }} 分钟</span></template>
          <template #cell-operatingStatus="{ row }"><Badge variant="outline" :class="operatingClass(row)">{{ shuttleOperatingStatusLabel(row.operatingStatus) }}</Badge></template>
          <template #cell-sortOrder="{ row }"><span class="tabular-nums text-muted-foreground">{{ row.sortOrder }}</span></template>
          <template #cell-actions="{ row }"><div class="flex justify-end gap-1"><Button variant="ghost" class="h-11 px-3" @click="openEdit(row)"><PencilLine aria-hidden="true" />编辑</Button><Button variant="ghost" class="h-11 px-3" @click="openStations(row)"><MapPin aria-hidden="true" />站点配置</Button><Button variant="ghost" size="icon-lg" class="h-11 w-11 text-destructive hover:text-destructive" :disabled="Boolean(store.deletingId)" :aria-label="`删除${row.name}`" @click="requestDelete(row)"><Trash2 aria-hidden="true" /></Button></div></template>
        </DataTable>
        <PaginationBar :page="store.currentPage" :page-size="store.pageSize" :total="store.total" :disabled="store.isLoading" :page-sizes="[20]" @update:page="store.setPage" @update:page-size="store.setPageSize" />
      </template>

      <ShuttleRouteMapView v-else :records="store.filteredRecords" :theme="themeStore.mode" />
    </div>

    <CrudSheet :open="routeOpen" :mode="routeMode" size="wide" :title="routeMode === 'create' ? '新增接驳线路' : `编辑接驳线路 · ${routeValue.code}`" description="维护线路方向、班次、运营状态和排序；站点保存后单独配置。" :saving="store.isSaving" :dirty="routeDirty" @submit="saveRoute" @request-close="requestRouteClose">
      <ShuttleRouteForm :key="`${routeMode}-${editingId ?? 'new'}`" ref="routeFormRef" :mode="routeMode" :value="routeValue" :issues="routeIssues" :saving="store.isSaving" @update:value="updateRoute" />
    </CrudSheet>

    <CrudSheet :open="stationOpen" mode="edit" size="wide" :title="`站点配置 · ${stationRoute?.code ?? ''}`" :description="stationRoute ? `${stationRoute.name} · ${shuttleDirectionLabel(stationRoute.direction)}，站点定位为必填项。` : '维护线路站点'" submit-label="保存站点" :saving="store.isSaving" :dirty="stationDirty" @submit="saveStations" @request-close="requestStationClose">
      <ShuttleStationConfig v-if="stationRouteId" :key="stationRouteId" ref="stationFormRef" :route-id="stationRouteId" :value="stationValue" :ticket-gates="ticketGates" :ticket-gates-loading="ticketGatesLoading" :ticket-gates-error="ticketGatesError" :saving="store.isSaving" @update:value="stationValue = $event; store.resetError()" @editor-dirty="stationEditorDirty = $event" />
    </CrudSheet>

    <AlertDialog :open="Boolean(discardKind)" @update:open="!$event && (discardKind = null)"><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>放弃未保存的修改？</AlertDialogTitle><AlertDialogDescription>{{ discardKind === 'stations' ? '当前站点顺序或站点信息尚未保存，关闭后将无法恢复。' : '当前接驳线路信息尚未保存，关闭后将无法恢复。' }}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel class="h-11">继续编辑</AlertDialogCancel><Button variant="destructive" class="h-11" @click="discardChanges"><X aria-hidden="true" />放弃修改</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>

    <AlertDialog :open="directionConfirmOpen" @update:open="directionConfirmOpen = $event"><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>确认变更线路方向？</AlertDialogTitle><AlertDialogDescription>方向变更将影响 H5 进出场推荐；该线路现有 {{ store.records.find((item) => item.id === editingId)?.stations.length ?? 0 }} 个站点的方向语义也会同步变更。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel class="h-11">返回检查</AlertDialogCancel><Button class="h-11" :disabled="store.isSaving" @click="confirmDirectionSave">确认变更并保存</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>

    <AlertDialog :open="Boolean(deleteTarget)" @update:open="!$event && closeDelete()"><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>确认删除“{{ deleteTarget?.name }}”？</AlertDialogTitle><AlertDialogDescription>删除后不可恢复，是否确认删除该线路？</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel class="h-11">取消</AlertDialogCancel><Button variant="destructive" class="h-11" :disabled="Boolean(store.deletingId)" @click="remove"><Trash2 aria-hidden="true" />{{ store.deletingId ? '删除中' : '确认删除' }}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>
</template>
