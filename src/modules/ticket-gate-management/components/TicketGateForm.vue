<script setup lang="ts">
import type { CrudDialogMode } from '@/components/common'
import type { TicketGateFloorOption, TicketGateStatus, TicketGateValidationIssue, TicketGateWriteInput } from '../types'
import { computed, nextTick, reactive, ref, useId, watch } from 'vue'
import { AlertTriangle, Info } from '@lucide/vue'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { validateTicketGateInput } from '../services/ticket-gate-service'

type Field = keyof TicketGateWriteInput

const props = withDefaults(defineProps<{
  mode: CrudDialogMode
  value: TicketGateWriteInput
  floors: readonly TicketGateFloorOption[]
  issues?: readonly TicketGateValidationIssue[]
  saving?: boolean
}>(), { issues: () => [], saving: false })

const emit = defineEmits<{ 'update:value': [value: TicketGateWriteInput] }>()
const id = useId()
const container = ref<HTMLElement | null>(null)
const touched = reactive<Record<Field, boolean>>({
  code: false,
  name: false,
  floorId: false,
  locationDescription: false,
  mapCoordinates: false,
  navigationAddress: false,
  sortOrder: false,
  status: false,
  statusRemark: false,
})

const allIssues = computed(() => {
  const merged = new Map<Field, TicketGateValidationIssue>()
  for (const issue of validateTicketGateInput(props.value).issues) merged.set(issue.field, issue)
  for (const issue of props.issues) merged.set(issue.field, issue)
  return [...merged.values()]
})

function patch(value: Partial<TicketGateWriteInput>): void {
  emit('update:value', { ...props.value, ...value })
}

function text(field: 'code' | 'name' | 'locationDescription' | 'mapCoordinates' | 'navigationAddress' | 'statusRemark', value: string | number): void {
  patch({ [field]: String(value) })
}

function sortValue(value: string | number): void {
  const source = String(value).trim()
  patch({ sortOrder: source ? Number(source) : Number.NaN })
}

function setStatus(status: TicketGateStatus): void {
  patch({ status, statusRemark: status === 'open' ? '' : props.value.statusRemark })
}

function issueFor(field: Field): TicketGateValidationIssue | undefined {
  return touched[field] ? allIssues.value.find((item) => item.field === field) : undefined
}

function inputId(field: Field): string {
  return `ticket-gate-${id}-${field}`
}

function errorId(field: Field): string {
  return `${inputId(field)}-error`
}

function validateAndFocus(): boolean {
  for (const field of Object.keys(touched) as Field[]) touched[field] = true
  const issue = allIssues.value[0]
  if (issue) {
    nextTick(() => container.value?.querySelector<HTMLElement>(`[data-field="${issue.field}"]`)?.focus())
    return false
  }
  return !props.saving
}

defineExpose({ validateAndFocus })
watch(() => props.mode, () => {
  for (const field of Object.keys(touched) as Field[]) touched[field] = false
}, { flush: 'sync' })
</script>

