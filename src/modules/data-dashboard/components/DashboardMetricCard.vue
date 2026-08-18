<script setup lang="ts">
import { ArrowDownRight, ArrowUpRight, CircleHelp, Clock3 } from '@lucide/vue'
import type { DashboardMetric } from '../types'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const props = defineProps<{
  metric: DashboardMetric
  selected?: boolean
  loading?: boolean
}>()

const emit = defineEmits<{
  select: [id: string]
}>()

function formatNumber(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(value)
}

function comparisonLabel(value: number | null): string {
  if (value === null) return '—'
  if (!Number.isFinite(value)) return '新增'
  if (value === 0) return '持平 0%'
  return `${Math.abs(value).toFixed(1)}%`
}
</script>

<template>
  <article
    class="group relative min-h-36 overflow-visible rounded-xl border bg-card/85 shadow-sm transition-[border-color,box-shadow,background-color] duration-200 motion-reduce:transition-none"
    :class="selected ? 'border-primary bg-primary/6 shadow-[0_0_0_3px_color-mix(in_srgb,var(--primary)_12%,transparent)]' : 'border-border/80 hover:border-primary/45 hover:shadow-md'"
  >
    <button
      type="button"
      class="flex size-full min-h-36 flex-col items-start rounded-xl px-4 py-3.5 text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50"
      :aria-pressed="selected"
      :aria-label="`查看${metric.name}详情`"
      :disabled="loading"
      @click="emit('select', props.metric.id)"
    >
      <span v-if="selected" class="absolute inset-y-3 left-0 w-0.5 rounded-r-full bg-primary" aria-hidden="true" />
      <span class="flex w-full items-start gap-8">
        <span class="line-clamp-2 text-xs font-medium leading-5 text-muted-foreground">{{ metric.name }}</span>
        <Badge v-if="metric.availability === 'pending'" variant="secondary" class="ml-auto shrink-0">数据待接入</Badge>
      </span>

      <span class="mt-2 flex items-end gap-1.5">
        <strong class="text-[1.45rem] font-semibold leading-none tracking-tight tabular-nums text-foreground">
          {{ formatNumber(metric.primaryValue) }}
        </strong>
        <span class="pb-0.5 text-[11px] text-muted-foreground">{{ metric.primaryLabel }}</span>
      </span>

      <span class="mt-2 flex items-center gap-2 text-[11px]">
        <span class="text-muted-foreground">较上一周期</span>
        <span
          class="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-semibold"
          :class="metric.comparisonRate === null || metric.comparisonRate === 0
            ? 'bg-muted text-muted-foreground'
            : metric.comparisonRate > 0 ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'"
        >
          <ArrowUpRight v-if="metric.comparisonRate !== null && metric.comparisonRate > 0" class="size-3" aria-hidden="true" />
          <ArrowDownRight v-else-if="metric.comparisonRate !== null && metric.comparisonRate < 0" class="size-3" aria-hidden="true" />
          {{ comparisonLabel(metric.comparisonRate) }}
        </span>
      </span>

      <span v-if="metric.secondaryValue !== null" class="mt-auto flex items-center gap-1.5 pt-2 text-[11px] text-muted-foreground">
        <span>{{ metric.secondaryLabel }}</span>
        <strong class="font-semibold tabular-nums text-foreground">{{ formatNumber(metric.secondaryValue) }}</strong>
        <span>人</span>
      </span>
      <span v-else class="mt-auto flex items-center gap-1.5 pt-2 text-[10px] text-muted-foreground/80">
        <Clock3 class="size-3" aria-hidden="true" />{{ metric.source }}
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
        {{ metric.definition }} 来源：{{ metric.source }}
      </TooltipContent>
    </Tooltip>
  </article>
</template>
