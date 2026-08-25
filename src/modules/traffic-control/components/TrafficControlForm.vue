<script setup lang="ts">
import type { CrudDialogMode } from '@/components/common'
import type { MapTheme } from '@/components/map'
import type { TrafficControlField, TrafficControlType, TrafficControlValidationIssue, TrafficControlWriteInput } from '../types'
import { AlertTriangle, Info } from '@lucide/vue'
import { computed, nextTick, reactive, ref, useId, watch } from 'vue'
import { AMapGeometryEditor } from '@/components/map'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { validateTrafficControlInput } from '../services/traffic-control-service'
import { TRAFFIC_CONTROL_TYPES, trafficControlTypeMeta } from '../types'

const props = withDefaults(defineProps<{
  mode: CrudDialogMode
  value: TrafficControlWriteInput
  issues?: readonly TrafficControlValidationIssue[]
  saving?: boolean
  theme?: MapTheme
}>(), { issues: () => [], saving: false, theme: 'light' })
const emit = defineEmits<{ 'update:value': [value: TrafficControlWriteInput] }>()
const id = useId()
const container = ref<HTMLElement | null>(null)
const fields: TrafficControlField[] = ['title', 'type', 'areaName', 'startAt', 'endAt', 'detourInstructions', 'geometry', 'publishAt', 'pinned', 'sortOrder', 'dateRange']
const touched = reactive(Object.fromEntries(fields.map((field) => [field, false])) as Record<TrafficControlField, boolean>)
const allIssues = computed(() => {
  const merged = new Map<TrafficControlField, TrafficControlValidationIssue>()
  for (const issue of validateTrafficControlInput(props.value, { mode: props.mode }).issues) merged.set(issue.field, issue)
  for (const issue of props.issues) merged.set(issue.field, issue)
  return [...merged.values()]
})
const mapColor = computed(() => trafficControlTypeMeta(props.value.type).color)

function patch(value: Partial<TrafficControlWriteInput>): void {
  emit('update:value', { ...props.value, ...value })
}
function inputId(field: TrafficControlField): string { return `traffic-control-${id}-${field}` }
function issueFor(field: TrafficControlField): TrafficControlValidationIssue | undefined {
  if (field === 'startAt' || field === 'endAt') {
    return touched[field] || touched.dateRange
      ? allIssues.value.find((item) => item.field === field || item.field === 'dateRange')
      : undefined
  }
  return touched[field] ? allIssues.value.find((item) => item.field === field) : undefined
}
function text(field: 'title' | 'areaName' | 'startAt' | 'endAt' | 'detourInstructions', value: string | number): void {
  patch({ [field]: String(value) })
}
function sortValue(value: string | number): void {
  const source = String(value).trim()
  patch({ sortOrder: source ? Number(source) : Number.NaN })
}
function validateAndFocus(): boolean {
  for (const field of fields) touched[field] = true
  const issue = allIssues.value[0]
  if (issue) {
    const target = issue.field === 'dateRange' ? 'startAt' : issue.field
    nextTick(() => container.value?.querySelector<HTMLElement>(`[data-field="${target}"]`)?.focus())
    return false
  }
  return !props.saving
}

defineExpose({ validateAndFocus })
watch(() => props.mode, () => { for (const field of fields) touched[field] = false }, { flush: 'sync' })
</script>

