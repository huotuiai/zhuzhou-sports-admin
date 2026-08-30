<script setup lang="ts">
import type { CrudDialogCloseRequest, CrudDialogMode, DataTableColumn } from '@/components/common'
import type { VrLink, VrLinkQuery, VrLinkValidationIssue, VrLinkWriteInput, VrPlaceOption, VrPlaceType } from '@/modules/vr-link-management/types'
import {
  ExternalLink,
  Link2,
  LoaderCircle,
  MapPin,
  PencilLine,
  Plus,
  RotateCcw,
  ScanEye,
  Trash2,
  TriangleAlert,
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import VrLinkForm from '@/modules/vr-link-management/components/VrLinkForm.vue'
import VrLinkStatusBadge from '@/modules/vr-link-management/components/VrLinkStatusBadge.vue'
import { useVrLinkStore } from '@/modules/vr-link-management/stores/vr-link-store'

const EMPTY: VrLinkWriteInput = {
  title: '',
  vrUrl: '',
  placeType: 'gate',
  placeId: '',
  status: 'enabled',
  remark: '',
}

const columns: readonly DataTableColumn<VrLink>[] = [
  { key: 'title', label: '展示名称', minWidth: '230px' },
  { key: 'placeType', label: '地点类型', width: '120px', align: 'center' },
  { key: 'placeName', label: '绑定地点', minWidth: '210px' },
  { key: 'vrUrl', label: 'VR 地址', minWidth: '280px' },
  { key: 'status', label: '状态', width: '112px', align: 'center' },
  { key: 'updatedAt', label: '更新时间', width: '170px' },
  { key: 'actions', label: '操作', width: '190px', align: 'right' },
]

const store = useVrLinkStore()
const queryDraft = ref<VrLinkQuery>({ ...store.query })
const formOpen = ref(false)
const formMode = ref<CrudDialogMode>('create')
const editingId = ref<string | null>(null)
const editingRecord = ref<VrLink | null>(null)
const formValue = ref<VrLinkWriteInput>({ ...EMPTY })
const initialValue = ref<VrLinkWriteInput>({ ...EMPTY })
const issues = ref<readonly VrLinkValidationIssue[]>([])
const formRef = ref<{ validateAndFocus(): boolean } | null>(null)
const discardOpen = ref(false)
const deleteTarget = ref<VrLink | null>(null)
const loadError = ref('')

const formDirty = computed(() => JSON.stringify(formValue.value) !== JSON.stringify(initialValue.value))
const hasQuery = computed(() => Boolean(store.query.keyword || store.query.placeType !== 'all' || store.query.status !== 'all'))
const formPlaceOptions = computed<VrPlaceOption[]>(() => {
  const options = store.placeOptions.map(option => ({ ...option }))
  const current = editingRecord.value
  if (
    formMode.value === 'edit' && current && current.placeType === formValue.value.placeType &&
    !options.some(option => option.id === current.placeId)
  ) {
    options.unshift({ id: current.placeId, name: current.placeName, extra: '', available: false })
  }
  return options
})
const submitDisabled = computed(() => store.isPlaceOptionsLoading || !formValue.value.placeId)

function toWriteInput(item: VrLink): VrLinkWriteInput {
  return {
    title: item.title,
    vrUrl: item.vrUrl,
    placeType: item.placeType,
    placeId: item.placeId,
    status: item.status,
    remark: item.remark,
  }
}

function placeTypeClass(type: VrPlaceType): string {
  if (type === 'gate') return 'border-primary/25 bg-primary/8 text-primary'
  if (type === 'parking') return 'border-cyan-500/30 bg-cyan-500/8 text-cyan-700 dark:text-cyan-300'
  return 'border-warning/30 bg-warning/10 text-warning'
}

function hostName(url: string): string {
  try {
    return new URL(url).hostname
  }
  catch {
    return url
  }
}

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value || '—'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

async function refreshFormPlaceOptions(placeType: VrPlaceType): Promise<void> {
  const loaded = await store.loadPlaceOptions(placeType)
  if (!loaded && store.placeOptionsType === placeType && store.placeOptionsError) {
    toast.error(store.placeOptionsError)
  }
}

function openCreate(): void {
  store.resetError()
  formMode.value = 'create'
  editingId.value = null
  editingRecord.value = null
  formValue.value = { ...EMPTY }
  initialValue.value = { ...EMPTY }
  issues.value = []
  formOpen.value = true
  void refreshFormPlaceOptions('gate')
}

async function openEdit(item: VrLink): Promise<void> {
  store.resetError()
  const detail = await store.get(item.id)
  if (!detail) {
    toast.error(store.error ?? 'VR 绑定详情加载失败。')
    return
  }
  const value = toWriteInput(detail)
  formMode.value = 'edit'
  editingId.value = detail.id
  editingRecord.value = detail
  formValue.value = { ...value }
  initialValue.value = { ...value }
  issues.value = []
  formOpen.value = true
  void refreshFormPlaceOptions(detail.placeType)
}

function closeForm(): void {
  initialValue.value = { ...formValue.value }
  formOpen.value = false
  editingId.value = null
  editingRecord.value = null
  issues.value = []
  discardOpen.value = false
}

function requestFormClose(request: CrudDialogCloseRequest): void {
  if (request.dirty) discardOpen.value = true
  else closeForm()
}

function updateForm(value: VrLinkWriteInput): void {
  const typeChanged = value.placeType !== formValue.value.placeType
  formValue.value = { ...value }
  issues.value = []
  store.resetError()
  if (typeChanged) void refreshFormPlaceOptions(value.placeType)
}

async function save(): Promise<void> {
  issues.value = store.validate(formValue.value).issues
  await nextTick()
  if (!formRef.value?.validateAndFocus() || issues.value.length) return
  const created = formMode.value === 'create'
  const saved = created
    ? await store.create(formValue.value)
    : editingId.value ? await store.update(editingId.value, formValue.value) : null
  if (!saved) {
    toast.error(store.error ?? 'VR 地点绑定保存失败，当前填写内容已保留。')
    return
  }
  closeForm()
  toast.success(created ? 'VR 地点绑定已新增。' : 'VR 地点绑定已更新。')
}

async function toggleStatus(item: VrLink): Promise<void> {
  if (store.updatingStatusId) return
  const nextStatus = item.status === 'enabled' ? 'disabled' : 'enabled'
  const saved = await store.updateStatus(item.id, nextStatus)
  if (!saved) {
    toast.error(store.error ?? 'VR 绑定状态更新失败。')
    return
  }
  toast.success(nextStatus === 'enabled' ? 'VR 绑定已启用，H5 端可读取。' : 'VR 绑定已停用，H5 端将不再读取。')
}

async function applyQuery(): Promise<void> {
  if (!await store.setQuery({ ...queryDraft.value })) toast.error(store.error ?? 'VR 绑定查询失败。')
}

async function resetQuery(): Promise<void> {
  const next: VrLinkQuery = { keyword: '', placeType: 'all', status: 'all' }
  if (!await store.resetQuery()) {
    toast.error(store.error ?? 'VR 绑定列表重置失败。')
    return
  }
  queryDraft.value = next
}

async function changePage(value: number): Promise<void> {
  if (!await store.setPage(value)) toast.error(store.error ?? 'VR 绑定列表加载失败。')
}

async function changePageSize(value: number): Promise<void> {
  if (!await store.setPageSize(value)) toast.error(store.error ?? 'VR 绑定列表加载失败。')
}

function requestDelete(item: VrLink): void {
  store.resetError()
  deleteTarget.value = item
}

async function remove(): Promise<void> {
  if (!deleteTarget.value) return
  if (await store.remove(deleteTarget.value.id)) {
    deleteTarget.value = null
    toast.success('VR 地点绑定已删除。')
  }
  else toast.error(store.error ?? '删除失败，请刷新后重试。')
}

function confirmLeave(): boolean {
  return !formOpen.value || !formDirty.value || window.confirm('当前有未保存的 VR 绑定信息，确定放弃吗？')
}

function beforeUnload(event: BeforeUnloadEvent): void {
  if (formOpen.value && formDirty.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}

async function load(): Promise<void> {
  loadError.value = ''
  if (!await store.load()) {
    loadError.value = store.error ?? 'VR 地点绑定数据加载失败'
    toast.error(loadError.value)
  }
}

onMounted(load)
onBeforeRouteLeave(() => confirmLeave())
useEventListener(window, 'beforeunload', beforeUnload)
</script>

<template>
  <section class="tech-grid min-h-[calc(100svh-4rem)] p-6" aria-labelledby="vr-link-title">
    <div class="mx-auto flex w-full max-w-[1680px] flex-col gap-4">
      <header class="flex items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <span class="grid size-11 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary"><ScanEye class="size-5" aria-hidden="true" /></span>
          <div><h1 id="vr-link-title" class="text-2xl font-semibold tracking-tight">VR 地点绑定</h1><p class="mt-1 text-sm text-muted-foreground">将 VR 外链与场馆地点建立一对一绑定</p></div>
        </div>
        <Button size="lg" class="h-11 px-4" :disabled="store.isLoading" @click="openCreate"><Plus aria-hidden="true" />新增绑定</Button>
      </header>

      <QueryPanel :loading="store.isLoading" @query="applyQuery" @reset="resetQuery">
        <div class="space-y-2"><Label for="vr-link-keyword">名称或 VR 地址</Label><Input id="vr-link-keyword" v-model="queryDraft.keyword" class="h-11" placeholder="请输入展示名称或 VR 地址" autocomplete="off" /></div>
        <div class="space-y-2"><Label for="vr-link-place-type">地点类型</Label><Select v-model="queryDraft.placeType"><SelectTrigger id="vr-link-place-type" class="h-11 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部类型</SelectItem><SelectItem value="gate">检票口</SelectItem><SelectItem value="parking">停车场</SelectItem><SelectItem value="shuttle_stop">接驳站点</SelectItem></SelectContent></Select></div>
        <div class="space-y-2"><Label for="vr-link-status">状态</Label><Select v-model="queryDraft.status"><SelectTrigger id="vr-link-status" class="h-11 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部状态</SelectItem><SelectItem value="enabled">启用</SelectItem><SelectItem value="disabled">停用</SelectItem></SelectContent></Select></div>
      </QueryPanel>

      <div v-if="loadError && !store.isLoading" class="flex items-center gap-3 rounded-xl border border-destructive/35 bg-destructive/8 p-4" role="alert">
        <TriangleAlert class="size-5 shrink-0 text-destructive" aria-hidden="true" /><p class="flex-1 text-sm text-destructive">{{ loadError }}</p><Button variant="outline" size="lg" class="h-11" @click="load"><RotateCcw aria-hidden="true" />重新加载</Button>
      </div>

      <DataTable :columns="columns" :rows="store.records" row-key="id" :loading="store.isLoading" :empty-text="hasQuery ? '当前查询条件下暂无 VR 地点绑定' : '暂无 VR 地点绑定，请新增'" caption="VR 地点绑定列表">
        <template #cell-title="{ row }">
          <div class="max-w-72"><p class="truncate font-medium" :title="row.title">{{ row.title }}</p><p v-if="row.remark" class="mt-1 truncate text-xs text-muted-foreground" :title="row.remark">{{ row.remark }}</p></div>
        </template>
        <template #cell-placeType="{ row }"><Badge variant="outline" :class="['gap-1.5', placeTypeClass(row.placeType)]"><MapPin class="size-3.5" />{{ row.placeTypeLabel }}</Badge></template>
        <template #cell-placeName="{ row }"><div class="flex max-w-64 items-center gap-2"><Link2 class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /><span :class="['truncate', row.placeName === '（已删除）' ? 'text-warning' : 'font-medium']" :title="row.placeName">{{ row.placeName }}</span></div></template>
        <template #cell-vrUrl="{ row }">
          <a :href="row.vrUrl" target="_blank" rel="noopener noreferrer" class="group inline-flex max-w-72 cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-primary transition-colors duration-200 hover:bg-primary/8 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none" :title="row.vrUrl">
            <span class="truncate font-mono text-xs">{{ hostName(row.vrUrl) }}</span><ExternalLink class="size-3.5 shrink-0 transition-colors group-hover:text-primary" aria-hidden="true" />
          </a>
        </template>
        <template #cell-status="{ row }"><VrLinkStatusBadge :status="row.status" interactive :loading="store.updatingStatusId === row.id" @click="toggleStatus(row)" /></template>
        <template #cell-updatedAt="{ row }"><time :datetime="row.updatedAt" class="whitespace-nowrap text-sm tabular-nums text-muted-foreground">{{ formatDateTime(row.updatedAt) }}</time></template>
        <template #cell-actions="{ row }">
          <div class="flex justify-end gap-1">
            <Button variant="ghost" class="h-11 px-3" :disabled="store.detailLoadingId === row.id" @click="openEdit(row)"><LoaderCircle v-if="store.detailLoadingId === row.id" class="animate-spin motion-reduce:animate-none" aria-hidden="true" /><PencilLine v-else aria-hidden="true" />编辑</Button>
            <Button variant="ghost" size="icon-lg" class="h-11 w-11 text-destructive hover:bg-destructive/10 hover:text-destructive" :aria-label="`删除${row.title}`" @click="requestDelete(row)"><Trash2 aria-hidden="true" /></Button>
          </div>
        </template>
      </DataTable>

      <PaginationBar :page="store.currentPage" :page-size="store.pageSize" :total="store.total" :page-sizes="[20, 50, 100]" :disabled="store.isLoading" @update:page="changePage" @update:page-size="changePageSize" />
    </div>

    <CrudSheet
      :open="formOpen"
      :mode="formMode"
      :title="formMode === 'create' ? '新增 VR 地点绑定' : `编辑绑定 · ${editingRecord?.title ?? ''}`"
      description="维护 VR 打开地址、关联地点与 H5 可用状态。"
      :saving="store.isSaving"
      :dirty="formDirty"
      :submit-disabled="submitDisabled"
      @submit="save"
      @request-close="requestFormClose"
    >
      <VrLinkForm
        :key="`${formMode}-${editingId ?? 'new'}`"
        ref="formRef"
        :mode="formMode"
        :value="formValue"
        :place-options="formPlaceOptions"
        :issues="issues"
        :saving="store.isSaving"
        :place-options-loading="store.isPlaceOptionsLoading"
        :place-options-error="store.placeOptionsError"
        @update:value="updateForm"
      />
    </CrudSheet>

    <AlertDialog :open="discardOpen" @update:open="discardOpen = $event">
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>放弃未保存的修改？</AlertDialogTitle><AlertDialogDescription>当前 VR 地点绑定信息尚未保存，关闭后将无法恢复。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel class="h-11">继续编辑</AlertDialogCancel><Button variant="destructive" class="h-11" @click="closeForm"><X />放弃修改</Button></AlertDialogFooter></AlertDialogContent>
    </AlertDialog>

    <AlertDialog :open="Boolean(deleteTarget)" @update:open="!$event && (deleteTarget = null)">
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>确认删除“{{ deleteTarget?.title }}”？</AlertDialogTitle><AlertDialogDescription>删除后不可恢复，H5 将无法再读取该地点的 VR 绑定；历史操作日志仍按审计规则保留。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel class="h-11">取消</AlertDialogCancel><Button variant="destructive" class="h-11" :disabled="Boolean(store.deletingId)" @click="remove"><LoaderCircle v-if="store.deletingId" class="animate-spin motion-reduce:animate-none" aria-hidden="true" /><Trash2 v-else />{{ store.deletingId ? '删除中' : '确认删除' }}</Button></AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
  </section>
</template>
