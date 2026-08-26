<script setup lang="ts">
import type { CrudDialogCloseRequest, CrudDialogMode, DataTableColumn } from '@/components/common'
import type {
  ParkingLot,
  ParkingLotFormValue,
  ParkingLotQuery,
  ParkingLotValidationIssue,
} from '@/modules/parking-management/types'
import type { TicketGate } from '@/modules/ticket-gate-management/types'
import {
  AlertTriangle,
  CircleDollarSign,
  Clock3,
  List,
  Map as MapIcon,
  PencilLine,
  Plus,
  Power,
  RefreshCw,
  SquareParking,
  Trash2,
} from '@lucide/vue'
import { useEventListener } from '@vueuse/core'
import { computed, nextTick, onMounted, ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { toast } from 'vue-sonner'
import { CrudSheet, DataTable, PaginationBar, QueryPanel } from '@/components/common'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import ParkingAvailabilityBadge from '@/modules/parking-management/components/ParkingAvailabilityBadge.vue'
import ParkingLotForm from '@/modules/parking-management/components/ParkingLotForm.vue'
import ParkingLotMapView from '@/modules/parking-management/components/ParkingLotMapView.vue'
import ParkingOpenStatusBadge from '@/modules/parking-management/components/ParkingOpenStatusBadge.vue'
import ParkingLotStatusBadge from '@/modules/parking-management/components/ParkingLotStatusBadge.vue'
import {
  parkingLotFormToCreateInput,
  parkingLotFormToUpdateInput,
  parkingLotToFormValue,
} from '@/modules/parking-management/lib/form-value'
import { useParkingLotStore } from '@/modules/parking-management/stores/parking-lot-store'
import {
  PARKING_AVAILABILITY_UPDATE_METHODS,
  PARKING_FEE_TYPES,
  PARKING_OPEN_STATUSES,
  parkingAvailabilityUpdateMethodLabel,
  parkingFeeTypeLabel,
} from '@/modules/parking-management/types'
import { ticketGateRelationService } from '@/modules/ticket-gate-management/services/ticket-gate-relation-service'
import { ticketGateService } from '@/modules/ticket-gate-management/services/ticket-gate-service'
import { useThemeStore } from '@/stores/theme'

type ViewMode = 'list' | 'map'

const columns: readonly DataTableColumn<ParkingLot>[] = [
  { key: 'code', label: '停车场编号', width: '118px' },
  { key: 'name', label: '名称', minWidth: '160px' },
  { key: 'locationDescription', label: '位置描述', minWidth: '220px' },
  { key: 'totalSpaces', label: '总车位', width: '96px', align: 'center' },
  { key: 'availableSpaces', label: '空余车位', minWidth: '160px' },
  { key: 'feeType', label: '收费类型', width: '108px', align: 'center' },
  { key: 'openStatus', label: '开放状态', width: '108px', align: 'center' },
  { key: 'enabled', label: '状态', width: '96px', align: 'center' },
  { key: 'availabilityUpdateMethod', label: '更新方式', minWidth: '150px' },
  { key: 'recommendationWeight', label: '推荐权重', width: '96px', align: 'center' },
  { key: 'actions', label: '操作', width: '330px', align: 'right' },
]

const store = useParkingLotStore()
const themeStore = useThemeStore()
const viewMode = ref<ViewMode>('list')
const queryDraft = ref<ParkingLotQuery>({ ...store.query })
const sheetOpen = ref(false)
const sheetMode = ref<CrudDialogMode>('create')
const editingId = ref<string | null>(null)
const formValue = ref<ParkingLotFormValue>(emptyForm())
const initialFormValue = ref<ParkingLotFormValue>(emptyForm())
const formIssues = ref<readonly ParkingLotValidationIssue[]>([])
const formRef = ref<{ validateAndFocus(): boolean } | null>(null)
const discardConfirmOpen = ref(false)
const capacityConfirmOpen = ref(false)
const deleteTarget = ref<ParkingLot | null>(null)
const availabilityOpen = ref(false)
const availabilityTarget = ref<ParkingLot | null>(null)
const availabilityValue = ref('')
const availabilityInitial = ref('')
const availabilityError = ref('')
const availabilityDiscardConfirmOpen = ref(false)
const loadError = ref('')
const ticketGates = ref<TicketGate[]>([])
const ticketGatesLoading = ref(false)
const ticketGatesError = ref('')
const loadingRelationsId = ref<string | null>(null)

const formDirty = computed(() => JSON.stringify(formValue.value) !== JSON.stringify(initialFormValue.value))
const availabilityDirty = computed(() => availabilityOpen.value && availabilityValue.value !== availabilityInitial.value)
const hasQuery = computed(() => Boolean(
  store.query.keyword ||
  store.query.feeType !== 'all' ||
  store.query.openStatus !== 'all' ||
  store.query.availabilityUpdateMethod !== 'all',
))
const emptyText = computed(() => hasQuery.value ? '当前查询条件下暂无停车场' : '尚未新增停车场')

function emptyForm(): ParkingLotFormValue {
  return {
    code: '',
    name: '',
    locationDescription: '',
    coordinateInput: '',
    navigationAddress: '',
    totalSpaces: Number.NaN,
    availabilityUpdateMethod: 'manual',
    feeType: 'free',
    feeStandard: '',
    openStatus: 'open',
    enabled: true,
    recommendationWeight: 50,
    sortOrder: 0,
    remark: '',
    nearbyGateBindings: [],
  }
}

function cloneForm(value: ParkingLotFormValue): ParkingLotFormValue {
  return {
    ...value,
    nearbyGateBindings: value.nearbyGateBindings.map((binding) => ({ ...binding })),
  }
}

function nextSortOrder(): number {
  return store.records.reduce((maximum, record) => Math.max(maximum, record.sortOrder), 0) + 1
}

function openCreate(): void {
  store.resetError()
  sheetMode.value = 'create'
  editingId.value = null
  const value = { ...emptyForm(), sortOrder: nextSortOrder() }
  formValue.value = cloneForm(value)
  initialFormValue.value = cloneForm(value)
  formIssues.value = []
  sheetOpen.value = true
}

async function openEdit(record: ParkingLot): Promise<void> {
  store.resetError()
  loadingRelationsId.value = record.id
  try {
    const relations = await ticketGateRelationService.listParkingLotRelations(record.id)
    sheetMode.value = 'edit'
    editingId.value = record.id
    const value = parkingLotToFormValue(record, relations.map((relation) => ({
      gateId: relation.gateId,
      walkingMinutes: relation.walkingMinutes,
    })))
    formValue.value = cloneForm(value)
    initialFormValue.value = cloneForm(value)
    formIssues.value = []
    sheetOpen.value = true
  }
  catch (error) {
    toast.error(error instanceof Error ? error.message : '附近检票口绑定加载失败')
  }
  finally {
    loadingRelationsId.value = null
  }
}

function updateForm(value: ParkingLotFormValue): void {
  formValue.value = value
  formIssues.value = []
  store.resetError()
}

function closeSheet(): void {
  sheetOpen.value = false
  editingId.value = null
  formIssues.value = []
  discardConfirmOpen.value = false
  capacityConfirmOpen.value = false
}

function requestSheetClose(request: CrudDialogCloseRequest): void {
  if (request.dirty) discardConfirmOpen.value = true
  else closeSheet()
}

function parsedFormInput(): ReturnType<typeof parkingLotFormToCreateInput> | null {
  try {
    return parkingLotFormToCreateInput(formValue.value)
  }
  catch (error) {
    formIssues.value = [{
      field: 'point',
      code: 'invalid',
      message: error instanceof Error ? error.message : '请输入合法的经度,纬度',
    }]
    return null
  }
}

async function persistForm(clampAvailableSpaces = false): Promise<void> {
  const created = sheetMode.value === 'create'
  const saved = created
    ? await store.create(parkingLotFormToCreateInput(formValue.value))
    : editingId.value
      ? await store.update(editingId.value, parkingLotFormToUpdateInput(formValue.value), { clampAvailableSpaces })
      : null
  if (!saved) {
    toast.error(store.error ?? '停车场保存失败，当前填写内容已保留。')
    return
  }
  try {
    await ticketGateRelationService.replaceParkingLotRelations(saved.id, formValue.value.nearbyGateBindings.map((binding) => ({
      gateId: binding.gateId,
      walkingMinutes: Number(binding.walkingMinutes),
    })))
  }
  catch (error) {
    closeSheet()
    toast.warning(`停车场信息已保存，但附近检票口绑定保存失败：${error instanceof Error ? error.message : '请稍后重试'}`)
    return
  }
  closeSheet()
  toast.success(created ? '停车场已新增。' : clampAvailableSpaces ? '停车场已更新，空余车位已同步下调。' : '停车场信息已更新。')
}

async function saveForm(): Promise<void> {
  const parsed = parsedFormInput()
  if (!parsed) {
    await nextTick()
    formRef.value?.validateAndFocus()
    return
  }
  formIssues.value = sheetMode.value === 'create'
    ? store.validateCreate(parsed).issues
    : store.validateUpdate(parkingLotFormToUpdateInput(formValue.value)).issues
  await nextTick()
  if (!formRef.value?.validateAndFocus() || formIssues.value.length) return

  const current = editingId.value ? store.records.find((record) => record.id === editingId.value) : null
  if (current && parsed.totalSpaces < current.availableSpaces) {
    capacityConfirmOpen.value = true
    return
  }
  await persistForm()
}

async function confirmCapacityClamp(): Promise<void> {
  capacityConfirmOpen.value = false
  await persistForm(true)
}

function openAvailability(record: ParkingLot): void {
  store.resetError()
  availabilityTarget.value = record
  availabilityValue.value = String(record.availableSpaces)
  availabilityInitial.value = String(record.availableSpaces)
  availabilityError.value = ''
  availabilityOpen.value = true
}

function closeAvailability(): void {
  availabilityOpen.value = false
  availabilityTarget.value = null
  availabilityValue.value = ''
  availabilityInitial.value = ''
  availabilityError.value = ''
  availabilityDiscardConfirmOpen.value = false
}

function requestAvailabilityClose(): void {
  if (availabilityDirty.value) availabilityDiscardConfirmOpen.value = true
  else closeAvailability()
}

function handleAvailabilityOpenChange(open: boolean): void {
  if (open) availabilityOpen.value = true
  else requestAvailabilityClose()
}

async function saveAvailability(): Promise<void> {
  const target = availabilityTarget.value
  if (!target) return
  const source = availabilityValue.value.trim()
  const value = Number(source)
  if (!source || !Number.isInteger(value) || value < 0 || value > target.totalSpaces) {
    availabilityError.value = `请输入 0–${target.totalSpaces} 的整数`
    return
  }
  const updated = await store.updateAvailability(target.id, value)
  if (!updated) {
    availabilityError.value = store.error ?? '余位更新失败'
    toast.error(availabilityError.value)
    return
  }
  closeAvailability()
  toast.success(value === 0 ? '空余车位已更新为已满。' : `空余车位已更新为 ${value} 个。`)
}

async function removeParkingLot(): Promise<void> {
  const target = deleteTarget.value
  if (!target) return
  const removed = await store.remove(target.id)
  if (!removed) {
    toast.error(store.error ?? '停车场删除失败。')
    return
  }
  try {
    await ticketGateRelationService.cleanupParkingLot(target.id)
    toast.success('停车场及其检票口关联已删除。')
  }
  catch {
    toast.warning('停车场已删除，关联数据将在下次打开检票口配置时自动清理。')
  }
  deleteTarget.value = null
}

async function toggleParkingLot(record: ParkingLot): Promise<void> {
  const value = parkingLotToFormValue(record)
  const saved = await store.update(record.id, parkingLotFormToUpdateInput({ ...value, enabled: !record.enabled }))
  if (!saved) {
    toast.error(store.error ?? '停车场状态更新失败。')
    return
  }
  toast.success(`停车场已${saved.enabled ? '启用' : '停用'}。`)
}

function applyQuery(): void {
  store.setQuery({ ...queryDraft.value })
}

function resetQuery(): void {
  store.resetQuery()
  queryDraft.value = { ...store.query }
}

function confirmLeave(): boolean {
  const unsaved = (sheetOpen.value && formDirty.value) || availabilityDirty.value
  return !unsaved || window.confirm('当前有未保存的停车场修改，确定放弃吗？')
}

function beforeUnload(event: BeforeUnloadEvent): void {
  if (!((sheetOpen.value && formDirty.value) || availabilityDirty.value)) return
  event.preventDefault()
  event.returnValue = ''
}

async function loadParkingLots(): Promise<void> {
  loadError.value = ''
  if (!await store.load()) {
    loadError.value = store.error ?? '停车场数据加载失败。'
    toast.error(loadError.value)
  }
}

async function loadTicketGates(): Promise<void> {
  ticketGatesLoading.value = true
  ticketGatesError.value = ''
  try {
    ticketGates.value = await ticketGateService.list()
  }
  catch (error) {
    ticketGatesError.value = error instanceof Error ? error.message : '检票口数据加载失败'
  }
  finally {
    ticketGatesLoading.value = false
  }
}

async function initializePage(): Promise<void> {
  await Promise.all([loadParkingLots(), loadTicketGates()])
}

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

onMounted(initializePage)
onBeforeRouteLeave(confirmLeave)
useEventListener(window, 'beforeunload', beforeUnload)
</script>

<template>
  <section class="tech-grid min-h-[calc(100svh-4rem)] p-6" aria-labelledby="parking-management-title">
    <div class="mx-auto flex w-full max-w-[1680px] flex-col gap-4">
      <header class="flex flex-wrap items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <span class="grid size-11 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
            <SquareParking class="size-5" aria-hidden="true" />
          </span>
          <div>
            <h1 id="parking-management-title" class="text-2xl font-semibold tracking-tight">停车区管理</h1>
            <p class="mt-1 text-sm text-muted-foreground">停车场基础信息与实时车位</p>
          </div>
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
          <Button size="lg" class="h-11 px-4" @click="openCreate">
            <Plus aria-hidden="true" />
            新增停车场
          </Button>
        </div>
      </header>

      <QueryPanel @query="applyQuery" @reset="resetQuery">
        <div class="space-y-2">
          <Label for="parking-query-keyword">编号 / 名称</Label>
          <Input id="parking-query-keyword" v-model="queryDraft.keyword" class="h-11" placeholder="请输入关键字" autocomplete="off" />
        </div>
        <div class="space-y-2">
          <Label for="parking-query-fee">收费类型</Label>
          <Select v-model="queryDraft.feeType">
            <SelectTrigger id="parking-query-fee" class="h-11 w-full bg-background"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部收费类型</SelectItem>
              <SelectItem v-for="item in PARKING_FEE_TYPES" :key="item.value" :value="item.value">{{ item.label }}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div class="space-y-2">
          <Label for="parking-query-open">开放状态</Label>
          <Select v-model="queryDraft.openStatus">
            <SelectTrigger id="parking-query-open" class="h-11 w-full bg-background"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部开放状态</SelectItem>
              <SelectItem v-for="item in PARKING_OPEN_STATUSES" :key="item.value" :value="item.value">{{ item.label }}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div class="space-y-2">
          <Label for="parking-query-update-method">更新方式</Label>
          <Select v-model="queryDraft.availabilityUpdateMethod">
            <SelectTrigger id="parking-query-update-method" class="h-11 w-full bg-background"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部更新方式</SelectItem>
              <SelectItem v-for="item in PARKING_AVAILABILITY_UPDATE_METHODS" :key="item.value" :value="item.value">{{ item.label }}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </QueryPanel>

      <div v-if="loadError && !store.isLoading" class="flex items-center gap-3 rounded-xl border border-destructive/35 bg-destructive/8 p-4" role="alert">
        <AlertTriangle class="size-5 shrink-0 text-destructive" aria-hidden="true" />
        <p class="flex-1 text-sm text-destructive">{{ loadError }}</p>
        <Button variant="outline" size="lg" class="h-11" @click="loadParkingLots"><RefreshCw aria-hidden="true" />重新加载</Button>
      </div>

      <template v-if="viewMode === 'list'">
        <DataTable :columns="columns" :rows="store.paginatedRecords" row-key="id" :loading="store.isLoading" :empty-text="emptyText" caption="停车场车位与收费信息列表">
          <template #empty>
            <div class="flex flex-col items-center text-muted-foreground" role="status">
              <span class="grid size-11 place-items-center rounded-xl border bg-muted/40"><SquareParking class="size-5" aria-hidden="true" /></span>
              <span class="mt-3 text-sm">{{ emptyText }}</span>
              <Button v-if="hasQuery" variant="link" class="mt-1 h-9" @click="resetQuery">清空筛选条件</Button>
            </div>
          </template>
          <template #cell-code="{ row }"><span class="rounded-md border bg-muted/35 px-2 py-1 font-mono text-xs font-semibold">{{ row.code }}</span></template>
          <template #cell-name="{ row }">
            <span class="font-medium text-foreground">{{ row.name }}</span>
          </template>
          <template #cell-locationDescription="{ row }">
            <span class="block max-w-72 truncate text-sm text-muted-foreground" :title="row.locationDescription || undefined">{{ row.locationDescription || '—' }}</span>
          </template>
          <template #cell-totalSpaces="{ row }"><span class="font-semibold tabular-nums">{{ row.totalSpaces.toLocaleString('zh-CN') }}</span></template>
          <template #cell-availableSpaces="{ row }">
            <div class="flex items-center gap-2">
              <span class="font-semibold tabular-nums">{{ row.availableSpaces.toLocaleString('zh-CN') }}</span>
              <ParkingAvailabilityBadge :record="row" />
            </div>
          </template>
          <template #cell-feeType="{ row }">
            <Badge variant="outline" :title="row.feeStandard || undefined" :class="row.feeType === 'free' ? 'border-success/30 bg-success/10 text-success' : 'border-warning/30 bg-warning/10 text-warning'">
              <CircleDollarSign class="size-3.5" aria-hidden="true" />{{ parkingFeeTypeLabel(row.feeType) }}
            </Badge>
          </template>
          <template #cell-openStatus="{ row }"><ParkingOpenStatusBadge :status="row.openStatus" /></template>
          <template #cell-enabled="{ row }"><ParkingLotStatusBadge :enabled="row.enabled" /></template>
          <template #cell-availabilityUpdateMethod="{ row }">
            <div class="space-y-1">
              <Badge variant="outline" :class="row.availabilityUpdateMethod === 'integrated' ? 'border-primary/30 bg-primary/10 text-primary' : 'border-border bg-muted/45 text-muted-foreground'">{{ parkingAvailabilityUpdateMethodLabel(row.availabilityUpdateMethod) }}</Badge>
              <p class="flex items-center gap-1 whitespace-nowrap text-[11px] text-muted-foreground"><Clock3 class="size-3" aria-hidden="true" />{{ formatDateTime(row.availabilityUpdatedAt) }}</p>
            </div>
          </template>
          <template #cell-recommendationWeight="{ row }"><span class="font-semibold tabular-nums">{{ row.recommendationWeight }}</span></template>
          <template #cell-actions="{ row }">
            <div class="flex justify-end gap-1">
              <Button variant="ghost" size="sm" class="h-9 px-2.5" :aria-label="`更新${row.name}余位`" @click="openAvailability(row)">
                <RefreshCw aria-hidden="true" />更新余位
              </Button>
              <Button variant="ghost" size="sm" class="h-9 px-2.5" :disabled="loadingRelationsId === row.id" :aria-label="`编辑${row.name}`" @click="openEdit(row)">
                <RefreshCw v-if="loadingRelationsId === row.id" class="animate-spin motion-reduce:animate-none" aria-hidden="true" /><PencilLine v-else aria-hidden="true" />{{ loadingRelationsId === row.id ? '加载中' : '编辑' }}
              </Button>
              <Button variant="ghost" size="sm" class="h-9 px-2.5" :disabled="store.isSaving" :aria-label="`${row.enabled ? '停用' : '启用'}${row.name}`" @click="toggleParkingLot(row)">
                <Power aria-hidden="true" />{{ row.enabled ? '停用' : '启用' }}
              </Button>
              <Button variant="ghost" size="icon" class="h-9 w-9 text-destructive hover:text-destructive" :aria-label="`删除${row.name}`" @click="deleteTarget = row">
                <Trash2 aria-hidden="true" />
              </Button>
            </div>
          </template>
        </DataTable>

        <PaginationBar
          :page="store.currentPage"
          :page-size="store.pageSize"
          :page-sizes="[20]"
          :total="store.total"
          :disabled="store.isLoading"
          @update:page="store.setPage"
          @update:page-size="store.setPageSize"
        />
      </template>

      <ParkingLotMapView v-else :records="store.filteredRecords" :theme="themeStore.mode" />
    </div>

    <CrudSheet
      :open="sheetOpen"
      :mode="sheetMode"
      size="wide"
      :title="sheetMode === 'create' ? '新增停车场' : `编辑停车场 · ${formValue.code}`"
      description="维护停车场基础档案、收费和展示状态；空余车位请使用列表中的快捷更新。"
      :saving="store.isSaving"
      :dirty="formDirty"
      @submit="saveForm"
      @request-close="requestSheetClose"
    >
      <ParkingLotForm
        :key="`${sheetMode}-${editingId ?? 'new'}`"
        ref="formRef"
        :mode="sheetMode"
        :value="formValue"
        :issues="formIssues"
        :saving="store.isSaving"
        :ticket-gates="ticketGates"
        :ticket-gates-loading="ticketGatesLoading"
        :ticket-gates-error="ticketGatesError"
        @update:value="updateForm"
      />
    </CrudSheet>

    <Dialog :open="availabilityOpen" @update:open="handleAvailabilityOpenChange">
      <DialogContent class="max-w-[440px] overflow-hidden p-0">
        <form @submit.prevent="saveAvailability">
          <DialogHeader class="border-b px-5 py-4 text-left">
            <DialogTitle>更新空余车位</DialogTitle>
            <DialogDescription>{{ availabilityTarget?.code }} · {{ availabilityTarget?.name }}</DialogDescription>
          </DialogHeader>
          <div class="space-y-4 px-5 py-5">
            <div class="rounded-xl border bg-muted/25 p-3 text-sm">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <span class="text-xs text-muted-foreground">更新方式</span>
                <Badge variant="outline">{{ availabilityTarget ? parkingAvailabilityUpdateMethodLabel(availabilityTarget.availabilityUpdateMethod) : '—' }}</Badge>
              </div>
              <p class="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><Clock3 class="size-3.5" aria-hidden="true" />最近更新：{{ availabilityTarget ? formatDateTime(availabilityTarget.availabilityUpdatedAt) : '—' }}</p>
              <Button type="button" variant="outline" class="mt-3 h-10 w-full" disabled><RefreshCw aria-hidden="true" />手动同步（接口接入后开放）</Button>
              <p class="mt-2 text-xs leading-5 text-muted-foreground">{{ availabilityTarget?.availabilityUpdateMethod === 'manual' ? '该停车场未接入系统接口，请使用下方手动更新。' : '系统同步接口尚未接入，当前可使用手动更新兜底。' }}</p>
            </div>
            <div class="grid grid-cols-2 gap-3 rounded-xl border bg-muted/25 p-3 text-sm">
              <div><p class="text-xs text-muted-foreground">总车位</p><p class="mt-1 font-semibold tabular-nums">{{ availabilityTarget?.totalSpaces ?? 0 }}</p></div>
              <div><p class="text-xs text-muted-foreground">当前空余</p><p class="mt-1 font-semibold tabular-nums">{{ availabilityTarget?.availableSpaces ?? 0 }}</p></div>
            </div>
            <div class="space-y-2">
              <Label for="parking-availability-value">新的空余车位 <span class="text-destructive" aria-hidden="true">*</span></Label>
              <Input
                id="parking-availability-value"
                v-model="availabilityValue"
                type="number"
                min="0"
                :max="availabilityTarget?.totalSpaces"
                step="1"
                class="h-11 tabular-nums"
                autofocus
                :disabled="Boolean(store.updatingAvailabilityId)"
                :aria-invalid="Boolean(availabilityError)"
                @input="availabilityError = ''"
              />
              <p v-if="availabilityError" class="flex items-center gap-1.5 text-xs text-destructive" role="alert"><AlertTriangle class="size-3.5" aria-hidden="true" />{{ availabilityError }}</p>
              <p v-else class="text-xs leading-5 text-muted-foreground">请输入 0–{{ availabilityTarget?.totalSpaces }} 的整数；填 0 后将显示“已满”。</p>
            </div>
          </div>
          <DialogFooter class="flex-row justify-end border-t bg-card/90 px-5 py-4">
            <Button type="button" variant="outline" class="h-11 min-w-24" :disabled="Boolean(store.updatingAvailabilityId)" @click="requestAvailabilityClose">取消</Button>
            <Button type="submit" class="h-11 min-w-28" :disabled="Boolean(store.updatingAvailabilityId)"><RefreshCw :class="store.updatingAvailabilityId ? 'animate-spin motion-reduce:animate-none' : ''" aria-hidden="true" />{{ store.updatingAvailabilityId ? '更新中' : '保存余位' }}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <AlertDialog :open="discardConfirmOpen" @update:open="discardConfirmOpen = $event">
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>放弃未保存的修改？</AlertDialogTitle><AlertDialogDescription>当前停车场信息尚未保存，关闭后将无法恢复。</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel class="h-11">继续编辑</AlertDialogCancel><AlertDialogAction variant="destructive" class="h-11" @click="closeSheet">放弃修改</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog :open="availabilityDiscardConfirmOpen" @update:open="availabilityDiscardConfirmOpen = $event">
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>放弃余位修改？</AlertDialogTitle><AlertDialogDescription>当前输入的空余车位尚未保存。</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel class="h-11">继续编辑</AlertDialogCancel><AlertDialogAction variant="destructive" class="h-11" @click="closeAvailability">放弃修改</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog :open="capacityConfirmOpen" @update:open="capacityConfirmOpen = $event">
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>同步下调空余车位？</AlertDialogTitle><AlertDialogDescription>新的总车位数小于当前空余车位。保存后空余车位将同步调整为 {{ formValue.totalSpaces }} 个，并更新余位时间。</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel class="h-11">返回修改</AlertDialogCancel><AlertDialogAction class="h-11" @click="confirmCapacityClamp">确认并保存</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog :open="Boolean(deleteTarget)" @update:open="!$event && (deleteTarget = null)">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认删除“{{ deleteTarget?.name }}”？</AlertDialogTitle>
          <AlertDialogDescription>删除后该停车场档案将立即移除，此操作无法恢复。</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel class="h-11">取消</AlertDialogCancel>
          <Button variant="destructive" class="h-11" :disabled="Boolean(store.deletingId)" @click="removeParkingLot">
            <Trash2 aria-hidden="true" />{{ store.deletingId ? '删除中' : '确认删除' }}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>
</template>
