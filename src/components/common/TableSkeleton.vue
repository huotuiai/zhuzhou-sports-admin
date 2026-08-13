<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { DataTableAlign } from './contracts'
import { Skeleton } from '@/components/ui/skeleton'

interface SkeletonColumn {
  key: string
  align?: DataTableAlign
  width?: string
  minWidth?: string
}

withDefaults(defineProps<{
  columns: readonly SkeletonColumn[]
  rows?: number
  visible?: boolean
}>(), {
  rows: 6,
  visible: true,
})

const skeletonWidths = ['68%', '82%', '56%', '74%', '48%', '62%'] as const

function columnStyle(column: SkeletonColumn): CSSProperties {
  return {
    width: column.width,
    minWidth: column.minWidth,
  }
}

function cellClass(column: SkeletonColumn): string {
  if (column.align === 'center') return 'justify-center'
  if (column.align === 'right') return 'justify-end'
  return 'justify-start'
}

function skeletonWidth(rowIndex: number, columnIndex: number, column: SkeletonColumn): string {
  if (column.key === 'index') return '1.5rem'
  if (column.key === 'actions') return '5.5rem'
  if (column.key === 'enabled' || column.key === 'status') return '3.25rem'
  return skeletonWidths[(rowIndex + columnIndex) % skeletonWidths.length]
}
</script>

<template>
  <tr
    v-for="rowIndex in rows"
    :key="rowIndex"
    class="border-b transition-opacity duration-150 last:border-b-0"
    :class="visible ? 'opacity-100' : 'opacity-0'"
    aria-hidden="true"
  >
    <td
      v-for="(column, columnIndex) in columns"
      :key="column.key"
      :style="columnStyle(column)"
      class="h-13 px-4 py-2.5"
    >
      <div class="flex" :class="cellClass(column)">
        <Skeleton
          class="h-4 max-w-full"
          :style="{ width: skeletonWidth(rowIndex, columnIndex, column) }"
        />
      </div>
    </td>
  </tr>
</template>
