<script setup lang="ts">
import type { CrudDialogCloseRequest, CrudDialogMode, DataTableColumn } from '@/components/common'
import type { TrafficControl, TrafficControlPublishStatus, TrafficControlQuery, TrafficControlTimeStatus, TrafficControlValidationIssue, TrafficControlWriteInput } from '@/modules/traffic-control/types'
import { AlertTriangle, Download, Ellipsis, List, LoaderCircle, Map as MapIcon, MapPinned, PencilLine, Pin, PinOff, Plus, RotateCcw, Trash2, X } from '@lucide/vue'
import { useEventListener, useNow } from '@vueuse/core'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { toast } from 'vue-sonner'
import { CrudSheet, DataTable, PaginationBar, QueryPanel } from '@/components/common'
import { cloneGeometry } from '@/components/map/geometry'
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import TrafficControlForm from '@/modules/traffic-control/components/TrafficControlForm.vue'
import TrafficControlMapView from '@/modules/traffic-control/components/TrafficControlMapView.vue'
import { deriveTrafficControlTimeStatus, useTrafficControlStore } from '@/modules/traffic-control/stores/traffic-control-store'
import { TRAFFIC_CONTROL_TYPES, TRAFFIC_PUBLISH_STATUS_LABELS, TRAFFIC_TIME_STATUS_LABELS, trafficControlTypeMeta } from '@/modules/traffic-control/types'
import { useThemeStore } from '@/stores/theme'
import { useAuthStore } from '@/stores/auth'

type ViewMode = 'list' | 'map'

const baseColumns: readonly DataTableColumn<TrafficControl>[] = [
  { key: 'code', label: '管制编号', width: '110px' },
  { key: 'title', label: '标题', minWidth: '210px' },
  { key: 'type', label: '类型', width: '112px', align: 'center' },
  { key: 'areaName', label: '区域名称', minWidth: '180px' },
  { key: 'timeRange', label: '时间范围', minWidth: '230px' },
  { key: 'timeStatus', label: '管制状态', width: '112px', align: 'center' },
  { key: 'publishStatus', label: '状态', width: '100px', align: 'center' },
  { key: 'pinned', label: '置顶', width: '80px', align: 'center' },
  { key: 'publishAt', label: '发布时间', width: '150px' },
  { key: 'publisher', label: '发布人', width: '100px' },
  { key: 'actions', label: '操作', width: '156px', align: 'right' },
]

const store = useTrafficControlStore()
const authStore = useAuthStore()
const themeStore = useThemeStore()
const canOperate = computed(() => authStore.hasPermission('control:operate'))
const canExport = computed(() => authStore.hasPermission('control:export'))
const columns = computed(() => canOperate.value ? baseColumns : baseColumns.filter(column => column.key !== 'actions'))
const now = useNow({ interval: 30_000 })
const viewMode = ref<ViewMode>('list')
const queryDraft = ref<TrafficControlQuery>({ ...store.query })
const formOpen = ref(false)
const formMode = ref<CrudDialogMode>('create')
const editingId = ref<string | null>(null)
const formPublishAt = ref<string | null>(null)
const formValue = ref<TrafficControlWriteInput>(emptyForm())
const initialValue = ref<TrafficControlWriteInput>(emptyForm())
const issues = ref<readonly TrafficControlValidationIssue[]>([])
const formRef = ref<{ validateAndFocus(): boolean } | null>(null)
const discardOpen = ref(false)
const deleteTarget = ref<TrafficControl | null>(null)
const statusTarget = ref<{ record: TrafficControl, action: 'publish' | 'revoke' } | null>(null)
const overlapResult = ref<TrafficControl | null>(null)
const historicalConfirmOpen = ref(false)
const loadError = ref('')

const formDirty = computed(() => JSON.stringify(formValue.value) !== JSON.stringify(initialValue.value))
const hasQuery = computed(() => Boolean(store.query.keyword || store.query.type !== 'all' || store.query.publishStatus !== 'all' || store.query.timeStatus !== 'all' || store.query.dateStart || store.query.dateEnd))

