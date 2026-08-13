<script setup lang="ts">
import type {
  ControlZone,
  ControlZoneMode,
  ControlZoneValidationIssue,
  ControlZoneWriteInput,
} from '@/modules/area-control/types'
import { computed } from 'vue'
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleOff,
  FileText,
  Layers3,
  LoaderCircle,
  MapPinned,
  PencilLine,
  Pentagon,
  RectangleHorizontal,
  Ruler,
  Trash2,
} from '@lucide/vue'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import ControlZoneForm from './ControlZoneForm.vue'

const props = withDefaults(defineProps<{
  mode?: ControlZoneMode
  zones?: readonly ControlZone[]
  selectedZone?: ControlZone | null
  formValue?: ControlZoneWriteInput | null
  formErrors?: readonly ControlZoneValidationIssue[]
  overlapWarnings?: readonly ControlZone[]
  readonly?: boolean
  readonlyReason?: string
  mapUnavailable?: boolean
  mapErrorMessage?: string
  saving?: boolean
  deleting?: boolean
}>(), {
  mode: 'list',
  zones: () => [],
  selectedZone: null,
  formValue: null,
  formErrors: () => [],
  overlapWarnings: () => [],
  readonly: false,
  readonlyReason: '当前尺寸仅支持查看，请使用电脑进行新增、编辑或删除。',
  mapUnavailable: false,
  mapErrorMessage: '地图暂不可用，区域数据已切换为只读。',
  saving: false,
  deleting: false,
})

const emit = defineEmits<{
  select: [id: string]
  back: []
  edit: [id: string]
  remove: [id: string]
  'update:formValue': [value: ControlZoneWriteInput]
  save: []
  cancel: []
}>()

const mutationDisabled = computed(() => props.readonly || props.mapUnavailable)
const panelTitle = computed(() => {
  if (props.mode === 'detail') return '区域详情'
  if (props.mode === 'create') return '新建管制区域'
  if (props.mode === 'edit') return '编辑管制区域'
  return '管制区域'
})

function formatArea(area: number): string {
  if (!Number.isFinite(area) || area < 0) return '--'
  if (area >= 1_000_000) return `${(area / 1_000_000).toLocaleString('zh-CN', { maximumFractionDigits: 2 })} km²`
  return `${Math.round(area).toLocaleString('zh-CN')} m²`
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '时间未知'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function formatFullTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '时间未知'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date)
}
</script>

