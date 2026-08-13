<script setup lang="ts">
import type { Component } from 'vue'
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BusFront,
  CalendarDays,
  ChartNoAxesCombined,
  Eye,
  ScanSearch,
  SquareParking,
  TicketCheck,
  TrafficCone,
} from '@lucide/vue'
import { computed, ref } from 'vue'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type PeriodDimension = 'day' | 'month' | 'event'

interface DashboardMetric {
  id: string
  name: string
  description: string
  value: number
  previousValue: number
  unit: '次' | '%'
  change: number
  icon: Component
  toneClass: string
}

interface EventPeriod {
  id: string
  name: string
  dateRange: string
  comparison: string
}

const dimensions: readonly { value: PeriodDimension, label: string }[] = [
  { value: 'day', label: '日' },
  { value: 'month', label: '月' },
  { value: 'event', label: '活动周期' },
]

const eventPeriods: readonly EventPeriod[] = [
  {
    id: 'concert-202608',
    name: '2026 盛夏音乐节',
    dateRange: '2026.08.08—08.10',
    comparison: '2026 城市运动会',
  },
  {
    id: 'games-202607',
    name: '2026 城市运动会',
    dateRange: '2026.07.18—07.24',
    comparison: '2026 全民健身日',
  },
  {
    id: 'fitness-202606',
    name: '2026 全民健身日',
    dateRange: '2026.06.14—06.15',
    comparison: '2026 春季体育嘉年华',
  },
]

