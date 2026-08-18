<script setup lang="ts">
import type { DataTableColumn } from '@/components/common'
import type { DistributionDetailRow } from '../types'
import { RefreshCw } from '@lucide/vue'
import { DataTable } from '@/components/common'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

defineProps<{
  open: boolean
  title: string
  sliceLabel: string
  rows: readonly DistributionDetailRow[]
  loading?: boolean
  error?: string | null
}>()

const emit = defineEmits<{
  'update:open': [open: boolean]
  retry: []
}>()

const columns: readonly DataTableColumn<DistributionDetailRow>[] = [
  { key: 'objectName', label: '对象', minWidth: '180px' },
  { key: 'category', label: '分类', minWidth: '130px' },
  { key: 'value', label: '当前数据', minWidth: '260px' },
  { key: 'updatedAt', label: '更新时间', minWidth: '165px' },
]

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date)
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="max-h-[min(720px,calc(100svh-2rem))] max-w-[min(760px,calc(100vw-2rem))] overflow-hidden p-0">
      <DialogHeader class="border-b px-6 py-5 text-left">
        <DialogTitle>{{ title }} · {{ sliceLabel }}</DialogTitle>
        <DialogDescription class="mt-1.5">当前配置/现状明细，不受运营数据时间筛选影响。</DialogDescription>
      </DialogHeader>

      <div class="min-h-0 overflow-y-auto px-6 py-5">
        <div v-if="error" class="grid min-h-44 place-items-center rounded-xl border border-danger/25 bg-danger/5 p-6 text-center">
          <div>
            <p class="text-sm font-medium text-danger">{{ error }}</p>
            <Button variant="outline" class="mt-4" @click="emit('retry')">
              <RefreshCw aria-hidden="true" />重新加载
            </Button>
          </div>
        </div>
        <DataTable
          v-else
          :columns="columns"
          :rows="rows"
          row-key="id"
          :loading="loading"
          caption="现状分布明细"
          empty-text="当前分类暂无明细"
          :skeleton-rows="4"
        >
          <template #cell-updatedAt="{ row }">{{ formatDateTime(row.updatedAt) }}</template>
        </DataTable>
      </div>

      <DialogFooter class="border-t bg-muted/15 px-6 py-4">
        <Button variant="outline" @click="emit('update:open', false)">关闭</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
