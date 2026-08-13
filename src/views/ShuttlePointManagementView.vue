<script setup lang="ts">
import type { CrudDialogCloseRequest, CrudDialogMode, DataTableColumn } from '@/components/common'
import type { ShuttlePoint, ShuttlePointValidationIssue, ShuttlePointWriteInput } from '@/modules/shuttle-management/types'
import { AlertTriangle, BusFront, Clock3, MapPinCheck, PencilLine, Plus, RotateCcw, Trash2 } from '@lucide/vue'
import { useEventListener } from '@vueuse/core'
import { computed, nextTick, onMounted, ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { toast } from 'vue-sonner'
import { CrudDialog, DataTable, EnabledStatusBadge, PaginationBar, QueryPanel } from '@/components/common'
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClientId } from '@/lib/id'
import ShuttlePointForm from '@/modules/shuttle-management/components/ShuttlePointForm.vue'
import { useShuttlePointStore } from '@/modules/shuttle-management/stores/shuttle-point-store'

function emptyForm(): ShuttlePointWriteInput {
  return {
    name: '', code: '', address: '', contactName: '', contactPhone: '', routeName: '',
    stations: [{ id: createClientId(), name: '' }, { id: createClientId(), name: '' }],
    vehicles: [], firstDeparture: '08:00', lastDeparture: '22:00', departureInterval: 15,
    enabled: true, remark: '',
  }
}

const columns: readonly DataTableColumn<ShuttlePoint>[] = [
  { key: 'index', label: '序号', width: '72px', align: 'center' },
  { key: 'name', label: '接驳点', minWidth: '210px' },
  { key: 'route', label: '线路与站点', minWidth: '280px' },
  { key: 'schedule', label: '运营时间', minWidth: '180px' },
  { key: 'vehicles', label: '接驳车', width: '110px', align: 'center' },
  { key: 'enabled', label: '状态', width: '100px', align: 'center' },
  { key: 'updatedAt', label: '更新时间', minWidth: '170px' },
  { key: 'actions', label: '操作', width: '164px', align: 'right' },
]

const store = useShuttlePointStore()
const queryDraft = ref({ ...store.query })
const dialogOpen = ref(false)
const dialogMode = ref<CrudDialogMode>('create')
const editingId = ref<string | null>(null)
const formValue = ref<ShuttlePointWriteInput>(emptyForm())
const initialValue = ref<ShuttlePointWriteInput>(emptyForm())
const issues = ref<readonly ShuttlePointValidationIssue[]>([])
const formRef = ref<{ validateAndFocus(): boolean } | null>(null)
const discardOpen = ref(false)
const deleteTarget = ref<ShuttlePoint | null>(null)
const loadError = ref('')
const dirty = computed(() => JSON.stringify(formValue.value) !== JSON.stringify(initialValue.value))
const hasQuery = computed(() => Boolean(store.query.keyword || store.query.status !== 'all'))

