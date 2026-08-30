<script setup lang="ts">
import type { CrudDialogCloseRequest, CrudDialogMode, DataTableColumn } from '@/components/common'
import type {
  TicketGate,
  TicketGateQuery,
  TicketGateStatus,
  TicketGateStatusInput,
  TicketGateValidationIssue,
  TicketGateWriteInput,
} from '@/modules/ticket-gate-management/types'
import {
  AlertTriangle,
  Building2,
  Download,
  Ellipsis,
  LoaderCircle,
  MapPin,
  PencilLine,
  Plus,
  RotateCcw,
  ScanLine,
  Settings2,
  Trash2,
  X,
} from '@lucide/vue'
import { useEventListener } from '@vueuse/core'
import { computed, nextTick, onMounted, ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { toast } from 'vue-sonner'
import { CrudSheet, DataTable, PaginationBar, QueryPanel } from '@/components/common'
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import TicketGateForm from '@/modules/ticket-gate-management/components/TicketGateForm.vue'
import TicketGateStatusBadge from '@/modules/ticket-gate-management/components/TicketGateStatusBadge.vue'
import { formatMapCoordinates } from '@/modules/ticket-gate-management/services/ticket-gate-service'
import { useTicketGateStore } from '@/modules/ticket-gate-management/stores/ticket-gate-store'

const EMPTY: TicketGateWriteInput = {
  code: '',
  name: '',
  floorId: '',
  locationDescription: '',
  mapCoordinates: '',
  navigationAddress: '',
  sortOrder: 1,
  status: 'open',
  statusRemark: '',
}

const columns: readonly DataTableColumn<TicketGate>[] = [
  { key: 'code', label: '检票口编号', width: '130px' },
  { key: 'name', label: '名称', minWidth: '150px' },
  { key: 'floorName', label: '楼层', width: '100px', align: 'center' },
  { key: 'locationDescription', label: '位置描述', minWidth: '210px' },
  { key: 'zoneNames', label: '覆盖座位分区', minWidth: '220px' },
  { key: 'status', label: '状态', width: '110px', align: 'center' },
  { key: 'statusRemark', label: '状态说明', minWidth: '210px' },
  { key: 'actions', label: '操作', width: '156px', align: 'right' },
]

const store = useTicketGateStore()
const queryDraft = ref<TicketGateQuery>({ ...store.query })
const formOpen = ref(false)
const formMode = ref<CrudDialogMode>('create')
const editingId = ref<string | null>(null)
const formValue = ref<TicketGateWriteInput>({ ...EMPTY })
const initialValue = ref<TicketGateWriteInput>({ ...EMPTY })
const issues = ref<readonly TicketGateValidationIssue[]>([])
const formRef = ref<{ validateAndFocus(): boolean } | null>(null)
const statusOpen = ref(false)
const statusTarget = ref<TicketGate | null>(null)
const statusValue = ref<TicketGateStatusInput>({ status: 'open', statusRemark: '' })
const initialStatusValue = ref<TicketGateStatusInput>({ status: 'open', statusRemark: '' })
const discardOpen = ref(false)
const discardKind = ref<'form' | 'status'>('form')
const deleteTarget = ref<TicketGate | null>(null)
const loadError = ref('')

const formDirty = computed(() => JSON.stringify(formValue.value) !== JSON.stringify(initialValue.value))
const statusDirty = computed(() => JSON.stringify(statusValue.value) !== JSON.stringify(initialStatusValue.value))
const hasQuery = computed(() => Boolean(store.query.keyword || store.query.status !== 'all' || store.query.floorId !== 'all'))

function toWriteInput(item: TicketGate): TicketGateWriteInput {
  return {
    code: item.code,
    name: item.name,
    floorId: item.floorId,
    locationDescription: item.locationDescription,
    mapCoordinates: formatMapCoordinates(item.point),
    navigationAddress: item.navigationAddress,
    sortOrder: item.sortOrder,
    status: item.status,
    statusRemark: item.statusRemark,
  }
}

function openCreate(): void {
  store.resetError()
  formMode.value = 'create'
  editingId.value = null
  formValue.value = {
    ...EMPTY,
    floorId: store.floors.find((floor) => floor.enabled)?.id ?? store.floors[0]?.id ?? '',
  }
  initialValue.value = { ...formValue.value }
  issues.value = []
  formOpen.value = true
}

async function openEdit(item: TicketGate): Promise<void> {
  store.resetError()
  const detail = await store.get(item.id)
  if (!detail) {
    toast.error(store.error ?? '检票口详情加载失败。')
    return
  }
  const value = toWriteInput(detail)
  formMode.value = 'edit'
  editingId.value = detail.id
  formValue.value = { ...value }
  initialValue.value = { ...value }
  issues.value = []
  formOpen.value = true
}

function closeForm(): void {
  initialValue.value = { ...formValue.value }
  formOpen.value = false
  editingId.value = null
  issues.value = []
  if (discardKind.value === 'form') discardOpen.value = false
}

function requestFormClose(request: CrudDialogCloseRequest): void {
  if (request.dirty) {
    discardKind.value = 'form'
    discardOpen.value = true
  }
  else closeForm()
}

function openStatus(item: TicketGate): void {
  statusTarget.value = item
  statusValue.value = { status: item.status, statusRemark: item.statusRemark }
  initialStatusValue.value = { ...statusValue.value }
  statusOpen.value = true
}

function setStatus(status: TicketGateStatus): void {
  statusValue.value = { status, statusRemark: status === 'open' ? '' : statusValue.value.statusRemark }
}

function closeStatus(): void {
  initialStatusValue.value = { ...statusValue.value }
  statusOpen.value = false
  statusTarget.value = null
  if (discardKind.value === 'status') discardOpen.value = false
}

function requestStatusClose(request: CrudDialogCloseRequest): void {
  if (request.dirty) {
    discardKind.value = 'status'
    discardOpen.value = true
  }
  else closeStatus()
}

function confirmDiscard(): void {
  if (discardKind.value === 'form') closeForm()
  else closeStatus()
}

function updateForm(value: TicketGateWriteInput): void {
  formValue.value = value
  issues.value = []
  store.resetError()
}

async function applyQuery(): Promise<void> {
  if (!await store.setQuery({ ...queryDraft.value })) toast.error(store.error ?? '检票口查询失败。')
}

async function resetQuery(): Promise<void> {
  queryDraft.value = { keyword: '', status: 'all', floorId: 'all' }
  if (!await store.resetQuery()) toast.error(store.error ?? '检票口列表重置失败。')
}

async function changePage(value: number): Promise<void> {
  if (!await store.setPage(value)) toast.error(store.error ?? '检票口列表加载失败。')
}

async function changePageSize(value: number): Promise<void> {
  if (!await store.setPageSize(value)) toast.error(store.error ?? '检票口列表加载失败。')
}

async function save(): Promise<void> {
  issues.value = store.validate(formValue.value, editingId.value ?? undefined).issues
  await nextTick()
  if (!formRef.value?.validateAndFocus() || issues.value.length) return
  const created = formMode.value === 'create'
  const saved = created
    ? await store.create(formValue.value)
    : editingId.value ? await store.update(editingId.value, formValue.value) : null
  if (!saved) {
    toast.error(store.error ?? '检票口保存失败，当前填写内容已保留。')
    return
  }
  closeForm()
  toast.success(created ? '检票口已新增。' : '检票口信息已更新。')
}

async function saveStatus(): Promise<void> {
  if (!statusTarget.value) return
  const saved = await store.updateStatus(statusTarget.value.id, statusValue.value)
  if (!saved) {
    toast.error(store.error ?? '状态更新失败。')
    return
  }
  closeStatus()
  toast.success('检票口状态已更新，将在 5 分钟内同步至 H5。')
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
    toast.error(store.error ?? '检票口导出失败。')
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

function requestDelete(item: TicketGate): void {
  store.resetError()
  deleteTarget.value = item
}

async function remove(): Promise<void> {
  if (!deleteTarget.value) return
  if (await store.remove(deleteTarget.value.id)) {
    deleteTarget.value = null
    toast.success('检票口已删除。')
  }
  else toast.error(store.error ?? '删除失败，请刷新后重试。')
}

function confirmLeave(): boolean {
  const hasUnsaved = (formOpen.value && formDirty.value) || (statusOpen.value && statusDirty.value)
  return !hasUnsaved || window.confirm('当前有未保存的检票口信息，确定放弃吗？')
}

function beforeUnload(event: BeforeUnloadEvent): void {
  if ((formOpen.value && formDirty.value) || (statusOpen.value && statusDirty.value)) {
    event.preventDefault()
    event.returnValue = ''
  }
}

async function load(): Promise<void> {
  loadError.value = ''
  if (!await store.load()) {
    loadError.value = store.error ?? '检票口数据加载失败'
    toast.error(loadError.value)
  }
}

onMounted(load)
onBeforeRouteLeave(() => confirmLeave())
useEventListener(window, 'beforeunload', beforeUnload)
</script>

<template>
  <section class="tech-grid min-h-[calc(100svh-4rem)] p-6" aria-labelledby="ticket-gate-title">
    <div class="mx-auto flex w-full max-w-[1680px] flex-col gap-4">
      <header class="flex items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <span class="grid size-11 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary"><ScanLine class="size-5" aria-hidden="true" /></span>
          <div><h1 id="ticket-gate-title" class="text-2xl font-semibold tracking-tight">检票口管理</h1><p class="mt-1 text-sm text-muted-foreground">检票口基础信息与状态配置</p></div>
        </div>
        <div class="flex items-center gap-2">
          <Button variant="outline" size="lg" class="h-11 px-4" :disabled="store.isLoading || store.isExporting" @click="exportCurrent"><LoaderCircle v-if="store.isExporting" class="animate-spin" aria-hidden="true" /><Download v-else aria-hidden="true" />{{ store.isExporting ? '导出中' : '导出' }}</Button>
          <Button size="lg" class="h-11 px-4" :disabled="store.isLoading || !store.floors.length" @click="openCreate"><Plus aria-hidden="true" />新增检票口</Button>
        </div>
      </header>

      <QueryPanel :loading="store.isLoading" @query="applyQuery" @reset="resetQuery">
        <div class="space-y-2"><Label for="gate-keyword">编号或名称</Label><Input id="gate-keyword" v-model="queryDraft.keyword" class="h-11" placeholder="请输入检票口编号或名称" autocomplete="off" /></div>
        <div class="space-y-2"><Label for="gate-status">状态</Label><Select v-model="queryDraft.status"><SelectTrigger id="gate-status" class="h-11 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部状态</SelectItem><SelectItem value="open">开放</SelectItem><SelectItem value="closed">关闭</SelectItem><SelectItem value="restricted">管制</SelectItem></SelectContent></Select></div>
        <div class="space-y-2"><Label for="gate-floor">楼层</Label><Select v-model="queryDraft.floorId"><SelectTrigger id="gate-floor" class="h-11 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部楼层</SelectItem><SelectItem v-for="floor in store.floors" :key="floor.id" :value="floor.id">{{ floor.name }}{{ floor.enabled ? '' : '（已停用）' }}</SelectItem></SelectContent></Select></div>
      </QueryPanel>

      <div v-if="loadError && !store.isLoading" class="flex items-center gap-3 rounded-xl border border-destructive/35 bg-destructive/8 p-4" role="alert">
        <AlertTriangle class="size-5 shrink-0 text-destructive" aria-hidden="true" /><p class="flex-1 text-sm text-destructive">{{ loadError }}</p><Button variant="outline" size="lg" class="h-11" @click="load"><RotateCcw aria-hidden="true" />重新加载</Button>
      </div>

      <DataTable :columns="columns" :rows="store.paginatedRecords" row-key="id" :loading="store.isLoading" :empty-text="hasQuery ? '当前查询条件下暂无检票口' : '暂无检票口，请新增'" caption="检票口信息列表">
        <template #cell-code="{ row }"><span class="rounded-md border bg-muted/35 px-2 py-1 font-mono text-xs font-semibold">{{ row.code }}</span></template>
        <template #cell-name="{ row }"><p class="font-medium">{{ row.name }}</p></template>
        <template #cell-floorName="{ row }"><Badge variant="outline"><Building2 class="size-3.5" />{{ row.floorName }}</Badge></template>
        <template #cell-locationDescription="{ row }"><div class="flex items-start gap-2"><MapPin class="mt-0.5 size-4 shrink-0 text-muted-foreground" /><p class="max-w-52 truncate" :title="row.locationDescription">{{ row.locationDescription || '—' }}</p></div></template>
        <template #cell-zoneNames="{ row }"><div v-if="row.zoneNames.length" class="flex max-w-60 flex-wrap gap-1.5"><Badge v-for="zone in row.zoneNames.slice(0, 3)" :key="zone" variant="secondary">{{ zone }}</Badge><Badge v-if="row.zoneNames.length > 3" variant="outline" :title="row.zoneNames.slice(3).join('、')">+{{ row.zoneNames.length - 3 }}</Badge></div><span v-else class="text-xs text-muted-foreground">未绑定座位分区</span></template>
        <template #cell-status="{ row }"><TicketGateStatusBadge :status="row.status" interactive @click="openStatus(row)" /></template>
        <template #cell-statusRemark="{ row }"><p :class="['max-w-52 truncate text-sm', row.status === 'open' || !row.statusRemark ? 'text-muted-foreground' : row.status === 'restricted' ? 'text-destructive' : 'text-warning']" :title="row.statusRemark">{{ row.status === 'open' || !row.statusRemark ? '—' : row.statusRemark }}</p></template>
        <template #cell-actions="{ row }">
          <div class="flex justify-end gap-1">
            <Button variant="ghost" class="h-11 px-3" :disabled="store.detailLoadingId === row.id" @click="openEdit(row)"><LoaderCircle v-if="store.detailLoadingId === row.id" class="animate-spin" aria-hidden="true" /><PencilLine v-else aria-hidden="true" />编辑</Button>
            <DropdownMenu>
              <DropdownMenuTrigger as-child><Button variant="ghost" size="icon-lg" class="h-11 w-11" :aria-label="`${row.name}更多操作`"><Ellipsis aria-hidden="true" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" class="w-40">
                <DropdownMenuItem class="min-h-10 px-3" @select="openStatus(row)"><Settings2 />状态配置</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" class="min-h-10 px-3" @select="requestDelete(row)"><Trash2 />删除</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </template>
      </DataTable>

      <PaginationBar :page="store.currentPage" :page-size="store.pageSize" :total="store.total" :page-sizes="[20, 50, 100]" :disabled="store.isLoading" @update:page="changePage" @update:page-size="changePageSize" />
    </div>

    <CrudSheet :open="formOpen" :mode="formMode" :title="formMode === 'create' ? '新增检票口' : `编辑检票口 · ${formValue.code}`" description="维护检票口位置、导航信息、排序与开放状态。" :saving="store.isSaving" :dirty="formDirty" @submit="save" @request-close="requestFormClose">
      <TicketGateForm :key="`${formMode}-${editingId ?? 'new'}`" ref="formRef" :mode="formMode" :value="formValue" :floors="store.floors" :issues="issues" :saving="store.isSaving" @update:value="updateForm" />
    </CrudSheet>

    <CrudSheet :open="statusOpen" mode="edit" size="narrow" :title="`状态配置 · ${statusTarget?.code ?? ''}`" :description="statusTarget?.name" submit-label="保存状态" :saving="store.isSaving" :dirty="statusDirty" @submit="saveStatus" @request-close="requestStatusClose">
      <div class="space-y-5">
        <div class="space-y-2"><Label for="gate-quick-status">状态</Label><Select :model-value="statusValue.status" :disabled="store.isSaving" @update:model-value="setStatus($event as TicketGateStatus)"><SelectTrigger id="gate-quick-status" class="h-11 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="open">开放</SelectItem><SelectItem value="closed">关闭</SelectItem><SelectItem value="restricted">管制</SelectItem></SelectContent></Select></div>
        <div v-if="statusValue.status !== 'open'" class="space-y-2"><Label for="gate-status-remark">状态说明</Label><Textarea id="gate-status-remark" v-model="statusValue.statusRemark" class="min-h-24 resize-y" placeholder="例如：临时关闭，请走东门" :disabled="store.isSaving" /><p class="text-xs leading-5 text-muted-foreground">该说明将在 H5 检票口详情中展示。</p></div>
        <div v-if="statusValue.status !== 'open'" class="flex gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4 text-warning"><AlertTriangle class="mt-0.5 size-5 shrink-0" /><p class="text-xs leading-5">关闭或管制后，H5 座位匹配将自动排除该检票口，并推荐同分区其他开放口；数据将在 5 分钟内同步。</p></div>
        <div v-else class="flex gap-3 rounded-xl border border-success/30 bg-success/10 p-4 text-success"><ScanLine class="mt-0.5 size-5 shrink-0" /><p class="text-xs leading-5">开放后，该检票口可重新参与 H5 座位匹配与入场推荐。</p></div>
      </div>
    </CrudSheet>

    <AlertDialog :open="discardOpen" @update:open="discardOpen = $event">
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>放弃未保存的修改？</AlertDialogTitle><AlertDialogDescription>当前检票口信息尚未保存，关闭后将无法恢复。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel class="h-11">继续编辑</AlertDialogCancel><Button variant="destructive" class="h-11" @click="confirmDiscard"><X />放弃修改</Button></AlertDialogFooter></AlertDialogContent>
    </AlertDialog>

    <AlertDialog :open="Boolean(deleteTarget)" @update:open="!$event && (deleteTarget = null)">
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>确认删除“{{ deleteTarget?.name }}”？</AlertDialogTitle><AlertDialogDescription>删除后不可恢复；历史操作日志将按审计规则保留。若检票口仍被业务数据引用，后端将拒绝删除并返回具体原因。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel class="h-11">取消</AlertDialogCancel><Button variant="destructive" class="h-11" :disabled="Boolean(store.deletingId)" @click="remove"><LoaderCircle v-if="store.deletingId" class="animate-spin" aria-hidden="true" /><Trash2 v-else />{{ store.deletingId ? '删除中' : '确认删除' }}</Button></AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
  </section>
</template>
