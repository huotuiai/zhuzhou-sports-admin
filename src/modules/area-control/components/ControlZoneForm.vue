<script setup lang="ts">
import type {
  ControlZone,
  ControlZoneValidationIssue,
  ControlZoneWriteInput,
} from '@/modules/area-control/types'
import { computed } from 'vue'
import {
  AlertTriangle,
  Check,
  LoaderCircle,
  MapPinned,
  Pentagon,
  RectangleHorizontal,
  Ruler,
} from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

const props = withDefaults(defineProps<{
  mode: 'create' | 'edit'
  value: ControlZoneWriteInput
  errors?: readonly ControlZoneValidationIssue[]
  overlapWarnings?: readonly ControlZone[]
  saving?: boolean
  readonly?: boolean
}>(), {
  errors: () => [],
  overlapWarnings: () => [],
  saving: false,
  readonly: false,
})

const emit = defineEmits<{
  'update:value': [value: ControlZoneWriteInput]
  save: []
  cancel: []
}>()

const nameError = computed(() => props.errors.find((issue) => issue.field === 'name'))
const descriptionError = computed(() => props.errors.find((issue) => issue.field === 'description'))
const geometryErrors = computed(() => props.errors.filter((issue) => issue.field === 'geometry' || issue.field === 'boundary'))
const cannotSave = computed(() => props.readonly || props.saving || props.errors.length > 0)

const geometryLabel = computed(() => props.value.geometry.type === 'rectangle' ? '矩形' : '多边形')
const formattedArea = computed(() => formatArea(props.value.areaSquareMeters))

function formatArea(area: number): string {
  if (!Number.isFinite(area) || area < 0) return '待地图计算'
  if (area >= 1_000_000) return `${(area / 1_000_000).toLocaleString('zh-CN', { maximumFractionDigits: 2 })} 平方公里`
  return `${Math.round(area).toLocaleString('zh-CN')} 平方米`
}

function patchValue(patch: Partial<Pick<ControlZoneWriteInput, 'name' | 'description' | 'enabled'>>) {
  emit('update:value', { ...props.value, ...patch })
}

function updateName(value: string | number) {
  patchValue({ name: String(value) })
}

function updateDescription(value: string | number) {
  patchValue({ description: String(value).slice(0, 300) })
}

function updateEnabled(value: boolean) {
  patchValue({ enabled: value })
}

function submitForm() {
  if (cannotSave.value) return
  emit('save')
}
</script>