<template>
  <div ref="container" class="grid grid-cols-2 gap-x-4 gap-y-5">
    <div class="col-span-2 space-y-2">
      <Label :for="inputId('title')">管制标题 <span class="text-destructive" aria-hidden="true">*</span></Label>
      <Input :id="inputId('title')" data-field="title" :model-value="value.title" class="h-11" maxlength="50" placeholder="例如：体育中心东门道路临时管制" :disabled="saving" :aria-invalid="Boolean(issueFor('title'))" @update:model-value="text('title', $event)" @blur="touched.title = true" />
      <p v-if="issueFor('title')" class="field-error" role="alert"><AlertTriangle />{{ issueFor('title')?.message }}</p>
      <p v-else class="text-right text-xs tabular-nums text-muted-foreground">{{ value.title.length }}/50</p>
    </div>

    <div class="space-y-2">
      <Label :for="inputId('type')">管制类型 <span class="text-destructive" aria-hidden="true">*</span></Label>
      <Select :model-value="value.type" :disabled="saving" @update:model-value="patch({ type: $event as TrafficControlType }); touched.type = true">
        <SelectTrigger :id="inputId('type')" data-field="type" class="h-11 w-full"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem v-for="item in TRAFFIC_CONTROL_TYPES" :key="item.value" :value="item.value"><span class="flex items-center gap-2"><span class="size-2.5 rounded-full" :style="{ backgroundColor: item.color }" />{{ item.label }}</span></SelectItem></SelectContent>
      </Select>
    </div>

    <div class="space-y-2">
      <Label :for="inputId('areaName')">区域名称 <span class="text-destructive" aria-hidden="true">*</span></Label>
      <Input :id="inputId('areaName')" data-field="areaName" :model-value="value.areaName" class="h-11" placeholder="例如：东环路至体育中心东门" :disabled="saving" :aria-invalid="Boolean(issueFor('areaName'))" @update:model-value="text('areaName', $event)" @blur="touched.areaName = true" />
      <p v-if="issueFor('areaName')" class="field-error" role="alert"><AlertTriangle />{{ issueFor('areaName')?.message }}</p>
    </div>

    <div class="space-y-2">
      <Label :for="inputId('startAt')">开始时间 <span class="text-destructive" aria-hidden="true">*</span></Label>
      <Input :id="inputId('startAt')" data-field="startAt" type="datetime-local" :model-value="value.startAt" class="h-11 tabular-nums" :disabled="saving" :aria-invalid="Boolean(issueFor('startAt'))" @update:model-value="text('startAt', $event)" @blur="touched.startAt = true; touched.dateRange = true" />
      <p v-if="issueFor('startAt')" class="field-error" role="alert"><AlertTriangle />{{ issueFor('startAt')?.message }}</p>
    </div>

    <div class="space-y-2">
      <Label :for="inputId('endAt')">结束时间 <span class="text-destructive" aria-hidden="true">*</span></Label>
      <Input :id="inputId('endAt')" data-field="endAt" type="datetime-local" :model-value="value.endAt" class="h-11 tabular-nums" :disabled="saving" :aria-invalid="Boolean(issueFor('endAt'))" @update:model-value="text('endAt', $event)" @blur="touched.endAt = true; touched.dateRange = true" />
      <p v-if="issueFor('endAt')" class="field-error" role="alert"><AlertTriangle />{{ issueFor('endAt')?.message }}</p>
    </div>

    <div class="col-span-2 space-y-2">
      <Label :for="inputId('detourInstructions')">绕行说明</Label>
      <Textarea :id="inputId('detourInstructions')" data-field="detourInstructions" :model-value="value.detourInstructions" class="min-h-24 resize-y" placeholder="说明建议绕行路线、注意事项等" :disabled="saving" @update:model-value="text('detourInstructions', $event)" />
    </div>

    <div class="col-span-2 space-y-3 rounded-xl border bg-muted/15 p-4" data-field="geometry" tabindex="-1">
      <div class="flex items-start gap-2"><Info class="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" /><div><p class="text-sm font-medium">管制区域（选填）</p><p class="mt-1 text-xs leading-5 text-muted-foreground">可在地图绘制或手动导入坐标；地图不可用时不影响其他字段保存。</p></div></div>
      <AMapGeometryEditor :model-value="value.geometry" :color="mapColor" :theme="theme" :disabled="saving" height="320px" @update:model-value="patch({ geometry: $event }); touched.geometry = true" />
      <p v-if="issueFor('geometry')" class="field-error" role="alert"><AlertTriangle />{{ issueFor('geometry')?.message }}</p>
    </div>

    <div class="space-y-2">
      <Label :for="inputId('sortOrder')">排序号 <span class="text-destructive" aria-hidden="true">*</span></Label>
      <Input :id="inputId('sortOrder')" data-field="sortOrder" type="number" min="0" step="1" :model-value="Number.isFinite(value.sortOrder) ? value.sortOrder : ''" class="h-11 tabular-nums" :disabled="saving" :aria-invalid="Boolean(issueFor('sortOrder'))" @update:model-value="sortValue" @blur="touched.sortOrder = true" />
      <p v-if="issueFor('sortOrder')" class="field-error" role="alert"><AlertTriangle />{{ issueFor('sortOrder')?.message }}</p>
      <p v-else class="text-xs text-muted-foreground">数值越小越靠前，置顶记录仍优先显示。</p>
    </div>

    <div class="flex min-h-20 items-center justify-between gap-4 rounded-xl border bg-muted/20 px-4 py-3">
      <div><Label :for="inputId('pinned')" class="cursor-pointer">置顶显示</Label><p class="mt-1 text-xs text-muted-foreground">置顶后排在普通记录之前。</p></div>
      <Switch :id="inputId('pinned')" data-field="pinned" :model-value="value.pinned" :disabled="saving" @update:model-value="patch({ pinned: $event })" />
    </div>

    <div class="col-span-2 space-y-2">
      <Label :for="inputId('publishAt')">发布时间 <span class="ml-1 text-xs font-normal text-muted-foreground">定时发布</span></Label>
      <Input :id="inputId('publishAt')" data-field="publishAt" type="datetime-local" :model-value="value.publishAt ?? ''" class="h-11 tabular-nums" :disabled="saving" :aria-invalid="Boolean(issueFor('publishAt'))" @update:model-value="patch({ publishAt: String($event) || null }); touched.publishAt = true" @blur="touched.publishAt = true" />
      <p v-if="issueFor('publishAt')" class="field-error" role="alert"><AlertTriangle />{{ issueFor('publishAt')?.message }}</p>
      <p v-else class="rounded-lg bg-muted/45 px-3 py-2 text-xs leading-5 text-muted-foreground">时间未到时保存为草稿，到点自动发布；留空后可在列表手动发布。</p>
    </div>
  </div>
</template>

<style scoped>
.field-error { display: flex; align-items: flex-start; gap: .375rem; color: var(--destructive); font-size: .75rem; line-height: 1.25rem; }
.field-error :deep(svg) { width: .875rem; height: .875rem; margin-top: .125rem; flex-shrink: 0; }
</style>
