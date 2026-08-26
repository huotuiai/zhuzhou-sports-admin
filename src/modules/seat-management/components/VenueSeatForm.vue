<script setup lang="ts">
import type { SeatFloor, SeatGateOption, SeatZone, SeatZoneValidationIssue, SeatZoneWriteInput } from '../types'
import { AlertTriangle, Ban, CircleCheck, ShieldAlert } from '@lucide/vue'
import { computed, nextTick, reactive, ref, useId, watch } from 'vue'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { validateSeatZoneInput } from '../services/venue-seat-service'

type Field = keyof SeatZoneWriteInput
type TextField = 'code' | 'name' | 'remark'
type NumberField = 'rowStart' | 'rowEnd' | 'sortOrder'

const props = withDefaults(defineProps<{
  mode: 'create' | 'edit'
  value: SeatZoneWriteInput
  floors: readonly SeatFloor[]
  zones: readonly SeatZone[]
  ticketGates: readonly SeatGateOption[]
  editingId?: string
  issues?: readonly SeatZoneValidationIssue[]
  saving?: boolean
}>(), { editingId: undefined, issues: () => [], saving: false })

const emit = defineEmits<{ 'update:value': [value: SeatZoneWriteInput] }>()
const container = ref<HTMLDivElement | null>(null)
const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
const touched = reactive<Record<Field, boolean>>({
  code: false, name: false, floorId: false, rowStart: false, rowEnd: false,
  gateIds: false, sortOrder: false, status: false, remark: false,
})

const allIssues = computed(() => {
  const issues = [...props.issues]
  for (const issue of validateSeatZoneInput(props.value, props.zones, props.floors, props.ticketGates, props.editingId).issues) {
    if (!issues.some((item) => item.field === issue.field)) issues.push(issue)
  }
  return issues
})

function patch(value: Partial<SeatZoneWriteInput>): void {
  emit('update:value', { ...props.value, ...value })
}

function text(field: TextField, value: string | number): void {
  const limit = field === 'remark' ? 300 : field === 'name' ? 80 : 10
  patch({ [field]: String(value).slice(0, limit) })
}

function numeric(field: NumberField, value: string | number): void {
  const source = String(value).trim()
  patch({ [field]: source ? Number(source) : Number.NaN })
}

function numericValue(field: NumberField): number | string {
  return Number.isNaN(props.value[field]) ? '' : props.value[field]
}

function toggleGate(gateId: string, checked: boolean | 'indeterminate'): void {
  const next = new Set(props.value.gateIds)
  if (checked === true) next.add(gateId)
  else next.delete(gateId)
  touched.gateIds = true
  patch({ gateIds: [...next] })
}

function gateStatus(gate: SeatGateOption): string {
  if (!gate.enabled) return '停用'
  return ({ open: '开放', closed: '关闭', restricted: '管制' })[gate.openStatus]
}

function issueFor(field: Field): SeatZoneValidationIssue | undefined {
  return touched[field] ? allIssues.value.find((item) => item.field === field) : undefined
}

function inputId(field: Field): string {
  return `seat-zone-${id}-${field}`
}

