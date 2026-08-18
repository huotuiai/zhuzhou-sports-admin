<script setup lang="ts">
import type { EChartsCoreOption } from 'echarts/core'
import type { DataTableColumn } from '@/components/common'
import type {
  DashboardDateRange,
  DashboardDistribution,
  DashboardDistributionSlice,
  DashboardFilterState,
  DashboardMetricGroup,
  ParkingUsageItem,
  VrWorkMetric,
} from '@/modules/data-dashboard/types'
import { computed, onMounted, ref } from 'vue'
import { usePreferredReducedMotion } from '@vueuse/core'
import {
  Activity,
  BarChart3,
  ChartNoAxesCombined,
  Database,
  LoaderCircle,
  RefreshCw,
  RotateCw,
  Table2,
} from '@lucide/vue'
import { toast } from 'vue-sonner'
import DashboardChart from '@/modules/data-dashboard/components/DashboardChart.vue'
import DashboardFilterBar from '@/modules/data-dashboard/components/DashboardFilterBar.vue'
import DashboardMetricCard from '@/modules/data-dashboard/components/DashboardMetricCard.vue'
import DistributionDetailDialog from '@/modules/data-dashboard/components/DistributionDetailDialog.vue'
import MetricDetailSheet from '@/modules/data-dashboard/components/MetricDetailSheet.vue'
import {
  buildDistributionOption,
  buildParkingUsageOption,
  dashboardChartTheme,
} from '@/modules/data-dashboard/lib/chart-options'
import {
  rangeForPreset,
  toDashboardDate,
} from '@/modules/data-dashboard/services/dashboard-service'
import { useDataDashboardStore } from '@/modules/data-dashboard/stores/data-dashboard-store'
import { DataTable } from '@/components/common'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useThemeStore } from '@/stores/theme'

interface EChartsClickPayload {
  name?: unknown
  data?: unknown
}

const groupTabs: readonly { value: DashboardMetricGroup, label: string, count: number }[] = [
  { value: 'core', label: '核心指标', count: 7 },
  { value: 'entry', label: '入口行为', count: 13 },
  { value: 'page', label: '页面数据', count: 4 },
]

const vrColumns: readonly DataTableColumn<VrWorkMetric>[] = [
  { key: 'rank', label: 'PV 排行', width: '92px', align: 'center' },
  { key: 'title', label: '作品', minWidth: '210px' },
  { key: 'cover', label: '封面', width: '88px', align: 'center' },
  { key: 'bindingType', label: '绑定对象', minWidth: '118px', align: 'center' },
  { key: 'pv', label: 'PV', minWidth: '100px', align: 'right' },
  { key: 'likes', label: '点赞', minWidth: '90px', align: 'right' },
  { key: 'sceneCount', label: '场景数', minWidth: '82px', align: 'right' },
  { key: 'uv', label: 'UV*', minWidth: '92px', align: 'center' },
  { key: 'shares', label: '分享*', minWidth: '92px', align: 'center' },
  { key: 'messages', label: '留言*', minWidth: '92px', align: 'center' },
  { key: 'phoneClicks', label: '电话点击*', minWidth: '100px', align: 'center' },
  { key: 'lastSyncedAt', label: '最后同步', minWidth: '170px' },
  { key: 'actions', label: '操作', minWidth: '150px', align: 'right' },
]

const store = useDataDashboardStore()
const themeStore = useThemeStore()
const reducedMotion = usePreferredReducedMotion()
const now = new Date()
const today = toDashboardDate(now)
const initialRange = rangeForPreset('last-7-days', now)
const filterState = ref<DashboardFilterState>({
  preset: 'last-7-days',
  customStart: '',
  customEnd: '',
  activityId: '',
})
const exporting = ref(false)

const currentRange = computed<DashboardDateRange>(() => store.snapshot?.operations.range ?? initialRange)
const selectedDistributionTitle = computed(() => store.selectedDistribution?.title ?? '分布明细')
const selectedDistributionSliceLabel = computed(() => store.selectedDistribution?.sliceLabel ?? '')
const chartTheme = computed(() => dashboardChartTheme(themeStore.mode))
const chartPalette = computed(() => [
  chartTheme.value.success,
  chartTheme.value.warning,
  chartTheme.value.danger,
  chartTheme.value.primary,
  chartTheme.value.cyan,
  chartTheme.value.mutedFill,
])