function cloneInput(input: ShuttlePointWriteInput): ShuttlePointWriteInput {
  return { ...input, stations: input.stations.map((item) => ({ ...item })), vehicles: input.vehicles.map((item) => ({ ...item })) }
}
function toWriteInput(item: ShuttlePoint): ShuttlePointWriteInput {
  return cloneInput({
    name: item.name,
    code: item.code,
    address: item.address,
    contactName: item.contactName,
    contactPhone: item.contactPhone,
    routeName: item.routeName,
    stations: item.stations,
    vehicles: item.vehicles,
    firstDeparture: item.firstDeparture,
    lastDeparture: item.lastDeparture,
    departureInterval: item.departureInterval,
    enabled: item.enabled,
    remark: item.remark,
  })
}
function formatDate(value: string): string { return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)) }
function stationSummary(item: ShuttlePoint): string { return item.stations.map((station) => station.name).join(' → ') }
function openCreate(): void { store.resetError(); dialogMode.value = 'create'; editingId.value = null; const value = emptyForm(); formValue.value = cloneInput(value); initialValue.value = cloneInput(value); issues.value = []; dialogOpen.value = true }
function openEdit(item: ShuttlePoint): void { const value = toWriteInput(item); dialogMode.value = 'edit'; editingId.value = item.id; formValue.value = cloneInput(value); initialValue.value = cloneInput(value); issues.value = []; dialogOpen.value = true }
function close(): void { dialogOpen.value = false; discardOpen.value = false; editingId.value = null; issues.value = [] }
function requestClose(request: CrudDialogCloseRequest): void { if (request.dirty) discardOpen.value = true; else close() }
function confirmLeave(): boolean { return !dialogOpen.value || !dirty.value || window.confirm('当前有未保存的接驳点信息，确定放弃吗？') }
function beforeUnload(event: BeforeUnloadEvent): void { if (dialogOpen.value && dirty.value) { event.preventDefault(); event.returnValue = '' } }
async function save(): Promise<void> {
  issues.value = store.validate(formValue.value, editingId.value ?? undefined).issues
  await nextTick()
  if (!formRef.value?.validateAndFocus() || issues.value.length) return
  const created = dialogMode.value === 'create'
  const saved = created ? await store.create(formValue.value) : editingId.value ? await store.update(editingId.value, formValue.value) : null
  if (!saved) { toast.error(store.error ?? '接驳点保存失败'); return }
  close(); toast.success(created ? '接驳点已新增。' : '接驳点配置已更新。')
}
async function remove(): Promise<void> { if (!deleteTarget.value) return; if (await store.remove(deleteTarget.value.id)) { deleteTarget.value = null; toast.success('接驳点已删除。') } else toast.error(store.error ?? '删除失败') }
async function load(): Promise<void> { loadError.value = ''; if (!await store.load()) { loadError.value = store.error ?? '接驳点数据加载失败'; toast.error(loadError.value) } }

onMounted(load)
onBeforeRouteLeave(() => confirmLeave())
useEventListener(window, 'beforeunload', beforeUnload)
</script>

