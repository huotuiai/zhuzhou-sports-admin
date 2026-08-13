<script setup lang="ts">
import { computed, useId, watch } from 'vue'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type PageToken = number | 'ellipsis-start' | 'ellipsis-end'

const props = withDefaults(defineProps<{
  page: number
  pageSize: number
  total: number
  pageSizes?: readonly number[]
  disabled?: boolean
}>(), {
  pageSizes: () => [10, 20, 50, 100],
  disabled: false,
})

const emit = defineEmits<{
  'update:page': [page: number]
  'update:pageSize': [pageSize: number]
}>()

const pageSizeId = `pagination-page-size-${useId()}`

const safePageSize = computed(() => Math.max(1, Math.trunc(props.pageSize) || 1))
const safeTotal = computed(() => Math.max(0, Math.trunc(props.total) || 0))
const totalPages = computed(() => Math.max(1, Math.ceil(safeTotal.value / safePageSize.value)))
const currentPage = computed(() => Math.min(Math.max(1, Math.trunc(props.page) || 1), totalPages.value))
const normalizedPageSizes = computed(() => {
  const values = [...props.pageSizes, safePageSize.value]
    .map((value) => Math.trunc(value))
    .filter((value) => value > 0)
  return [...new Set(values)].sort((first, second) => first - second)
})

const startItem = computed(() => safeTotal.value === 0 ? 0 : (currentPage.value - 1) * safePageSize.value + 1)
const endItem = computed(() => Math.min(currentPage.value * safePageSize.value, safeTotal.value))

const pageTokens = computed<PageToken[]>(() => {
  const last = totalPages.value
  const current = currentPage.value
  if (last <= 7) return Array.from({ length: last }, (_, index) => index + 1)

  const tokens: PageToken[] = [1]
  const start = Math.max(2, current - 1)
  const end = Math.min(last - 1, current + 1)
  if (start > 2) tokens.push('ellipsis-start')
  for (let page = start; page <= end; page += 1) tokens.push(page)
  if (end < last - 1) tokens.push('ellipsis-end')
  tokens.push(last)
  return tokens
})

watch([() => props.page, totalPages], () => {
  if (props.page !== currentPage.value) emit('update:page', currentPage.value)
}, { flush: 'post' })

function setPage(page: number) {
  if (props.disabled) return
  const nextPage = Math.min(Math.max(1, page), totalPages.value)
  if (nextPage !== currentPage.value) emit('update:page', nextPage)
}

function setPageSize(value: unknown) {
  if (props.disabled) return
  const nextPageSize = Number(value)
  if (nextPageSize > 0 && nextPageSize !== safePageSize.value) {
    emit('update:pageSize', nextPageSize)
  }
}
</script>

<template>
  <nav
    class="flex items-center justify-between gap-4 rounded-xl border bg-card/65 px-3 py-3"
    aria-label="数据分页"
  >
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
      <span aria-live="polite">
        共 <strong class="font-semibold tabular-nums text-foreground">{{ safeTotal.toLocaleString('zh-CN') }}</strong> 条
      </span>
      <span v-if="safeTotal > 0" class="tabular-nums">
        当前 {{ startItem.toLocaleString('zh-CN') }}–{{ endItem.toLocaleString('zh-CN') }} 条
      </span>
      <label class="flex min-h-11 items-center gap-2" :for="pageSizeId">
        每页
        <Select
          :model-value="safePageSize"
          :disabled="disabled"
          @update:model-value="setPageSize"
        >
          <SelectTrigger :id="pageSizeId" class="h-11 min-w-24 bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="size in normalizedPageSizes" :key="size" :value="size">
              {{ size }} 条
            </SelectItem>
          </SelectContent>
        </Select>
      </label>
    </div>

    <div class="flex items-center justify-end gap-1" aria-label="页码导航">
      <Button
        variant="outline"
        size="icon-lg"
        class="h-11 w-11"
        :disabled="disabled || currentPage <= 1"
        aria-label="第一页"
        @click="setPage(1)"
      >
        <ChevronsLeft aria-hidden="true" />
      </Button>
      <Button
        variant="outline"
        size="icon-lg"
        class="h-11 w-11"
        :disabled="disabled || currentPage <= 1"
        aria-label="上一页"
        @click="setPage(currentPage - 1)"
      >
        <ChevronLeft aria-hidden="true" />
      </Button>

      <template v-for="token in pageTokens" :key="token">
        <span
          v-if="typeof token !== 'number'"
          class="w-8 text-center text-sm text-muted-foreground"
          aria-hidden="true"
        >…</span>
        <Button
          v-else
          :variant="token === currentPage ? 'default' : 'outline'"
          size="icon-lg"
          class="h-11 w-11 tabular-nums"
          :disabled="disabled"
          :aria-label="`第 ${token} 页`"
          :aria-current="token === currentPage ? 'page' : undefined"
          @click="setPage(token)"
        >
          {{ token }}
        </Button>
      </template>

      <Button
        variant="outline"
        size="icon-lg"
        class="h-11 w-11"
        :disabled="disabled || currentPage >= totalPages"
        aria-label="下一页"
        @click="setPage(currentPage + 1)"
      >
        <ChevronRight aria-hidden="true" />
      </Button>
      <Button
        variant="outline"
        size="icon-lg"
        class="h-11 w-11"
        :disabled="disabled || currentPage >= totalPages"
        aria-label="最后一页"
        @click="setPage(totalPages)"
      >
        <ChevronsRight aria-hidden="true" />
      </Button>
    </div>
  </nav>
</template>
