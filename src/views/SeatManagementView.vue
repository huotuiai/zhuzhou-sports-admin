<script setup lang="ts">
import type { CrudDialogCloseRequest, CrudDialogMode, DataTableColumn } from '@/components/common'
import type { VenueSeat, VenueSeatValidationIssue, VenueSeatWriteInput } from '@/modules/seat-management/types'
import { Accessibility, AlertTriangle, Armchair, Crown, PencilLine, Plus, RotateCcw, Trash2 } from '@lucide/vue'
import { useEventListener } from '@vueuse/core'
import { computed, nextTick, onMounted, ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { toast } from 'vue-sonner'
import { CrudDialog, DataTable, PaginationBar, QueryPanel } from '@/components/common'
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import SeatStatusBadge from '@/modules/seat-management/components/SeatStatusBadge.vue'
import VenueSeatForm from '@/modules/seat-management/components/VenueSeatForm.vue'
import { useVenueSeatStore } from '@/modules/seat-management/stores/venue-seat-store'

const EMPTY: VenueSeatWriteInput = { code: '', venueArea: '', section: '', rowNumber: '', seatNumber: '', type: 'standard', status: 'available', remark: '' }
const columns: readonly DataTableColumn<VenueSeat>[] = [
  { key: 'index', label: '序号', width: '72px', align: 'center' },
  { key: 'code', label: '座位编码', minWidth: '170px' },
  { key: 'location', label: '座位位置', minWidth: '250px' },
  { key: 'rowNumber', label: '排号', width: '100px', align: 'center' },
  { key: 'seatNumber', label: '座号', width: '100px', align: 'center' },
  { key: 'type', label: '座位类型', width: '120px', align: 'center' },
  { key: 'status', label: '状态', width: '110px', align: 'center' },
  { key: 'updatedAt', label: '更新时间', minWidth: '170px' },
  { key: 'actions', label: '操作', width: '164px', align: 'right' },
]

const store = useVenueSeatStore()
const queryDraft = ref({ ...store.query })
const dialogOpen = ref(false)
const dialogMode = ref<CrudDialogMode>('create')
const editingId = ref<string | null>(null)
const formValue = ref<VenueSeatWriteInput>({ ...EMPTY })
const initialValue = ref<VenueSeatWriteInput>({ ...EMPTY })
const issues = ref<readonly VenueSeatValidationIssue[]>([])
const formRef = ref<{ validateAndFocus(): boolean } | null>(null)
const discardOpen = ref(false)
const deleteTarget = ref<VenueSeat | null>(null)
const loadError = ref('')
const dirty = computed(() => JSON.stringify(formValue.value) !== JSON.stringify(initialValue.value))
const hasQuery = computed(() => Boolean(store.query.keyword || store.query.type !== 'all' || store.query.status !== 'all'))

function toWriteInput(item: VenueSeat): VenueSeatWriteInput { return { code: item.code, venueArea: item.venueArea, section: item.section, rowNumber: item.rowNumber, seatNumber: item.seatNumber, type: item.type, status: item.status, remark: item.remark } }
function formatDate(value: string): string { return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)) }
function typeLabel(type: VenueSeat['type']): string { return ({ standard: '普通座', vip: 'VIP 座', accessible: '无障碍座' })[type] }
function openCreate(): void { store.resetError(); dialogMode.value = 'create'; editingId.value = null; formValue.value = { ...EMPTY }; initialValue.value = { ...EMPTY }; issues.value = []; dialogOpen.value = true }
function openEdit(item: VenueSeat): void { const value = toWriteInput(item); dialogMode.value = 'edit'; editingId.value = item.id; formValue.value = { ...value }; initialValue.value = { ...value }; issues.value = []; dialogOpen.value = true }
function close(): void { dialogOpen.value = false; discardOpen.value = false; editingId.value = null; issues.value = [] }
function requestClose(request: CrudDialogCloseRequest): void { if (request.dirty) discardOpen.value = true; else close() }
function confirmLeave(): boolean { return !dialogOpen.value || !dirty.value || window.confirm('当前有未保存的座位信息，确定放弃吗？') }
function beforeUnload(event: BeforeUnloadEvent): void { if (dialogOpen.value && dirty.value) { event.preventDefault(); event.returnValue = '' } }
async function save(): Promise<void> {
  issues.value = store.validate(formValue.value, editingId.value ?? undefined).issues
  await nextTick()
  if (!formRef.value?.validateAndFocus() || issues.value.length) return
  const created = dialogMode.value === 'create'
  const saved = created ? await store.create(formValue.value) : editingId.value ? await store.update(editingId.value, formValue.value) : null
  if (!saved) { toast.error(store.error ?? '座位保存失败'); return }
  close(); toast.success(created ? '座位已新增。' : '座位信息已更新。')
}
async function remove(): Promise<void> { if (!deleteTarget.value) return; if (await store.remove(deleteTarget.value.id)) { deleteTarget.value = null; toast.success('座位已删除。') } else toast.error(store.error ?? '删除失败') }
async function load(): Promise<void> { loadError.value = ''; if (!await store.load()) { loadError.value = store.error ?? '座位数据加载失败'; toast.error(loadError.value) } }

onMounted(load)
onBeforeRouteLeave(() => confirmLeave())
useEventListener(window, 'beforeunload', beforeUnload)
</script>