function localDateTime(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function emptyForm(): TrafficControlWriteInput {
  const start = new Date(Date.now() + 60 * 60_000)
  start.setMinutes(Math.ceil(start.getMinutes() / 15) * 15, 0, 0)
  const end = new Date(start.getTime() + 3 * 60 * 60_000)
  return { title: '', type: 'road-closure', areaName: '', startAt: localDateTime(start), endAt: localDateTime(end), detourInstructions: '', geometry: null, pinned: false, sortOrder: 50 }
}

function toWriteInput(item: TrafficControl): TrafficControlWriteInput {
  return {
    title: item.title,
    type: item.type,
    areaName: item.areaName,
    startAt: localDateTime(new Date(item.startAt)),
    endAt: localDateTime(new Date(item.endAt)),
    detourInstructions: item.detourInstructions,
    geometry: item.geometry ? cloneGeometry(item.geometry) : null,
    pinned: item.pinned,
    sortOrder: item.sortOrder,
  }
}

function cloneWriteInput(value: TrafficControlWriteInput): TrafficControlWriteInput {
  return {
    ...value,
    geometry: value.geometry ? cloneGeometry(value.geometry) : null,
  }
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))
}

function timeStatus(item: TrafficControl): TrafficControlTimeStatus {
  return deriveTrafficControlTimeStatus(item, now.value)
}

function timeStatusClass(status: TrafficControlTimeStatus): string {
  if (status === 'active') return 'border-success/30 bg-success/10 text-success'
  if (status === 'upcoming') return 'border-primary/30 bg-primary/10 text-primary'
  return 'border-border bg-muted/50 text-muted-foreground'
}

function publishStatusClass(status: TrafficControlPublishStatus): string {
  if (status === 'published') return 'border-success/30 bg-success/10 text-success'
  if (status === 'draft') return 'border-warning/30 bg-warning/10 text-warning'
  return 'border-border bg-muted/50 text-muted-foreground line-through'
}

async function exportAll(): Promise<void> {
  if (!canExport.value) return
  const file = await store.exportAll()
  if (!file) {
    toast.error(store.error ?? '交通管制导出失败。')
    return
  }
  const url = URL.createObjectURL(file.content)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = file.filename
  anchor.click()
  URL.revokeObjectURL(url)
  toast.success('已导出全部交通管制数据。')
}

function openCreate(): void {
  if (!canOperate.value) return
  store.resetError()
  formMode.value = 'create'
  editingId.value = null
  formPublishAt.value = null
  const value = emptyForm()
  formValue.value = cloneWriteInput(value)
  initialValue.value = cloneWriteInput(value)
  issues.value = []
  formOpen.value = true
}

async function openEdit(item: TrafficControl): Promise<void> {
  if (!canOperate.value) return
  store.resetError()
  const detail = await store.get(item.id)
  if (!detail) {
    toast.error(store.error ?? '交通管制详情加载失败。')
    return
  }
  formMode.value = 'edit'
  editingId.value = detail.id
  formPublishAt.value = detail.publishAt
  const value = toWriteInput(detail)
  formValue.value = cloneWriteInput(value)
  initialValue.value = cloneWriteInput(value)
  issues.value = []
  formOpen.value = true
}

function updateForm(value: TrafficControlWriteInput): void {
  formValue.value = value
  issues.value = []
  store.resetError()
}

function closeForm(): void {
  formOpen.value = false
  editingId.value = null
  formPublishAt.value = null
  issues.value = []
  discardOpen.value = false
  historicalConfirmOpen.value = false
}

function requestFormClose(request: CrudDialogCloseRequest): void {
  if (request.dirty) discardOpen.value = true
  else closeForm()
}

async function refreshMapIfNeeded(): Promise<void> {
  if (viewMode.value !== 'map') return
  if (!await store.loadMap()) toast.error(store.error ?? '交通管制地图数据加载失败。')
}

async function applyQuery(): Promise<void> {
  if (queryDraft.value.dateStart && queryDraft.value.dateEnd && queryDraft.value.dateStart > queryDraft.value.dateEnd) {
    toast.error('查询开始日期不能晚于结束日期。')
    return
  }
  if (!await store.setQuery({ ...queryDraft.value })) {
    toast.error(store.error ?? '交通管制查询失败。')
    return
  }
  loadError.value = ''
  await refreshMapIfNeeded()
}

