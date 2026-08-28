<script setup lang="ts">
import type { CrudDialogCloseRequest, CrudDialogMode, DataTableColumn } from '@/components/common'
import type { IntegrationSource, IntegrationSourceQuery, IntegrationSourceWriteInput, IntegrationSyncLogQuery } from '@/modules/external-data-integration/types'
import type { IntegrationSourceFormHandle } from '@/modules/external-data-integration/components/IntegrationSourceForm.vue'
import type { IntegrationValidationIssue } from '@/modules/external-data-integration/lib/integration-validation'
import { computed, nextTick, onMounted, ref } from 'vue'
import {
  AlertTriangle,
  Cable,
  CircleCheck,
  CircleX,
  Clock3,
  FileClock,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  RotateCw,
  ShieldAlert,
} from '@lucide/vue'
import { toast } from 'vue-sonner'
import { CrudSheet, DataTable, PaginationBar, QueryPanel } from '@/components/common'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import IntegrationSourceForm from '@/modules/external-data-integration/components/IntegrationSourceForm.vue'
import IntegrationSyncLogDialog from '@/modules/external-data-integration/components/IntegrationSyncLogDialog.vue'
import { validateIntegrationSourceInput } from '@/modules/external-data-integration/lib/integration-validation'
import {
  DEFAULT_INTEGRATION_LOG_QUERY,
  DEFAULT_INTEGRATION_SOURCE_QUERY,
  INTEGRATION_LOG_PAGE_SIZE,
  useIntegrationStore,
} from '@/modules/external-data-integration/stores/integration-store'
import {
  INTEGRATION_SOURCE_TYPE_LABELS,
  integrationSourceTypeLabel,
  isWritableIntegrationSourceType,
} from '@/modules/external-data-integration/types'

const columns: readonly DataTableColumn<IntegrationSource>[] = [
  { key: 'code', label: '对接源编号', minWidth: '120px' },
  { key: 'name', label: '名称', minWidth: '180px' },
  { key: 'sourceType', label: '类型', minWidth: '125px', align: 'center' },
  { key: 'apiUrl', label: 'API 地址', minWidth: '240px' },
  { key: 'intervalMinutes', label: '同步频率', minWidth: '105px', align: 'right' },
  { key: 'lastSyncAt', label: '最近同步', minWidth: '170px' },
  { key: 'lastSyncStatus', label: '同步状态', minWidth: '110px', align: 'center' },
  { key: 'enabled', label: '启停', width: '90px', align: 'center' },
  { key: 'actions', label: '操作', minWidth: '230px', align: 'right' },
]

const store = useIntegrationStore()
const queryDraft = ref<IntegrationSourceQuery>({ ...DEFAULT_INTEGRATION_SOURCE_QUERY })
const unavailableSyncStatus = ref('all')
const formOpen = ref(false)
const formMode = ref<CrudDialogMode>('create')
const editingId = ref<string | null>(null)
const editingCode = ref('')
const apiKeyMasked = ref('')
const formValue = ref<IntegrationSourceWriteInput>(emptyForm())
const initialFormJson = ref('')
const formIssues = ref<IntegrationValidationIssue[]>([])
const formRef = ref<IntegrationSourceFormHandle | null>(null)
const discardOpen = ref(false)
const logDraft = ref<IntegrationSyncLogQuery>({ ...DEFAULT_INTEGRATION_LOG_QUERY })

const formDirty = computed(() => formOpen.value && JSON.stringify(formValue.value) !== initialFormJson.value)
const hasActiveQuery = computed(() => queryDraft.value.keyword.trim() !== '' || queryDraft.value.sourceType !== 'all')

function emptyForm(): IntegrationSourceWriteInput {
  return {
    name: '',
    sourceType: 'parking',
    apiUrl: '',
    apiKey: '',
    intervalMinutes: 10,
    enabled: true,
    remark: '',
  }
}

function sourceToForm(source: IntegrationSource): IntegrationSourceWriteInput {
  return {
    name: source.name,
    sourceType: source.sourceType,
    apiUrl: source.apiUrl,
    apiKey: '',
    intervalMinutes: source.intervalMinutes,
    enabled: source.enabled,
    remark: source.remark,
  }
}

const dateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
})

function formatDateTime(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : dateTimeFormatter.format(date)
}

function typeBadgeClass(source: IntegrationSource): string {
  if (source.sourceType === 'parking') return 'border-success/30 bg-success/10 text-success'
  if (source.sourceType === 'yun720') return 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300'
  return 'border-border bg-muted/60 text-muted-foreground'
}

