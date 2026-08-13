<script setup lang="ts">
import type { ParkingLotValidationIssue, ParkingLotWriteInput } from '../types'
import { AlertTriangle, MapPin, ParkingSquare } from '@lucide/vue'
import { computed, nextTick, reactive, ref, useId, watch } from 'vue'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { validateParkingLotInput } from '../services/parking-lot-service'

type ParkingLotFormField = keyof ParkingLotWriteInput
type ValidatedField = ParkingLotValidationIssue['field']

type TextField = 'name' | 'code' | 'address' | 'remark'

const props = withDefaults(defineProps<{
  mode: 'create' | 'edit'
  value: ParkingLotWriteInput
  issues?: readonly ParkingLotValidationIssue[]
  saving?: boolean
  readonly?: boolean
}>(), {
  issues: () => [],
  saving: false,
  readonly: false,
})

const emit = defineEmits<{
  'update:value': [value: ParkingLotWriteInput]
}>()

const fieldsRef = ref<HTMLDivElement | null>(null)
const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, '')
const codeHintId = `parking-lot-${instanceId}-code-hint`
const touched = reactive<Record<ParkingLotFormField, boolean>>({
  name: false,
  code: false,
  address: false,
  totalSpaces: false,
  enabled: false,
  remark: false,
})

const localIssues = computed(() => validateParkingLotInput(props.value).issues)

const allIssues = computed(() => {
  const issues = [...props.issues]
  for (const issue of localIssues.value) {
    if (!issues.some((candidate) => candidate.field === issue.field)) issues.push(issue)
  }
  return issues
})

const fieldIssues = computed(() => Object.fromEntries(
  (Object.keys(touched) as ParkingLotFormField[]).map((field) => [
    field,
    allIssues.value.find((issue) => issue.field === field as ValidatedField),
  ]),
) as Partial<Record<ParkingLotFormField, ParkingLotValidationIssue>>)

function patchValue(patch: Partial<ParkingLotWriteInput>) {
  emit('update:value', { ...props.value, ...patch })
}

function updateText(field: TextField, value: string | number) {
  const text = String(value)
  const limited = field === 'remark' ? text.slice(0, 300) : text
  patchValue({ [field]: limited })
}

function updateTotalSpaces(value: string | number) {
  const source = String(value).trim()
  patchValue({ totalSpaces: source === '' ? Number.NaN : Number(source) })
}

function markTouched(field: ParkingLotFormField) {
  touched[field] = true
}

function errorFor(field: ParkingLotFormField) {
  return touched[field] ? fieldIssues.value[field] : undefined
}

function inputId(field: ParkingLotFormField) {
  return `parking-lot-${instanceId}-${field}`
}

function errorId(field: ParkingLotFormField) {
  return `${inputId(field)}-error`
}

function validateAndFocus(): boolean {
  for (const field of Object.keys(touched) as ParkingLotFormField[]) touched[field] = true
  const issue = allIssues.value[0]
  if (issue) {
    nextTick(() => fieldsRef.value?.querySelector<HTMLElement>(`[data-parking-field="${issue.field}"]`)?.focus())
    return false
  }
  return !props.readonly && !props.saving
}

defineExpose({ validateAndFocus })

watch(() => props.mode, () => {
  for (const field of Object.keys(touched) as ParkingLotFormField[]) touched[field] = false
}, { flush: 'sync' })
</script>

