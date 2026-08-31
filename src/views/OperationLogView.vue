<script setup lang="ts">
import type { DataTableColumn } from '@/components/common'
import type { OperationLog, OperationLogQuery } from '@/modules/operation-log/types'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CircleX,
  Download,
  Info,
  LoaderCircle,
  RefreshCw,
  ScrollText,
  ShieldCheck,
} from '@lucide/vue'
import { computed, onMounted, ref } from 'vue'
import { toast } from 'vue-sonner'
import { DataTable, PaginationBar, QueryPanel } from '@/components/common'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import OperationLogDetailDialog from '@/modules/operation-log/components/OperationLogDetailDialog.vue'
import {
  DEFAULT_OPERATION_LOG_QUERY,
  useOperationLogStore,
} from '@/modules/operation-log/stores/operation-log-store'
import {
  OPERATION_LOG_RESULT_LABELS,
  operationLogActionLabel,
  operationLogModuleLabel,
} from '@/modules/operation-log/types'
import { useAuthStore } from '@/stores/auth'

const columns: readonly DataTableColumn<OperationLog>[] = [
  { key: 'performedAt', label: '操作时间', minWidth: '176px' },
  { key: 'operatorName', label: '操作人', minWidth: '130px' },
  { key: 'departmentName', label: '所属部门', minWidth: '170px' },
  { key: 'module', label: '模块', minWidth: '140px' },
  { key: 'action', label: '操作类型', minWidth: '120px' },
  { key: 'target', label: '操作对象', minWidth: '250px' },
  { key: 'ipAddress', label: 'IP 地址', minWidth: '130px' },
  { key: 'result', label: '结果', width: '100px', align: 'center' },
  { key: 'actions', label: '操作', width: '104px', align: 'right' },
]

const store = useOperationLogStore()
const authStore = useAuthStore()
const canExport = computed(() => authStore.hasPermission('audit:export'))
const queryDraft = ref<OperationLogQuery>({ ...store.query })
const detailTarget = ref<OperationLog | null>(null)
const hasActiveQuery = computed(() => Object.entries(DEFAULT_OPERATION_LOG_QUERY)
  .some(([key, value]) => store.query[key as keyof OperationLogQuery] !== value))

const dateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

function formatDateTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : dateTimeFormatter.format(date)
}

function targetText(log: OperationLog): string {
  const value = [log.targetType, log.targetId].filter(Boolean).join(' ')
  return value || '—'
}

function actionBadgeClass(action: string): string {
  if (action === 'delete' || action === 'revoke') return 'border-destructive/30 bg-destructive/10 text-destructive'
  if (action === 'publish') return 'border-warning/30 bg-warning/10 text-warning'
  if (action === 'create') return 'border-success/30 bg-success/10 text-success'
  return 'border-primary/30 bg-primary/10 text-primary'
}

async function applyQuery(): Promise<void> {
  if (await store.queryLogs(queryDraft.value)) return
  toast.error(store.queryError ?? store.error ?? '操作日志查询失败')
}

async function resetQuery(): Promise<void> {
  queryDraft.value = { ...DEFAULT_OPERATION_LOG_QUERY }
  if (!await store.resetQuery()) toast.error(store.error ?? '操作日志重置失败')
}

function openDetail(log: OperationLog): void {
  detailTarget.value = log
}

function closeDetail(): void {
  detailTarget.value = null
}

async function exportCurrent(): Promise<void> {
  if (!canExport.value) return
  const file = await store.exportLogs()
  if (!file) {
    toast.error(store.error ?? '操作日志导出失败，请稍后重试。')
    store.resetError()
    return
  }
  const url = URL.createObjectURL(file.content)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = file.filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
  toast.success('操作日志导出已开始。')
}

async function load(): Promise<void> {
  if (!await store.refresh()) toast.error(store.error ?? '操作日志加载失败')
  queryDraft.value = { ...store.query }
}

async function changePage(page: number): Promise<void> {
  if (!await store.changePage(page)) toast.error(store.error ?? '操作日志分页加载失败')
}

async function changePageSize(pageSize: number): Promise<void> {
  if (!await store.changePageSize(pageSize)) toast.error(store.error ?? '操作日志分页加载失败')
}

onMounted(() => {
  void load()
})
</script>