function syncStatusText(source: IntegrationSource): string {
  if (source.lastSyncStatus === 'success') return '成功'
  if (source.lastSyncStatus === 'fail') return source.consecutiveFailures > 0 ? `失败 ×${source.consecutiveFailures}` : '失败'
  return '未同步'
}

function syncStatusClass(source: IntegrationSource): string {
  if (source.lastSyncStatus === 'success') return 'border-success/30 bg-success/10 text-success'
  if (source.lastSyncStatus === 'fail') return 'border-destructive/30 bg-destructive/10 text-destructive'
  return 'border-border bg-muted/60 text-muted-foreground'
}

async function load(force = false): Promise<void> {
  if (!await store.initialize(force)) toast.error(store.error ?? '对接源加载失败。')
}

async function applyQuery(): Promise<void> {
  if (!await store.querySources({ ...queryDraft.value })) toast.error(store.error ?? '对接源查询失败。')
}

async function resetQuery(): Promise<void> {
  queryDraft.value = { ...DEFAULT_INTEGRATION_SOURCE_QUERY }
  unavailableSyncStatus.value = 'all'
  if (!await store.resetQuery()) toast.error(store.error ?? '对接源查询重置失败。')
}

async function changePage(page: number): Promise<void> {
  if (!await store.changePage(page)) toast.error(store.error ?? '对接源分页加载失败。')
}

async function changePageSize(pageSize: number): Promise<void> {
  if (!await store.changePageSize(pageSize)) toast.error(store.error ?? '对接源分页加载失败。')
}

function openCreate(): void {
  formMode.value = 'create'
  editingId.value = null
  editingCode.value = ''
  apiKeyMasked.value = ''
  formValue.value = emptyForm()
  initialFormJson.value = JSON.stringify(formValue.value)
  formIssues.value = []
  formOpen.value = true
}

async function openEdit(source: IntegrationSource): Promise<void> {
  if (!isWritableIntegrationSourceType(source.sourceType)) {
    toast.info('存量对接类型仅支持只读展示和手动同步。')
    return
  }
  const detail = await store.getSource(source.id)
  if (!detail) {
    toast.error(store.detailError ?? '对接源详情加载失败。')
    return
  }
  formMode.value = 'edit'
  editingId.value = detail.id
  editingCode.value = detail.code
  apiKeyMasked.value = detail.apiKeyMasked
  formValue.value = sourceToForm(detail)
  initialFormJson.value = JSON.stringify(formValue.value)
  formIssues.value = []
  formOpen.value = true
}

function closeForm(): void {
  formOpen.value = false
  editingId.value = null
  editingCode.value = ''
  apiKeyMasked.value = ''
  formIssues.value = []
  discardOpen.value = false
}

function requestFormClose(request: CrudDialogCloseRequest): void {
  if (request.dirty) discardOpen.value = true
  else closeForm()
}

async function saveForm(): Promise<void> {
  formIssues.value = validateIntegrationSourceInput(formValue.value, formMode.value)
  await nextTick()
  if (!formRef.value?.validateAndFocus() || formIssues.value.length) return
  const created = formMode.value === 'create'
  const saved = created
    ? await store.createSource(formValue.value)
    : editingId.value ? await store.updateSource(editingId.value, formValue.value) : null
  if (!saved) {
    toast.error(store.mutationError ?? '对接源保存失败，当前填写内容已保留。')
    return
  }
  closeForm()
  toast.success(created ? '对接源已新增。' : '对接源已更新。')
}

async function toggleSource(source: IntegrationSource): Promise<void> {
  const updated = await store.toggleSource(source.id)
  if (!updated) {
    toast.error(store.mutationError ?? '启停状态更新失败。')
    return
  }
  toast.success(`${updated.code} 已${updated.enabled ? '启用' : '停用'}。`)
}

async function syncSource(source: IntegrationSource): Promise<void> {
  const result = await store.syncSource(source.id)
  if (!result) {
    toast.error(store.mutationError ?? '同步失败，可重试或查看同步日志。')
    return
  }
  if (result.result === 'fail') {
    toast.error(result.disabled ? `${result.summary}；对接源已自动停用。` : result.summary)
    return
  }
  toast.success(result.summary)
}

async function openLogs(): Promise<void> {
  logDraft.value = { ...store.logQuery }
  if (!await store.openLogs()) toast.error(store.logsError ?? '同步日志加载失败。')
}

async function queryLogs(): Promise<void> {
  if (!await store.queryLogs(logDraft.value)) toast.error(store.logsError ?? '同步日志查询失败。')
}