<template>
  <div ref="fieldsRef" class="grid grid-cols-2 gap-x-4 gap-y-5">
    <div class="col-span-2 space-y-2">
      <Label :for="inputId('name')">
        停车场名称
        <span class="text-destructive" aria-hidden="true">*</span>
      </Label>
      <Input
        :id="inputId('name')"
        data-parking-field="name"
        required
        :model-value="value.name"
        class="h-11"
        placeholder="例如：体育中心北停车场"
        autocomplete="off"
        :disabled="readonly || saving"
        :aria-invalid="Boolean(errorFor('name'))"
        :aria-describedby="errorFor('name') ? errorId('name') : undefined"
        @update:model-value="updateText('name', $event)"
        @blur="markTouched('name')"
      />
      <p v-if="errorFor('name')" :id="errorId('name')" class="field-error" role="alert">
        <AlertTriangle aria-hidden="true" />
        {{ errorFor('name')?.message }}
      </p>
    </div>

    <div class="space-y-2">
      <Label :for="inputId('code')">
        停车场编码
        <span class="text-destructive" aria-hidden="true">*</span>
      </Label>
      <Input
        :id="inputId('code')"
        data-parking-field="code"
        required
        :model-value="value.code"
        class="h-11 font-mono uppercase"
        placeholder="例如：ZZSC-NORTH"
        autocomplete="off"
        :disabled="readonly || saving"
        :aria-invalid="Boolean(errorFor('code'))"
        :aria-describedby="errorFor('code') ? errorId('code') : codeHintId"
        @update:model-value="updateText('code', $event)"
        @blur="markTouched('code')"
      />
      <p v-if="errorFor('code')" :id="errorId('code')" class="field-error" role="alert">
        <AlertTriangle aria-hidden="true" />
        {{ errorFor('code')?.message }}
      </p>
      <p v-else :id="codeHintId" class="text-xs leading-5 text-muted-foreground">
        编码保存时会去除首尾空格，并按不区分大小写的结果判重。
      </p>
    </div>

    <div class="space-y-2">
      <Label :for="inputId('totalSpaces')">
        总车位数
        <span class="text-destructive" aria-hidden="true">*</span>
      </Label>
      <div class="relative">
        <ParkingSquare class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          :id="inputId('totalSpaces')"
          data-parking-field="totalSpaces"
          type="number"
          required
          inputmode="numeric"
          min="0"
          step="1"
          :model-value="Number.isFinite(value.totalSpaces) ? value.totalSpaces : ''"
          class="h-11 pl-9 tabular-nums"
          placeholder="请输入车位数"
          :disabled="readonly || saving"
          :aria-invalid="Boolean(errorFor('totalSpaces'))"
          :aria-describedby="errorFor('totalSpaces') ? errorId('totalSpaces') : undefined"
          @update:model-value="updateTotalSpaces"
          @blur="markTouched('totalSpaces')"
        />
      </div>
      <p v-if="errorFor('totalSpaces')" :id="errorId('totalSpaces')" class="field-error" role="alert">
        <AlertTriangle aria-hidden="true" />
        {{ errorFor('totalSpaces')?.message }}
      </p>
    </div>

    <div class="col-span-2 space-y-2">
      <Label :for="inputId('address')">
        停车场地址
      </Label>
      <div class="relative">
        <MapPin class="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground" aria-hidden="true" />
        <Input
          :id="inputId('address')"
          data-parking-field="address"
          :model-value="value.address"
          class="h-11 pl-9"
          placeholder="请输入停车场的详细地址"
          autocomplete="street-address"
          :disabled="readonly || saving"
          :aria-invalid="Boolean(errorFor('address'))"
          :aria-describedby="errorFor('address') ? errorId('address') : undefined"
          @update:model-value="updateText('address', $event)"
          @blur="markTouched('address')"
        />
      </div>
      <p v-if="errorFor('address')" :id="errorId('address')" class="field-error" role="alert">
        <AlertTriangle aria-hidden="true" />
        {{ errorFor('address')?.message }}
      </p>
    </div>

    <div class="col-span-2 space-y-2">
      <div class="flex items-center justify-between gap-3">
        <Label :for="inputId('remark')">备注</Label>
        <span class="text-xs tabular-nums text-muted-foreground" aria-live="polite">
          {{ value.remark.length }}/300
        </span>
      </div>
      <Textarea
        :id="inputId('remark')"
        data-parking-field="remark"
        :model-value="value.remark"
        class="min-h-24 resize-y"
        placeholder="可选，填写其他说明"
        :maxlength="300"
        :disabled="readonly || saving"
        :aria-invalid="Boolean(errorFor('remark'))"
        :aria-describedby="errorFor('remark') ? errorId('remark') : undefined"
        @update:model-value="updateText('remark', $event)"
        @blur="markTouched('remark')"
      />
      <p v-if="errorFor('remark')" :id="errorId('remark')" class="field-error" role="alert">
        <AlertTriangle aria-hidden="true" />
        {{ errorFor('remark')?.message }}
      </p>
    </div>

    <div class="col-span-2">
      <div class="flex min-h-16 items-center justify-between gap-4 rounded-xl border bg-muted/25 px-3 py-2.5">
        <div>
          <Label :for="inputId('enabled')" class="cursor-pointer">启用停车场</Label>
          <p class="mt-1 text-xs leading-5 text-muted-foreground">
            停用后保留记录，但在业务中不再作为可用停车场。
          </p>
        </div>
        <Switch
          :id="inputId('enabled')"
          :model-value="value.enabled"
          :disabled="readonly || saving"
          :aria-label="value.enabled ? '停车场已启用' : '停车场已停用'"
          @update:model-value="patchValue({ enabled: $event })"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.field-error {
  display: flex;
  align-items: flex-start;
  gap: 0.375rem;
  color: var(--destructive);
  font-size: 0.75rem;
  line-height: 1.25rem;
}

.field-error :deep(svg) {
  width: 0.875rem;
  height: 0.875rem;
  margin-top: 0.125rem;
  flex-shrink: 0;
}
</style>
