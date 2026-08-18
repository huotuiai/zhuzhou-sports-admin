<script setup lang="ts">
import { CalendarRange, LoaderCircle } from '@lucide/vue'
import type {
  DashboardActivityOption,
  DashboardDatePreset,
  DashboardDateRange,
  DashboardFilterState,
} from '../types'
import { normalizeDashboardRange, rangeForPreset } from '../services/dashboard-service'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const props = defineProps<{
  modelValue: DashboardFilterState
  currentRange: DashboardDateRange
  activities: readonly DashboardActivityOption[]
  today: string
  loading?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: DashboardFilterState]
  apply: [range: DashboardDateRange]
  validationError: [message: string]
}>()

const presets: readonly { value: DashboardDatePreset, label: string }[] = [
  { value: 'today', label: '今日' },
  { value: 'yesterday', label: '昨日' },
  { value: 'last-7-days', label: '近 7 日' },
  { value: 'last-30-days', label: '近 30 日' },
  { value: 'custom', label: '自定义日期区间' },
]

function isPreset(value: unknown): value is DashboardDatePreset {
  return typeof value === 'string' && presets.some((item) => item.value === value)
}

function localToday(): Date {
  return new Date(`${props.today}T00:00:00`)
}

function updateState(patch: Partial<DashboardFilterState>): DashboardFilterState {
  const next = { ...props.modelValue, ...patch }
  emit('update:modelValue', next)
  return next
}

function applyCustom(state: DashboardFilterState): void {
  if (!state.customStart || !state.customEnd) return
  try {
    const range = normalizeDashboardRange({ start: state.customStart, end: state.customEnd }, localToday())
    if (range.end !== state.customEnd) updateState({ customEnd: range.end })
    emit('apply', range)
  } catch (error) {
    emit('validationError', error instanceof Error ? error.message : '日期范围无效')
  }
}

function handlePresetChange(value: unknown): void {
  if (!isPreset(value)) return
  const next = updateState({ preset: value, activityId: '' })
  if (value === 'custom') return
  emit('apply', rangeForPreset(value, localToday()))
  if (next.customStart || next.customEnd) updateState({ customStart: '', customEnd: '' })
}

function handleCustomDate(field: 'customStart' | 'customEnd', value: string | number): void {
  const next = updateState({ [field]: String(value), preset: 'custom', activityId: '' })
  applyCustom(next)
}

function handleActivityChange(value: unknown): void {
  const id = typeof value === 'string' ? value : ''
  if (!id || id === 'none') {
    updateState({ activityId: '' })
    return
  }
  const activity = props.activities.find((item) => item.id === id)
  if (!activity) return
  const next = updateState({
    preset: 'custom',
    activityId: id,
    customStart: activity.start,
    customEnd: activity.end,
  })
  applyCustom(next)
}

function formatRange(range: DashboardDateRange): string {
  return `${range.start.replaceAll('-', '.')} — ${range.end.replaceAll('-', '.')}`
}
</script>

<template>
  <section class="glass-panel rounded-xl border p-4" aria-labelledby="dashboard-filter-title" :aria-busy="loading">
    <div class="flex flex-col gap-4 xl:flex-row xl:items-end">
      <div class="grid min-w-0 flex-1 gap-4 md:grid-cols-2 xl:grid-cols-[minmax(180px,230px)_minmax(240px,320px)_minmax(280px,1fr)]">
        <div class="space-y-2">
          <Label id="dashboard-filter-title" for="dashboard-range-preset">时间范围</Label>
          <Select :model-value="modelValue.preset" :disabled="loading" @update:model-value="handlePresetChange">
            <SelectTrigger id="dashboard-range-preset" class="h-11 w-full bg-background">
              <CalendarRange class="size-4 text-muted-foreground" aria-hidden="true" />
              <SelectValue placeholder="选择时间范围" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="preset in presets" :key="preset.value" :value="preset.value">
                {{ preset.label }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div class="space-y-2">
          <Label for="dashboard-activity">快捷选活动</Label>
          <Select :model-value="modelValue.activityId || 'none'" :disabled="loading || activities.length === 0" @update:model-value="handleActivityChange">
            <SelectTrigger id="dashboard-activity" class="h-11 w-full bg-background">
              <SelectValue :placeholder="activities.length ? '选择活动（自动切换时间）' : '暂无活动'" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">不按活动筛选</SelectItem>
              <SelectItem v-for="activity in activities" :key="activity.id" :value="activity.id">
                {{ activity.name }}（{{ activity.start.slice(5) }}—{{ activity.end.slice(5) }}）
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div v-if="modelValue.preset === 'custom'" class="space-y-2 md:col-span-2 xl:col-span-1">
          <Label for="dashboard-custom-start">自定义日期</Label>
          <div class="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
            <Input
              id="dashboard-custom-start"
              type="date"
              class="h-11 bg-background [color-scheme:light] dark:[color-scheme:dark]"
              :model-value="modelValue.customStart"
              :max="today"
              :disabled="loading"
              @update:model-value="handleCustomDate('customStart', $event)"
            />
            <span class="text-xs text-muted-foreground">至</span>
            <Input
              id="dashboard-custom-end"
              type="date"
              class="h-11 bg-background [color-scheme:light] dark:[color-scheme:dark]"
              :model-value="modelValue.customEnd"
              :max="today"
              :disabled="loading"
              @update:model-value="handleCustomDate('customEnd', $event)"
            />
          </div>
        </div>
      </div>

      <div class="flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-border/70 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
        <LoaderCircle v-if="loading" class="size-4 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
        <span v-else class="size-2 rounded-full bg-success" aria-hidden="true" />
        <span>当前统计范围：</span>
        <strong class="font-semibold tabular-nums text-foreground">{{ formatRange(currentRange) }}</strong>
      </div>
    </div>

    <p class="mt-3 text-xs leading-5 text-muted-foreground">
      时间筛选只联动运营指标及当前打开的指标详情；现状分布与 VR 作品展示累计快照。
    </p>
  </section>
</template>