async function changeLogPage(page: number): Promise<void> {
  if (!await store.changeLogPage(page)) toast.error(store.logsError ?? '同步日志分页加载失败。')
}

onMounted(() => {
  void load()
})
</script>

<template>
  <section class="tech-grid min-h-[calc(100svh-4rem)] min-w-0 overflow-x-hidden p-4 lg:p-6" aria-labelledby="external-integration-title">
    <div class="mx-auto flex w-full max-w-[1680px] flex-col gap-4">
      <header class="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div class="flex min-w-0 items-center gap-3">
          <span class="grid size-11 shrink-0 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
            <Cable class="size-5" aria-hidden="true" />
          </span>
          <div class="min-w-0">
            <h1 id="external-integration-title" class="text-2xl font-semibold tracking-tight">外部数据对接管理</h1>
            <p class="mt-1 text-sm text-muted-foreground">统一维护对接源配置、手动同步与异常日志</p>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <Button size="lg" class="h-11" :disabled="store.isLoading || store.isSaving" @click="openCreate"><Plus aria-hidden="true" />新增对接源</Button>
          <span title="等待后端提供全部同步专用接口">
            <Button variant="outline" size="lg" class="h-11" disabled><RotateCw aria-hidden="true" />全部同步</Button>
          </span>
          <Button variant="outline" size="lg" class="h-11" :disabled="store.isLogsLoading" @click="openLogs">
            <LoaderCircle v-if="store.isLogsLoading" class="animate-spin motion-reduce:animate-none" aria-hidden="true" />
            <FileClock v-else aria-hidden="true" />同步日志
          </Button>
        </div>
      </header>

      <div class="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
        <ShieldAlert class="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <div class="min-w-0 flex-1">
          <p class="font-medium">同一类型仅允许一个启用中的对接源</p>
          <p class="mt-1 text-xs leading-5 text-muted-foreground">连续同步失败达到后端阈值时会自动停用。测试连接、全部同步及部分筛选仍等待后端接口。</p>
        </div>
      </div>

      <QueryPanel :loading="store.isLoading" @query="applyQuery" @reset="resetQuery">
        <div class="space-y-2">
          <Label for="integration-source-type">对接类型</Label>
          <Select v-model="queryDraft.sourceType">
            <SelectTrigger id="integration-source-type" class="h-11 w-full bg-background"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部类型</SelectItem>
              <SelectItem v-for="(label, value) in INTEGRATION_SOURCE_TYPE_LABELS" :key="value" :value="value">{{ label }}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div class="space-y-2">
          <Label for="integration-sync-status">同步状态 <span class="text-xs font-normal text-muted-foreground">等待接口</span></Label>
          <Select v-model="unavailableSyncStatus" disabled>
            <SelectTrigger id="integration-sync-status" class="h-11 w-full bg-background"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">全部同步状态</SelectItem></SelectContent>
          </Select>
        </div>
        <div class="space-y-2">
          <Label for="integration-source-keyword">名称 / 编号</Label>
          <Input id="integration-source-keyword" v-model="queryDraft.keyword" class="h-11 bg-background" placeholder="输入名称或编号" @keydown.enter.prevent="applyQuery" />
        </div>
      </QueryPanel>

      <div v-if="store.error && !store.isLoading" class="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4" role="alert">
        <AlertTriangle class="size-5 shrink-0 text-destructive" aria-hidden="true" />
        <p class="min-w-0 flex-1 text-sm text-destructive">{{ store.error }}</p>
        <Button variant="outline" :disabled="store.isLoading" @click="load(true)"><RefreshCw aria-hidden="true" />重新加载</Button>
      </div>

      <DataTable
        :columns="columns"
        :rows="store.sources"
        row-key="id"
        :loading="store.isLoading"
        caption="外部数据对接源列表"
        :empty-text="hasActiveQuery ? '当前筛选条件下暂无对接源' : '暂无对接源，请先新增配置'"
      >
        <template #cell-code="{ row }"><span class="font-mono text-xs font-semibold text-primary">{{ row.code }}</span></template>
        <template #cell-name="{ row }">
          <div><p class="font-medium">{{ row.name }}</p><p v-if="!isWritableIntegrationSourceType(row.sourceType)" class="mt-1 text-[11px] text-muted-foreground">存量类型 · 配置只读</p></div>
        </template>
        <template #cell-sourceType="{ row }"><Badge variant="outline" :class="typeBadgeClass(row)">{{ integrationSourceTypeLabel(row.sourceType) }}</Badge></template>
        <template #cell-apiUrl="{ row }"><span class="block max-w-72 truncate font-mono text-xs text-muted-foreground" :title="row.apiUrl">{{ row.apiUrl || '—' }}</span></template>
        <template #cell-intervalMinutes="{ row }"><span class="whitespace-nowrap tabular-nums">{{ row.intervalMinutes }} 分钟</span></template>
        <template #cell-lastSyncAt="{ row }"><time class="whitespace-nowrap text-xs tabular-nums text-muted-foreground">{{ formatDateTime(row.lastSyncAt) }}</time></template>
        <template #cell-lastSyncStatus="{ row }">
          <Badge variant="outline" :class="syncStatusClass(row)">
            <CircleCheck v-if="row.lastSyncStatus === 'success'" aria-hidden="true" /><CircleX v-else-if="row.lastSyncStatus === 'fail'" aria-hidden="true" /><Clock3 v-else aria-hidden="true" />
            {{ syncStatusText(row) }}
          </Badge>
        </template>
        <template #cell-enabled="{ row }"><Badge :variant="row.enabled ? 'outline' : 'secondary'" :class="row.enabled ? 'border-success/30 bg-success/10 text-success' : ''">{{ row.enabled ? '启用' : '停用' }}</Badge></template>
        <template #cell-actions="{ row }">
          <div class="flex items-center justify-end gap-1">
            <span :title="isWritableIntegrationSourceType(row.sourceType) ? '' : '存量类型配置只读'">
              <Button variant="ghost" size="sm" :disabled="!isWritableIntegrationSourceType(row.sourceType) || store.isDetailLoading" @click="openEdit(row)"><Pencil aria-hidden="true" />编辑</Button>
            </span>
            <Button variant="ghost" size="sm" :disabled="!row.enabled || store.syncingIds.has(row.id)" @click="syncSource(row)">
              <LoaderCircle v-if="store.syncingIds.has(row.id)" class="animate-spin motion-reduce:animate-none" aria-hidden="true" /><RotateCw v-else aria-hidden="true" />
              {{ store.syncingIds.has(row.id) ? '同步中' : row.lastSyncStatus === 'fail' ? '重试' : '同步' }}
            </Button>
            <span :title="isWritableIntegrationSourceType(row.sourceType) ? '' : '存量类型配置只读'">
              <Button variant="ghost" size="sm" :disabled="!isWritableIntegrationSourceType(row.sourceType) || store.updatingIds.has(row.id)" @click="toggleSource(row)">
                <LoaderCircle v-if="store.updatingIds.has(row.id)" class="animate-spin motion-reduce:animate-none" aria-hidden="true" />
                {{ store.updatingIds.has(row.id) ? '更新中' : row.enabled ? '停用' : '启用' }}
              </Button>
            </span>
          </div>
        </template>
      </DataTable>

      <PaginationBar :page="store.page" :page-size="store.pageSize" :total="store.total" :page-sizes="[20, 50, 100]" :disabled="store.isLoading" @update:page="changePage" @update:page-size="changePageSize" />
    </div>

    <CrudSheet
      :open="formOpen"
      :mode="formMode"
      size="wide"
      :title="formMode === 'create' ? '新增对接源' : `编辑对接源 · ${editingCode}`"
      description="维护外部接口地址、密钥、同步频率与启停状态。"
      :saving="store.isSaving"
      :dirty="formDirty"
      @submit="saveForm"
      @request-close="requestFormClose"
    >
      <IntegrationSourceForm ref="formRef" :value="formValue" :mode="formMode" :api-key-masked="apiKeyMasked" :issues="formIssues" :saving="store.isSaving" @update:value="formValue = $event" />
    </CrudSheet>

    <AlertDialog :open="discardOpen" @update:open="discardOpen = $event">
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>放弃未保存的修改？</AlertDialogTitle><AlertDialogDescription>当前对接源配置尚未保存，关闭后无法恢复。</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>继续编辑</AlertDialogCancel><Button variant="destructive" @click="closeForm">放弃修改</Button></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <IntegrationSyncLogDialog
      :open="store.logOpen"
      :logs="store.logs"
      :query="logDraft"
      :page="store.logPage"
      :page-size="INTEGRATION_LOG_PAGE_SIZE"
      :total="store.logTotal"
      :loading="store.isLogsLoading"
      :error="store.logsError"
      :source-label="store.sourceLabel"
      @update:open="!$event && store.closeLogs()"
      @update:query="logDraft = $event"
      @query="queryLogs"
      @page="changeLogPage"
      @retry="store.loadLogs()"
    />
  </section>
</template>