<template>
  <aside
    class="glass-panel flex h-full min-h-0 w-full flex-col overflow-hidden border lg:w-[360px] lg:shrink-0"
    aria-labelledby="control-zone-panel-title"
  >
    <header class="flex min-h-16 shrink-0 items-center gap-3 border-b px-4">
      <Button
        v-if="mode !== 'list'"
        variant="ghost"
        size="icon-lg"
        class="h-11 w-11 shrink-0"
        :aria-label="mode === 'detail' ? '返回区域列表' : '取消并返回'"
        @click="mode === 'detail' ? emit('back') : emit('cancel')"
      >
        <ArrowLeft aria-hidden="true" />
      </Button>

      <div class="min-w-0 flex-1">
        <h2 id="control-zone-panel-title" class="truncate text-base font-semibold text-foreground">
          {{ panelTitle }}
        </h2>
        <p v-if="mode === 'list'" class="mt-0.5 text-xs text-muted-foreground">
          共 {{ zones.length }} 个区域
        </p>
        <p v-else-if="mode === 'create'" class="mt-0.5 text-xs text-muted-foreground">完善区域信息后保存</p>
        <p v-else-if="mode === 'edit'" class="mt-0.5 text-xs text-muted-foreground">地图与表单修改将同时保存</p>
      </div>
    </header>

    <div
      v-if="mapUnavailable || readonly"
      class="mx-4 mt-4 flex shrink-0 items-start gap-2 rounded-lg border px-3 py-2.5 text-xs leading-5"
      :class="mapUnavailable ? 'border-destructive/30 bg-destructive/8 text-destructive' : 'border-warning/30 bg-warning/8 text-foreground'"
      role="status"
    >
      <AlertTriangle v-if="mapUnavailable" class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <Layers3 v-else class="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
      <span>{{ mapUnavailable ? mapErrorMessage : readonlyReason }}</span>
    </div>

    <template v-if="mode === 'list'">
      <div v-if="zones.length" class="min-h-0 flex-1 overflow-y-auto p-3" aria-label="管制区域列表">
        <ul class="space-y-2">
          <li v-for="zone in zones" :key="zone.id">
            <button
              type="button"
              class="group w-full rounded-xl border bg-card/60 p-3 text-left transition-colors duration-200 hover:border-primary/35 hover:bg-accent/55 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              :class="selectedZone?.id === zone.id ? 'border-primary/45 bg-primary/8' : 'border-border/75'"
              :aria-current="selectedZone?.id === zone.id ? 'true' : undefined"
              @click="emit('select', zone.id)"
            >
              <div class="flex items-start gap-3">
                <span
                  class="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg border"
                  :class="zone.enabled ? 'border-destructive/25 bg-destructive/10 text-destructive' : 'border-border bg-muted text-muted-foreground'"
                >
                  <RectangleHorizontal v-if="zone.geometry.type === 'rectangle'" class="size-4" aria-hidden="true" />
                  <Pentagon v-else class="size-4" aria-hidden="true" />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="flex items-center justify-between gap-2">
                    <span class="truncate text-sm font-semibold text-foreground">{{ zone.name }}</span>
                    <ChevronRight class="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" aria-hidden="true" />
                  </span>
                  <span class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                    <span class="inline-flex items-center gap-1.5">
                      <span class="size-1.5 rounded-full" :class="zone.enabled ? 'bg-success' : 'bg-muted-foreground'" aria-hidden="true" />
                      {{ zone.enabled ? '启用' : '停用' }}
                    </span>
                    <span class="inline-flex items-center gap-1.5 tabular-nums">
                      <Ruler class="size-3.5" aria-hidden="true" />
                      {{ formatArea(zone.areaSquareMeters) }}
                    </span>
                  </span>
                  <span class="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground/85">
                    <CalendarClock class="size-3.5" aria-hidden="true" />
                    更新于 {{ formatUpdatedAt(zone.updatedAt) }}
                  </span>
                </span>
              </div>
            </button>
          </li>
        </ul>
      </div>

      <div v-else class="grid min-h-0 flex-1 place-items-center px-8 py-10 text-center">
        <div class="max-w-64">
          <span class="mx-auto grid size-14 place-items-center rounded-2xl border bg-muted/45 text-muted-foreground">
            <MapPinned class="size-6" aria-hidden="true" />
          </span>
          <h3 class="mt-4 text-sm font-semibold">暂无管制区域</h3>
          <p class="mt-2 text-xs leading-5 text-muted-foreground">
            {{ mutationDisabled ? '当前为只读状态，已有区域将在这里显示。' : '使用地图上方的“新建区域”工具开始绘制。' }}
          </p>
        </div>
      </div>
    </template>

    <template v-else-if="mode === 'detail'">
      <div v-if="selectedZone" class="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="break-words text-lg font-semibold text-foreground">{{ selectedZone.name }}</p>
            <p class="mt-1 text-xs text-muted-foreground">区域编号 {{ selectedZone.id }}</p>
          </div>
          <Badge
            variant="outline"
            class="h-7 shrink-0 gap-1.5"
            :class="selectedZone.enabled ? 'border-success/30 bg-success/10 text-success' : 'bg-muted text-muted-foreground'"
          >
            <CheckCircle2 v-if="selectedZone.enabled" aria-hidden="true" />
            <CircleOff v-else aria-hidden="true" />
            {{ selectedZone.enabled ? '已启用' : '已停用' }}
          </Badge>
        </div>

        <div class="mt-6 space-y-2">
          <p class="text-xs font-medium text-muted-foreground">区域说明</p>
          <p v-if="selectedZone.description" class="whitespace-pre-wrap text-sm leading-6 text-foreground">
            {{ selectedZone.description }}
          </p>
          <p v-else class="text-sm text-muted-foreground">未填写说明</p>
        </div>

        <dl class="mt-6 overflow-hidden rounded-xl border bg-card/55">
          <div class="flex min-h-13 items-center justify-between gap-4 border-b px-3 py-2.5">
            <dt class="flex items-center gap-2 text-sm text-muted-foreground">
              <FileText class="size-4" aria-hidden="true" />
              形状类型
            </dt>
            <dd class="flex items-center gap-1.5 text-sm font-medium">
              <RectangleHorizontal v-if="selectedZone.geometry.type === 'rectangle'" class="size-4" aria-hidden="true" />
              <Pentagon v-else class="size-4" aria-hidden="true" />
              {{ selectedZone.geometry.type === 'rectangle' ? '矩形' : '多边形' }}
            </dd>
          </div>
          <div class="flex min-h-13 items-center justify-between gap-4 border-b px-3 py-2.5">
            <dt class="flex items-center gap-2 text-sm text-muted-foreground">
              <Ruler class="size-4" aria-hidden="true" />
              区域面积
            </dt>
            <dd class="text-sm font-medium tabular-nums">{{ formatArea(selectedZone.areaSquareMeters) }}</dd>
          </div>
          <div class="flex min-h-13 items-center justify-between gap-4 border-b px-3 py-2.5">
            <dt class="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPinned class="size-4" aria-hidden="true" />
              坐标系统
            </dt>
            <dd class="text-sm font-medium">{{ selectedZone.coordinateSystem }}</dd>
          </div>
          <div class="flex min-h-13 items-center justify-between gap-4 px-3 py-2.5">
            <dt class="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarClock class="size-4" aria-hidden="true" />
              更新时间
            </dt>
            <dd class="text-right text-xs font-medium tabular-nums">{{ formatFullTime(selectedZone.updatedAt) }}</dd>
          </div>
        </dl>
      </div>

      <div v-else class="grid min-h-0 flex-1 place-items-center px-8 text-center">
        <div>
          <AlertTriangle class="mx-auto size-6 text-warning" aria-hidden="true" />
          <p class="mt-3 text-sm font-medium">未找到选中的区域</p>
          <Button variant="outline" size="lg" class="mt-4 h-11" @click="emit('back')">返回列表</Button>
        </div>
      </div>

      <div v-if="selectedZone" class="flex shrink-0 gap-2 border-t bg-card/90 p-4">
        <AlertDialog>
          <AlertDialogTrigger as-child>
            <Button
              variant="destructive"
              size="lg"
              class="h-11 flex-1"
              :disabled="mutationDisabled || deleting"
            >
              <Trash2 aria-hidden="true" />
              删除
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认删除“{{ selectedZone.name }}”？</AlertDialogTitle>
              <AlertDialogDescription>
                删除后该区域及其地图边界将立即移除，且无法恢复。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel class="h-11">取消</AlertDialogCancel>
              <AlertDialogAction
                class="h-11 bg-destructive text-white hover:bg-destructive/90"
                :disabled="deleting"
                @click="emit('remove', selectedZone.id)"
              >
                <LoaderCircle v-if="deleting" class="animate-spin motion-reduce:animate-none" aria-hidden="true" />
                <Trash2 v-else aria-hidden="true" />
                {{ deleting ? '删除中' : '确认删除' }}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Button
          size="lg"
          class="h-11 flex-1"
          :disabled="mutationDisabled"
          @click="emit('edit', selectedZone.id)"
        >
          <PencilLine aria-hidden="true" />
          编辑区域
        </Button>
      </div>
    </template>

    <template v-else>
      <ControlZoneForm
        v-if="formValue"
        :mode="mode"
        :value="formValue"
        :errors="formErrors"
        :overlap-warnings="overlapWarnings"
        :saving="saving"
        :readonly="mutationDisabled"
        @update:value="emit('update:formValue', $event)"
        @save="emit('save')"
        @cancel="emit('cancel')"
      />

      <div v-else class="grid min-h-0 flex-1 place-items-center px-8 text-center" role="alert">
        <div>
          <AlertTriangle class="mx-auto size-6 text-warning" aria-hidden="true" />
          <p class="mt-3 text-sm font-medium">区域表单暂未准备好</p>
          <p class="mt-1 text-xs leading-5 text-muted-foreground">请取消本次操作并重新绘制区域。</p>
          <Button variant="outline" size="lg" class="mt-4 h-11" @click="emit('cancel')">取消操作</Button>
        </div>
      </div>
    </template>
  </aside>
</template>
