<script setup lang="ts">
import type { ParkingUsageItem } from '../types'
import type { ParkingUsageFilter, ParkingUsageSort, ParkingUsageStatus } from '../lib/parking-usage'
import { computed, ref, useId } from 'vue'
import { RouterLink } from 'vue-router'
import { ArrowRight, Inbox } from '@lucide/vue'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  formatParkingUsageRate,
  PARKING_USAGE_FILTERS,
  PARKING_USAGE_LIMIT,
  PARKING_USAGE_SORTS,
  parkingUsageRate,
  parkingUsageStatus,
  selectParkingUsage,
  summarizeParkingUsage,
} from '../lib/parking-usage'

const props = defineProps<{
  items: readonly ParkingUsageItem[]
  canManage: boolean
}>()

const filter = ref<ParkingUsageFilter>('all')
const sort = ref<ParkingUsageSort>('usage-desc')
const titleId = useId()
const sortId = useId()
const summary = computed(() => summarizeParkingUsage(props.items))
const selection = computed(() => selectParkingUsage(props.items, filter.value, sort.value))
const sortDescription = computed(() => PARKING_USAGE_SORTS.find(item => item.value === sort.value)?.description)
const rows = computed(() => selection.value.items.map(item => ({
  ...item,
  rate: parkingUsageRate(item),
  status: parkingUsageStatus(item),
})))
const statusStyles: Record<ParkingUsageStatus, { label: string, text: string, bar: string, badge: string }> = {
  full: { label: '已满', text: 'text-danger', bar: 'bg-danger', badge: 'bg-danger/10 text-danger' },
  high: { label: '高占用', text: 'text-warning', bar: 'bg-amber-500', badge: 'bg-amber-500/15 text-warning' },
  available: { label: '空闲', text: 'text-success', bar: 'bg-green-600 dark:bg-green-400', badge: 'bg-success/10 text-success' },
  unknown: { label: '余位未知', text: 'text-muted-foreground', bar: 'bg-muted-foreground', badge: 'bg-muted text-muted-foreground' },
  unconfigured: { label: '未配置车位', text: 'text-muted-foreground', bar: 'bg-muted-foreground', badge: 'bg-muted text-muted-foreground' },
}

function formatCount(value: number | null): string {
  return value?.toLocaleString('zh-CN') ?? '—'
}
</script>