<template>
  <section class="tech-grid min-h-[calc(100svh-4rem)] min-w-0 overflow-x-hidden p-4 lg:p-6" aria-labelledby="operation-log-title">
    <div class="mx-auto flex w-full max-w-[1680px] flex-col gap-4">
      <header class="flex flex-col items-stretch gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div class="flex min-w-0 items-center gap-3">
          <span class="grid size-11 shrink-0 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
            <ScrollText class="size-5" aria-hidden="true" />
          </span>
          <div class="min-w-0">
            <h1 id="operation-log-title" class="text-2xl font-semibold tracking-tight">操作日志</h1>
            <p class="mt-1 text-sm text-muted-foreground">审计追溯后台操作，辅助安全核查与问题定位</p>
          </div>
        </div>
        <Button
          v-if="canExport"
          variant="outline"
          size="lg"
          class="h-11 self-start xl:self-auto"
          :disabled="store.isLoading || store.isExporting"
          @click="exportCurrent"
        >
          <LoaderCircle v-if="store.isExporting" class="animate-spin motion-reduce:animate-none" aria-hidden="true" />
          <Download v-else aria-hidden="true" />
          {{ store.isExporting ? '导出中' : '导出当前结果' }}
        </Button>
      </header>

      <div class="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/6 px-4 py-3 text-sm">
        <ShieldCheck class="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <div class="min-w-0 flex-1">
          <p class="font-medium text-foreground">日志数据范围由当前账号权限控制</p>
          <p class="mt-1 text-xs leading-5 text-muted-foreground">服务端会根据当前账号的审计权限自动过滤可查看和可导出的记录。</p>
        </div>
      </div>

      <QueryPanel :loading="store.isLoading" @query="applyQuery" @reset="resetQuery">
        <div class="space-y-2">
          <Label for="operation-log-module">操作模块</Label>
          <Input id="operation-log-module" v-model="queryDraft.module" class="h-11 bg-background" placeholder="如 user / control" />
        </div>

        <div class="space-y-2">
          <Label for="operation-log-action">操作类型</Label>
          <Input id="operation-log-action" v-model="queryDraft.action" class="h-11 bg-background" placeholder="如 create / login" />
        </div>

        <div class="space-y-2">
          <Label for="operation-log-result">操作结果</Label>
          <Select v-model="queryDraft.result">
            <SelectTrigger id="operation-log-result" class="h-11 w-full bg-background"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部结果</SelectItem>
              <SelectItem value="success">成功</SelectItem>
              <SelectItem value="failure">失败</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div class="space-y-2">
          <Label for="operation-log-start">开始日期</Label>
          <Input id="operation-log-start" v-model="queryDraft.from" type="date" class="h-11 bg-background" :max="queryDraft.to || undefined" />
        </div>

        <div class="space-y-2">
          <Label for="operation-log-end">结束日期</Label>
          <Input id="operation-log-end" v-model="queryDraft.to" type="date" class="h-11 bg-background" :min="queryDraft.from || undefined" />
        </div>

        <div class="space-y-2">
          <Label for="operation-log-keyword">关键词</Label>
          <Input
            id="operation-log-keyword"
            v-model="queryDraft.keyword"
            class="h-11 bg-background"
            placeholder="操作者、模块、动作或详情"
            @keydown.enter.prevent="applyQuery"
          />
        </div>
      </QueryPanel>

      <p v-if="store.queryError" class="flex items-center gap-1.5 text-xs text-destructive" role="alert">
        <AlertTriangle class="size-3.5" aria-hidden="true" />{{ store.queryError }}
      </p>

      <div v-if="store.error && !store.isLoading" class="flex items-center gap-3 rounded-xl border border-destructive/35 bg-destructive/8 p-4" role="alert">
        <AlertTriangle class="size-5 shrink-0 text-destructive" aria-hidden="true" />
        <p class="flex-1 text-sm text-destructive">{{ store.error }}</p>
        <Button variant="outline" size="lg" class="h-11" @click="load"><RefreshCw aria-hidden="true" />重新加载</Button>
      </div>

      <DataTable
        :columns="columns"
        :rows="store.logs"
        row-key="id"
        :loading="store.isLoading"
        :empty-text="hasActiveQuery ? '当前筛选条件下暂无操作日志' : '暂无可见操作日志'"
        caption="后台操作日志列表"
      >
        <template #cell-performedAt="{ row }">
          <time class="whitespace-nowrap text-xs tabular-nums text-muted-foreground">{{ formatDateTime(row.performedAt) }}</time>
        </template>
        <template #cell-operatorName="{ row }">
          <div>
            <p class="font-medium">{{ row.operatorName }}</p>
            <p class="mt-1 font-mono text-[11px] text-muted-foreground">{{ row.operatorId ? `用户 ID：${row.operatorId}` : '系统任务' }}</p>
          </div>
        </template>
        <template #cell-departmentName="{ row }">
          <span class="text-sm text-muted-foreground">{{ row.departmentName || '—' }}</span>
        </template>
        <template #cell-module="{ row }">
          <span class="whitespace-nowrap text-sm">{{ operationLogModuleLabel(row.module) }}</span>
        </template>
        <template #cell-action="{ row }">
          <Badge variant="outline" :class="actionBadgeClass(row.action)">
            <Activity aria-hidden="true" />{{ operationLogActionLabel(row.action) }}
          </Badge>
        </template>
        <template #cell-target="{ row }">
          <div class="max-w-72">
            <p class="font-medium">{{ targetText(row) }}</p>
            <p class="mt-1 truncate font-mono text-xs text-muted-foreground">日志 ID：{{ row.id }}</p>
          </div>
        </template>
        <template #cell-ipAddress="{ row }">
          <span class="whitespace-nowrap font-mono text-xs tabular-nums text-muted-foreground">{{ row.ipAddress }}</span>
        </template>
        <template #cell-result="{ row }">
          <Badge
            variant="outline"
            :class="row.result === 'success' ? 'border-success/30 bg-success/10 text-success' : 'border-destructive/30 bg-destructive/10 text-destructive'"
          >
            <CheckCircle2 v-if="row.result === 'success'" aria-hidden="true" />
            <CircleX v-else aria-hidden="true" />
            {{ OPERATION_LOG_RESULT_LABELS[row.result] }}
          </Badge>
        </template>
        <template #cell-actions="{ row }">
          <Button variant="ghost" class="h-11 px-3 text-primary hover:text-primary" @click="openDetail(row)">
            <Info aria-hidden="true" />详情
          </Button>
        </template>
      </DataTable>

      <PaginationBar
        :page="store.page"
        :page-size="store.pageSize"
        :page-sizes="[20, 50, 100]"
        :total="store.total"
        :disabled="store.isLoading"
        @update:page="changePage"
        @update:page-size="changePageSize"
      />
    </div>

    <OperationLogDetailDialog
      :open="Boolean(detailTarget)"
      :log="detailTarget"
      @update:open="!$event && closeDetail()"
    />
  </section>
</template>
