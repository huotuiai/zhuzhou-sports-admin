<script setup lang="ts">
import type { CrudDialogCloseRequest, CrudDialogMode, DataTableColumn } from '@/components/common'
import type { TicketGate, TicketGateValidationIssue, TicketGateWriteInput } from '@/modules/ticket-gate-management/types'
import { AlertTriangle, PencilLine, Plus, RotateCcw, ScanLine, Trash2 } from '@lucide/vue'
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
import TicketGateForm from '@/modules/ticket-gate-management/components/TicketGateForm.vue'
import { useTicketGateStore } from '@/modules/ticket-gate-management/stores/ticket-gate-store'

const EMPTY: TicketGateWriteInput = { name: '', code: '', venueArea: '', location: '', direction: 'entry', laneCount: 1, deviceCount: 1, enabled: true, remark: '' }
const columns: readonly DataTableColumn<TicketGate>[] = [
  { key: 'index', label: '序号', width: '72px', align: 'center' },
  { key: 'name', label: '检票口', minWidth: '190px' },
  { key: 'venueArea', label: '所属区域 / 位置', minWidth: '240px' },
  { key: 'direction', label: '通行方向', width: '110px', align: 'center' },
  { key: 'laneCount', label: '通道 / 设备', width: '130px', align: 'center' },
  { key: 'enabled', label: '状态', width: '100px', align: 'center' },
  { key: 'updatedAt', label: '更新时间', minWidth: '170px' },
  { key: 'actions', label: '操作', width: '164px', align: 'right' },
]

const store = useTicketGateStore()
const queryDraft = ref({ ...store.query })
const dialogOpen = ref(false)
const dialogMode = ref<CrudDialogMode>('create')
const editingId = ref<string | null>(null)
const formValue = ref<TicketGateWriteInput>({ ...EMPTY })
const initialValue = ref<TicketGateWriteInput>({ ...EMPTY })
const issues = ref<readonly TicketGateValidationIssue[]>([])
const formRef = ref<{ validateAndFocus(): boolean } | null>(null)
const discardOpen = ref(false)
const deleteTarget = ref<TicketGate | null>(null)
const loadError = ref('')
const dirty = computed(() => JSON.stringify(formValue.value) !== JSON.stringify(initialValue.value))
const hasQuery = computed(() => Boolean(store.query.keyword || store.query.direction !== 'all' || store.query.status !== 'all'))

function writeInput(item: TicketGate): TicketGateWriteInput { return { name: item.name, code: item.code, venueArea: item.venueArea, location: item.location, direction: item.direction, laneCount: item.laneCount, deviceCount: item.deviceCount, enabled: item.enabled, remark: item.remark } }
function formatDate(value: string): string { return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)) }
function directionLabel(value: TicketGate['direction']): string { return ({ entry: '入场', exit: '出场', bidirectional: '双向' })[value] }
function openCreate(): void { store.resetError(); dialogMode.value = 'create'; editingId.value = null; formValue.value = { ...EMPTY }; initialValue.value = { ...EMPTY }; issues.value = []; dialogOpen.value = true }
function openEdit(item: TicketGate): void { const value = writeInput(item); dialogMode.value = 'edit'; editingId.value = item.id; formValue.value = { ...value }; initialValue.value = { ...value }; issues.value = []; dialogOpen.value = true }
function close(): void { dialogOpen.value = false; discardOpen.value = false; editingId.value = null; issues.value = [] }
function requestClose(request: CrudDialogCloseRequest): void { if (request.dirty) discardOpen.value = true; else close() }
function confirmLeave(): boolean { return !dialogOpen.value || !dirty.value || window.confirm('当前有未保存的检票口信息，确定放弃吗？') }
function beforeUnload(event: BeforeUnloadEvent): void { if (dialogOpen.value && dirty.value) { event.preventDefault(); event.returnValue = '' } }
async function save(): Promise<void> {
  issues.value = store.validate(formValue.value, editingId.value ?? undefined).issues
  await nextTick()
  if (!formRef.value?.validateAndFocus() || issues.value.length) return
  const created = dialogMode.value === 'create'
  const saved = created ? await store.create(formValue.value) : editingId.value ? await store.update(editingId.value, formValue.value) : null
  if (!saved) { toast.error(store.error ?? '检票口保存失败'); return }
  close(); toast.success(created ? '检票口已新增。' : '检票口信息已更新。')
}
async function remove(): Promise<void> { if (!deleteTarget.value) return; if (await store.remove(deleteTarget.value.id)) { deleteTarget.value = null; toast.success('检票口已删除。') } else toast.error(store.error ?? '删除失败') }
async function load(): Promise<void> { loadError.value = ''; if (!await store.load()) { loadError.value = store.error ?? '检票口数据加载失败'; toast.error(loadError.value) } }

onMounted(load)
onBeforeRouteLeave(() => confirmLeave())
useEventListener(window, 'beforeunload', beforeUnload)
</script>

