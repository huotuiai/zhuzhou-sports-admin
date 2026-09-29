<script setup lang="ts">
import type { SecurityMetric } from '../types'
import { Card } from '@/components/ui/card'

defineProps<{ metric: SecurityMetric }>()
</script>

<template>
  <article data-testid="security-metric" :data-metric-key="metric.key" :aria-labelledby="`security-metric-${metric.key}`" class="min-w-0">
    <Card class="h-full min-h-28 min-w-0 gap-0 border border-[#d4d4d4] px-3 py-3 shadow-none ring-0 dark:border-border">
      <h3 :id="`security-metric-${metric.key}`" class="text-base font-normal text-muted-foreground">{{ metric.label }}</h3>
      <p class="mt-2 flex items-baseline gap-1.5">
        <strong class="text-[1.7rem] font-semibold leading-none tracking-tight tabular-nums text-foreground">{{ metric.value.toLocaleString('zh-CN') }}</strong>
        <span class="text-sm text-muted-foreground">人</span>
      </p>
      <p class="mt-auto pt-3 text-xs leading-5 text-muted-foreground/65">{{ metric.description }}</p>
    </Card>
  </article>
</template>