function distributionOption(distribution: DashboardDistribution): EChartsCoreOption {
  return buildDistributionOption(
    distribution,
    themeStore.mode,
    reducedMotion.value === 'reduce',
  )
}

const parkingOption = computed(() => buildParkingUsageOption(
  store.snapshot?.parkingUsage ?? [],
  themeStore.mode,
  reducedMotion.value === 'reduce',
))

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date)
}

function parseChartPayload(payload: unknown): EChartsClickPayload {
  return payload && typeof payload === 'object' ? payload as EChartsClickPayload : {}
}

function chartSliceKey(payload: unknown, distribution: DashboardDistribution): string | null {
  const parsed = parseChartPayload(payload)
  if (parsed.data && typeof parsed.data === 'object') {
    const id = Reflect.get(parsed.data, 'id')
    if (typeof id === 'string') return id
  }
  if (typeof parsed.name === 'string') {
    return distribution.slices.find((slice) => slice.label === parsed.name)?.key ?? null
  }
  return null
}

function parkingItemFromPayload(payload: unknown): ParkingUsageItem | null {
  const parsed = parseChartPayload(payload)
  if (parsed.data && typeof parsed.data === 'object') {
    const id = Reflect.get(parsed.data, 'id')
    if (typeof id === 'string') return store.snapshot?.parkingUsage.find((item) => item.id === id) ?? null
  }
  if (typeof parsed.name === 'string') return store.snapshot?.parkingUsage.find((item) => item.name === parsed.name) ?? null
  return null
}

async function applyRange(range: DashboardDateRange): Promise<void> {
  const succeeded = await store.refreshOperations(range)
  if (!succeeded && store.error) toast.error(store.error)
}

async function selectMetric(id: string): Promise<void> {
  await store.selectMetric(id)
}

async function openDistribution(distribution: DashboardDistribution, slice: DashboardDistributionSlice): Promise<void> {
  await store.openDistributionDetail({
    id: distribution.id,
    title: distribution.title,
    sliceKey: slice.key,
    sliceLabel: slice.label,
  })
}

async function handleDistributionChartClick(distribution: DashboardDistribution, payload: unknown): Promise<void> {
  const key = chartSliceKey(payload, distribution)
  const slice = distribution.slices.find((item) => item.key === key)
  if (slice) await openDistribution(distribution, slice)
}

async function openParkingDetail(item: ParkingUsageItem): Promise<void> {
  await store.openDistributionDetail({
    id: 'parking-usage',
    title: '停车场车位使用情况',
    sliceKey: item.id,
    sliceLabel: `${item.name} 停车场`,
  })
}

async function handleParkingChartClick(payload: unknown): Promise<void> {
  const item = parkingItemFromPayload(payload)
  if (item) await openParkingDetail(item)
}

function csvCell(value: unknown): string {
  return `"${String(value ?? '').replaceAll('"', '""')}"`
}

function downloadCsv(filename: string, headers: readonly string[], rows: readonly (readonly unknown[])[]): void {
  const content = `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}`
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

async function exportMetricDetails(): Promise<void> {
  if (!store.selectedMetric || exporting.value) return
  exporting.value = true
  try {
    const rows = await store.readMetricExport()
    const metric = store.selectedMetric
    const dimension = store.detailDimension === 'secondary' ? metric.secondaryLabel : metric.primaryLabel
    downloadCsv(
      `数据看板-${metric.name}-${currentRange.value.start}-${currentRange.value.end}.csv`,
      ['日期', '指标', '数据维度', '数值', '来源入口'],
      rows.map((row) => [row.date, metric.name, dimension, row.value, row.sourceEntry]),
    )
    toast.success(`已导出 ${rows.length} 条指标明细`)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '导出失败')
  } finally {
    exporting.value = false
  }
}

async function syncVrWork(id: string): Promise<void> {
  const succeeded = await store.syncVrWork(id)
  if (succeeded) {
    const work = store.snapshot?.vrWorks.find((item) => item.id === id)
    toast.success(`同步完成，已更新至 ${formatDateTime(work?.lastSyncedAt)}`)
  } else {
    toast.error(store.syncErrors[id] ?? '同步失败，可重试')
  }
}