function errorId(field: Field): string | undefined {
  return issueFor(field) ? `${inputId(field)}-error` : undefined
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
watch(() => [props.mode, props.editingId], () => {
  for (const field of Object.keys(touched) as Field[]) touched[field] = false
}, { flush: 'sync' })
</script>

<template>
  <div ref="container" class="grid grid-cols-2 gap-x-4 gap-y-5">
    <div class="space-y-2">
      <Label :for="inputId('code')">分区编号 <span class="text-destructive">*</span></Label>
      <Input
        :id="inputId('code')" data-field="code" :model-value="value.code" class="h-11 font-mono uppercase"
        placeholder="例如：A-01" :disabled="saving || mode === 'edit'" :aria-invalid="Boolean(issueFor('code'))"
        :aria-describedby="errorId('code')" @update:model-value="text('code', $event)" @blur="touched.code = true"
      />
      <p v-if="issueFor('code')" :id="errorId('code')" class="field-error" role="alert"><AlertTriangle />{{ issueFor('code')?.message }}</p>
      <p v-else class="text-xs leading-5 text-muted-foreground">2–10 位字母、数字或连字符，保存时自动转为大写；创建后不可修改。</p>
    </div>

    <div class="space-y-2">
      <Label :for="inputId('name')">区域名称 <span class="text-destructive">*</span></Label>
      <Input
        :id="inputId('name')" data-field="name" :model-value="value.name" class="h-11"
        placeholder="例如：A 区 · 主舞台正对区" :disabled="saving" :aria-invalid="Boolean(issueFor('name'))"
        :aria-describedby="errorId('name')" @update:model-value="text('name', $event)" @blur="touched.name = true"
      />
      <p v-if="issueFor('name')" :id="errorId('name')" class="field-error" role="alert"><AlertTriangle />{{ issueFor('name')?.message }}</p>
    </div>

    <div class="space-y-2">
      <Label :for="inputId('floorId')">所属楼层 <span class="text-destructive">*</span></Label>
      <Select :model-value="value.floorId" :disabled="saving" @update:model-value="patch({ floorId: String($event) }); touched.floorId = true">
        <SelectTrigger :id="inputId('floorId')" data-field="floorId" class="h-11 w-full" :aria-invalid="Boolean(issueFor('floorId'))" :aria-describedby="errorId('floorId')"><SelectValue placeholder="请选择楼层" /></SelectTrigger>
        <SelectContent><SelectItem v-for="floor in floors" :key="floor.id" :value="floor.id">{{ floor.name }}</SelectItem></SelectContent>
      </Select>
      <p v-if="issueFor('floorId')" :id="errorId('floorId')" class="field-error" role="alert"><AlertTriangle />{{ issueFor('floorId')?.message }}</p>
    </div>

    <div class="space-y-2">
      <Label :for="inputId('sortOrder')">排序 <span class="text-destructive">*</span></Label>
      <Input
        :id="inputId('sortOrder')" data-field="sortOrder" :model-value="numericValue('sortOrder')" type="number" min="1" step="1" class="h-11"
        :disabled="saving" :aria-invalid="Boolean(issueFor('sortOrder'))" :aria-describedby="errorId('sortOrder')"
        @update:model-value="numeric('sortOrder', $event)" @blur="touched.sortOrder = true"
      />
      <p v-if="issueFor('sortOrder')" :id="errorId('sortOrder')" class="field-error" role="alert"><AlertTriangle />{{ issueFor('sortOrder')?.message }}</p>
    </div>

    <div class="space-y-2">
      <Label :for="inputId('rowStart')">座位范围起 <span class="text-destructive">*</span></Label>
      <Input
        :id="inputId('rowStart')" data-field="rowStart" :model-value="numericValue('rowStart')" type="number" min="1" max="200" step="1" class="h-11"
        :disabled="saving" :aria-invalid="Boolean(issueFor('rowStart'))" :aria-describedby="errorId('rowStart')"
        @update:model-value="numeric('rowStart', $event)" @blur="touched.rowStart = true"
      />
      <p v-if="issueFor('rowStart')" :id="errorId('rowStart')" class="field-error" role="alert"><AlertTriangle />{{ issueFor('rowStart')?.message }}</p>
    </div>

    <div class="space-y-2">
      <Label :for="inputId('rowEnd')">座位范围止 <span class="text-destructive">*</span></Label>
      <Input
        :id="inputId('rowEnd')" data-field="rowEnd" :model-value="numericValue('rowEnd')" type="number" min="1" max="200" step="1" class="h-11"
        :disabled="saving" :aria-invalid="Boolean(issueFor('rowEnd'))" :aria-describedby="errorId('rowEnd')"
        @update:model-value="numeric('rowEnd', $event)" @blur="touched.rowEnd = true"
      />
      <p v-if="issueFor('rowEnd')" :id="errorId('rowEnd')" class="field-error" role="alert"><AlertTriangle />{{ issueFor('rowEnd')?.message }}</p>
    </div>

    <div class="col-span-2 space-y-2">
      <div class="flex items-end justify-between gap-3">
        <Label :id="`${inputId('gateIds')}-label`">对应检票口 <span class="text-destructive">*</span></Label>
        <span class="text-xs text-muted-foreground">已选 {{ value.gateIds.length }} 个</span>
      </div>
      <div
        data-field="gateIds" tabindex="-1" role="group" :aria-labelledby="`${inputId('gateIds')}-label`"
        :aria-invalid="Boolean(issueFor('gateIds'))" :aria-describedby="errorId('gateIds')"
        :class="['grid max-h-64 grid-cols-2 gap-2 overflow-y-auto rounded-xl border bg-muted/15 p-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50', issueFor('gateIds') && 'border-destructive']"
      >
        <label
          v-for="gate in ticketGates" :key="gate.id"
          class="flex min-h-16 cursor-pointer items-start gap-3 rounded-lg border bg-background/75 p-3 transition-colors hover:border-primary/35 hover:bg-primary/5"
        >
          <Checkbox :model-value="value.gateIds.includes(gate.id)" :disabled="saving" :aria-label="`选择检票口：${gate.code} ${gate.name}`" @update:model-value="toggleGate(gate.id, $event)" />
          <span class="min-w-0 flex-1">
            <span class="flex min-w-0 items-center gap-2"><code class="shrink-0 text-xs font-semibold">{{ gate.code }}</code><span class="truncate text-sm font-medium">{{ gate.name }}</span></span>
            <Badge
              variant="outline"
              :class="['mt-1.5 h-5 gap-1 px-1.5 text-[10px]', !gate.enabled ? 'border-muted-foreground/30 text-muted-foreground' : gate.openStatus === 'open' ? 'border-success/30 text-success' : gate.openStatus === 'restricted' ? 'border-destructive/30 text-destructive' : 'border-warning/30 text-warning']"
            >
              <Ban v-if="!gate.enabled || gate.openStatus === 'closed'" class="size-3" /><ShieldAlert v-else-if="gate.openStatus === 'restricted'" class="size-3" /><CircleCheck v-else class="size-3" />{{ gateStatus(gate) }}
            </Badge>
          </span>
        </label>
        <p v-if="ticketGates.length === 0" class="col-span-2 py-5 text-center text-sm text-muted-foreground">暂无可选择的检票口，请先维护检票口数据。</p>
      </div>
      <p v-if="issueFor('gateIds')" :id="errorId('gateIds')" class="field-error" role="alert"><AlertTriangle />{{ issueFor('gateIds')?.message }}</p>
      <p v-else class="text-xs leading-5 text-muted-foreground">关闭、管制或停用的检票口仍可绑定，但不会参与 H5 的开放入口推荐。</p>
    </div>

    <div class="space-y-2">
      <Label :for="inputId('status')">状态</Label>
      <Select :model-value="value.status" :disabled="saving" @update:model-value="patch({ status: $event as SeatZoneWriteInput['status'] })">
        <SelectTrigger :id="inputId('status')" data-field="status" class="h-11 w-full"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="enabled">启用</SelectItem><SelectItem value="disabled">停用</SelectItem></SelectContent>
      </Select>
    </div>

    <div class="col-span-2 space-y-2">
      <div class="flex justify-between"><Label :for="inputId('remark')">备注</Label><span class="text-xs tabular-nums text-muted-foreground">{{ value.remark.length }}/300</span></div>
      <Textarea
        :id="inputId('remark')" data-field="remark" :model-value="value.remark" maxlength="300" class="min-h-24 resize-y"
        placeholder="填写分区视线、入场或现场管理说明" :disabled="saving" :aria-invalid="Boolean(issueFor('remark'))"
        :aria-describedby="errorId('remark')" @update:model-value="text('remark', $event)" @blur="touched.remark = true"
      />
      <p v-if="issueFor('remark')" :id="errorId('remark')" class="field-error" role="alert"><AlertTriangle />{{ issueFor('remark')?.message }}</p>
    </div>
  </div>
</template>

<style scoped>
.field-error { display: flex; align-items: flex-start; gap: .375rem; color: var(--destructive); font-size: .75rem; line-height: 1.25rem; }
.field-error :deep(svg) { width: .875rem; height: .875rem; margin-top: .125rem; flex-shrink: 0; }
</style>