<template>
  <div ref="container" class="grid grid-cols-2 gap-x-4 gap-y-5">
    <div class="space-y-2">
      <Label :for="inputId('code')">检票口编号 <span class="text-destructive" aria-hidden="true">*</span></Label>
      <Input
        :id="inputId('code')"
        data-field="code"
        :model-value="value.code"
        class="h-11 font-mono uppercase"
        placeholder="例如：G-7"
        maxlength="10"
        :disabled="saving || mode === 'edit'"
        :aria-invalid="Boolean(issueFor('code'))"
        :aria-describedby="issueFor('code') ? errorId('code') : undefined"
        @update:model-value="text('code', $event)"
        @blur="touched.code = true"
      />
      <p v-if="mode === 'edit'" class="text-xs leading-5 text-muted-foreground">编号已被关联数据引用，编辑时不可修改。</p>
      <p v-if="issueFor('code')" :id="errorId('code')" class="field-error" role="alert"><AlertTriangle />{{ issueFor('code')?.message }}</p>
    </div>

    <div class="space-y-2">
      <Label :for="inputId('name')">名称 <span class="text-destructive" aria-hidden="true">*</span></Label>
      <Input
        :id="inputId('name')"
        data-field="name"
        :model-value="value.name"
        class="h-11"
        placeholder="例如：北门入口"
        :disabled="saving"
        :aria-invalid="Boolean(issueFor('name'))"
        :aria-describedby="issueFor('name') ? errorId('name') : undefined"
        @update:model-value="text('name', $event)"
        @blur="touched.name = true"
      />
      <p v-if="issueFor('name')" :id="errorId('name')" class="field-error" role="alert"><AlertTriangle />{{ issueFor('name')?.message }}</p>
    </div>

    <div class="space-y-2">
      <Label :for="inputId('floorId')">楼层 <span class="text-destructive" aria-hidden="true">*</span></Label>
      <Select :model-value="value.floorId" :disabled="saving || !floors.length" @update:model-value="patch({ floorId: String($event) }); touched.floorId = true">
        <SelectTrigger :id="inputId('floorId')" data-field="floorId" class="h-11 w-full" :aria-invalid="Boolean(issueFor('floorId'))"><SelectValue placeholder="请选择楼层" /></SelectTrigger>
        <SelectContent><SelectItem v-for="floor in floors" :key="floor.id" :value="floor.id">{{ floor.name }}{{ floor.enabled ? '' : '（已停用）' }}</SelectItem></SelectContent>
      </Select>
      <p v-if="issueFor('floorId')" :id="errorId('floorId')" class="field-error" role="alert"><AlertTriangle />{{ issueFor('floorId')?.message }}</p>
      <p v-else-if="!floors.length" class="text-xs leading-5 text-warning">暂无可选楼层，请先在座位规划管理中配置。</p>
    </div>

    <div class="space-y-2">
      <Label :for="inputId('sortOrder')">排序号</Label>
      <Input
        :id="inputId('sortOrder')"
        data-field="sortOrder"
        type="number"
        min="1"
        step="1"
        :model-value="Number.isFinite(value.sortOrder) ? value.sortOrder : ''"
        class="h-11 tabular-nums"
        :disabled="saving"
        :aria-invalid="Boolean(issueFor('sortOrder'))"
        @update:model-value="sortValue"
        @blur="touched.sortOrder = true"
      />
      <p v-if="issueFor('sortOrder')" class="field-error" role="alert"><AlertTriangle />{{ issueFor('sortOrder')?.message }}</p>
    </div>

    <div class="col-span-2 space-y-2">
      <Label :for="inputId('locationDescription')">位置描述</Label>
      <Input
        :id="inputId('locationDescription')"
        data-field="locationDescription"
        :model-value="value.locationDescription"
        class="h-11"
        placeholder="例如：场馆北侧主入口"
        :disabled="saving"
        @update:model-value="text('locationDescription', $event)"
      />
    </div>

    <div class="col-span-2 space-y-2">
      <Label :for="inputId('mapCoordinates')">定位（经纬度） <span class="text-destructive" aria-hidden="true">*</span></Label>
      <Input
        :id="inputId('mapCoordinates')"
        data-field="mapCoordinates"
        :model-value="value.mapCoordinates"
        class="h-11 font-mono"
        placeholder="例如：113.1462, 27.8165"
        :disabled="saving"
        :aria-invalid="Boolean(issueFor('mapCoordinates'))"
        :aria-describedby="issueFor('mapCoordinates') ? errorId('mapCoordinates') : undefined"
        @update:model-value="text('mapCoordinates', $event)"
        @blur="touched.mapCoordinates = true"
      />
      <p v-if="issueFor('mapCoordinates')" :id="errorId('mapCoordinates')" class="field-error" role="alert"><AlertTriangle />{{ issueFor('mapCoordinates')?.message }}</p>
      <div v-else class="flex items-start gap-2 rounded-lg bg-muted/35 px-3 py-2 text-xs leading-5 text-muted-foreground"><Info class="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />定位为必填项，用于地图点位、距离计算、2KM 筛选和一键导航。</div>
    </div>

    <div class="col-span-2 space-y-2">
      <Label :for="inputId('navigationAddress')">导航地址（选填）</Label>
      <Input
        :id="inputId('navigationAddress')"
        data-field="navigationAddress"
        :model-value="value.navigationAddress"
        class="h-11"
        placeholder="例如：株洲市天元区湘江大道 88 号"
        :disabled="saving"
        @update:model-value="text('navigationAddress', $event)"
        @blur="touched.navigationAddress = true"
      />
      <p class="text-xs leading-5 text-muted-foreground">文本地址，作为第三方地图目的地或复制地址兜底。</p>
    </div>

    <div class="col-span-2 space-y-2">
      <Label :for="inputId('status')">状态</Label>
      <Select :model-value="value.status" :disabled="saving" @update:model-value="setStatus($event as TicketGateStatus)">
        <SelectTrigger :id="inputId('status')" data-field="status" class="h-11 w-full"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="open">开放</SelectItem><SelectItem value="closed">关闭</SelectItem><SelectItem value="restricted">管制</SelectItem></SelectContent>
      </Select>
    </div>

  </div>
</template>

<style scoped>
.field-error { display: flex; align-items: flex-start; gap: .375rem; color: var(--destructive); font-size: .75rem; line-height: 1.25rem; }
.field-error :deep(svg) { width: .875rem; height: .875rem; margin-top: .125rem; flex-shrink: 0; }
</style>
