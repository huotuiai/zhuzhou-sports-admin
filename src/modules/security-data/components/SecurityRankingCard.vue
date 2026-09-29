<script setup lang="ts">
import { computed } from 'vue'
import type { SecurityRanking, SecurityRankingItem } from '../types'
import { Card } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const props = defineProps<{ ranking: SecurityRanking }>()

const items = computed(() => [...props.ranking.items]
  .sort((left, right) => right.count - left.count)
  .slice(0, props.ranking.limit))
const columns = computed(() => props.ranking.wide
  ? [items.value.slice(0, 6), items.value.slice(6)]
  : [items.value])

function percentage(item: SecurityRankingItem): number {
  return props.ranking.total > 0 ? item.count / props.ranking.total * 100 : 0
}

function percentageLabel(item: SecurityRankingItem): string {
  return `${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 }).format(percentage(item))}%`
}

function itemDescription(item: SecurityRankingItem): string {
  return `${item.label}，${item.count.toLocaleString('zh-CN')} 人，占比 ${percentageLabel(item)}`
}

function itemLabel(item: SecurityRankingItem): string {
  if (props.ranking.id.endsWith('-shuttle')) return item.id.toUpperCase()
  if (props.ranking.id.endsWith('-zone')) return item.label.replace(/\s+区$/, '区')
  return item.label
}
</script>

<template>
  <Card data-testid="security-ranking" :data-ranking-id="ranking.id" class="min-h-[340px] min-w-0 gap-4 overflow-visible rounded-xl border border-[#d4d4d4] p-4 shadow-none ring-0 dark:border-border" :class="ranking.wide ? 'lg:col-span-2' : ''">
    <header class="min-h-[100px] 2xl:min-h-20">
      <h3 class="text-base font-semibold">{{ ranking.title }}</h3>
      <p class="mt-3 text-xs leading-5 text-muted-foreground/65">{{ ranking.description }}</p>
    </header>
    <div class="grid min-w-0 gap-x-8" :class="ranking.wide ? 'sm:grid-cols-2' : ''">
      <ol v-for="(column, columnIndex) in columns" :key="columnIndex" :start="columnIndex * 6 + 1" class="min-w-0" :aria-label="`${ranking.title}${ranking.wide ? `（第 ${columnIndex * 6 + 1} 至 ${columnIndex * 6 + column.length} 名）` : ''}`">
        <li v-for="(item, index) in column" :key="item.id" class="min-w-0">
          <Tooltip>
            <TooltipTrigger as-child>
              <div
                tabindex="0"
                class="grid min-h-9 min-w-0 items-center gap-x-2 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                :class="ranking.id.endsWith('-gate') ? 'grid-cols-[4.75rem_minmax(0,1fr)_2.75rem]' : 'grid-cols-[2.5rem_minmax(0,1fr)_2.75rem]'"
                data-testid="security-ranking-row"
                :data-ranking-item="item.id"
                :aria-label="itemDescription(item)"
              >
                <span class="truncate text-right text-sm text-foreground">{{ itemLabel(item) }}</span>
                <div class="h-5 overflow-hidden rounded-full bg-[#efefef] dark:bg-muted" aria-hidden="true">
                  <div
                    class="h-full rounded-full"
                    :class="index === 0 ? 'bg-[#ff0800]' : index === 1 ? 'bg-[#eb9e3e]' : 'bg-[#15a14a]'"
                    :style="{ width: `${Math.min(100, Math.max(0, percentage(item)))}%` }"
                    data-testid="security-ranking-bar"
                  />
                </div>
                <span class="text-sm tabular-nums">{{ percentageLabel(item) }}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" class="max-w-72 leading-5">{{ itemDescription(item) }}</TooltipContent>
          </Tooltip>
        </li>
      </ol>
    </div>
  </Card>
</template>
