<script setup lang="ts">
import type { TicketGateValidationIssue, TicketGateWriteInput } from '../types'
import { AlertTriangle } from '@lucide/vue'
import { computed, nextTick, reactive, ref, useId, watch } from 'vue'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { validateTicketGateInput } from '../services/ticket-gate-service'

type Field = keyof TicketGateWriteInput
type TextField = 'name' | 'code' | 'venueArea' | 'location' | 'remark'

const props = withDefaults(defineProps<{
  mode: 'create' | 'edit'
  value: TicketGateWriteInput
  issues?: readonly TicketGateValidationIssue[]
  saving?: boolean
}>(), { issues: () => [], saving: false })

const emit = defineEmits<{ 'update:value': [value: TicketGateWriteInput] }>()
const container = ref<HTMLDivElement | null>(null)
const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
const touched = reactive<Record<Field, boolean>>({ name: false, code: false, venueArea: false, location: false, direction: false, laneCount: false, deviceCount: false, enabled: false, remark: false })
const allIssues = computed(() => {
  const issues = [...props.issues]
  for (const issue of validateTicketGateInput(props.value).issues) {
    if (!issues.some((item) => item.field === issue.field)) issues.push(issue)
  }
  return issues
})

function patch(value: Partial<TicketGateWriteInput>): void { emit('update:value', { ...props.value, ...value }) }
function text(field: TextField, value: string | number): void { patch({ [field]: String(value).slice(0, field === 'remark' ? 300 : undefined) }) }
function numberValue(field: 'laneCount' | 'deviceCount', value: string | number): void {
  const source = String(value).trim()
  patch({ [field]: source ? Number(source) : Number.NaN })
}
function issueFor(field: Field): TicketGateValidationIssue | undefined { return touched[field] ? allIssues.value.find((item) => item.field === field) : undefined }
function inputId(field: Field): string { return `ticket-gate-${id}-${field}` }
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
      <Label :for="inputId('name')">检票口名称 <span class="text-destructive">*</span></Label>
      <Input :id="inputId('name')" data-field="name" :model-value="value.name" class="h-11" placeholder="例如：东广场 1 号检票口" :disabled="saving" :aria-invalid="Boolean(issueFor('name'))" @update:model-value="text('name', $event)" @blur="touched.name = true" />
      <p v-if="issueFor('name')" class="field-error" role="alert"><AlertTriangle />{{ issueFor('name')?.message }}</p>
    </div>
    <div class="space-y-2">
      <Label :for="inputId('code')">检票口编码 <span class="text-destructive">*</span></Label>
      <Input :id="inputId('code')" data-field="code" :model-value="value.code" class="h-11 font-mono uppercase" placeholder="例如：GATE-E01" :disabled="saving" :aria-invalid="Boolean(issueFor('code'))" @update:model-value="text('code', $event)" @blur="touched.code = true" />
      <p v-if="issueFor('code')" class="field-error" role="alert"><AlertTriangle />{{ issueFor('code')?.message }}</p>
    </div>
    <div class="space-y-2">
      <Label :for="inputId('venueArea')">所属区域 <span class="text-destructive">*</span></Label>
      <Input :id="inputId('venueArea')" data-field="venueArea" :model-value="value.venueArea" class="h-11" placeholder="例如：体育场东广场" :disabled="saving" :aria-invalid="Boolean(issueFor('venueArea'))" @update:model-value="text('venueArea', $event)" @blur="touched.venueArea = true" />
      <p v-if="issueFor('venueArea')" class="field-error" role="alert"><AlertTriangle />{{ issueFor('venueArea')?.message }}</p>
    </div>
    <div class="col-span-2 space-y-2">
      <Label :for="inputId('location')">具体位置</Label>
      <Input :id="inputId('location')" :model-value="value.location" class="h-11" placeholder="例如：东广场北侧，靠近 A 区入口" :disabled="saving" @update:model-value="text('location', $event)" />
    </div>
    <div class="space-y-2">
      <Label :for="inputId('direction')">通行方向</Label>
      <Select :model-value="value.direction" :disabled="saving" @update:model-value="patch({ direction: $event as TicketGateWriteInput['direction'] })">
        <SelectTrigger :id="inputId('direction')" class="h-11 w-full"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="entry">入场</SelectItem><SelectItem value="exit">出场</SelectItem><SelectItem value="bidirectional">双向</SelectItem></SelectContent>
      </Select>
    </div>
    <div class="grid grid-cols-2 gap-4">
      <div class="space-y-2">
        <Label :for="inputId('laneCount')">通道数 <span class="text-destructive">*</span></Label>
        <Input :id="inputId('laneCount')" data-field="laneCount" type="number" min="1" step="1" :model-value="Number.isFinite(value.laneCount) ? value.laneCount : ''" class="h-11 tabular-nums" :disabled="saving" :aria-invalid="Boolean(issueFor('laneCount'))" @update:model-value="numberValue('laneCount', $event)" @blur="touched.laneCount = true" />
      </div>
      <div class="space-y-2">
        <Label :for="inputId('deviceCount')">设备数 <span class="text-destructive">*</span></Label>
        <Input :id="inputId('deviceCount')" data-field="deviceCount" type="number" min="0" step="1" :model-value="Number.isFinite(value.deviceCount) ? value.deviceCount : ''" class="h-11 tabular-nums" :disabled="saving" :aria-invalid="Boolean(issueFor('deviceCount'))" @update:model-value="numberValue('deviceCount', $event)" @blur="touched.deviceCount = true" />
      </div>
      <p v-if="issueFor('laneCount') || issueFor('deviceCount')" class="field-error col-span-2" role="alert"><AlertTriangle />{{ issueFor('laneCount')?.message ?? issueFor('deviceCount')?.message }}</p>
    </div>
    <div class="col-span-2 space-y-2">
      <div class="flex justify-between"><Label :for="inputId('remark')">备注</Label><span class="text-xs tabular-nums text-muted-foreground">{{ value.remark.length }}/300</span></div>
      <Textarea :id="inputId('remark')" data-field="remark" :model-value="value.remark" class="min-h-24 resize-y" maxlength="300" placeholder="填写设备、人员或现场管理说明" :disabled="saving" @update:model-value="text('remark', $event)" />
    </div>
    <div class="col-span-2 flex min-h-16 items-center justify-between gap-4 rounded-xl border bg-muted/25 px-3 py-2.5">
      <div><Label :for="inputId('enabled')" class="cursor-pointer">启用检票口</Label><p class="mt-1 text-xs text-muted-foreground">停用后保留档案，不再作为可用检票通道。</p></div>
      <Switch :id="inputId('enabled')" :model-value="value.enabled" :disabled="saving" @update:model-value="patch({ enabled: $event })" />
    </div>
  </div>
</template>

<style scoped>
.field-error { display: flex; align-items: flex-start; gap: .375rem; color: var(--destructive); font-size: .75rem; line-height: 1.25rem; }
.field-error :deep(svg) { width: .875rem; height: .875rem; margin-top: .125rem; flex-shrink: 0; }
</style>
