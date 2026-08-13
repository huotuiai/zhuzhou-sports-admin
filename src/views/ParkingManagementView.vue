<script setup lang="ts">
import type {
  CrudDialogCloseRequest,
  CrudDialogMode,
  DataTableColumn,
} from '@/components/common'
import type {
  ParkingLot,
  ParkingLotValidationIssue,
  ParkingLotWriteInput,
} from '@/modules/parking-management/types'
import {
  AlertTriangle,
  PencilLine,
  Plus,
  RotateCcw,
  SquareParking,
  Trash2,
} from '@lucide/vue'
import { useEventListener } from '@vueuse/core'
import { computed, nextTick, onMounted, ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { toast } from 'vue-sonner'
import {
  CrudDialog,
  DataTable,
  PaginationBar,
  QueryPanel,
} from '@/components/common'
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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import ParkingLotForm from '@/modules/parking-management/components/ParkingLotForm.vue'
import ParkingLotStatusBadge from '@/modules/parking-management/components/ParkingLotStatusBadge.vue'
import { useParkingLotStore } from '@/modules/parking-management/stores/parking-lot-store'

interface ParkingLotFormHandle {
  validateAndFocus(): boolean
}

const EMPTY_FORM: ParkingLotWriteInput = {
  name: '',
  code: '',
  address: '',
  totalSpaces: Number.NaN,
  enabled: true,
  remark: '',
}

const columns: readonly DataTableColumn<ParkingLot>[] = [
  { key: 'index', label: '序号', width: '72px', align: 'center' },
  { key: 'name', label: '停车场名称', accessor: 'name', minWidth: '180px' },
  { key: 'code', label: '停车场编码', accessor: 'code', minWidth: '150px' },
  { key: 'address', label: '地址', accessor: 'address', minWidth: '220px' },
  { key: 'totalSpaces', label: '车位总数', accessor: 'totalSpaces', width: '120px', align: 'right' },
  { key: 'enabled', label: '状态', accessor: 'enabled', width: '110px', align: 'center' },
  { key: 'updatedAt', label: '更新时间', accessor: 'updatedAt', minWidth: '170px' },
  { key: 'actions', label: '操作', width: '164px', align: 'right' },
]

const parkingLotStore = useParkingLotStore()
const queryDraft = ref({ ...parkingLotStore.query })
const dialogOpen = ref(false)
const dialogMode = ref<CrudDialogMode>('create')
const editingId = ref<string | null>(null)
const formValue = ref<ParkingLotWriteInput>({ ...EMPTY_FORM })
const initialFormValue = ref<ParkingLotWriteInput>({ ...EMPTY_FORM })
const formIssues = ref<readonly ParkingLotValidationIssue[]>([])
const formRef = ref<ParkingLotFormHandle | null>(null)
const discardConfirmOpen = ref(false)
const deleteTarget = ref<ParkingLot | null>(null)
const loadError = ref('')
const UNSAVED_MESSAGE = '当前有未保存的停车场信息，确定放弃吗？'

const hasActiveQuery = computed(() =>
  Boolean(parkingLotStore.query.name || parkingLotStore.query.code || parkingLotStore.query.status !== 'all'),
)
const dialogDirty = computed(() =>
  JSON.stringify(formValue.value) !== JSON.stringify(initialFormValue.value),
)
const emptyText = computed(() =>
  hasActiveQuery.value ? '当前查询条件下暂无停车场' : '尚未新增停车场',
)

function cloneWriteInput(input: ParkingLotWriteInput): ParkingLotWriteInput {
  return { ...input }
}

function recordToWriteInput(record: ParkingLot): ParkingLotWriteInput {
  return {
    name: record.name,
    code: record.code,
    address: record.address,
    totalSpaces: record.totalSpaces,
    enabled: record.enabled,
    remark: record.remark,
  }
}

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function applyQuery(): void {
  parkingLotStore.setQuery({ ...queryDraft.value })
}

function resetQuery(): void {
  parkingLotStore.resetQuery()
  queryDraft.value = { ...parkingLotStore.query }
}

function openCreateDialog(): void {
  parkingLotStore.resetError()
  dialogMode.value = 'create'
  editingId.value = null
  formValue.value = { ...EMPTY_FORM }
  initialFormValue.value = { ...EMPTY_FORM }
  formIssues.value = []
  dialogOpen.value = true
}

function openEditDialog(record: ParkingLot): void {
  parkingLotStore.resetError()
  const value = recordToWriteInput(record)
  dialogMode.value = 'edit'
  editingId.value = record.id
  formValue.value = cloneWriteInput(value)
  initialFormValue.value = cloneWriteInput(value)
  formIssues.value = []
  dialogOpen.value = true
}

function closeDialog(): void {
  dialogOpen.value = false
  discardConfirmOpen.value = false
  formIssues.value = []
  editingId.value = null
}

function requestDialogClose(request: CrudDialogCloseRequest): void {
  if (request.dirty) {
    discardConfirmOpen.value = true
    return
  }
  closeDialog()
}

function confirmDiscardChanges(): boolean {
  return !dialogOpen.value || !dialogDirty.value || window.confirm(UNSAVED_MESSAGE)
}

function handleBeforeUnload(event: BeforeUnloadEvent): void {
  if (!dialogOpen.value || !dialogDirty.value) return
  event.preventDefault()
  event.returnValue = ''
}

function updateFormValue(value: ParkingLotWriteInput): void {
  formValue.value = value
  formIssues.value = []
  parkingLotStore.resetError()
}

async function saveParkingLot(): Promise<void> {
  const completedMode = dialogMode.value
  formIssues.value = parkingLotStore.validate(formValue.value, editingId.value ?? undefined).issues
  await nextTick()
  if (!formRef.value?.validateAndFocus() || formIssues.value.length > 0) return

  const saved = dialogMode.value === 'create'
    ? await parkingLotStore.create(formValue.value)
    : editingId.value
      ? await parkingLotStore.update(editingId.value, formValue.value)
      : null

  if (!saved) {
    toast.error(parkingLotStore.error ?? '停车场保存失败，当前填写内容已保留。')
    parkingLotStore.resetError()
    return
  }

  closeDialog()
  toast.success(completedMode === 'create' ? '停车场已新增。' : '停车场信息已更新。')
}

async function removeParkingLot(): Promise<void> {
  const target = deleteTarget.value
  if (!target) return
  const removed = await parkingLotStore.remove(target.id)
  if (!removed) {
    toast.error(parkingLotStore.error ?? '停车场删除失败。')
    parkingLotStore.resetError()
    return
  }
  deleteTarget.value = null
  toast.success('停车场已删除。')
}

async function loadParkingLots(): Promise<void> {
  loadError.value = ''
  const loaded = await parkingLotStore.load()
  if (!loaded) {
    loadError.value = parkingLotStore.error ?? '停车场数据加载失败。'
    toast.error(loadError.value)
  }
}

onMounted(loadParkingLots)
onBeforeRouteLeave(() => confirmDiscardChanges())
useEventListener(window, 'beforeunload', handleBeforeUnload)
</script>

<template>
  <section class="tech-grid min-h-[calc(100svh-4rem)] p-6" aria-labelledby="parking-management-title">
    <div class="mx-auto flex w-full max-w-[1680px] flex-col gap-4">
      <header class="flex items-center justify-between gap-4">
        <div>
          <div class="flex items-center gap-3">
            <span class="grid size-11 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
              <SquareParking class="size-5" aria-hidden="true" />
            </span>
            <div>
              <h1 id="parking-management-title" class="text-2xl font-semibold tracking-tight">
                停车场管理
              </h1>
              <p class="mt-1 text-sm text-muted-foreground">维护停车场基础档案</p>
            </div>
          </div>
        </div>

        <Button size="lg" class="h-11 px-4" @click="openCreateDialog">
          <Plus aria-hidden="true" />
          新增停车场
        </Button>
      </header>

      <QueryPanel @query="applyQuery" @reset="resetQuery">
        <div class="space-y-2">
          <Label for="parking-query-name">停车场名称</Label>
          <Input
            id="parking-query-name"
            v-model="queryDraft.name"
            class="h-11"
            placeholder="请输入停车场名称"
            autocomplete="off"
          />
        </div>
        <div class="space-y-2">
          <Label for="parking-query-code">停车场编码</Label>
          <Input
            id="parking-query-code"
            v-model="queryDraft.code"
            class="h-11 font-mono"
            placeholder="请输入停车场编码"
            autocomplete="off"
          />
        </div>
        <div class="space-y-2">
          <Label for="parking-query-status">启用状态</Label>
          <Select v-model="queryDraft.status">
            <SelectTrigger id="parking-query-status" class="h-11 w-full bg-background">
              <SelectValue placeholder="请选择启用状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="enabled">启用</SelectItem>
              <SelectItem value="disabled">停用</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </QueryPanel>

      <div v-if="loadError && !parkingLotStore.isLoading" class="flex items-center gap-3 rounded-xl border border-destructive/35 bg-destructive/8 p-4" role="alert">
        <AlertTriangle class="size-5 shrink-0 text-destructive" aria-hidden="true" />
        <p class="flex-1 text-sm text-destructive">{{ loadError }}</p>
        <Button variant="outline" size="lg" class="h-11" @click="loadParkingLots">
          <RotateCcw aria-hidden="true" />
          重新加载
        </Button>
      </div>

      <DataTable
        :columns="columns"
        :rows="parkingLotStore.paginatedRecords"
        row-key="id"
        :loading="parkingLotStore.isLoading"
        :empty-text="emptyText"
        caption="停车场基础档案列表"
      >
        <template #cell-index="{ rowIndex }">
          <span class="tabular-nums text-muted-foreground">
            {{ (parkingLotStore.currentPage - 1) * parkingLotStore.pageSize + rowIndex + 1 }}
          </span>
        </template>
        <template #cell-name="{ row }">
          <div class="min-w-0">
            <p class="font-medium text-foreground">{{ row.name }}</p>
            <p v-if="row.remark" class="mt-1 max-w-56 truncate text-xs text-muted-foreground">{{ row.remark }}</p>
          </div>
        </template>
        <template #cell-code="{ row }">
          <span class="rounded-md border bg-muted/35 px-2 py-1 font-mono text-xs">{{ row.code }}</span>
        </template>
        <template #cell-address="{ row }">
          <span class="block max-w-72 truncate text-muted-foreground" :title="row.address || undefined">
            {{ row.address || '—' }}
          </span>
        </template>
        <template #cell-totalSpaces="{ row }">
          <span class="font-semibold tabular-nums">{{ row.totalSpaces.toLocaleString('zh-CN') }}</span>
        </template>
        <template #cell-enabled="{ row }">
          <ParkingLotStatusBadge :enabled="row.enabled" />
        </template>
        <template #cell-updatedAt="{ row }">
          <time class="whitespace-nowrap text-xs tabular-nums text-muted-foreground" :datetime="row.updatedAt">
            {{ formatDateTime(row.updatedAt) }}
          </time>
        </template>
        <template #cell-actions="{ row }">
          <div class="flex justify-end gap-1">
            <Button variant="ghost" size="lg" class="h-11 px-3" :aria-label="`编辑${row.name}`" @click="openEditDialog(row)">
              <PencilLine aria-hidden="true" />
              编辑
            </Button>
            <Button variant="ghost" size="icon-lg" class="h-11 w-11 text-destructive hover:text-destructive" :aria-label="`删除${row.name}`" @click="deleteTarget = row">
              <Trash2 aria-hidden="true" />
            </Button>
          </div>
        </template>
      </DataTable>

      <PaginationBar
        :page="parkingLotStore.currentPage"
        :page-size="parkingLotStore.pageSize"
        :total="parkingLotStore.total"
        :disabled="parkingLotStore.isLoading"
        @update:page="parkingLotStore.setPage"
        @update:page-size="parkingLotStore.setPageSize"
      />
    </div>

    <CrudDialog
      :open="dialogOpen"
      :mode="dialogMode"
      :title="dialogMode === 'create' ? '新增停车场' : '编辑停车场'"
      description="维护停车场基础信息，名称、编码和车位总数为必填项。"
      :saving="parkingLotStore.isSaving"
      :dirty="dialogDirty"
      @submit="saveParkingLot"
      @request-close="requestDialogClose"
    >
      <ParkingLotForm
        :key="`${dialogMode}-${editingId ?? 'new'}`"
        ref="formRef"
        :mode="dialogMode"
        :value="formValue"
        :issues="formIssues"
        :saving="parkingLotStore.isSaving"
        @update:value="updateFormValue"
      />
    </CrudDialog>

    <AlertDialog :open="discardConfirmOpen" @update:open="discardConfirmOpen = $event">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>放弃未保存的修改？</AlertDialogTitle>
          <AlertDialogDescription>当前填写内容尚未保存，关闭后将无法恢复。</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel class="h-11" @click="discardConfirmOpen = false">继续编辑</AlertDialogCancel>
          <AlertDialogAction variant="destructive" class="h-11" @click="closeDialog">
            放弃修改
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog :open="Boolean(deleteTarget)" @update:open="!$event && (deleteTarget = null)">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认删除“{{ deleteTarget?.name }}”？</AlertDialogTitle>
          <AlertDialogDescription>删除后该停车场基础档案将立即移除，且无法恢复。</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel class="h-11">取消</AlertDialogCancel>
          <Button
            variant="destructive"
            class="h-11"
            :disabled="Boolean(parkingLotStore.deletingId)"
            @click="removeParkingLot"
          >
            <Trash2 aria-hidden="true" />
            {{ parkingLotStore.deletingId ? '删除中' : '确认删除' }}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>
</template>