async function resetQuery(): Promise<void> {
  if (!await store.resetQuery()) {
    toast.error(store.error ?? '交通管制查询重置失败。')
    return
  }
  loadError.value = ''
  queryDraft.value = { ...store.query }
  await refreshMapIfNeeded()
}

async function changePageSize(value: number): Promise<void> {
  if (!await store.setPageSize(value)) toast.error(store.error ?? '交通管制分页加载失败。')
}

async function persistSave(): Promise<void> {
  if (!canOperate.value) return
  const created = formMode.value === 'create'
  const saved = created
    ? await store.create(formValue.value)
    : editingId.value ? await store.update(editingId.value, formValue.value) : null
  if (!saved) {
    toast.error(store.error ?? '交通管制保存失败，当前填写内容已保留。')
    return
  }
  closeForm()
  toast.success(created ? '交通管制已新增。' : '交通管制已更新。')
}

async function save(): Promise<void> {
  issues.value = store.validate(formValue.value, formMode.value).issues
  await nextTick()
  if (!formRef.value?.validateAndFocus() || issues.value.length) return
  if (formMode.value === 'edit' && Date.parse(formValue.value.endAt) <= Date.now()) {
    historicalConfirmOpen.value = true
    return
  }
  await persistSave()
}

async function confirmHistoricalSave(): Promise<void> {
  historicalConfirmOpen.value = false
  await persistSave()
}

async function togglePinned(item: TrafficControl): Promise<void> {
  if (!canOperate.value) return
  const updated = await store.togglePinned(item)
  if (updated) toast.success(updated.pinned ? '已置顶该管制。' : '已取消置顶。')
  else toast.error(store.error ?? '置顶状态更新失败。')
}

async function confirmStatusChange(): Promise<void> {
  if (!canOperate.value) return
  const target = statusTarget.value
  if (!target) return
  const updated = target.action === 'publish'
    ? await store.publish(target.record)
    : await store.revoke(target.record)
  if (!updated) {
    toast.error(store.error ?? (target.action === 'publish' ? '发布失败。' : '撤销失败。'))
    return
  }
  statusTarget.value = null
  if (target.action === 'publish' && updated.overlaps.length) overlapResult.value = updated
  else toast.success(target.action === 'publish' ? '管制已发布。' : '管制已撤销。')
}

async function remove(): Promise<void> {
  if (!canOperate.value || !deleteTarget.value) return
  if (await store.remove(deleteTarget.value.id)) {
    deleteTarget.value = null
    toast.success('交通管制已删除。')
  }
  else toast.error(store.error ?? '删除失败，请稍后重试。')
}

function confirmLeave(): boolean {
  return !(formOpen.value && formDirty.value) || window.confirm('当前有未保存的交通管制修改，确定放弃吗？')
}

function beforeUnload(event: BeforeUnloadEvent): void {
  if (!formOpen.value || !formDirty.value) return
  event.preventDefault()
  event.returnValue = ''
}

async function load(): Promise<void> {
  loadError.value = ''
  if (!await store.load()) {
    loadError.value = store.error ?? '交通管制数据加载失败'
    toast.error(loadError.value)
  }
}

watch(now, () => store.refreshTime())
watch(viewMode, async (mode) => {
  if (mode !== 'map') return
  if (!await store.loadMap()) toast.error(store.error ?? '交通管制地图数据加载失败。')
})
onMounted(load)
onBeforeRouteLeave(() => confirmLeave())
useEventListener(window, 'beforeunload', beforeUnload)
</script>

