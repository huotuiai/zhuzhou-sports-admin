<script setup lang="ts">
import type { EChartsCoreOption } from 'echarts/core'
import type { DataTableColumn } from '@/components/common'
import type {
  DashboardDateRange,
  DashboardDistribution,
  DashboardDistributionSlice,
  DashboardFilterState,
  DashboardMetricGroup,
  DashboardStatsQuery,
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
import DistributionDetailSheet from '@/modules/data-dashboard/components/DistributionDetailSheet.vue'
import DashboardFilterBar from '@/modules/data-dashboard/components/DashboardFilterBar.vue'
import DashboardMetricCard from '@/modules/data-dashboard/components/DashboardMetricCard.vue'
import MetricDetailSheet from '@/modules/data-dashboard/components/MetricDetailSheet.vue'
import {
  buildDistributionOption,
  buildParkingUsageOption,
  distributionSliceColor,
} from '@/modules/data-dashboard/lib/chart-options'
import {
  queryForPreset,
  toDashboardDate,
} from '@/modules/data-dashboard/services/dashboard-service'
import { useDataDashboardStore } from '@/modules/data-dashboard/stores/data-dashboard-store'
import { DataTable } from '@/components/common'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useThemeStore } from '@/stores/theme'
import { useAuthStore } from '@/stores/auth'

const groupTabs: readonly { value: DashboardMetricGroup, label: string }[] = [
  { value: 'entry', label: '入口行为' },
  { value: 'page', label: '页面数据' },
]

const vrColumns: readonly DataTableColumn<VrWorkMetric>[] = [
  { key: 'rank', label: 'PV 排行', width: '92px', align: 'center' },
  { key: 'title', label: '作品', minWidth: '210px' },
  { key: 'cover', label: '封面', width: '88px', align: 'center' },
  { key: 'bindingObject', label: '绑定对象', minWidth: '150px' },
  { key: 'pv', label: 'PV', minWidth: '100px', align: 'right' },
  { key: 'uv', label: 'UV', minWidth: '90px', align: 'right' },
  { key: 'likes', label: '点赞', minWidth: '90px', align: 'right' },
  { key: 'sceneCount', label: '场景数', minWidth: '82px', align: 'right' },
  { key: 'status', label: '状态', minWidth: '90px', align: 'center' },
  { key: 'lastSyncedAt', label: '最后同步', minWidth: '170px' },
]

const store = useDataDashboardStore()
const authStore = useAuthStore()
const themeStore = useThemeStore()
const canExport = computed(() => authStore.hasPermission('dashboard:export'))
const canSyncVr = computed(() => authStore.hasPermission('integration:operate'))
const reducedMotion = usePreferredReducedMotion()
const now = new Date()
const today = toDashboardDate(now)
const initialQuery = queryForPreset('last-7-days', now)
const initialRange: DashboardDateRange = { start: initialQuery.start, end: initialQuery.end }
const filterState = ref<DashboardFilterState>({
  preset: 'last-7-days',
  customStart: '',
  customEnd: '',
  activityId: '',
})
const exporting = ref(false)

const currentRange = computed<DashboardDateRange>(() => store.snapshot?.operations.range ?? initialRange)
function distributionOption(distribution: DashboardDistribution): EChartsCoreOption {
  return buildDistributionOption(
    distribution,
    themeStore.mode,
    reducedMotion.value === 'reduce',
  )
}

function distributionColor(slice: DashboardDistributionSlice): string {
  return distributionSliceColor(slice, themeStore.mode)
}

function chartItemId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const data = (payload as { data?: unknown }).data
  if (!data || typeof data !== 'object') return null
  const id = (data as { id?: unknown }).id
  return typeof id === 'string' || typeof id === 'number' ? String(id) : null
}

function selectDistributionSlice(distribution: DashboardDistribution, slice: DashboardDistributionSlice): void {
  void store.selectDistribution({
    kind: distribution.detailKind,
    slice: slice.key,
    title: distribution.title,
    label: slice.label,
  })
}

function selectDistributionChartSlice(distribution: DashboardDistribution, payload: unknown): void {
  const id = chartItemId(payload)
  const slice = distribution.slices.find(item => item.key === id)
  if (slice) selectDistributionSlice(distribution, slice)
}

function selectParking(id: string): void {
  const parking = store.snapshot?.parkingUsage.find(item => item.id === id)
  if (!parking) return
  void store.selectDistribution({
    kind: 'parking_remain',
    slice: parking.id,
    title: '停车场车位使用情况',
    label: parking.name,
  })
}