<template>
  <section class="tech-grid min-h-[calc(100svh-4rem)] p-6" aria-labelledby="ticket-gate-title">
    <div class="mx-auto flex w-full max-w-[1680px] flex-col gap-4">
      <header class="flex items-center justify-between gap-4">
        <div class="flex items-center gap-3"><span class="grid size-11 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary"><ScanLine class="size-5" /></span><div><h1 id="ticket-gate-title" class="text-2xl font-semibold tracking-tight">检票口管理</h1><p class="mt-1 text-sm text-muted-foreground">维护检票通道、设备数量与通行规则</p></div></div>
        <Button size="lg" class="h-11" @click="openCreate"><Plus />新增检票口</Button>
      </header>
      <QueryPanel @query="store.setQuery(queryDraft)" @reset="store.resetQuery(); queryDraft = { ...store.query }">
        <div class="space-y-2"><Label for="gate-keyword">关键字</Label><Input id="gate-keyword" v-model="queryDraft.keyword" class="h-11" placeholder="名称、编码、区域或位置" /></div>
        <div class="space-y-2"><Label for="gate-direction">通行方向</Label><Select v-model="queryDraft.direction"><SelectTrigger id="gate-direction" class="h-11 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部方向</SelectItem><SelectItem value="entry">入场</SelectItem><SelectItem value="exit">出场</SelectItem><SelectItem value="bidirectional">双向</SelectItem></SelectContent></Select></div>
        <div class="space-y-2"><Label for="gate-status">启用状态</Label><Select v-model="queryDraft.status"><SelectTrigger id="gate-status" class="h-11 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部状态</SelectItem><SelectItem value="enabled">启用</SelectItem><SelectItem value="disabled">停用</SelectItem></SelectContent></Select></div>
      </QueryPanel>
      <div v-if="loadError && !store.isLoading" class="flex items-center gap-3 rounded-xl border border-destructive/35 bg-destructive/8 p-4" role="alert"><AlertTriangle class="size-5 text-destructive" /><p class="flex-1 text-sm text-destructive">{{ loadError }}</p><Button variant="outline" class="h-11" @click="load"><RotateCcw />重新加载</Button></div>
      <DataTable :columns="columns" :rows="store.paginatedRecords" row-key="id" :loading="store.isLoading" :empty-text="hasQuery ? '当前条件下暂无检票口' : '尚未新增检票口'" caption="检票口列表">
        <template #cell-index="{ rowIndex }"><span class="tabular-nums text-muted-foreground">{{ (store.currentPage - 1) * store.pageSize + rowIndex + 1 }}</span></template>
        <template #cell-name="{ row }"><div><p class="font-medium">{{ row.name }}</p><span class="mt-1 inline-block rounded-md border bg-muted/35 px-2 py-0.5 font-mono text-xs">{{ row.code }}</span></div></template>
        <template #cell-venueArea="{ row }"><p>{{ row.venueArea }}</p><p class="mt-1 max-w-64 truncate text-xs text-muted-foreground" :title="row.location">{{ row.location || '—' }}</p></template>
        <template #cell-direction="{ row }"><Badge variant="outline">{{ directionLabel(row.direction) }}</Badge></template>
        <template #cell-laneCount="{ row }"><span class="font-semibold tabular-nums">{{ row.laneCount }}</span><span class="text-muted-foreground"> / {{ row.deviceCount }}</span></template>
        <template #cell-enabled="{ row }"><EnabledStatusBadge :enabled="row.enabled" /></template>
        <template #cell-updatedAt="{ row }"><time class="whitespace-nowrap text-xs tabular-nums text-muted-foreground">{{ formatDate(row.updatedAt) }}</time></template>
        <template #cell-actions="{ row }"><div class="flex justify-end gap-1"><Button variant="ghost" class="h-11 px-3" @click="openEdit(row)"><PencilLine />编辑</Button><Button variant="ghost" size="icon-lg" class="h-11 w-11 text-destructive hover:text-destructive" :aria-label="`删除${row.name}`" @click="deleteTarget = row"><Trash2 /></Button></div></template>
      </DataTable>
      <PaginationBar :page="store.currentPage" :page-size="store.pageSize" :total="store.total" :disabled="store.isLoading" @update:page="store.setPage" @update:page-size="store.setPageSize" />
    </div>
    <CrudDialog :open="dialogOpen" :mode="dialogMode" :title="dialogMode === 'create' ? '新增检票口' : '编辑检票口'" description="先维护基础档案，后续可直接对接检票设备与后端接口。" :saving="store.isSaving" :dirty="dirty" @submit="save" @request-close="requestClose"><TicketGateForm :key="`${dialogMode}-${editingId ?? 'new'}`" ref="formRef" :mode="dialogMode" :value="formValue" :issues="issues" :saving="store.isSaving" @update:value="formValue = $event; issues = []; store.resetError()" /></CrudDialog>
    <AlertDialog :open="discardOpen" @update:open="discardOpen = $event"><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>放弃未保存的修改？</AlertDialogTitle><AlertDialogDescription>当前填写内容尚未保存，关闭后将无法恢复。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel class="h-11">继续编辑</AlertDialogCancel><Button variant="destructive" class="h-11" @click="close">放弃修改</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog :open="Boolean(deleteTarget)" @update:open="!$event && (deleteTarget = null)"><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>确认删除“{{ deleteTarget?.name }}”？</AlertDialogTitle><AlertDialogDescription>删除后该检票口档案将立即移除，且无法恢复。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel class="h-11">取消</AlertDialogCancel><Button variant="destructive" class="h-11" :disabled="Boolean(store.deletingId)" @click="remove"><Trash2 />{{ store.deletingId ? '删除中' : '确认删除' }}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>
</template>
