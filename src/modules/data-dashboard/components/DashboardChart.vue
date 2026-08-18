<script setup lang="ts">
import type { EChartsCoreOption } from 'echarts/core'
import { use } from 'echarts/core'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import {
  AriaComponent,
  GraphicComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
import VChart from 'vue-echarts'

use([
  SVGRenderer,
  LineChart,
  PieChart,
  BarChart,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  GraphicComponent,
  AriaComponent,
])

defineProps<{
  option: EChartsCoreOption
  accessibleLabel: string
  loading?: boolean
}>()

const emit = defineEmits<{
  chartClick: [payload: unknown]
}>()

const initOptions = { renderer: 'svg' as const }
</script>

<template>
  <div class="size-full min-h-0" role="img" :aria-label="accessibleLabel">
    <VChart
      class="size-full"
      :option="option"
      :init-options="initOptions"
      :loading="loading"
      autoresize
      @click="emit('chartClick', $event)"
    />
  </div>
</template>