const metricsByDimension: Record<PeriodDimension, readonly DashboardMetric[]> = {
  day: [
    { id: 'visits', name: '用户访问量', description: 'H5 / VR 页面访问人次', value: 18642, previousValue: 16789, unit: '次', change: 11.0, icon: Eye, toneClass: 'bg-sky-500/10 text-sky-700 dark:text-sky-300' },
    { id: 'parking', name: '车位使用率', description: '各停车场已用车位占比', value: 78.6, previousValue: 72.4, unit: '%', change: 8.6, icon: SquareParking, toneClass: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300' },
    { id: 'shuttle', name: '接驳车查询次数', description: '线路、站点及到站时间查询', value: 3286, previousValue: 3512, unit: '次', change: -6.4, icon: BusFront, toneClass: 'bg-violet-500/10 text-violet-700 dark:text-violet-300' },
    { id: 'gate', name: '检票口检索次数', description: '按座位区检索检票口', value: 2147, previousValue: 1826, unit: '次', change: 17.6, icon: TicketCheck, toneClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
    { id: 'traffic', name: '交通管制查看次数', description: '交通管制信息查看次数', value: 5940, previousValue: 5211, unit: '次', change: 14.0, icon: TrafficCone, toneClass: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  ],
  month: [
    { id: 'visits', name: '用户访问量', description: 'H5 / VR 页面访问人次', value: 398620, previousValue: 354108, unit: '次', change: 12.6, icon: Eye, toneClass: 'bg-sky-500/10 text-sky-700 dark:text-sky-300' },
    { id: 'parking', name: '车位使用率', description: '各停车场已用车位周期均值', value: 74.2, previousValue: 68.8, unit: '%', change: 7.8, icon: SquareParking, toneClass: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300' },
    { id: 'shuttle', name: '接驳车查询次数', description: '线路、站点及到站时间查询', value: 69420, previousValue: 62356, unit: '次', change: 11.3, icon: BusFront, toneClass: 'bg-violet-500/10 text-violet-700 dark:text-violet-300' },
    { id: 'gate', name: '检票口检索次数', description: '按座位区检索检票口', value: 45870, previousValue: 40612, unit: '次', change: 12.9, icon: TicketCheck, toneClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
    { id: 'traffic', name: '交通管制查看次数', description: '交通管制信息查看次数', value: 110240, previousValue: 98986, unit: '次', change: 11.4, icon: TrafficCone, toneClass: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  ],
  event: [
    { id: 'visits', name: '用户访问量', description: 'H5 / VR 页面访问人次', value: 72486, previousValue: 58920, unit: '次', change: 23.0, icon: Eye, toneClass: 'bg-sky-500/10 text-sky-700 dark:text-sky-300' },
    { id: 'parking', name: '车位使用率', description: '各停车场已用车位周期均值', value: 91.8, previousValue: 84.6, unit: '%', change: 8.5, icon: SquareParking, toneClass: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300' },
    { id: 'shuttle', name: '接驳车查询次数', description: '线路、站点及到站时间查询', value: 16840, previousValue: 12920, unit: '次', change: 30.3, icon: BusFront, toneClass: 'bg-violet-500/10 text-violet-700 dark:text-violet-300' },
    { id: 'gate', name: '检票口检索次数', description: '按座位区检索检票口', value: 11625, previousValue: 8640, unit: '次', change: 34.5, icon: TicketCheck, toneClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
    { id: 'traffic', name: '交通管制查看次数', description: '交通管制信息查看次数', value: 28306, previousValue: 19780, unit: '次', change: 43.1, icon: TrafficCone, toneClass: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  ],
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDay(value: string): string {
  const [year, month, day] = value.split('-')
  return year && month && day ? `${year}年${Number(month)}月${Number(day)}日` : value
}

function formatMonth(value: string): string {
  const [year, month] = value.split('-')
  return year && month ? `${year}年${Number(month)}月` : value
}

function previousDay(value: string): string {
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return '前一日'
  date.setDate(date.getDate() - 1)
  return formatDay(toDateInputValue(date))
}

function previousMonth(value: string): string {
  const [year, month] = value.split('-').map(Number)
  if (!year || !month) return '前一月'
  const date = new Date(year, month - 2, 1)
  return formatMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`)
}

const today = new Date()
const dimension = ref<PeriodDimension>('day')
const selectedDay = ref(toDateInputValue(today))
const selectedMonth = ref(toDateInputValue(today).slice(0, 7))
const selectedEventId = ref(eventPeriods[0].id)
const lastUpdatedAt = ref(today)

const currentEvent = computed(() =>
  eventPeriods.find(item => item.id === selectedEventId.value) ?? eventPeriods[0],
)
const selectedPeriodKey = computed(() => {
  if (dimension.value === 'day') return selectedDay.value
  if (dimension.value === 'month') return selectedMonth.value
  return selectedEventId.value
})
const metrics = computed(() => {
  let hash = 0
  for (const character of selectedPeriodKey.value) {
    hash = (hash * 31 + character.charCodeAt(0)) % 997
  }
  const scale = 0.9 + (hash % 21) / 100

  return metricsByDimension[dimension.value].map(metric => ({
    ...metric,
    value: metric.unit === '%'
      ? Math.min(99.9, Number((metric.value * scale).toFixed(1)))
      : Math.round(metric.value * scale),
    previousValue: metric.unit === '%'
      ? Math.min(99.9, Number((metric.previousValue * scale).toFixed(1)))
      : Math.round(metric.previousValue * scale),
  }))
})
const periodTitle = computed(() => {
  if (dimension.value === 'day') return formatDay(selectedDay.value)
  if (dimension.value === 'month') return formatMonth(selectedMonth.value)
  return currentEvent.value.name
})
const periodDetail = computed(() => {
  if (dimension.value === 'event') return currentEvent.value.dateRange
  return dimension.value === 'day' ? '当日实时累计' : '当月累计 / 均值'
})
const comparisonTitle = computed(() => {
  if (dimension.value === 'day') return previousDay(selectedDay.value)
  if (dimension.value === 'month') return previousMonth(selectedMonth.value)
  return currentEvent.value.comparison
})
const upCount = computed(() => metrics.value.filter(metric => metric.change > 0).length)
const downCount = computed(() => metrics.value.filter(metric => metric.change < 0).length)
const strongestMetric = computed(() =>
  [...metrics.value].sort((left, right) => Math.abs(right.change) - Math.abs(left.change))[0],
)
const updatedAtText = computed(() => new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
}).format(lastUpdatedAt.value))

function formatMetricValue(metric: DashboardMetric, previous = false): string {
  const value = previous ? metric.previousValue : metric.value
  return metric.unit === '%' ? value.toFixed(1) : new Intl.NumberFormat('zh-CN').format(value)
}

function changeLabel(metric: DashboardMetric): string {
  if (metric.change > 0) return `上升 ${metric.change.toFixed(1)}%`
  if (metric.change < 0) return `下降 ${Math.abs(metric.change).toFixed(1)}%`
  return '持平 0.0%'
}
</script>

<template>
  <section class="tech-grid min-h-[calc(100svh-4rem)] p-4 sm:p-6" aria-labelledby="dashboard-title">
    <div class="mx-auto flex w-full max-w-[1680px] flex-col gap-4">
      <header class="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div class="flex items-center gap-3">
          <span class="grid size-11 shrink-0 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
            <ChartNoAxesCombined class="size-5" aria-hidden="true" />
          </span>
          <div>
            <h1 id="dashboard-title" class="text-2xl font-semibold tracking-tight">运营概览</h1>
            <p class="mt-1 text-sm text-muted-foreground">聚合核心运行指标，快速掌握场馆运营态势</p>
          </div>
        </div>

        <div class="flex items-center gap-2 self-start rounded-lg border border-border/70 bg-card/75 px-3 py-2 text-xs text-muted-foreground lg:self-auto">
          <span class="relative flex size-2" aria-hidden="true">
            <span class="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-50" />
            <span class="relative inline-flex size-2 rounded-full bg-success" />
          </span>
          <span>数据已更新至 {{ updatedAtText }}</span>
        </div>
      </header>

      <section class="glass-panel rounded-xl border p-4" aria-label="统计筛选">
        <div class="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div class="grid gap-4 md:grid-cols-[auto_minmax(220px,340px)] md:items-end">
            <div>
              <p id="dimension-label" class="mb-2 text-xs font-medium text-muted-foreground">统计维度</p>
              <div class="inline-flex h-11 rounded-lg border border-border bg-muted/65 p-1" role="group" aria-labelledby="dimension-label">
                <button
                  v-for="item in dimensions"
                  :key="item.value"
                  type="button"
                  class="min-w-16 rounded-md px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  :class="dimension === item.value ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:bg-card/60 hover:text-foreground'"
                  :aria-pressed="dimension === item.value"
                  @click="dimension = item.value"
                >
                  {{ item.label }}
                </button>
              </div>
            </div>

            <div>
              <label for="dashboard-period" class="mb-2 block text-xs font-medium text-muted-foreground">统计周期</label>
              <div v-if="dimension === 'day'" class="relative">
                <CalendarDays class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <input
                  id="dashboard-period"
                  v-model="selectedDay"
                  type="date"
                  class="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-3 text-sm text-foreground shadow-xs outline-none transition-colors [color-scheme:light] focus:border-ring focus:ring-3 focus:ring-ring/50 dark:[color-scheme:dark]"
                >
              </div>
              <div v-else-if="dimension === 'month'" class="relative">
                <CalendarDays class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <input
                  id="dashboard-period"
                  v-model="selectedMonth"
                  type="month"
                  class="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-3 text-sm text-foreground shadow-xs outline-none transition-colors [color-scheme:light] focus:border-ring focus:ring-3 focus:ring-ring/50 dark:[color-scheme:dark]"
                >
              </div>
              <Select v-else v-model="selectedEventId">
                <SelectTrigger id="dashboard-period" class="h-11 w-full bg-background">
                  <Activity class="size-4 text-muted-foreground" aria-hidden="true" />
                  <SelectValue placeholder="选择活动" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="item in eventPeriods" :key="item.id" :value="item.id">
                    {{ item.name }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-border/65 bg-background/60 px-4 py-3 text-sm">
            <div class="flex items-center gap-2">
              <span class="text-muted-foreground">当前周期</span>
              <span class="font-medium text-foreground">{{ periodTitle }}</span>
              <span class="hidden text-xs text-muted-foreground sm:inline">{{ periodDetail }}</span>
            </div>
            <span class="hidden h-4 w-px bg-border sm:block" aria-hidden="true" />
            <div class="flex items-center gap-2">
              <span class="text-muted-foreground">环比周期</span>
              <span class="font-medium text-foreground">{{ comparisonTitle }}</span>
            </div>
          </div>
        </div>
      </section>

      <section class="overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm" aria-labelledby="metrics-title">
        <div class="flex flex-col justify-between gap-3 border-b border-border/75 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
          <div>
            <div class="flex items-center gap-2">
              <ScanSearch class="size-4 text-primary" aria-hidden="true" />
              <h2 id="metrics-title" class="font-semibold">核心运营指标</h2>
              <span class="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{{ metrics.length }} 项</span>
            </div>
            <p class="mt-1.5 text-xs text-muted-foreground">数据统计范围：{{ periodTitle }}</p>
          </div>

          <div class="flex flex-wrap items-center gap-2 text-xs">
            <span class="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 font-medium text-success">
              <ArrowUpRight class="size-3.5" aria-hidden="true" />{{ upCount }} 项上升
            </span>
            <span v-if="downCount" class="inline-flex items-center gap-1 rounded-full bg-danger/10 px-2.5 py-1 font-medium text-danger">
              <ArrowDownRight class="size-3.5" aria-hidden="true" />{{ downCount }} 项下降
            </span>
            <span class="text-muted-foreground">波动最大：{{ strongestMetric.name }}</span>
          </div>
        </div>

        <div class="hidden grid-cols-[minmax(260px,1.65fr)_minmax(150px,.75fr)_minmax(150px,.75fr)_minmax(180px,.8fr)] gap-4 border-b border-border/70 bg-muted/55 px-5 py-3 text-xs font-medium text-muted-foreground lg:grid">
          <span>指标名称</span>
          <span>当前周期</span>
          <span>上一周期</span>
          <span>环比变化</span>
        </div>

        <ul class="divide-y divide-border/75" aria-label="运营指标列表">
          <li
            v-for="metric in metrics"
            :key="metric.id"
            class="grid gap-4 px-4 py-4 transition-colors hover:bg-muted/35 sm:px-5 lg:grid-cols-[minmax(260px,1.65fr)_minmax(150px,.75fr)_minmax(150px,.75fr)_minmax(180px,.8fr)] lg:items-center"
          >
            <div class="flex min-w-0 items-center gap-3">
              <span class="grid size-10 shrink-0 place-items-center rounded-lg" :class="metric.toneClass">
                <component :is="metric.icon" class="size-5" aria-hidden="true" />
              </span>
              <div class="min-w-0">
                <h3 class="font-medium text-foreground">{{ metric.name }}</h3>
                <p class="mt-1 truncate text-xs text-muted-foreground">{{ metric.description }}</p>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:contents">
              <div>
                <p class="mb-1 text-[11px] text-muted-foreground lg:hidden">当前周期</p>
                <p class="font-mono text-xl font-semibold tabular-nums tracking-tight text-foreground">
                  {{ formatMetricValue(metric) }}<span class="ml-1 font-sans text-xs font-medium text-muted-foreground">{{ metric.unit }}</span>
                </p>
              </div>
              <div>
                <p class="mb-1 text-[11px] text-muted-foreground lg:hidden">上一周期</p>
                <p class="font-mono text-base font-medium tabular-nums text-muted-foreground">
                  {{ formatMetricValue(metric, true) }}<span class="ml-1 font-sans text-xs">{{ metric.unit }}</span>
                </p>
              </div>
              <div class="col-span-2 sm:col-span-1">
                <p class="mb-1 text-[11px] text-muted-foreground lg:hidden">环比变化</p>
                <span
                  class="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-semibold"
                  :class="metric.change > 0 ? 'bg-success/10 text-success' : metric.change < 0 ? 'bg-danger/10 text-danger' : 'bg-muted text-muted-foreground'"
                >
                  <ArrowUpRight v-if="metric.change > 0" class="size-3.5" aria-hidden="true" />
                  <ArrowDownRight v-else-if="metric.change < 0" class="size-3.5" aria-hidden="true" />
                  <ArrowRight v-else class="size-3.5" aria-hidden="true" />
                  {{ changeLabel(metric) }}
                </span>
              </div>
            </div>
          </li>
        </ul>
      </section>
    </div>
  </section>
</template>

<style scoped>
@media (prefers-reduced-motion: reduce) {
  .animate-ping {
    animation: none;
  }
}
</style>
