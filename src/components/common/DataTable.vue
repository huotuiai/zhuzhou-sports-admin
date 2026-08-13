<script setup lang="ts" generic="TRow extends object">
import type { CSSProperties } from 'vue'
import type { DataTableColumn, DataTableRowKey } from './contracts'
import TableSkeleton from './TableSkeleton.vue'
import { computed } from 'vue'
import { Inbox } from '@lucide/vue'
import { useDelayedLoading } from '@/composables/use-delayed-loading'

const props = withDefaults(defineProps<{
  columns: readonly DataTableColumn<TRow>[]
  rows: readonly TRow[]
  rowKey: DataTableRowKey<TRow>
  loading?: boolean
  loadingText?: string
  emptyText?: string
  caption?: string
  skeletonRows?: number
}>(), {
  loading: false,
  loadingText: '正在加载数据',
  emptyText: '暂无数据',
  caption: '数据列表',
  skeletonRows: 6,
})

const columnCount = computed(() => Math.max(props.columns.length, 1))
const showLoading = useDelayedLoading(() => props.loading, {
  delay: 120,
  minimumVisible: 240,
})
const showInitialSkeleton = computed(() => showLoading.value && props.rows.length === 0)
const showRefreshProgress = computed(() => showLoading.value && props.rows.length > 0)
const reserveInitialSkeleton = computed(() =>
  props.rows.length === 0 && (props.loading || showInitialSkeleton.value),
)

function resolveRowKey(row: TRow, rowIndex: number): PropertyKey {
  if (typeof props.rowKey === 'function') return props.rowKey(row, rowIndex)
  const value = Reflect.get(row, props.rowKey)
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'symbol'
    ? value
    : rowIndex
}

function resolveCellValue(row: TRow, rowIndex: number, column: DataTableColumn<TRow>): unknown {
  if (typeof column.accessor === 'function') return column.accessor(row, rowIndex)
  return Reflect.get(row, column.accessor ?? column.key)
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  return String(value)
}

function columnStyle(column: DataTableColumn<TRow>): CSSProperties {
  return {
    width: column.width,
    minWidth: column.minWidth,
  }
}

function alignClass(column: DataTableColumn<TRow>): string {
  if (column.align === 'center') return 'text-center'
  if (column.align === 'right') return 'text-right'
  return 'text-left'
}
</script>

<template>
  <div class="relative overflow-hidden rounded-xl border bg-card/75">
    <Transition name="table-progress">
      <div
        v-if="showRefreshProgress"
        class="absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden bg-primary/10"
        role="status"
        :aria-label="loadingText"
      >
        <span class="table-loading-bar block h-full w-1/3 bg-gradient-to-r from-primary via-cyan-400 to-primary" />
      </div>
    </Transition>
    <div
      class="w-full overflow-x-auto focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50"
      role="region"
      :aria-label="`${caption}，可横向滚动`"
      tabindex="0"
    >
      <table class="w-full min-w-max border-collapse text-sm" :aria-busy="loading">
        <caption class="sr-only">{{ caption }}</caption>
        <thead class="border-b bg-muted/55 text-muted-foreground">
          <tr>
            <th
              v-for="column in columns"
              :key="column.key"
              scope="col"
              :style="columnStyle(column)"
              :class="[
                'h-12 whitespace-nowrap px-4 text-xs font-semibold tracking-wide',
                alignClass(column),
                column.headerClass,
              ]"
            >
              <slot :name="`header-${column.key}`" :column="column">
                {{ column.label }}
              </slot>
            </th>
          </tr>
        </thead>

        <tbody>
          <TableSkeleton
            v-if="reserveInitialSkeleton"
            :columns="columns"
            :rows="skeletonRows"
            :visible="showInitialSkeleton"
          />

          <tr v-else-if="rows.length === 0">
            <td :colspan="columnCount" class="h-48 px-4 text-center">
              <div class="flex flex-col items-center text-muted-foreground" role="status">
                <span class="grid size-11 place-items-center rounded-xl border bg-muted/40">
                  <Inbox class="size-5" aria-hidden="true" />
                </span>
                <span class="mt-3 text-sm">{{ emptyText }}</span>
              </div>
            </td>
          </tr>

          <template v-else>
            <tr
              v-for="(row, rowIndex) in rows"
              :key="resolveRowKey(row, rowIndex)"
              class="border-b transition-colors duration-150 last:border-b-0 hover:bg-muted/35"
            >
              <td
                v-for="column in columns"
                :key="column.key"
                :style="columnStyle(column)"
                :class="[
                  'h-13 px-4 py-2.5 text-foreground',
                  alignClass(column),
                  column.cellClass,
                ]"
              >
                <slot
                  :name="`cell-${column.key}`"
                  :row="row"
                  :row-index="rowIndex"
                  :column="column"
                  :value="resolveCellValue(row, rowIndex, column)"
                >
                  {{ formatCellValue(resolveCellValue(row, rowIndex, column)) }}
                </slot>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.table-loading-bar {
  animation: table-loading-slide 1.1s ease-in-out infinite;
  will-change: transform;
}

.table-progress-enter-active,
.table-progress-leave-active {
  transition: opacity 150ms ease;
}

.table-progress-enter-from,
.table-progress-leave-to {
  opacity: 0;
}

@keyframes table-loading-slide {
  from {
    transform: translateX(-110%);
  }

  to {
    transform: translateX(310%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .table-loading-bar {
    width: 100%;
    animation: none;
  }

  .table-progress-enter-active,
  .table-progress-leave-active {
    transition: none;
  }
}
</style>