<template>
  <Card class="min-w-0 gap-0 p-4" role="region" :aria-labelledby="titleId">
    <div class="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div>
        <h3 :id="titleId" class="text-sm font-semibold">停车场车位使用情况</h3>
        <dl class="mt-2 flex flex-wrap gap-2 text-xs" aria-label="全部停车场车位概览">
          <div class="flex items-center gap-1.5 rounded-md bg-muted/65 px-2.5 py-1">
            <dt class="text-muted-foreground">总车位</dt><dd class="font-semibold tabular-nums">{{ formatCount(summary.total) }}</dd>
          </div>
          <div class="flex items-center gap-1.5 rounded-md bg-muted/65 px-2.5 py-1">
            <dt class="text-muted-foreground">已用</dt><dd class="font-semibold tabular-nums">{{ formatCount(summary.used) }}</dd>
          </div>
          <div class="flex items-center gap-1.5 rounded-md bg-muted/65 px-2.5 py-1">
            <dt class="text-muted-foreground">剩余</dt><dd class="font-semibold tabular-nums">{{ formatCount(summary.available) }}</dd>
          </div>
          <div class="flex items-center gap-1.5 rounded-md bg-danger/10 px-2.5 py-1 text-danger">
            <dt>已满</dt><dd class="font-semibold tabular-nums">{{ formatCount(summary.full) }}</dd>
          </div>
          <div class="flex items-center gap-1.5 rounded-md bg-amber-500/15 px-2.5 py-1 text-warning">
            <dt>高占用</dt><dd class="font-semibold tabular-nums">{{ formatCount(summary.high) }}</dd>
          </div>
        </dl>
      </div>
      <p class="text-xs leading-5 text-muted-foreground">低使用率绿色 · 高占用橙色 · 已满红色</p>
    </div>

    <p v-if="summary.unknownCount" class="mt-3 text-xs text-muted-foreground">
      {{ summary.unknownCount }} 个停车场余位未知，已用、剩余及状态数量暂不汇总。
    </p>

    <div class="my-4 flex flex-wrap items-center justify-between gap-3">
      <div class="inline-flex flex-wrap gap-1 rounded-lg bg-muted/65 p-1" role="group" aria-label="停车场状态筛选">
        <button
          v-for="option in PARKING_USAGE_FILTERS"
          :key="option.value"
          type="button"
          class="min-h-10 cursor-pointer rounded-md px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none"
          :class="filter === option.value ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:bg-card/65 hover:text-foreground'"
          :aria-pressed="filter === option.value"
          @click="filter = option.value"
        >{{ option.label }}</button>
      </div>
      <div>
        <label :for="sortId" class="sr-only">停车场排序</label>
        <Select v-model="sort">
          <SelectTrigger :id="sortId" class="h-11 w-56 bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="option in PARKING_USAGE_SORTS" :key="option.value" :value="option.value">{{ option.label }}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>

    <div class="min-w-0">
      <table class="w-full table-fixed border-collapse text-left text-xs">
        <caption class="sr-only">停车场车位使用情况，按{{ sortDescription }}展示，最多 {{ PARKING_USAGE_LIMIT }} 个</caption>
        <thead class="border-b border-border/65 bg-muted/55 text-muted-foreground">
          <tr>
            <th scope="col" class="w-[31%] px-3 py-3 font-medium">停车场</th>
            <th scope="col" class="w-[28%] px-3 py-3 font-medium">使用率</th>
            <th scope="col" class="w-[18%] px-3 py-3 font-medium">已用 / 总车位</th>
            <th scope="col" class="w-[10%] px-3 py-3 font-medium">剩余</th>
            <th scope="col" class="w-[13%] px-3 py-3 font-medium">状态</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="parking in rows" :key="parking.id" class="border-b border-border/35">
            <td class="px-3 py-3">
              <div class="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 break-words">
                <span>{{ parking.name }}</span>
                <span v-if="parking.code" class="text-[10px] text-muted-foreground">{{ parking.code }}</span>
              </div>
            </td>
            <td class="px-3 py-3">
              <div class="flex items-center gap-2" :class="statusStyles[parking.status].text">
                <span class="h-2 w-20 shrink rounded-full bg-muted/65" aria-hidden="true">
                  <span class="block h-full rounded-full" :class="statusStyles[parking.status].bar" :style="{ width: `${parking.rate ?? 0}%` }" />
                </span>
                <span class="shrink-0 font-medium tabular-nums">{{ formatParkingUsageRate(parking.rate) }}</span>
              </div>
            </td>
            <td class="px-3 py-3 tabular-nums">{{ formatCount(parking.available === null && parking.total > 0 ? null : parking.used) }} / {{ formatCount(parking.total) }}</td>
            <td class="px-3 py-3 tabular-nums">{{ formatCount(parking.available) }}</td>
            <td class="px-3 py-3">
              <span class="inline-flex rounded-full px-2 py-0.5 text-[11px]" :class="statusStyles[parking.status].badge">{{ statusStyles[parking.status].label }}</span>
            </td>
          </tr>
          <tr v-if="!rows.length">
            <td colspan="5" class="h-44 px-4 text-center text-muted-foreground">
              <Inbox class="mx-auto mb-3 size-7" aria-hidden="true" />
              {{ items.length ? '没有符合条件的停车场，请切换筛选条件' : '暂无停车场车位数据' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <footer class="pt-3 text-center text-xs">
      <p class="leading-5 text-muted-foreground" role="status" aria-live="polite">
        <template v-if="selection.matchedCount">
          <template v-if="selection.matchedCount > PARKING_USAGE_LIMIT">当前按{{ sortDescription }}展示前 {{ PARKING_USAGE_LIMIT }} 个，</template>
          <template v-else>当前展示 {{ selection.matchedCount }} 个，</template>
        </template>
        <template v-if="filter !== 'all'">符合条件 {{ selection.matchedCount }} 个，</template>
        共 {{ items.length }} 个停车场
      </p>
      <RouterLink
        v-if="items.length > PARKING_USAGE_LIMIT && canManage"
        :to="{ name: 'parking-management' }"
        class="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-md px-3 font-medium text-primary transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none"
      >
        查看全部 {{ items.length }} 个<ArrowRight class="size-3.5" aria-hidden="true" />
      </RouterLink>
    </footer>
  </Card>
</template>