function selectParkingChart(payload: unknown): void {
  const id = chartItemId(payload)
  if (id) selectParking(id)
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
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('month')}-${part('day')} ${part('hour')}:${part('minute')}`
}

async function applyRange(query: DashboardStatsQuery): Promise<void> {
  const succeeded = await store.refreshOperations(query)
  if (!succeeded && store.error) toast.error(store.error)
}

async function selectMetric(id: string): Promise<void> {
  await store.selectMetric(id)
}

function downloadFile(content: Blob, filename: string): void {
  const url = URL.createObjectURL(content)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

async function exportMetricDetails(): Promise<void> {
  if (!canExport.value || !store.selectedMetric || exporting.value) return
  exporting.value = true
  try {
    const file = await store.exportMetricDetails()
    if (!file) throw new Error(store.detailError ?? '导出失败')
    downloadFile(file.content, file.filename)
    toast.success('指标原始埋点 CSV 已导出')
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '导出失败')
  } finally {
    exporting.value = false
  }
}

async function syncVrWorks(): Promise<void> {
  if (!canSyncVr.value) return
  const result = await store.syncVrWorks()
  if (!result) {
    toast.error(store.vrSyncError ?? '同步失败，可重试')
    return
  }
  if (result.result === 'fail') {
    toast.error(result.disabled ? `${result.summary}；对接源已自动停用` : result.summary)
    return
  }
  toast.success(result.summary)
}

onMounted(async () => {
  await store.load(initialQuery)
})
</script>

<template>
  <section class="tech-grid min-h-[calc(100svh-4rem)] min-w-0 overflow-x-hidden p-4 lg:p-6" aria-labelledby="data-dashboard-title">
    <div class="mx-auto flex w-full max-w-[1680px] flex-col gap-6">
      <header class="flex items-center gap-3">
        <div class="flex items-center gap-3">
          <span class="grid size-11 shrink-0 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
            <ChartNoAxesCombined class="size-5" aria-hidden="true" />
          </span>
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <h1 id="data-dashboard-title" class="text-2xl font-semibold tracking-tight">数据看板</h1>
            </div>
            <p class="mt-1 text-sm text-muted-foreground">运营复盘与决策入口</p>
          </div>
        </div>
      </header>

      <div v-if="store.error && !store.snapshot && !store.isLoading" class="grid min-h-80 place-items-center rounded-xl border border-danger/25 bg-danger/5 p-8 text-center">
        <div>
          <Database class="mx-auto size-9 text-danger" aria-hidden="true" />
          <h2 class="mt-4 font-semibold">数据看板加载失败</h2>
          <p class="mt-2 text-sm text-muted-foreground">{{ store.error }}</p>
          <Button class="mt-5" @click="store.load(initialQuery)">
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
              <span class="rounded-full px-1.5 py-0.5 text-[10px]" :class="store.activeGroup === tab.value ? 'bg-primary-foreground/15' : 'bg-muted'">{{ store.metricGroupCounts[tab.value] }}</span>
            </button>
          </div>

          <div v-if="store.snapshot" class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
                  @chart-click="selectDistributionChartSlice(distribution, $event)"
                />
              </div>
              <div class="flex flex-wrap gap-2 border-t border-border/60 px-4 py-3">
                <button
                  v-for="slice in distribution.slices"
                  :key="slice.key"
                  type="button"
                  class="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-md px-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none"
                  :aria-label="`查看${distribution.title}${slice.label}明细`"
                  @click="selectDistributionSlice(distribution, slice)"
                >
                  <span class="size-2.5 rounded-sm" :style="{ backgroundColor: distributionColor(slice) }" aria-hidden="true" />
                  {{ slice.label }} <strong class="font-semibold tabular-nums text-foreground">{{ slice.value }}</strong>
                </button>
              </div>
            </Card>
          </div>
          <div v-else class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Skeleton v-for="index in 3" :key="index" class="h-72 rounded-xl" />
          </div>

          <Card v-if="store.snapshot" class="gap-2 py-0">
            <div class="flex flex-col justify-between gap-2 px-4 pt-4 sm:flex-row sm:items-center">
              <div>
                <h3 class="text-sm font-semibold">停车场车位使用情况</h3>
                <p class="mt-1 text-xs text-muted-foreground">低使用率绿色 · 高使用率橙色 · 已满红色</p>
              </div>
              <span class="text-xs text-muted-foreground">数据为当前停车余位快照</span>
            </div>
            <div class="h-72 min-w-0 px-2 sm:h-80">
              <DashboardChart
                :option="parkingOption"
                accessible-label="停车场车位使用情况柱状图"
                @chart-click="selectParkingChart"
              />
            </div>
            <div class="flex flex-wrap gap-2 border-t border-border/60 px-4 py-3" aria-label="停车场车位使用情况摘要">
              <button
                v-for="parking in store.snapshot.parkingUsage"
                :key="parking.id"
                type="button"
                class="inline-flex min-h-9 cursor-pointer items-center rounded-lg border border-border/70 bg-background/60 px-3 text-xs transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none"
                :aria-label="`查看${parking.name}停车余位明细`"
                @click="selectParking(parking.id)"
              >
                <strong>{{ parking.name }}</strong>
                <span class="ml-2 tabular-nums text-muted-foreground">{{ parking.usageRate }}% · 剩余 {{ parking.available ?? '未知' }}</span>
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
            <Button v-if="canSyncVr" variant="outline" size="sm" class="ml-auto" :disabled="store.isVrSyncing" @click="syncVrWorks">
              <LoaderCircle v-if="store.isVrSyncing" class="animate-spin motion-reduce:animate-none" aria-hidden="true" />
              <RotateCw v-else aria-hidden="true" />
              {{ store.isVrSyncing ? '同步中' : '同步全部 720 云' }}
            </Button>
          </div>

          <p v-if="store.vrSyncError" class="rounded-lg border border-danger/25 bg-danger/5 px-3 py-2 text-xs text-danger">{{ store.vrSyncError }}</p>

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
              <p class="font-medium">{{ row.title }}</p><p class="mt-1 font-mono text-[10px] text-muted-foreground">{{ row.externalId }}</p>
            </template>
            <template #cell-cover="{ row }">
              <img v-if="row.coverUrl" :src="row.coverUrl" :alt="`${row.title}封面`" class="h-10 w-14 rounded-md border object-cover">
              <span v-else class="inline-grid h-10 w-14 place-items-center rounded-md bg-gradient-to-br from-sky-800 to-cyan-500 text-[10px] font-semibold text-white shadow-sm">VR</span>
            </template>
            <template #cell-bindingObject="{ row }"><span class="text-xs text-muted-foreground">{{ row.bindingObject ?? '—' }}</span></template>
            <template #cell-pv="{ row }"><strong class="tabular-nums">{{ row.pv.toLocaleString('zh-CN') }}</strong></template>
            <template #cell-uv="{ row }"><span class="tabular-nums">{{ row.uv?.toLocaleString('zh-CN') ?? '—' }}</span></template>
            <template #cell-likes="{ row }"><span class="tabular-nums">{{ row.likes.toLocaleString('zh-CN') }}</span></template>
            <template #cell-sceneCount="{ row }"><span class="tabular-nums">{{ row.sceneCount }}</span></template>
            <template #cell-status="{ row }"><Badge :variant="row.isInvalid ? 'destructive' : row.enabled ? 'outline' : 'secondary'">{{ row.isInvalid ? '已失效' : row.enabled ? '启用' : '停用' }}</Badge></template>
            <template #cell-lastSyncedAt="{ row }"><span class="whitespace-nowrap text-xs tabular-nums">{{ formatDateTime(row.lastSyncedAt) }}</span></template>
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
      :trend-loading="store.isTrendLoading"
      :exporting="exporting"
      :can-export="canExport"
      :error="store.detailError"
      :trend-error="store.trendError"
      @update:open="!$event && store.closeMetricDetail()"
      @update:dimension="store.setDetailDimension($event)"
      @update:page="store.setDetailPage($event)"
      @update:page-size="store.setDetailPageSize($event)"
      @retry="store.loadMetricDetail()"
      @retry-trend="store.loadMetricTrend()"
      @export="exportMetricDetails"
    />
    <DistributionDetailSheet
      :open="Boolean(store.selectedDistribution)"
      :selection="store.selectedDistribution"
      :detail="store.distributionDetail"
      :loading="store.isDistributionDetailLoading"
      :error="store.distributionDetailError"
      @update:open="!$event && store.closeDistributionDetail()"
      @update:page="store.setDistributionDetailPage($event)"
      @update:page-size="store.setDistributionDetailPageSize($event)"
      @retry="store.loadDistributionDetail()"
    />
  </section>
</template>
