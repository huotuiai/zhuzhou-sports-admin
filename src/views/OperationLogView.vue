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
import { computed, nextTick, onMounted, ref } from 'vue'
import { toast } from 'vue-sonner'
import { DataTable, PaginationBar, QueryPanel } from '@/components/common'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import OperationLogDetailDialog from '@/modules/operation-log/components/OperationLogDetailDialog.vue'
import {
  createOperationLogExport,
  operationLogExportBlockReason,
} from '@/modules/operation-log/lib/export'
import {
  DEFAULT_OPERATION_LOG_QUERY,
  OPERATION_LOG_PAGE_SIZE,
  resolveOperationLogViewerScope,
  useOperationLogStore,
} from '@/modules/operation-log/stores/operation-log-store'
import {
  OPERATION_LOG_ACTION_LABELS,
  OPERATION_LOG_MODULE_LABELS,
  OPERATION_LOG_RESULT_LABELS,
} from '@/modules/operation-log/types'
import { useRbacStore } from '@/modules/system-management/stores/rbac-store'
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
const rbacStore = useRbacStore()
const authStore = useAuthStore()
const queryDraft = ref<OperationLogQuery>({ ...DEFAULT_OPERATION_LOG_QUERY })
const detailTarget = ref<OperationLog | null>(null)
const exporting = ref(false)
const scopeWarning = ref('')

const moduleEntries = Object.entries(OPERATION_LOG_MODULE_LABELS) as Array<
  [OperationLog['module'], string]
>
const actionEntries = Object.entries(OPERATION_LOG_ACTION_LABELS) as Array<
  [OperationLog['action'], string]
>
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
  return `${log.targetType} ${log.targetId}`
}

function actionBadgeClass(action: OperationLog['action']): string {
  if (action === 'delete' || action === 'revoke') return 'border-destructive/30 bg-destructive/10 text-destructive'
  if (action === 'publish') return 'border-warning/30 bg-warning/10 text-warning'
  if (action === 'create') return 'border-success/30 bg-success/10 text-success'
  return 'border-primary/30 bg-primary/10 text-primary'
}

function applyQuery(): void {
  if (!store.setQuery(queryDraft.value)) {
    toast.error(store.queryError ?? '查询条件无效')
  }
}

function resetQuery(): void {
  queryDraft.value = { ...DEFAULT_OPERATION_LOG_QUERY }
  store.resetQuery()
}

function openDetail(log: OperationLog): void {
  detailTarget.value = log
}

function closeDetail(): void {
  detailTarget.value = null
}

