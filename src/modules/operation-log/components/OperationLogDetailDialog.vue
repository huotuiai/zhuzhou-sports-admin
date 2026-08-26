<script setup lang="ts">
import type { OperationLog } from '../types'
import { CheckCircle2, ChevronDown, ChevronUp, CircleX, ScrollText, X } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  OPERATION_LOG_RESULT_LABELS,
  operationLogActionLabel,
  operationLogModuleLabel,
} from '../types'

const props = defineProps<{
  open: boolean
  log: OperationLog | null
}>()

const emit = defineEmits<{
  'update:open': [open: boolean]
}>()

const expanded = ref(false)
const formattedDetails = computed(() => {
  if (!props.log || props.log.details === null) return '无详情数据'
  if (typeof props.log.details === 'string') return props.log.details
  return JSON.stringify(props.log.details, null, 2) ?? String(props.log.details)
})
const isLongDetails = computed(() =>
  formattedDetails.value.length > 900 || formattedDetails.value.split('\n').length > 18,
)
const targetText = computed(() => {
  if (!props.log) return '—'
  return [props.log.targetType, props.log.targetId].filter(Boolean).join(' ') || '—'
})

const dateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

function formatDateTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : dateTimeFormatter.format(date)
}

function setOpen(open: boolean): void {
  emit('update:open', open)
}

watch([() => props.open, () => props.log?.id], () => {
  expanded.value = false
})
</script>

<template>
  <Dialog :open="open" @update:open="setOpen">
    <DialogContent class="flex max-h-[min(820px,calc(100svh-2rem))] w-[calc(100%-2rem)] max-w-3xl flex-col overflow-hidden p-0">
      <template v-if="log">
        <DialogHeader class="relative shrink-0 border-b px-6 py-5 pr-18 text-left">
          <DialogTitle class="flex items-center gap-2 text-lg">
            <ScrollText class="size-5 text-primary" aria-hidden="true" />
            操作日志详情 · {{ log.id }}
          </DialogTitle>
          <DialogDescription class="mt-1.5">完整操作元数据与请求详情，仅供审计追溯。</DialogDescription>
          <Button
            variant="ghost"
            size="icon-lg"
            class="absolute right-3 top-3 h-11 w-11"
            aria-label="关闭操作日志详情"
            @click="setOpen(false)"
          >
            <X aria-hidden="true" />
          </Button>
        </DialogHeader>

        <div class="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <dl class="grid grid-cols-2 gap-x-6 gap-y-4 rounded-xl border bg-muted/25 p-4">
            <div>
              <dt class="text-xs text-muted-foreground">操作人</dt>
              <dd class="mt-1.5 text-sm font-medium">{{ log.operatorName }} <span v-if="log.operatorId" class="font-mono text-xs text-muted-foreground">(用户 ID：{{ log.operatorId }})</span></dd>
            </div>
            <div>
              <dt class="text-xs text-muted-foreground">所属部门</dt>
              <dd class="mt-1.5 text-sm font-medium">{{ log.departmentName || '—' }}</dd>
            </div>
            <div>
              <dt class="text-xs text-muted-foreground">操作模块</dt>
              <dd class="mt-1.5 text-sm font-medium">{{ operationLogModuleLabel(log.module) }}</dd>
            </div>
            <div>
              <dt class="text-xs text-muted-foreground">操作类型</dt>
              <dd class="mt-1.5 text-sm font-medium">{{ operationLogActionLabel(log.action) }}</dd>
            </div>
            <div class="col-span-2">
              <dt class="text-xs text-muted-foreground">操作对象</dt>
              <dd class="mt-1.5 text-sm font-medium">{{ targetText }}</dd>
            </div>
            <div>
              <dt class="text-xs text-muted-foreground">操作时间</dt>
              <dd class="mt-1.5 text-sm tabular-nums">{{ formatDateTime(log.performedAt) }}</dd>
            </div>
            <div>
              <dt class="text-xs text-muted-foreground">IP 地址</dt>
              <dd class="mt-1.5 font-mono text-sm tabular-nums">{{ log.ipAddress }}</dd>
            </div>
            <div>
              <dt class="text-xs text-muted-foreground">操作结果</dt>
              <dd class="mt-1.5">
                <Badge
                  variant="outline"
                  :class="log.result === 'success' ? 'border-success/30 bg-success/10 text-success' : 'border-destructive/30 bg-destructive/10 text-destructive'"
                >
                  <CheckCircle2 v-if="log.result === 'success'" aria-hidden="true" />
                  <CircleX v-else aria-hidden="true" />
                  {{ OPERATION_LOG_RESULT_LABELS[log.result] }}
                </Badge>
              </dd>
            </div>
            <div>
              <dt class="text-xs text-muted-foreground">日志 ID</dt>
              <dd class="mt-1.5 font-mono text-sm text-primary">{{ log.id }}</dd>
            </div>
          </dl>

          <section aria-labelledby="operation-detail-json-title">
            <div class="flex items-center justify-between gap-3">
              <div>
                <h3 id="operation-detail-json-title" class="text-sm font-semibold">操作详情</h3>
                <p class="mt-1 text-xs text-muted-foreground">JSON 数据，长内容默认折叠显示</p>
              </div>
              <Button
                v-if="isLongDetails"
                variant="outline"
                size="sm"
                class="h-9"
                :aria-expanded="expanded"
                @click="expanded = !expanded"
              >
                <ChevronUp v-if="expanded" aria-hidden="true" />
                <ChevronDown v-else aria-hidden="true" />
                {{ expanded ? '收起' : '展开全部' }}
              </Button>
            </div>

            <div class="relative mt-3 overflow-hidden rounded-xl border border-slate-700/80 bg-slate-950 shadow-inner">
              <pre
                class="overflow-auto p-4 font-mono text-xs leading-6 text-slate-100 transition-[max-height] duration-200 motion-reduce:transition-none"
                :class="isLongDetails && !expanded ? 'max-h-64' : 'max-h-[34rem]'"
                tabindex="0"
                aria-label="操作详情 JSON"
              >{{ formattedDetails }}</pre>
              <div
                v-if="isLongDetails && !expanded"
                class="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-slate-950 to-transparent"
                aria-hidden="true"
              />
            </div>
          </section>
        </div>

        <DialogFooter class="shrink-0 border-t bg-card/90 px-6 py-4">
          <Button variant="outline" size="lg" class="h-11 min-w-24" @click="setOpen(false)">关闭</Button>
        </DialogFooter>
      </template>
    </DialogContent>
  </Dialog>
</template>
