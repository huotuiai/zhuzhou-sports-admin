<script setup lang="ts">
import type { DataTableColumn } from '@/components/common'
import type {
  DashboardMetric,
  DashboardMetricDetail,
  DashboardMetricDimension,
  MetricDetailPage,
} from '../types'
import { computed } from 'vue'
import { usePreferredReducedMotion } from '@vueuse/core'
import { Download, LoaderCircle, RefreshCw, X } from '@lucide/vue'
import DashboardChart from './DashboardChart.vue'
import { buildMetricTrendOption } from '../lib/chart-options'
import { DataTable, PaginationBar } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useThemeStore } from '@/stores/theme'

const props = defineProps<{
  open: boolean
  metric: DashboardMetric | null
  dimension: DashboardMetricDimension
  detail: MetricDetailPage
  loading?: boolean
  trendLoading?: boolean
  exporting?: boolean
  error?: string | null
  trendError?: string | null
}>()

const emit = defineEmits<{
  'update:open': [open: boolean]
  'update:dimension': [dimension: DashboardMetricDimension]
  'update:page': [page: number]
  retry: []
  retryTrend: []
  export: []
}>()

const themeStore = useThemeStore()
const reducedMotion = usePreferredReducedMotion()

const columns: readonly DataTableColumn<DashboardMetricDetail>[] = [
  { key: 'occurredAt', label: '发生时间', minWidth: '168px' },
  { key: 'eventName', label: '事件', minWidth: '150px' },
  { key: 'deviceId', label: '设备', minWidth: '150px' },
  { key: 'page', label: '页面', minWidth: '150px' },
  { key: 'reference', label: '关联对象', minWidth: '150px' },
]

const chartOption = computed(() => props.metric
  ? buildMetricTrendOption(
      props.metric,
      props.dimension,
      themeStore.mode,
      reducedMotion.value === 'reduce',
    )
  : {})

const currentDimensionLabel = computed(() => {
  if (!props.metric) return '指标'
  return props.dimension === 'secondary'
    ? (props.metric.secondaryLabel ?? '次级数据')
    : props.metric.primaryLabel
})

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(date)
}

function referenceLabel(row: DashboardMetricDetail): string {
  if (!row.referenceType && !row.referenceId) return '—'
  return [row.referenceType, row.referenceId ? `#${row.referenceId}` : ''].filter(Boolean).join(' ')
}
</script>

<template>
  <Sheet :open="open" @update:open="emit('update:open', $event)">
    <SheetContent
      side="right"
      :show-close-button="false"
      class="!w-[min(640px,calc(100vw-1rem))] !max-w-none gap-0 p-0 sm:!max-w-[640px]"
    >
      <SheetHeader class="shrink-0 border-b px-5 py-4 pr-14 text-left">
        <div class="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div class="min-w-0">
            <SheetTitle class="truncate text-lg font-semibold">{{ metric?.name ?? '指标详情' }}</SheetTitle>
            <SheetDescription class="mt-1 leading-5">
              当前筛选范围逐日趋势与原始埋点事件 · {{ currentDimensionLabel }}
            </SheetDescription>
          </div>
          <Button
            variant="outline"
            class="h-10 shrink-0 self-start"
            :disabled="!metric || loading || exporting"
            @click="emit('export')"
          >
            <LoaderCircle v-if="exporting" class="animate-spin motion-reduce:animate-none" aria-hidden="true" />
            <Download v-else aria-hidden="true" />
            {{ exporting ? '导出中' : '导出 CSV' }}
          </Button>
        </div>
        <Button
          variant="ghost"
          size="icon-lg"
          class="absolute right-2 top-2 h-11 w-11"
          aria-label="关闭指标详情"
          @click="emit('update:open', false)"
        >
          <X aria-hidden="true" />
        </Button>
      </SheetHeader>

      <div class="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5">
        <div
          v-if="metric && metric.secondaryValue !== null"
          class="mx-auto mb-5 flex w-fit rounded-lg border bg-muted/65 p-1"
          role="tablist"
          aria-label="指标数据维度"
        >
          <button
            type="button"
            role="tab"
            class="min-h-10 rounded-md px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none"
            :class="dimension === 'primary' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'"
            :aria-selected="dimension === 'primary'"
            @click="emit('update:dimension', 'primary')"
          >
            {{ metric.primaryLabel }}
          </button>
          <button
            type="button"
            role="tab"
            class="min-h-10 rounded-md px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none"
            :class="dimension === 'secondary' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'"
            :aria-selected="dimension === 'secondary'"
            @click="emit('update:dimension', 'secondary')"
          >
            {{ metric.secondaryLabel }}
          </button>
        </div>

        <section class="rounded-xl border bg-card/70 p-4" aria-labelledby="metric-trend-title">
          <div class="mb-3 flex items-center justify-between gap-3">
            <h3 id="metric-trend-title" class="text-sm font-semibold">逐日趋势</h3>
            <span class="text-xs text-muted-foreground">{{ currentDimensionLabel }}</span>
          </div>
          <div v-if="trendError" class="grid h-64 place-items-center rounded-lg bg-danger/5 p-5 text-center">
            <div>
              <p class="text-sm text-danger">{{ trendError }}</p>
              <Button variant="outline" class="mt-3" @click="emit('retryTrend')"><RefreshCw aria-hidden="true" />重试趋势</Button>
            </div>
          </div>
          <div v-else-if="metric" class="h-64 min-w-0">
            <DashboardChart
              :option="chartOption"
              :accessible-label="`${metric.name}${currentDimensionLabel}逐日趋势`"
              :loading="trendLoading"
            />
          </div>
        </section>

        <section class="mt-5" aria-labelledby="metric-detail-table-title">
          <div class="mb-3 flex items-center justify-between gap-3">
            <h3 id="metric-detail-table-title" class="text-sm font-semibold">原始埋点事件</h3>
            <span class="text-xs text-muted-foreground">每页 20 条</span>
          </div>

          <div v-if="error" class="grid min-h-44 place-items-center rounded-xl border border-danger/25 bg-danger/5 p-6 text-center">
            <div>
              <p class="text-sm font-medium text-danger">{{ error }}</p>
              <Button variant="outline" class="mt-4" @click="emit('retry')">
                <RefreshCw aria-hidden="true" />重新加载
              </Button>
            </div>
          </div>

          <template v-else>
            <DataTable
              :columns="columns"
              :rows="detail.items"
              row-key="id"
              :loading="loading"
              caption="指标明细列表"
              empty-text="当前时间范围暂无指标明细"
              :skeleton-rows="5"
            >
              <template #cell-occurredAt="{ row }"><span class="whitespace-nowrap text-xs tabular-nums">{{ formatDateTime(row.occurredAt) }}</span></template>
              <template #cell-deviceId="{ row }"><span class="block max-w-40 truncate font-mono text-xs" :title="row.deviceId ?? ''">{{ row.deviceId ?? '—' }}</span></template>
              <template #cell-page="{ row }"><span class="block max-w-40 truncate text-xs" :title="row.page ?? ''">{{ row.page ?? '—' }}</span></template>
              <template #cell-reference="{ row }"><span class="whitespace-nowrap text-xs">{{ referenceLabel(row) }}</span></template>
            </DataTable>
            <PaginationBar
              v-if="detail.total > 0"
              class="mt-3"
              :page="detail.page"
              :page-size="detail.pageSize"
              :page-sizes="[20]"
              :total="detail.total"
              :disabled="loading"
              @update:page="emit('update:page', $event)"
            />
          </template>
        </section>
      </div>
    </SheetContent>
  </Sheet>
</template>
