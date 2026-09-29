<script setup lang="ts">
import { ArrowDownRight, ArrowUpRight, CircleHelp, Clock3 } from '@lucide/vue'
import { computed } from 'vue'
import type { DashboardMetricCardItem } from '../types'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const props = defineProps<{
  metric: DashboardMetricCardItem
  selected?: boolean
  loading?: boolean
}>()

const emit = defineEmits<{
  select: [id: string]
}>()

const availableMetric = computed(() => 'primaryValue' in props.metric ? props.metric : null)

function formatNumber(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(value)
}

</script>

<template>
  <article
    class="group relative min-h-36 min-w-0 overflow-visible rounded-xl border bg-card/85 shadow-sm transition-[border-color,box-shadow,background-color] duration-200 motion-reduce:transition-none"
    :class="selected && availableMetric ? 'border-primary bg-primary/6 shadow-[0_0_0_3px_color-mix(in_srgb,var(--primary)_12%,transparent)]' : availableMetric ? 'border-border/80 hover:border-primary/45 hover:shadow-md' : 'border-border/80'"
  >
    <button
      type="button"
      class="flex size-full min-h-36 min-w-0 cursor-pointer flex-col items-start rounded-xl px-4 py-3.5 text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50"
      :class="availableMetric ? 'disabled:cursor-wait' : 'disabled:cursor-default'"
      :aria-pressed="selected"
      :aria-label="availableMetric ? `查看${metric.name}详情` : `${metric.name}待接入`"
      :disabled="loading || !availableMetric"
      @click="emit('select', props.metric.id)"
    >
      <span v-if="selected && availableMetric" class="absolute inset-y-3 left-0 w-0.5 rounded-r-full bg-primary" aria-hidden="true" />
      <span class="flex w-full min-w-0 items-start pr-7">
        <span class="line-clamp-2 min-w-0 text-xs font-medium leading-5 text-muted-foreground">{{ metric.name }}</span>
      </span>

      <span class="mt-2 flex items-end gap-1.5">
        <strong class="text-[1.45rem] font-semibold leading-none tracking-tight tabular-nums text-foreground">
          {{ availableMetric ? formatNumber(availableMetric.primaryValue) : '—' }}
        </strong>
        <span class="pb-0.5 text-[11px] text-muted-foreground">{{ availableMetric?.primaryLabel ?? 'PV' }}</span>
      </span>

      <span v-if="availableMetric" class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
        <span class="text-muted-foreground">{{ availableMetric.primaryLabel }} 较上一周期</span>
        <span
          class="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-semibold"
          :class="availableMetric.comparisonRate === null || availableMetric.comparisonRate === 0
            ? 'bg-muted text-muted-foreground'
            : availableMetric.comparisonRate > 0 ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'"
        >
          <ArrowUpRight v-if="availableMetric.comparisonRate !== null && availableMetric.comparisonRate > 0" class="size-3" aria-hidden="true" />
          <ArrowDownRight v-else-if="availableMetric.comparisonRate !== null && availableMetric.comparisonRate < 0" class="size-3" aria-hidden="true" />
          {{ availableMetric.comparisonText }}
        </span>
      </span>
      <span v-else class="mt-2 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">待接入</span>

      <span v-if="!availableMetric || availableMetric.secondaryValue !== null" class="mt-auto flex items-center gap-1.5 pt-2 text-[11px] text-muted-foreground">
        <span>{{ availableMetric?.secondaryLabel ?? 'UV' }}</span>
        <strong class="font-semibold tabular-nums text-foreground">{{ availableMetric && availableMetric.secondaryValue !== null ? formatNumber(availableMetric.secondaryValue) : '—' }}</strong>
        <span>人</span>
      </span>
      <span v-else class="mt-auto flex items-center gap-1.5 pt-2 text-[10px] text-muted-foreground/80">
        <Clock3 class="size-3" aria-hidden="true" />{{ availableMetric.source }}
      </span>
    </button>

    <Tooltip>
      <TooltipTrigger as-child>
        <button
          type="button"
          class="absolute right-2.5 top-2.5 grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none"
          :aria-label="`查看${metric.name}指标口径`"
        >
          <CircleHelp class="size-4" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="end" class="max-w-72 leading-5">
        {{ metric.definition }}<template v-if="availableMetric"> 来源：{{ availableMetric.source }}</template>
      </TooltipContent>
    </Tooltip>
  </article>
</template>