<template>
  <section class="tech-grid min-h-[calc(100svh-4rem)] p-6" aria-labelledby="seat-management-title">
    <div class="mx-auto flex w-full max-w-[1680px] flex-col gap-4">
      <header class="flex items-center justify-between gap-4">
        <div class="flex items-center gap-3"><span class="grid size-11 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary"><Armchair class="size-5" /></span><div><h1 id="seat-management-title" class="text-2xl font-semibold tracking-tight">座位管理</h1><p class="mt-1 text-sm text-muted-foreground">维护场馆看台、排号、座号与座位状态</p></div></div>
        <Button size="lg" class="h-11" @click="openCreate"><Plus />新增座位</Button>
      </header>
      <QueryPanel @query="store.setQuery(queryDraft)" @reset="store.resetQuery(); queryDraft = { ...store.query }">
        <div class="space-y-2"><Label for="seat-keyword">关键字</Label><Input id="seat-keyword" v-model="queryDraft.keyword" class="h-11" placeholder="编码、场馆、分区、排号或座号" /></div>
        <div class="space-y-2"><Label for="seat-type">座位类型</Label><Select v-model="queryDraft.type"><SelectTrigger id="seat-type" class="h-11 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部类型</SelectItem><SelectItem value="standard">普通座</SelectItem><SelectItem value="vip">VIP 座</SelectItem><SelectItem value="accessible">无障碍座</SelectItem></SelectContent></Select></div>
        <div class="space-y-2"><Label for="seat-status">座位状态</Label><Select v-model="queryDraft.status"><SelectTrigger id="seat-status" class="h-11 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部状态</SelectItem><SelectItem value="available">可用</SelectItem><SelectItem value="maintenance">维护中</SelectItem><SelectItem value="disabled">停用</SelectItem></SelectContent></Select></div>
      </QueryPanel>
      <div v-if="loadError && !store.isLoading" class="flex items-center gap-3 rounded-xl border border-destructive/35 bg-destructive/8 p-4" role="alert"><AlertTriangle class="size-5 text-destructive" /><p class="flex-1 text-sm text-destructive">{{ loadError }}</p><Button variant="outline" class="h-11" @click="load"><RotateCcw />重新加载</Button></div>
      <DataTable :columns="columns" :rows="store.paginatedRecords" row-key="id" :loading="store.isLoading" :empty-text="hasQuery ? '当前条件下暂无座位' : '尚未新增座位'" caption="座位档案列表">
        <template #cell-index="{ rowIndex }"><span class="tabular-nums text-muted-foreground">{{ (store.currentPage - 1) * store.pageSize + rowIndex + 1 }}</span></template>
        <template #cell-code="{ row }"><div><span class="rounded-md border bg-muted/35 px-2 py-1 font-mono text-xs">{{ row.code }}</span><p v-if="row.remark" class="mt-1.5 max-w-48 truncate text-xs text-muted-foreground" :title="row.remark">{{ row.remark }}</p></div></template>
        <template #cell-location="{ row }"><p class="font-medium">{{ row.venueArea }}</p><p class="mt-1 text-xs text-muted-foreground">{{ row.section }}</p></template>
        <template #cell-rowNumber="{ row }"><span class="font-medium tabular-nums">{{ row.rowNumber }}</span></template>
        <template #cell-seatNumber="{ row }"><span class="font-semibold tabular-nums">{{ row.seatNumber }}</span></template>
        <template #cell-type="{ row }"><Badge variant="outline" class="gap-1.5"><Crown v-if="row.type === 'vip'" class="size-3.5 text-warning" /><Accessibility v-else-if="row.type === 'accessible'" class="size-3.5 text-primary" /><Armchair v-else class="size-3.5 text-muted-foreground" />{{ typeLabel(row.type) }}</Badge></template>
        <template #cell-status="{ row }"><SeatStatusBadge :status="row.status" /></template>
        <template #cell-updatedAt="{ row }"><time class="whitespace-nowrap text-xs tabular-nums text-muted-foreground">{{ formatDate(row.updatedAt) }}</time></template>
        <template #cell-actions="{ row }"><div class="flex justify-end gap-1"><Button variant="ghost" class="h-11 px-3" @click="openEdit(row)"><PencilLine />编辑</Button><Button variant="ghost" size="icon-lg" class="h-11 w-11 text-destructive hover:text-destructive" :aria-label="`删除座位${row.code}`" @click="deleteTarget = row"><Trash2 /></Button></div></template>
      </DataTable>
      <PaginationBar :page="store.currentPage" :page-size="store.pageSize" :total="store.total" :disabled="store.isLoading" @update:page="store.setPage" @update:page-size="store.setPageSize" />
    </div>
    <CrudDialog :open="dialogOpen" :mode="dialogMode" :title="dialogMode === 'create' ? '新增座位' : '编辑座位'" description="维护座位唯一编码、看台位置、类型与可用状态。" :saving="store.isSaving" :dirty="dirty" @submit="save" @request-close="requestClose"><VenueSeatForm :key="`${dialogMode}-${editingId ?? 'new'}`" ref="formRef" :mode="dialogMode" :value="formValue" :issues="issues" :saving="store.isSaving" @update:value="formValue = $event; issues = []; store.resetError()" /></CrudDialog>
    <AlertDialog :open="discardOpen" @update:open="discardOpen = $event"><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>放弃未保存的修改？</AlertDialogTitle><AlertDialogDescription>当前座位信息尚未保存，关闭后将无法恢复。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel class="h-11">继续编辑</AlertDialogCancel><Button variant="destructive" class="h-11" @click="close">放弃修改</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog :open="Boolean(deleteTarget)" @update:open="!$event && (deleteTarget = null)"><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>确认删除座位“{{ deleteTarget?.code }}”？</AlertDialogTitle><AlertDialogDescription>删除后该座位档案将立即移除，且无法恢复。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel class="h-11">取消</AlertDialogCancel><Button variant="destructive" class="h-11" :disabled="Boolean(store.deletingId)" @click="remove"><Trash2 />{{ store.deletingId ? '删除中' : '确认删除' }}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>
</template>
