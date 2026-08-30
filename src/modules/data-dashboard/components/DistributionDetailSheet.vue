<script setup lang="ts">
import type { DataTableColumn } from '@/components/common'
import type {
  DashboardDistributionDetail,
  DashboardDistributionDetailSelection,
  DistributionDetailPage,
} from '../types'
import { RefreshCw, X } from '@lucide/vue'
import { DataTable, PaginationBar } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'

defineProps<{
  open: boolean
  selection: DashboardDistributionDetailSelection | null
  detail: DistributionDetailPage
  loading?: boolean
  error?: string | null
}>()

const emit = defineEmits<{
  'update:open': [open: boolean]
  'update:page': [page: number]
  retry: []
}>()

const columns: readonly DataTableColumn<DashboardDistributionDetail>[] = [
  { key: 'code', label: '业务编号', minWidth: '150px' },
  { key: 'name', label: '名称', minWidth: '180px' },
  { key: 'extra', label: '附加说明', minWidth: '190px' },
]
</script>

<template>
  <Sheet :open="open" @update:open="emit('update:open', $event)">
    <SheetContent
      side="right"
      :show-close-button="false"
      class="!w-[min(600px,calc(100vw-1rem))] !max-w-none gap-0 p-0 sm:!max-w-[600px]"
    >
      <SheetHeader class="shrink-0 border-b px-5 py-4 pr-14 text-left">
        <SheetTitle class="truncate text-lg font-semibold">
          {{ selection ? `${selection.title} · ${selection.label}` : '分布明细' }}
        </SheetTitle>
        <SheetDescription class="mt-1 leading-5">
          当前实时分布中的对象明细 · 每页 20 条
        </SheetDescription>
        <Button
          variant="ghost"
          size="icon-lg"
          class="absolute right-2 top-2 h-11 w-11"
          aria-label="关闭分布明细"
          @click="emit('update:open', false)"
        >
          <X aria-hidden="true" />
        </Button>
      </SheetHeader>

      <div class="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5">
        <div v-if="error" class="grid min-h-52 place-items-center rounded-xl border border-danger/25 bg-danger/5 p-6 text-center">
          <div>
            <p class="text-sm font-medium text-danger">{{ error }}</p>
            <Button variant="outline" class="mt-4" @click="emit('retry')">
              <RefreshCw aria-hidden="true" />重新加载
            </Button>
          </div>
        </div>

        <template v-else>
          <DataTable
            :columns="columns"
            :rows="detail.items"
            row-key="id"
            :loading="loading"
            caption="当前分布对象明细"
            empty-text="当前分布下暂无对象明细"
            :skeleton-rows="6"
          >
            <template #cell-code="{ row }">
              <span class="font-mono text-xs font-semibold">{{ row.code }}</span>
            </template>
            <template #cell-name="{ row }">
              <span class="font-medium">{{ row.name }}</span>
            </template>
            <template #cell-extra="{ row }">
              <span class="text-sm text-muted-foreground">{{ row.extra || '—' }}</span>
            </template>
          </DataTable>
          <PaginationBar
            v-if="detail.total > 0"
            class="mt-3"
            :page="detail.page"
            :page-size="detail.pageSize"
            :page-sizes="[20]"
            :total="detail.total"
            :disabled="loading"
            @update:page="emit('update:page', $event)"
          />
        </template>
      </div>
    </SheetContent>
  </Sheet>
</template>