<template>
  <section class="tech-grid min-h-[calc(100svh-4rem)] p-6" aria-labelledby="traffic-control-title">
    <div class="mx-auto flex w-full max-w-[1680px] flex-col gap-4">
      <header class="flex flex-wrap items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <span class="grid size-11 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary"><MapPinned class="size-5" aria-hidden="true" /></span>
          <div><h1 id="traffic-control-title" class="text-2xl font-semibold tracking-tight">交通管制管理</h1><p class="mt-1 text-sm text-muted-foreground">交警管制信息发布</p></div>
        </div>
        <div class="flex items-center gap-2">
          <div class="flex rounded-lg border bg-card p-1" role="group" aria-label="视图切换">
            <Button :variant="viewMode === 'list' ? 'secondary' : 'ghost'" size="sm" class="h-9" :aria-pressed="viewMode === 'list'" @click="viewMode = 'list'">
              <List aria-hidden="true" />列表
            </Button>
            <Button :variant="viewMode === 'map' ? 'secondary' : 'ghost'" size="sm" class="h-9" :aria-pressed="viewMode === 'map'" @click="viewMode = 'map'">
              <MapIcon aria-hidden="true" />地图
            </Button>
          </div>
          <Button v-if="canOperate" size="lg" class="h-11 px-4" @click="openCreate"><Plus aria-hidden="true" />新增管制</Button>
          <Button v-if="canExport" variant="outline" size="lg" class="h-11" :disabled="store.isExporting" @click="exportAll"><LoaderCircle v-if="store.isExporting" class="animate-spin" aria-hidden="true" /><Download v-else aria-hidden="true" />{{ store.isExporting ? '导出中' : '导出全部' }}</Button>
        </div>
      </header>

      <QueryPanel :loading="store.isLoading" @query="applyQuery" @reset="resetQuery">
        <div class="space-y-2"><Label for="traffic-type">管制类型</Label><Select v-model="queryDraft.type"><SelectTrigger id="traffic-type" class="h-11 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部类型</SelectItem><SelectItem v-for="item in TRAFFIC_CONTROL_TYPES" :key="item.value" :value="item.value">{{ item.label }}</SelectItem></SelectContent></Select></div>
        <div class="space-y-2"><Label for="traffic-publish-status">发布状态</Label><Select :model-value="queryDraft.publishStatus" @update:model-value="queryDraft.publishStatus = $event as TrafficControlPublishStatus | 'all'"><SelectTrigger id="traffic-publish-status" class="h-11 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部状态</SelectItem><SelectItem value="draft">草稿</SelectItem><SelectItem value="published">已发布</SelectItem><SelectItem value="revoked">已撤销</SelectItem></SelectContent></Select></div>
        <div class="space-y-2"><Label for="traffic-status">管制状态</Label><Select :model-value="queryDraft.timeStatus" @update:model-value="queryDraft.timeStatus = $event as TrafficControlTimeStatus | 'all'"><SelectTrigger id="traffic-status" class="h-11 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部状态</SelectItem><SelectItem value="active">进行中</SelectItem><SelectItem value="upcoming">即将开始</SelectItem><SelectItem value="ended">已结束</SelectItem></SelectContent></Select></div>
        <div class="space-y-2"><Label for="traffic-date-start">查询开始日期</Label><Input id="traffic-date-start" v-model="queryDraft.dateStart" type="date" class="h-11" /></div>
        <div class="space-y-2"><Label for="traffic-date-end">查询结束日期</Label><Input id="traffic-date-end" v-model="queryDraft.dateEnd" type="date" class="h-11" /></div>
        <div class="space-y-2"><Label for="traffic-keyword">关键字</Label><Input id="traffic-keyword" v-model="queryDraft.keyword" class="h-11" placeholder="标题 / 区域关键字" autocomplete="off" @keydown.enter.prevent="applyQuery" /></div>
      </QueryPanel>

      <div v-if="loadError && !store.isLoading" class="flex items-center gap-3 rounded-xl border border-destructive/35 bg-destructive/8 p-4" role="alert"><AlertTriangle class="size-5 shrink-0 text-destructive" aria-hidden="true" /><p class="flex-1 text-sm text-destructive">{{ loadError }}</p><Button variant="outline" size="lg" class="h-11" @click="load"><RotateCcw aria-hidden="true" />重新加载</Button></div>

      <template v-if="viewMode === 'list'">
        <DataTable :columns="columns" :rows="store.paginatedRecords" row-key="id" :loading="store.isLoading" :empty-text="hasQuery ? '当前查询条件下暂无交通管制' : '暂无交通管制，请新增'" caption="交通管制列表">
          <template #cell-code="{ row }"><span class="rounded-md border bg-muted/35 px-2 py-1 font-mono text-xs font-semibold">{{ row.code }}</span></template>
          <template #cell-title="{ row }"><p class="max-w-64 truncate font-medium" :title="row.title">{{ row.title }}</p><p v-if="!row.geometry" class="mt-1 text-xs text-warning">未配置地图区域</p></template>
          <template #cell-type="{ row }"><Badge variant="outline" :style="{ borderColor: `${trafficControlTypeMeta(row.type).color}66`, color: trafficControlTypeMeta(row.type).color }">{{ trafficControlTypeMeta(row.type).label }}</Badge></template>
          <template #cell-areaName="{ row }"><p class="max-w-52 truncate" :title="row.areaName">{{ row.areaName }}</p></template>
          <template #cell-timeRange="{ row }"><div class="whitespace-nowrap text-xs tabular-nums"><time :datetime="row.startAt">{{ formatDateTime(row.startAt) }}</time><span class="mx-1.5 text-muted-foreground">–</span><time :datetime="row.endAt">{{ formatDateTime(row.endAt) }}</time></div></template>
          <template #cell-timeStatus="{ row }"><Badge variant="outline" :class="timeStatusClass(timeStatus(row))">{{ TRAFFIC_TIME_STATUS_LABELS[timeStatus(row)] }}</Badge></template>
          <template #cell-publishStatus="{ row }"><Badge variant="outline" :class="publishStatusClass(row.publishStatus)">{{ TRAFFIC_PUBLISH_STATUS_LABELS[row.publishStatus] }}</Badge></template>
          <template #cell-pinned="{ row }"><Pin v-if="row.pinned" class="mx-auto size-4 fill-primary text-primary" aria-label="已置顶" /><span v-else class="text-muted-foreground">—</span></template>
          <template #cell-publishAt="{ row }"><time v-if="row.publishAt" class="whitespace-nowrap text-xs tabular-nums text-muted-foreground" :datetime="row.publishAt">{{ formatDateTime(row.publishAt) }}</time><span v-else class="text-muted-foreground">—</span></template>
          <template #cell-publisher="{ row }"><span class="whitespace-nowrap text-sm">{{ row.publisherId ? `用户 #${row.publisherId}` : '—' }}</span></template>
          <template #cell-actions="{ row }">
            <div class="flex justify-end gap-1">
              <Button variant="ghost" class="h-11 px-3" :disabled="store.detailLoadingId === row.id" @click="openEdit(row)"><LoaderCircle v-if="store.detailLoadingId === row.id" class="animate-spin" aria-hidden="true" /><PencilLine v-else aria-hidden="true" />编辑</Button>
              <DropdownMenu><DropdownMenuTrigger as-child><Button variant="ghost" size="icon-lg" class="h-11 w-11" :aria-label="`${row.title}更多操作`"><Ellipsis aria-hidden="true" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" class="w-44"><DropdownMenuItem class="min-h-10 px-3" :disabled="row.publishStatus === 'revoked'" @select="togglePinned(row)"><PinOff v-if="row.pinned" /><Pin v-else />{{ row.pinned ? '取消置顶' : '置顶' }}</DropdownMenuItem><DropdownMenuItem v-if="row.publishStatus === 'draft'" class="min-h-10 px-3" @select="statusTarget = { record: row, action: 'publish' }">发布</DropdownMenuItem><DropdownMenuItem v-else-if="row.publishStatus === 'published'" class="min-h-10 px-3" @select="statusTarget = { record: row, action: 'revoke' }">撤销</DropdownMenuItem><DropdownMenuItem v-else class="min-h-10 px-3" disabled>已撤销不可再发布</DropdownMenuItem><template v-if="row.publishStatus === 'draft'"><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" class="min-h-10 px-3" @select="deleteTarget = row"><Trash2 />删除</DropdownMenuItem></template></DropdownMenuContent></DropdownMenu>
            </div>
          </template>
        </DataTable>
        <PaginationBar :page="store.currentPage" :page-size="store.pageSize" :total="store.total" :disabled="store.isLoading" :page-sizes="[20, 50, 100]" @update:page="store.setPage" @update:page-size="changePageSize" />
      </template>

      <TrafficControlMapView v-else-if="!formOpen" :records="store.mapRecords" :theme="themeStore.mode" />
    </div>

    <CrudSheet :open="formOpen" :mode="formMode" size="wide" :title="formMode === 'create' ? '新增交通管制' : `编辑交通管制 · ${store.records.find((item) => item.id === editingId)?.code ?? ''}`" description="维护核心信息；地图区域为选填项。" :saving="store.isSaving" :dirty="formDirty" @submit="save" @request-close="requestFormClose">
      <TrafficControlForm :key="`${formMode}-${editingId ?? 'new'}`" ref="formRef" :mode="formMode" :value="formValue" :publish-at="formPublishAt" :issues="issues" :saving="store.isSaving" :theme="themeStore.mode" @update:value="updateForm" />
    </CrudSheet>

    <AlertDialog :open="discardOpen" @update:open="discardOpen = $event"><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>放弃未保存的修改？</AlertDialogTitle><AlertDialogDescription>当前交通管制信息尚未保存，关闭后将无法恢复。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel class="h-11">继续编辑</AlertDialogCancel><Button variant="destructive" class="h-11" @click="closeForm"><X />放弃修改</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>

    <AlertDialog :open="historicalConfirmOpen" @update:open="historicalConfirmOpen = $event"><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>保存历史管制时间？</AlertDialogTitle><AlertDialogDescription>该记录的结束时间早于当前时间，保存后将显示为“已结束”。请确认这是在维护历史记录。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel class="h-11">返回检查</AlertDialogCancel><Button class="h-11" :disabled="store.isSaving" @click="confirmHistoricalSave">确认保存</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>

    <AlertDialog :open="Boolean(statusTarget)" @update:open="!$event && (statusTarget = null)">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认{{ statusTarget?.action === 'publish' ? '发布' : '撤销' }}该管制？</AlertDialogTitle>
          <AlertDialogDescription>{{ statusTarget?.action === 'publish' ? '发布后即时同步 H5 用户端。' : '撤销后 H5 不再展示，历史日志保留。' }}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel class="h-11">取消</AlertDialogCancel><Button class="h-11" :disabled="store.isSaving" @click="confirmStatusChange">确认{{ statusTarget?.action === 'publish' ? '发布' : '撤销' }}</Button></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog :open="Boolean(overlapResult)" @update:open="!$event && (overlapResult = null)">
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>管制已发布，发现区域重叠</AlertDialogTitle><AlertDialogDescription>后端已完成发布；以下设施可能与管制区域重叠，系统不会自动停用，请另行确认。</AlertDialogDescription></AlertDialogHeader>
        <ul class="max-h-64 space-y-2 overflow-auto rounded-xl border bg-muted/20 p-3 text-sm">
          <li v-for="item in overlapResult?.overlaps ?? []" :key="`${item.kind}-${item.id}`" class="flex items-center justify-between gap-3 rounded-lg bg-background px-3 py-2"><span class="font-medium">{{ item.name }}</span><span class="font-mono text-xs text-muted-foreground">{{ item.kind }} #{{ item.id }}</span></li>
        </ul>
        <AlertDialogFooter><Button class="h-11" @click="overlapResult = null">知道了</Button></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog :open="Boolean(deleteTarget)" @update:open="!$event && (deleteTarget = null)"><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>确认删除“{{ deleteTarget?.title }}”？</AlertDialogTitle><AlertDialogDescription>仅草稿可删除。删除后该管制的基础信息与地图区域将一并移除，且无法恢复。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel class="h-11">取消</AlertDialogCancel><Button variant="destructive" class="h-11" :disabled="Boolean(store.deletingId)" @click="remove"><Trash2 />{{ store.deletingId ? '删除中' : '确认删除' }}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>
</template>