async function exportCurrent(): Promise<void> {
  if (exporting.value) return
  const logs = store.filteredLogs
  const blocked = operationLogExportBlockReason(logs)
  if (blocked === 'empty') {
    toast.info('当前筛选范围内没有可导出的日志。')
    return
  }
  if (blocked === 'too-many') {
    toast.warning('当前结果超过 50,000 条，请缩小时间范围后再导出。')
    return
  }

  exporting.value = true
  await nextTick()
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  try {
    const file = createOperationLogExport(logs)
    const url = URL.createObjectURL(new Blob([file.content], { type: file.mimeType }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = file.filename
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
    toast.success(`已导出 ${logs.length} 条操作日志。`)
  } catch {
    toast.error('操作日志导出失败，请稍后重试。')
  } finally {
    exporting.value = false
  }
}

async function load(): Promise<void> {
  scopeWarning.value = ''
  const [rbacLoaded, logsLoaded] = await Promise.all([
    rbacStore.load(),
    store.load(),
  ])
  store.setViewerScope(resolveOperationLogViewerScope(
    authStore.user,
    rbacLoaded ? rbacStore.snapshot : null,
  ))
  if (!rbacLoaded) {
    scopeWarning.value = '权限数据加载失败，当前已按最小权限范围展示日志。'
  }
  if (!logsLoaded) toast.error(store.error ?? '操作日志加载失败')
}

onMounted(load)
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
          variant="outline"
          size="lg"
          class="h-11 self-start xl:self-auto"
          :disabled="store.isLoading || exporting"
          @click="exportCurrent"
        >
          <LoaderCircle v-if="exporting" class="animate-spin motion-reduce:animate-none" aria-hidden="true" />
          <Download v-else aria-hidden="true" />
          {{ exporting ? '导出中' : '导出当前结果' }}
        </Button>
      </header>

      <div class="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/6 px-4 py-3 text-sm">
        <ShieldCheck class="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <div class="min-w-0 flex-1">
          <p class="font-medium text-foreground">当前数据范围：{{ store.viewerScope.label }}</p>
          <p class="mt-1 text-xs leading-5 text-muted-foreground">超级管理员查看全部；部门主管查看所管部门及下级部门；普通用户仅查看本人记录。</p>
        </div>
      </div>

      <div v-if="scopeWarning" class="flex items-center gap-3 rounded-xl border border-warning/35 bg-warning/8 p-4 text-sm text-warning" role="alert">
        <AlertTriangle class="size-5 shrink-0" aria-hidden="true" />
        {{ scopeWarning }}
      </div>

      <QueryPanel :loading="store.isLoading" @query="applyQuery" @reset="resetQuery">
        <div class="space-y-2">
          <Label for="operation-log-module">操作模块</Label>
          <Select v-model="queryDraft.module">
            <SelectTrigger id="operation-log-module" class="h-11 w-full bg-background"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部模块</SelectItem>
              <SelectItem v-for="([value, label]) in moduleEntries" :key="value" :value="value">{{ label }}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div class="space-y-2">
          <Label for="operation-log-action">操作类型</Label>
          <Select v-model="queryDraft.action">
            <SelectTrigger id="operation-log-action" class="h-11 w-full bg-background"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部操作类型</SelectItem>
              <SelectItem v-for="([value, label]) in actionEntries" :key="value" :value="value">{{ label }}</SelectItem>
            </SelectContent>
          </Select>
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
          <Input id="operation-log-start" v-model="queryDraft.startDate" type="date" class="h-11 bg-background" :max="queryDraft.endDate || undefined" />
        </div>

        <div class="space-y-2">
          <Label for="operation-log-end">结束日期</Label>
          <Input id="operation-log-end" v-model="queryDraft.endDate" type="date" class="h-11 bg-background" :min="queryDraft.startDate || undefined" />
        </div>

        <div class="space-y-2">
          <Label for="operation-log-operator">操作人</Label>
          <Input
            id="operation-log-operator"
            v-model="queryDraft.operatorKeyword"
            class="h-11 bg-background"
            placeholder="姓名或登录账号"
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
        :rows="store.paginatedLogs"
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
            <p class="mt-1 font-mono text-[11px] text-muted-foreground">{{ row.operatorUsername }}</p>
          </div>
        </template>
        <template #cell-departmentName="{ row }">
          <span class="text-sm text-muted-foreground">{{ row.departmentName || '—' }}</span>
        </template>
        <template #cell-module="{ row }">
          <span class="whitespace-nowrap text-sm">{{ OPERATION_LOG_MODULE_LABELS[row.module] }}</span>
        </template>
        <template #cell-action="{ row }">
          <Badge variant="outline" :class="actionBadgeClass(row.action)">
            <Activity aria-hidden="true" />{{ OPERATION_LOG_ACTION_LABELS[row.action] }}
          </Badge>
        </template>
        <template #cell-target="{ row }">
          <div class="max-w-72">
            <p class="font-medium">{{ targetText(row) }}</p>
            <p class="mt-1 truncate text-xs text-muted-foreground" :title="row.targetLabel">{{ row.targetLabel }}</p>
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
        :page="store.currentPage"
        :page-size="OPERATION_LOG_PAGE_SIZE"
        :page-sizes="[OPERATION_LOG_PAGE_SIZE]"
        :total="store.total"
        :disabled="store.isLoading"
        @update:page="store.setPage"
      />
    </div>

    <OperationLogDetailDialog
      :open="Boolean(detailTarget)"
      :log="detailTarget"
      @update:open="!$event && closeDetail()"
    />
  </section>
</template>
