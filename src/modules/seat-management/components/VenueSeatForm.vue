<script setup lang="ts">
import type { VenueSeatValidationIssue, VenueSeatWriteInput } from '../types'
import { AlertTriangle } from '@lucide/vue'
import { computed, nextTick, reactive, ref, useId, watch } from 'vue'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { validateVenueSeatInput } from '../services/venue-seat-service'

type Field = keyof VenueSeatWriteInput
type TextField = 'code' | 'venueArea' | 'section' | 'rowNumber' | 'seatNumber' | 'remark'

const props = withDefaults(defineProps<{
  mode: 'create' | 'edit'
  value: VenueSeatWriteInput
  issues?: readonly VenueSeatValidationIssue[]
  saving?: boolean
}>(), { issues: () => [], saving: false })

const emit = defineEmits<{ 'update:value': [value: VenueSeatWriteInput] }>()
const container = ref<HTMLDivElement | null>(null)
const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
const touched = reactive<Record<Field, boolean>>({ code: false, venueArea: false, section: false, rowNumber: false, seatNumber: false, type: false, status: false, remark: false })
const allIssues = computed(() => {
  const issues = [...props.issues]
  for (const issue of validateVenueSeatInput(props.value).issues) {
    if (!issues.some((item) => item.field === issue.field)) issues.push(issue)
  }
  return issues
})

function patch(value: Partial<VenueSeatWriteInput>): void { emit('update:value', { ...props.value, ...value }) }
function text(field: TextField, value: string | number): void { patch({ [field]: String(value).slice(0, field === 'remark' ? 300 : undefined) }) }
function issueFor(field: Field): VenueSeatValidationIssue | undefined { return touched[field] ? allIssues.value.find((item) => item.field === field) : undefined }
function inputId(field: Field): string { return `venue-seat-${id}-${field}` }
function validateAndFocus(): boolean {
  for (const field of Object.keys(touched) as Field[]) touched[field] = true
  const issue = allIssues.value[0]
  if (issue) { nextTick(() => container.value?.querySelector<HTMLElement>(`[data-field="${issue.field}"]`)?.focus()); return false }
  return !props.saving
}

defineExpose({ validateAndFocus })
watch(() => props.mode, () => { for (const field of Object.keys(touched) as Field[]) touched[field] = false }, { flush: 'sync' })
</script>

<template>
  <div ref="container" class="grid grid-cols-2 gap-x-4 gap-y-5">
    <div class="col-span-2 space-y-2">
      <Label :for="inputId('code')">座位编码 <span class="text-destructive">*</span></Label>
      <Input :id="inputId('code')" data-field="code" :model-value="value.code" class="h-11 font-mono uppercase" placeholder="例如：ST-A-01-008" :disabled="saving" :aria-invalid="Boolean(issueFor('code'))" @update:model-value="text('code', $event)" @blur="touched.code = true" />
      <p v-if="issueFor('code')" class="field-error" role="alert"><AlertTriangle />{{ issueFor('code')?.message }}</p>
      <p v-else class="text-xs leading-5 text-muted-foreground">建议按“场馆-分区-排-座号”生成唯一编码，便于后续检票与票务对接。</p>
    </div>
    <div class="space-y-2">
      <Label :for="inputId('venueArea')">场馆区域 <span class="text-destructive">*</span></Label>
      <Input :id="inputId('venueArea')" data-field="venueArea" :model-value="value.venueArea" class="h-11" placeholder="例如：主体育场" :disabled="saving" :aria-invalid="Boolean(issueFor('venueArea'))" @update:model-value="text('venueArea', $event)" @blur="touched.venueArea = true" />
      <p v-if="issueFor('venueArea')" class="field-error" role="alert"><AlertTriangle />{{ issueFor('venueArea')?.message }}</p>
    </div>
    <div class="space-y-2">
      <Label :for="inputId('section')">看台分区 <span class="text-destructive">*</span></Label>
      <Input :id="inputId('section')" data-field="section" :model-value="value.section" class="h-11" placeholder="例如：A 区" :disabled="saving" :aria-invalid="Boolean(issueFor('section'))" @update:model-value="text('section', $event)" @blur="touched.section = true" />
      <p v-if="issueFor('section')" class="field-error" role="alert"><AlertTriangle />{{ issueFor('section')?.message }}</p>
    </div>
    <div class="space-y-2">
      <Label :for="inputId('rowNumber')">排号 <span class="text-destructive">*</span></Label>
      <Input :id="inputId('rowNumber')" data-field="rowNumber" :model-value="value.rowNumber" class="h-11" placeholder="例如：01 排" :disabled="saving" :aria-invalid="Boolean(issueFor('rowNumber'))" @update:model-value="text('rowNumber', $event)" @blur="touched.rowNumber = true" />
      <p v-if="issueFor('rowNumber')" class="field-error" role="alert"><AlertTriangle />{{ issueFor('rowNumber')?.message }}</p>
    </div>
    <div class="space-y-2">
      <Label :for="inputId('seatNumber')">座号 <span class="text-destructive">*</span></Label>
      <Input :id="inputId('seatNumber')" data-field="seatNumber" :model-value="value.seatNumber" class="h-11" placeholder="例如：008 号" :disabled="saving" :aria-invalid="Boolean(issueFor('seatNumber'))" @update:model-value="text('seatNumber', $event)" @blur="touched.seatNumber = true" />
      <p v-if="issueFor('seatNumber')" class="field-error" role="alert"><AlertTriangle />{{ issueFor('seatNumber')?.message }}</p>
    </div>
    <div class="space-y-2">
      <Label :for="inputId('type')">座位类型</Label>
      <Select :model-value="value.type" :disabled="saving" @update:model-value="patch({ type: $event as VenueSeatWriteInput['type'] })"><SelectTrigger :id="inputId('type')" class="h-11 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="standard">普通座</SelectItem><SelectItem value="vip">VIP 座</SelectItem><SelectItem value="accessible">无障碍座</SelectItem></SelectContent></Select>
    </div>
    <div class="space-y-2">
      <Label :for="inputId('status')">座位状态</Label>
      <Select :model-value="value.status" :disabled="saving" @update:model-value="patch({ status: $event as VenueSeatWriteInput['status'] })"><SelectTrigger :id="inputId('status')" class="h-11 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="available">可用</SelectItem><SelectItem value="maintenance">维护中</SelectItem><SelectItem value="disabled">停用</SelectItem></SelectContent></Select>
    </div>
    <div class="col-span-2 space-y-2">
      <div class="flex justify-between"><Label :for="inputId('remark')">备注</Label><span class="text-xs tabular-nums text-muted-foreground">{{ value.remark.length }}/300</span></div>
      <Textarea :id="inputId('remark')" :model-value="value.remark" maxlength="300" class="min-h-24 resize-y" placeholder="填写座位视线、设施或现场管理说明" :disabled="saving" @update:model-value="text('remark', $event)" />
    </div>
  </div>
</template>

<style scoped>
.field-error { display: flex; align-items: flex-start; gap: .375rem; color: var(--destructive); font-size: .75rem; line-height: 1.25rem; }
.field-error :deep(svg) { width: .875rem; height: .875rem; margin-top: .125rem; flex-shrink: 0; }
</style>