function pendingValue(value: number | null): string {
  return value === null ? '待接入' : value.toLocaleString('zh-CN')
}

onMounted(async () => {
  await store.load(initialRange)
})
</script>

<template>
  <section class="tech-grid min-h-[calc(100svh-4rem)] min-w-0 overflow-x-hidden p-4 lg:p-6" aria-labelledby="data-dashboard-title">
    <div class="mx-auto flex w-full max-w-[1680px] flex-col gap-6">
      <header class="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
        <div class="flex items-center gap-3">
          <span class="grid size-11 shrink-0 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
            <ChartNoAxesCombined class="size-5" aria-hidden="true" />
          </span>
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <h1 id="data-dashboard-title" class="text-2xl font-semibold tracking-tight">数据看板</h1>
              <Badge variant="outline" class="border-warning/35 bg-warning/8 text-warning">示例数据</Badge>
            </div>
            <p class="mt-1 text-sm text-muted-foreground">聚合运营指标、现状分布与 720 云作品累计数据</p>
          </div>
        </div>

        <div class="flex min-h-11 items-center gap-2 self-start rounded-lg border border-border/70 bg-card/75 px-3 py-2 text-xs text-muted-foreground xl:self-auto">
          <span class="relative flex size-2" aria-hidden="true">
            <span class="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-40 motion-reduce:animate-none" />
            <span class="relative inline-flex size-2 rounded-full bg-success" />
          </span>
          <span>示例快照更新至 {{ formatDateTime(store.snapshot?.operations.updatedAt) }}</span>
        </div>
      </header>

      <div v-if="store.error && !store.snapshot && !store.isLoading" class="grid min-h-80 place-items-center rounded-xl border border-danger/25 bg-danger/5 p-8 text-center">
        <div>
          <Database class="mx-auto size-9 text-danger" aria-hidden="true" />
          <h2 class="mt-4 font-semibold">数据看板加载失败</h2>
          <p class="mt-2 text-sm text-muted-foreground">{{ store.error }}</p>
          <Button class="mt-5" @click="store.load(initialRange)">
            <RefreshCw aria-hidden="true" />重新加载
          </Button>
        </div>
      </div>

      <template v-else>
        <section class="space-y-4" aria-labelledby="operations-section-title" :aria-busy="store.isLoading || store.isOperationsLoading">
          <div class="flex flex-wrap items-center gap-2">
            <span class="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
              <Activity class="size-4" aria-hidden="true" />
            </span>
            <h2 id="operations-section-title" class="text-base font-semibold">板块一 · 运营数据</h2>
            <Badge variant="secondary">受时间筛选联动</Badge>
          </div>

          <DashboardFilterBar
            v-if="store.snapshot"
            v-model="filterState"
            :current-range="currentRange"
            :activities="store.snapshot.activities"
            :today="today"
            :loading="store.isOperationsLoading"
            @apply="applyRange"
            @validation-error="toast.error($event)"
          />
          <Skeleton v-else class="h-36 w-full rounded-xl" />

          <div class="flex flex-wrap gap-2" role="tablist" aria-label="运营指标分类">
            <button
              v-for="tab in groupTabs"
              :key="tab.value"
              type="button"
              role="tab"
              class="inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none"
              :class="store.activeGroup === tab.value ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card/80 text-muted-foreground hover:border-primary/40 hover:text-foreground'"
              :aria-selected="store.activeGroup === tab.value"
              @click="store.setActiveGroup(tab.value)"
            >
              {{ tab.label }}
              <span class="rounded-full px-1.5 py-0.5 text-[10px]" :class="store.activeGroup === tab.value ? 'bg-primary-foreground/15' : 'bg-muted'">{{ tab.count }}</span>
            </button>
          </div>

          <div v-if="store.snapshot" class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <DashboardMetricCard
              v-for="metric in store.visibleMetrics"
              :key="metric.id"
              :metric="metric"
              :selected="store.selectedMetricId === metric.id"
              :loading="store.isOperationsLoading"
              @select="selectMetric"
            />
          </div>
          <div v-else class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Skeleton v-for="index in 7" :key="index" class="h-36 rounded-xl" />
          </div>
        </section>

        <section class="space-y-4" aria-labelledby="distribution-section-title">
          <div class="flex flex-wrap items-center gap-2">
            <span class="grid size-8 place-items-center rounded-lg bg-cyan-500/10 text-cyan-700 dark:text-cyan-300">
              <BarChart3 class="size-4" aria-hidden="true" />
            </span>
            <h2 id="distribution-section-title" class="text-base font-semibold">板块二 · 现状分布</h2>
            <Badge variant="secondary">固定展示，不随筛选变更</Badge>
          </div>

          <div v-if="store.snapshot" class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card v-for="distribution in store.snapshot.distributions" :key="distribution.id" class="gap-2 py-0">
              <div class="px-4 pt-4">
                <h3 class="text-sm font-semibold">{{ distribution.title }}</h3>
                <p class="mt-1 text-xs text-muted-foreground">{{ distribution.description }}</p>
              </div>
              <div class="h-44 px-2">
                <DashboardChart
                  :option="distributionOption(distribution)"
                  :accessible-label="distribution.title"
                  @chart-click="handleDistributionChartClick(distribution, $event)"
                />
              </div>
              <div class="flex flex-wrap gap-2 border-t border-border/60 px-4 py-3">
                <button
                  v-for="(slice, index) in distribution.slices"
                  :key="slice.key"
                  type="button"
                  class="inline-flex min-h-8 items-center gap-1.5 rounded-md px-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none"
                  @click="openDistribution(distribution, slice)"
                >
                  <span class="size-2.5 rounded-sm" :style="{ backgroundColor: chartPalette[index % chartPalette.length] }" aria-hidden="true" />
                  {{ slice.label }} <strong class="font-semibold tabular-nums text-foreground">{{ slice.value }}</strong>
                </button>
              </div>
            </Card>
          </div>
          <div v-else class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Skeleton v-for="index in 4" :key="index" class="h-72 rounded-xl" />
          </div>

          <Card v-if="store.snapshot" class="gap-2 py-0">
            <div class="flex flex-col justify-between gap-2 px-4 pt-4 sm:flex-row sm:items-center">
              <div>
                <h3 class="text-sm font-semibold">停车场车位使用情况</h3>
                <p class="mt-1 text-xs text-muted-foreground">低使用率绿色 · 高使用率橙色 · 已满红色</p>
              </div>
              <span class="text-xs text-muted-foreground">点击柱体查看停车场明细</span>
            </div>
            <div class="h-72 min-w-0 px-2 sm:h-80">
              <DashboardChart
                :option="parkingOption"
                accessible-label="停车场车位使用情况柱状图"
                @chart-click="handleParkingChartClick"
              />
            </div>
            <div class="flex flex-wrap gap-2 border-t border-border/60 px-4 py-3" aria-label="停车场车位使用情况快捷明细">
              <button
                v-for="parking in store.snapshot.parkingUsage"
                :key="parking.id"
                type="button"
                class="min-h-9 rounded-lg border border-border/70 bg-background/60 px-3 text-xs transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none"
                @click="openParkingDetail(parking)"
              >
                <strong>{{ parking.name }}</strong>
                <span class="ml-2 tabular-nums text-muted-foreground">{{ parking.usageRate }}% · 剩余 {{ parking.available }}</span>
              </button>
            </div>
          </Card>
          <Skeleton v-else class="h-96 rounded-xl" />
        </section>

        <section class="space-y-4" aria-labelledby="vr-section-title">
          <div class="flex flex-wrap items-center gap-2">
            <span class="grid size-8 place-items-center rounded-lg bg-violet-500/10 text-violet-700 dark:text-violet-300">
              <Table2 class="size-4" aria-hidden="true" />
            </span>
            <h2 id="vr-section-title" class="text-base font-semibold">板块三 · VR 作品数据</h2>
            <Badge variant="secondary">720 云累计，固定展示</Badge>
          </div>

          <DataTable
            :columns="vrColumns"
            :rows="store.snapshot?.vrWorks ?? []"
            row-key="id"
            :loading="store.isLoading"
            caption="VR 作品累计数据"
            empty-text="暂无 VR 作品，请先配置 720 云对接"
          >
            <template #cell-rank="{ row }">
              <span class="inline-grid size-7 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">{{ row.rank }}</span>
            </template>
            <template #cell-title="{ row }">
              <div :class="row.availability === 'invalid' ? 'opacity-55' : ''">
                <p class="font-medium">{{ row.title }}</p>
                <Badge v-if="row.availability === 'invalid'" variant="destructive" class="mt-1">已失效</Badge>
              </div>
            </template>
            <template #cell-cover="{ row }">
              <span class="inline-grid h-9 w-12 place-items-center rounded-md bg-gradient-to-br from-sky-800 to-cyan-500 text-[10px] font-semibold text-white shadow-sm">{{ row.coverLabel }}</span>
            </template>
            <template #cell-bindingType="{ row }">
              <Badge :variant="row.bindingType === 'manual' ? 'secondary' : 'outline'">
                {{ row.bindingType === 'manual' ? '手动绑定' : '外部绑定' }}
              </Badge>
            </template>
            <template #cell-pv="{ row }"><strong class="tabular-nums">{{ row.pv.toLocaleString('zh-CN') }}</strong></template>
            <template #cell-likes="{ row }"><span class="tabular-nums">{{ row.likes.toLocaleString('zh-CN') }}</span></template>
            <template #cell-sceneCount="{ row }"><span class="tabular-nums">{{ row.sceneCount }}</span></template>
            <template #cell-uv="{ row }"><Badge v-if="row.uv === null" variant="outline" class="border-dashed text-muted-foreground">{{ pendingValue(row.uv) }}</Badge><span v-else>{{ pendingValue(row.uv) }}</span></template>
            <template #cell-shares="{ row }"><Badge v-if="row.shares === null" variant="outline" class="border-dashed text-muted-foreground">{{ pendingValue(row.shares) }}</Badge><span v-else>{{ pendingValue(row.shares) }}</span></template>
            <template #cell-messages="{ row }"><Badge v-if="row.messages === null" variant="outline" class="border-dashed text-muted-foreground">{{ pendingValue(row.messages) }}</Badge><span v-else>{{ pendingValue(row.messages) }}</span></template>
            <template #cell-phoneClicks="{ row }"><Badge v-if="row.phoneClicks === null" variant="outline" class="border-dashed text-muted-foreground">{{ pendingValue(row.phoneClicks) }}</Badge><span v-else>{{ pendingValue(row.phoneClicks) }}</span></template>
            <template #cell-lastSyncedAt="{ row }"><span class="whitespace-nowrap text-xs tabular-nums">{{ formatDateTime(row.lastSyncedAt) }}</span></template>
            <template #cell-actions="{ row }">
              <div class="inline-flex flex-col items-end gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  :disabled="store.syncingVrIds.has(row.id) || row.availability === 'invalid'"
                  @click="syncVrWork(row.id)"
                >
                  <LoaderCircle v-if="store.syncingVrIds.has(row.id)" class="animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  <RotateCw v-else aria-hidden="true" />
                  {{ store.syncingVrIds.has(row.id) ? '同步中' : '手动同步' }}
                </Button>
                <span v-if="store.syncErrors[row.id]" class="max-w-44 text-right text-[10px] leading-4 text-danger">{{ store.syncErrors[row.id] }}</span>
              </div>
            </template>
          </DataTable>
        </section>
      </template>
    </div>

    <MetricDetailSheet
      :open="Boolean(store.selectedMetric)"
      :metric="store.selectedMetric"
      :dimension="store.detailDimension"
      :detail="store.metricDetail"
      :loading="store.isDetailLoading"
      :exporting="exporting"
      :error="store.detailError"
      @update:open="!$event && store.closeMetricDetail()"
      @update:dimension="store.setDetailDimension($event)"
      @update:page="store.setDetailPage($event)"
      @retry="store.loadMetricDetail()"
      @export="exportMetricDetails"
    />

    <DistributionDetailDialog
      :open="Boolean(store.selectedDistribution)"
      :title="selectedDistributionTitle"
      :slice-label="selectedDistributionSliceLabel"
      :rows="store.distributionDetails"
      :loading="store.isDistributionLoading"
      :error="store.distributionError"
      @update:open="!$event && store.closeDistributionDetail()"
      @retry="store.retryDistributionDetail()"
    />
  </section>
</template>
