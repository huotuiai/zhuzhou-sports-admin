<script setup lang="ts">
import { CircleAlert } from '@lucide/vue'
import { Card } from '@/components/ui/card'
import { TooltipProvider } from '@/components/ui/tooltip'
import SecurityMetricCard from '@/modules/security-data/components/SecurityMetricCard.vue'
import SecurityObservationFilter from '@/modules/security-data/components/SecurityObservationFilter.vue'
import SecurityRankingCard from '@/modules/security-data/components/SecurityRankingCard.vue'
import { useSecurityData } from '@/modules/security-data/use-security-data'
import { formatActivityRange } from '@/modules/security-data/lib/observation-window'

const {
  window, today, isCurrent, rangeLabel, visibleMetrics, activities, rankings, dateError,
  selectDate, selectPeriod, isPeriodDisabled,
} = useSecurityData()
</script>

<template>
  <section class="min-h-[calc(100svh-4rem)] min-w-0 bg-[#f8f9fa] p-4 text-foreground lg:p-6 dark:bg-background" aria-labelledby="security-data-title">
    <TooltipProvider :delay-duration="180">
      <div class="flex w-full min-w-0 flex-col gap-6">
        <h1 id="security-data-title" class="sr-only">安保数据</h1>

        <div role="note" class="flex min-w-0 items-start gap-2 rounded-xl border border-[#f5a33c] bg-[#fff4c7] px-3 py-2.5 text-sm font-medium leading-6 text-[#e89937] dark:bg-amber-950/30 dark:text-amber-400">
          <CircleAlert class="mt-0.5 size-5 shrink-0 fill-current stroke-[#fff4c7] dark:stroke-background" aria-hidden="true" />
          <p>本板块所有数据仅来自使用本产品的用户（H5 / 微信内），不代表场馆现场实际人数，不可作为人流管控的唯一依据。</p>
        </div>

        <SecurityObservationFilter
          :window="window"
          :today="today"
          :is-current="isCurrent"
          :range-label="rangeLabel"
          :date-error="dateError"
          :is-period-disabled="isPeriodDisabled"
          @select-date="selectDate"
          @select-period="selectPeriod"
        />

        <section class="min-w-0 space-y-3" aria-labelledby="security-activities-title">
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h2 id="security-activities-title" class="text-base font-semibold">活动信息</h2>
            <p class="text-sm text-muted-foreground/65">需重点关注活动期间数据</p>
          </div>
          <div v-if="activities.length" class="grid min-w-0 gap-x-6 gap-y-4 md:grid-cols-2">
            <Card v-for="activity in activities" :key="activity.id" class="min-w-0 gap-1.5 border border-[#ededed] px-3 py-2.5 shadow-none ring-0 dark:border-border">
              <h3 class="truncate text-sm font-medium" :title="activity.name">{{ activity.name }}</h3>
              <p class="text-xs leading-5 tabular-nums text-muted-foreground/80">{{ formatActivityRange(activity) }}</p>
            </Card>
          </div>
          <Card v-else class="items-center justify-center border border-dashed border-border px-4 py-7 text-sm text-muted-foreground shadow-none ring-0" data-testid="security-activities-empty">
            所选日期暂无活动
          </Card>
        </section>

        <section class="min-w-0 space-y-3" aria-labelledby="security-metrics-title">
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h2 id="security-metrics-title" class="text-base font-semibold">当前状态</h2>
            <p class="text-sm text-muted-foreground/65">需重点关注场馆外围与前往场馆人数</p>
          </div>
          <div class="grid min-w-0 grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            <SecurityMetricCard v-for="metric in visibleMetrics" :key="metric.key" :metric="metric" />
          </div>
        </section>

        <section class="min-w-0 space-y-3" aria-labelledby="security-rankings-title">
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h2 id="security-rankings-title" class="text-base font-semibold">场景分布</h2>
            <p class="text-sm text-muted-foreground/65">需重点关注高占比场景的真实人流量</p>
          </div>
          <div class="grid min-w-0 grid-cols-1 gap-x-6 gap-y-4 lg:grid-cols-3">
            <SecurityRankingCard v-for="ranking in rankings" :key="ranking.id" :ranking="ranking" />
          </div>
        </section>
      </div>
    </TooltipProvider>
  </section>
</template>