<template>
  <form class="flex min-h-0 flex-1 flex-col" novalidate @submit.prevent="submitForm">
    <div class="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
      <div class="space-y-2">
        <Label for="control-zone-name">
          区域名称
          <span class="text-destructive" aria-hidden="true">*</span>
        </Label>
        <Input
          id="control-zone-name"
          :model-value="value.name"
          class="h-11"
          placeholder="请输入区域名称"
          autocomplete="off"
          :disabled="readonly || saving"
          :aria-invalid="Boolean(nameError)"
          :aria-describedby="nameError ? 'control-zone-name-error' : undefined"
          @update:model-value="updateName"
        />
        <p
          v-if="nameError"
          id="control-zone-name-error"
          class="flex items-start gap-1.5 text-xs leading-5 text-destructive"
          role="alert"
        >
          <AlertTriangle class="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {{ nameError.message }}
        </p>
      </div>

      <div class="space-y-2">
        <div class="flex items-center justify-between gap-3">
          <Label for="control-zone-description">区域说明</Label>
          <span class="text-xs tabular-nums text-muted-foreground" aria-live="polite">
            {{ value.description.length }}/300
          </span>
        </div>
        <Textarea
          id="control-zone-description"
          :model-value="value.description"
          class="min-h-28 resize-y"
          placeholder="可选，补充该区域的识别说明"
          :maxlength="300"
          :disabled="readonly || saving"
          :aria-invalid="Boolean(descriptionError)"
          :aria-describedby="descriptionError ? 'control-zone-description-error' : undefined"
          @update:model-value="updateDescription"
        />
        <p
          v-if="descriptionError"
          id="control-zone-description-error"
          class="flex items-start gap-1.5 text-xs leading-5 text-destructive"
          role="alert"
        >
          <AlertTriangle class="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {{ descriptionError.message }}
        </p>
      </div>

      <div class="space-y-2">
        <Label>区域信息</Label>
        <dl class="overflow-hidden rounded-xl border bg-muted/35">
          <div class="flex min-h-12 items-center justify-between gap-4 border-b px-3 py-2.5">
            <dt class="flex items-center gap-2 text-sm text-muted-foreground">
              <component
                :is="value.geometry.type === 'rectangle' ? RectangleHorizontal : Pentagon"
                class="size-4"
                aria-hidden="true"
              />
              形状
            </dt>
            <dd class="text-sm font-medium">{{ geometryLabel }}</dd>
          </div>
          <div class="flex min-h-12 items-center justify-between gap-4 px-3 py-2.5">
            <dt class="flex items-center gap-2 text-sm text-muted-foreground">
              <Ruler class="size-4" aria-hidden="true" />
              面积
            </dt>
            <dd class="text-sm font-medium tabular-nums">{{ formattedArea }}</dd>
          </div>
        </dl>
        <p class="flex items-start gap-1.5 text-xs leading-5 text-muted-foreground">
          <MapPinned class="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          形状与面积由地图绘制结果生成，请在地图上调整。
        </p>
      </div>

      <div class="rounded-xl border bg-muted/25 px-3 py-2.5">
        <div class="flex min-h-11 items-center justify-between gap-4">
          <div>
            <Label for="control-zone-enabled" class="cursor-pointer">启用区域</Label>
            <p class="mt-1 text-xs leading-5 text-muted-foreground">
              停用后保留区域记录，但不作为生效状态展示。
            </p>
          </div>
          <Switch
            id="control-zone-enabled"
            :model-value="value.enabled"
            :disabled="readonly || saving"
            aria-label="启用区域"
            @update:model-value="updateEnabled"
          />
        </div>
      </div>

      <div v-if="geometryErrors.length" class="rounded-xl border border-destructive/35 bg-destructive/8 p-3" role="alert">
        <p class="flex items-center gap-2 text-sm font-medium text-destructive">
          <AlertTriangle class="size-4 shrink-0" aria-hidden="true" />
          当前区域暂不能保存
        </p>
        <ul class="mt-2 space-y-1 pl-6 text-xs leading-5 text-destructive">
          <li v-for="issue in geometryErrors" :key="`${issue.field}-${issue.code}`" class="list-disc">
            {{ issue.message }}
          </li>
        </ul>
      </div>

      <div
        v-if="overlapWarnings.length"
        class="rounded-xl border border-warning/35 bg-warning/8 p-3"
        aria-live="polite"
      >
        <p class="flex items-center gap-2 text-sm font-medium text-warning">
          <AlertTriangle class="size-4 shrink-0" aria-hidden="true" />
          与 {{ overlapWarnings.length }} 个已有区域重叠
        </p>
        <p class="mt-1 text-xs leading-5 text-muted-foreground">重叠不会阻止保存，请确认区域边界符合预期。</p>
        <ul class="mt-2 flex flex-wrap gap-1.5" aria-label="重叠区域">
          <li v-for="zone in overlapWarnings" :key="zone.id">
            <Badge variant="outline" class="gap-1.5 bg-background/70">
              <span
                class="size-1.5 rounded-full"
                :class="zone.enabled ? 'bg-success' : 'bg-muted-foreground'"
                aria-hidden="true"
              />
              {{ zone.name }} · {{ zone.enabled ? '启用' : '停用' }}
            </Badge>
          </li>
        </ul>
      </div>
    </div>

    <div class="flex shrink-0 gap-2 border-t bg-card/90 p-4">
      <Button
        type="button"
        variant="outline"
        size="lg"
        class="h-11 flex-1"
        :disabled="saving"
        @click="emit('cancel')"
      >
        取消
      </Button>
      <Button type="submit" size="lg" class="h-11 flex-1" :disabled="cannotSave">
        <LoaderCircle v-if="saving" class="animate-spin motion-reduce:animate-none" aria-hidden="true" />
        <Check v-else aria-hidden="true" />
        {{ saving ? '保存中' : mode === 'create' ? '保存区域' : '保存修改' }}
      </Button>
    </div>
  </form>
</template>