<template>
  <section class="tech-grid min-h-[calc(100svh-4rem)] p-6" aria-labelledby="shuttle-point-title">
    <div class="mx-auto flex w-full max-w-[1680px] flex-col gap-4">
      <header class="flex items-center justify-between gap-4">
        <div class="flex items-center gap-3"><span class="grid size-11 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary"><MapPinCheck class="size-5" /></span><div><h1 id="shuttle-point-title" class="text-2xl font-semibold tracking-tight">接驳点管理</h1><p class="mt-1 text-sm text-muted-foreground">配置接驳点、车辆、线路站点与班次计划</p></div></div>
        <Button size="lg" class="h-11" @click="openCreate"><Plus />新增接驳点</Button>
      </header>
      <QueryPanel @query="store.setQuery(queryDraft)" @reset="store.resetQuery(); queryDraft = { ...store.query }">
        <div class="space-y-2"><Label for="shuttle-keyword">关键字</Label><Input id="shuttle-keyword" v-model="queryDraft.keyword" class="h-11" placeholder="点位、编码、线路或站点" /></div>
        <div class="space-y-2"><Label for="shuttle-status">启用状态</Label><Select v-model="queryDraft.status"><SelectTrigger id="shuttle-status" class="h-11 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部状态</SelectItem><SelectItem value="enabled">启用</SelectItem><SelectItem value="disabled">停用</SelectItem></SelectContent></Select></div>
      </QueryPanel>
      <div v-if="loadError && !store.isLoading" class="flex items-center gap-3 rounded-xl border border-destructive/35 bg-destructive/8 p-4" role="alert"><AlertTriangle class="size-5 text-destructive" /><p class="flex-1 text-sm text-destructive">{{ loadError }}</p><Button variant="outline" class="h-11" @click="load"><RotateCcw />重新加载</Button></div>
      <DataTable :columns="columns" :rows="store.paginatedRecords" row-key="id" :loading="store.isLoading" :empty-text="hasQuery ? '当前条件下暂无接驳点' : '尚未新增接驳点'" caption="接驳点列表">
        <template #cell-index="{ rowIndex }"><span class="tabular-nums text-muted-foreground">{{ (store.currentPage - 1) * store.pageSize + rowIndex + 1 }}</span></template>
        <template #cell-name="{ row }"><div><p class="font-medium">{{ row.name }}</p><div class="mt-1 flex items-center gap-2"><span class="rounded-md border bg-muted/35 px-2 py-0.5 font-mono text-xs">{{ row.code }}</span><span v-if="row.address" class="max-w-36 truncate text-xs text-muted-foreground" :title="row.address">{{ row.address }}</span></div></div></template>
        <template #cell-route="{ row }"><div><div class="flex items-center gap-2"><p class="font-medium">{{ row.routeName }}</p><Badge variant="outline">{{ row.stations.length }} 站</Badge></div><p class="mt-1 max-w-80 truncate text-xs text-muted-foreground" :title="stationSummary(row)">{{ stationSummary(row) }}</p></div></template>
        <template #cell-schedule="{ row }"><div class="flex items-center gap-1.5 font-medium tabular-nums"><Clock3 class="size-4 text-primary" />{{ row.firstDeparture }}–{{ row.lastDeparture }}</div><p class="mt-1 text-xs text-muted-foreground">每 {{ row.departureInterval }} 分钟一班</p></template>
        <template #cell-vehicles="{ row }"><div class="inline-flex items-center gap-1.5"><BusFront class="size-4 text-muted-foreground" /><span class="font-semibold tabular-nums">{{ row.vehicles.length }}</span><span class="text-muted-foreground">辆</span></div></template>
        <template #cell-enabled="{ row }"><EnabledStatusBadge :enabled="row.enabled" /></template>
        <template #cell-updatedAt="{ row }"><time class="whitespace-nowrap text-xs tabular-nums text-muted-foreground">{{ formatDate(row.updatedAt) }}</time></template>
        <template #cell-actions="{ row }"><div class="flex justify-end gap-1"><Button variant="ghost" class="h-11 px-3" @click="openEdit(row)"><PencilLine />编辑</Button><Button variant="ghost" size="icon-lg" class="h-11 w-11 text-destructive hover:text-destructive" :aria-label="`删除${row.name}`" @click="deleteTarget = row"><Trash2 /></Button></div></template>
      </DataTable>
      <PaginationBar :page="store.currentPage" :page-size="store.pageSize" :total="store.total" :disabled="store.isLoading" @update:page="store.setPage" @update:page-size="store.setPageSize" />
    </div>
    <CrudDialog :open="dialogOpen" :mode="dialogMode" size="wide" :title="dialogMode === 'create' ? '新增接驳点' : '编辑接驳点'" description="统一维护点位、车辆、站点与班次，后续可直接替换为后端数据源。" :saving="store.isSaving" :dirty="dirty" @submit="save" @request-close="requestClose"><ShuttlePointForm :key="`${dialogMode}-${editingId ?? 'new'}`" ref="formRef" :mode="dialogMode" :value="formValue" :issues="issues" :saving="store.isSaving" @update:value="formValue = $event; issues = []; store.resetError()" /></CrudDialog>
    <AlertDialog :open="discardOpen" @update:open="discardOpen = $event"><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>放弃未保存的修改？</AlertDialogTitle><AlertDialogDescription>当前接驳点、车辆或班次配置尚未保存。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel class="h-11">继续编辑</AlertDialogCancel><Button variant="destructive" class="h-11" @click="close">放弃修改</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog :open="Boolean(deleteTarget)" @update:open="!$event && (deleteTarget = null)"><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>确认删除“{{ deleteTarget?.name }}”？</AlertDialogTitle><AlertDialogDescription>删除后该点位的车辆、站点和班次配置也会一并移除。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel class="h-11">取消</AlertDialogCancel><Button variant="destructive" class="h-11" :disabled="Boolean(store.deletingId)" @click="remove"><Trash2 />{{ store.deletingId ? '删除中' : '确认删除' }}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>
</template>
