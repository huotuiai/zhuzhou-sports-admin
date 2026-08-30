<script setup lang="ts">
import type { DataTableColumn } from '@/components/common'
import type { IntegrationSyncLog, IntegrationSyncLogQuery } from '../types'
import { Download, LoaderCircle, RefreshCw, Search, X } from '@lucide/vue'
import { DataTable, PaginationBar } from '@/components/common'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const props = defineProps<{
  open: boolean
  logs: readonly IntegrationSyncLog[]
  query: IntegrationSyncLogQuery
  page: number
  pageSize: number
  total: number
  loading?: boolean
  error?: string | null
  sourceLabel: (sourceId: string) => string
}>()

const emit = defineEmits<{
  'update:open': [open: boolean]
  'update:query': [query: IntegrationSyncLogQuery]
  query: []
  page: [page: number]
  'page-size': [pageSize: number]
  retry: []
}>()

const columns: readonly DataTableColumn<IntegrationSyncLog>[] = [
  { key: 'startedAt', label: '同步时间', minWidth: '170px' },
  { key: 'source', label: '对接源', minWidth: '190px' },
  { key: 'result', label: '结果', width: '90px', align: 'center' },
  { key: 'summary', label: '同步摘要', minWidth: '210px' },
  { key: 'failureReason', label: '失败原因', minWidth: '220px' },
  { key: 'durationMs', label: '耗时', width: '100px', align: 'right' },
]

const dateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
})

function formatDateTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : dateTimeFormatter.format(date)
}

function formatDuration(value: number | null): string {
  if (value === null) return '—'
  if (value < 1000) return `${value} ms`
  return `${(value / 1000).toFixed(1)} s`
}

function patchResult(value: unknown): void {
  if (value === 'all' || value === 'success' || value === 'fail') {
    emit('update:query', { ...props.query, result: value })
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="flex max-h-[min(860px,calc(100svh-2rem))] w-[calc(100vw-2rem)] max-w-6xl flex-col overflow-hidden p-0">
      <DialogHeader class="relative shrink-0 border-b px-5 py-4 pr-16">
        <DialogTitle class="text-lg font-semibold">同步日志</DialogTitle>
        <DialogDescription>保留最近 90 天 · 查询结果来自后端同步日志</DialogDescription>
        <Button type="button" variant="ghost" size="icon-lg" class="absolute right-3 top-3 h-11 w-11" aria-label="关闭同步日志" @click="emit('update:open', false)">
          <X aria-hidden="true" />
        </Button>
      </DialogHeader>

      <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
        <div class="grid gap-3 rounded-xl border bg-muted/20 p-3 md:grid-cols-2 xl:grid-cols-[minmax(150px,1fr)_minmax(130px,0.8fr)_minmax(140px,0.9fr)_auto_minmax(140px,0.9fr)_auto] xl:items-end">
          <div class="space-y-1.5">
            <span class="text-xs font-medium">类型</span>
            <Select model-value="all" disabled><SelectTrigger class="h-10 w-full bg-background"><SelectValue placeholder="类型（全部）" /></SelectTrigger><SelectContent><SelectItem value="all">类型（全部）</SelectItem></SelectContent></Select>
          </div>
          <div class="space-y-1.5">
            <span class="text-xs font-medium">结果</span>
            <Select :model-value="query.result" :disabled="loading" @update:model-value="patchResult">
              <SelectTrigger class="h-10 w-full bg-background"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">全部结果</SelectItem><SelectItem value="success">成功</SelectItem><SelectItem value="fail">失败</SelectItem></SelectContent>
            </Select>
          </div>
          <div class="space-y-1.5"><span class="text-xs font-medium">开始日期</span><Input type="date" class="h-10 bg-background" disabled /></div>
          <span class="hidden pb-3 text-xs text-muted-foreground xl:block">至</span>
          <div class="space-y-1.5"><span class="text-xs font-medium">结束日期</span><Input type="date" class="h-10 bg-background" disabled /></div>
          <div class="flex gap-2">
            <Button type="button" variant="outline" class="h-10" :disabled="loading" @click="emit('query')">
              <LoaderCircle v-if="loading" class="animate-spin motion-reduce:animate-none" aria-hidden="true" /><Search v-else aria-hidden="true" />查询
            </Button>
            <span title="等待后端提供同步日志导出接口"><Button type="button" variant="outline" class="h-10" disabled><Download aria-hidden="true" />导出</Button></span>
          </div>
        </div>

        <p class="rounded-lg border border-warning/25 bg-warning/5 px-3 py-2 text-xs leading-5 text-warning">
          当前接口仅支持结果筛选；类型、日期范围和导出需等待后端补充接口。
        </p>

        <div v-if="error" class="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4" role="alert">
          <p class="min-w-0 flex-1 text-sm text-destructive">{{ error }}</p>
          <Button type="button" variant="outline" :disabled="loading" @click="emit('retry')"><RefreshCw aria-hidden="true" />重试</Button>
        </div>

        <DataTable :columns="columns" :rows="logs" row-key="id" :loading="loading" caption="同步日志列表" empty-text="暂无同步记录" :skeleton-rows="6">
          <template #cell-startedAt="{ row }"><time class="whitespace-nowrap text-xs tabular-nums">{{ formatDateTime(row.startedAt) }}</time></template>
          <template #cell-source="{ row }"><span class="font-medium">{{ sourceLabel(row.sourceId) }}</span></template>
          <template #cell-result="{ row }"><Badge :variant="row.result === 'success' ? 'outline' : 'destructive'" :class="row.result === 'success' ? 'border-success/30 bg-success/10 text-success' : ''">{{ row.result === 'success' ? '成功' : '失败' }}</Badge></template>
          <template #cell-summary="{ row }"><span class="text-sm text-muted-foreground">{{ row.summary || '—' }}</span></template>
          <template #cell-failureReason="{ row }"><span :class="row.failureReason ? 'text-destructive' : 'text-muted-foreground'">{{ row.failureReason || '—' }}</span></template>
          <template #cell-durationMs="{ row }"><span class="whitespace-nowrap tabular-nums text-muted-foreground">{{ formatDuration(row.durationMs) }}</span></template>
        </DataTable>

        <PaginationBar v-if="total > 0" :page="page" :page-size="pageSize" :page-sizes="[20, 50, 100]" :total="total" :disabled="loading" @update:page="emit('page', $event)" @update:page-size="emit('page-size', $event)" />
      </div>
    </DialogContent>
  </Dialog>
</template>
