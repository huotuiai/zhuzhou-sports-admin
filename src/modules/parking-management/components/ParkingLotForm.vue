<script setup lang="ts">
import type { CrudDialogMode } from '@/components/common'
import type {
  ParkingFeeType,
  ParkingLotFormValue,
  ParkingLotValidationField,
  ParkingLotValidationIssue,
  ParkingOpenStatus,
} from '../types'
import { AlertTriangle, CircleDollarSign, MapPin, ParkingSquare } from '@lucide/vue'
import { computed, nextTick, reactive, ref, useId, watch } from 'vue'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { parkingLotFormToCreateInput, parkingLotFormToUpdateInput } from '../lib/form-value'
import { validateParkingLotBaseInput, validateParkingLotCreateInput } from '../services/parking-lot-service'
import { PARKING_FEE_TYPES, PARKING_OPEN_STATUSES } from '../types'

const props = withDefaults(defineProps<{
  mode: CrudDialogMode
  value: ParkingLotFormValue
  issues?: readonly ParkingLotValidationIssue[]
  saving?: boolean
}>(), {
  issues: () => [],
  saving: false,
})

const emit = defineEmits<{ 'update:value': [value: ParkingLotFormValue] }>()
const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, '')
const container = ref<HTMLElement | null>(null)
const feeClearConfirmOpen = ref(false)
const fields: ParkingLotValidationField[] = [
  'code',
  'name',
  'locationDescription',
  'point',
  'navigationAddress',
  'totalSpaces',
  'feeType',
  'hourlyRateYuan',
  'openStatus',
  'enabled',
  'recommendationWeight',
  'sortOrder',
  'remark',
]
const touched = reactive(Object.fromEntries(fields.map((field) => [field, false])) as Record<ParkingLotValidationField, boolean>)

const localIssues = computed<ParkingLotValidationIssue[]>(() => {
  try {
    const validation = props.mode === 'create'
      ? validateParkingLotCreateInput(parkingLotFormToCreateInput(props.value))
      : validateParkingLotBaseInput(parkingLotFormToUpdateInput(props.value))
    return [...validation.issues]
  }
  catch (error) {
    return [{
      field: 'point',
      code: 'invalid',
      message: error instanceof Error ? error.message : '请输入合法的经度,纬度',
    }]
  }
})

const allIssues = computed(() => {
  const merged = new Map<ParkingLotValidationField, ParkingLotValidationIssue>()
  for (const issue of localIssues.value) merged.set(issue.field, issue)
  for (const issue of props.issues) merged.set(issue.field, issue)
  return [...merged.values()]
})

function inputId(field: ParkingLotValidationField): string {
  return `parking-lot-${instanceId}-${String(field)}`
}

function issueFor(field: ParkingLotValidationField): ParkingLotValidationIssue | undefined {
  return touched[field] ? allIssues.value.find((issue) => issue.field === field) : undefined
}

function patch(value: Partial<ParkingLotFormValue>): void {
  emit('update:value', { ...props.value, ...value })
}

function text(
  field: 'code' | 'name' | 'locationDescription' | 'coordinateInput' | 'navigationAddress' | 'remark',
  value: string | number,
): void {
  patch({ [field]: String(value) })
}

function numeric(
  field: 'totalSpaces' | 'hourlyRateYuan' | 'recommendationWeight' | 'sortOrder',
  value: string | number,
): void {
  const source = String(value).trim()
  if (field === 'hourlyRateYuan') patch({ hourlyRateYuan: source ? Number(source) : null })
  else patch({ [field]: source ? Number(source) : Number.NaN })
}

function handleFeeType(value: unknown): void {
  const next = value as ParkingFeeType
  if (next === 'free' && props.value.hourlyRateYuan !== null) {
    feeClearConfirmOpen.value = true
    return
  }
  patch({ feeType: next, hourlyRateYuan: next === 'free' ? null : props.value.hourlyRateYuan })
  touched.feeType = true
}

function confirmClearFee(): void {
  feeClearConfirmOpen.value = false
  patch({ feeType: 'free', hourlyRateYuan: null })
  touched.feeType = true
  touched.hourlyRateYuan = true
}

function validateAndFocus(): boolean {
  for (const field of fields) touched[field] = true
  const issue = allIssues.value[0]
  if (issue) {
    nextTick(() => container.value?.querySelector<HTMLElement>(`[data-field="${issue.field}"]`)?.focus())
    return false
  }
  return !props.saving
}

defineExpose({ validateAndFocus })
watch(() => props.mode, () => {
  for (const field of fields) touched[field] = false
  feeClearConfirmOpen.value = false
}, { flush: 'sync' })
</script>

<template>
  <div ref="container" class="grid grid-cols-2 gap-x-4 gap-y-5">
    <div class="space-y-2">
      <Label :for="inputId('code')">停车场编号 <span class="text-destructive" aria-hidden="true">*</span></Label>
      <Input
        :id="inputId('code')"
        data-field="code"
        :model-value="value.code"
        class="h-11 font-mono uppercase"
        maxlength="10"
        placeholder="例如：P-01"
        :disabled="saving || mode === 'edit'"
        :aria-invalid="Boolean(issueFor('code'))"
        @update:model-value="text('code', $event)"
        @blur="touched.code = true"
      />
      <p v-if="issueFor('code')" class="field-error" role="alert"><AlertTriangle />{{ issueFor('code')?.message }}</p>
      <p v-else class="text-xs leading-5 text-muted-foreground">{{ mode === 'edit' ? '编号创建后不可修改。' : '2–10 位字母、数字或连字符，保存后转为大写。' }}</p>
    </div>

    <div class="space-y-2">
      <Label :for="inputId('name')">停车场名称 <span class="text-destructive" aria-hidden="true">*</span></Label>
      <Input
        :id="inputId('name')"
        data-field="name"
        :model-value="value.name"
        class="h-11"
        maxlength="50"
        placeholder="例如：体育中心东停车场"
        :disabled="saving"
        :aria-invalid="Boolean(issueFor('name'))"
        @update:model-value="text('name', $event)"
        @blur="touched.name = true"
      />
      <p v-if="issueFor('name')" class="field-error" role="alert"><AlertTriangle />{{ issueFor('name')?.message }}</p>
      <p v-else class="text-right text-xs tabular-nums text-muted-foreground">{{ value.name.length }}/50</p>
    </div>

    <div class="col-span-2 space-y-2">
      <Label :for="inputId('locationDescription')">位置描述</Label>
      <Input
        :id="inputId('locationDescription')"
        data-field="locationDescription"
        :model-value="value.locationDescription"
        class="h-11"
        maxlength="100"
        placeholder="例如：体育中心东广场"
        :disabled="saving"
        :aria-invalid="Boolean(issueFor('locationDescription'))"
        @update:model-value="text('locationDescription', $event)"
        @blur="touched.locationDescription = true"
      />
      <p v-if="issueFor('locationDescription')" class="field-error" role="alert"><AlertTriangle />{{ issueFor('locationDescription')?.message }}</p>
    </div>

    <div class="col-span-2 space-y-2">
      <Label :for="inputId('point')">定位（经度,纬度）</Label>
      <div class="relative">
        <MapPin class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          :id="inputId('point')"
          data-field="point"
          :model-value="value.coordinateInput"
          class="h-11 pl-9 font-mono"
          placeholder="例如：113.1462,27.8165"
          :disabled="saving"
          :aria-invalid="Boolean(issueFor('point'))"
          @update:model-value="text('coordinateInput', $event)"
          @blur="touched.point = true"
        />
      </div>
      <p v-if="issueFor('point')" class="field-error" role="alert"><AlertTriangle />{{ issueFor('point')?.message }}</p>
      <p v-else class="text-xs leading-5 text-muted-foreground">坐标系为 GCJ-02；允许留空，未配置时只在列表展示。</p>
    </div>

    <div class="col-span-2 space-y-2">
      <Label :for="inputId('navigationAddress')">导航地址</Label>
      <Input
        :id="inputId('navigationAddress')"
        data-field="navigationAddress"
        :model-value="value.navigationAddress"
        class="h-11"
        maxlength="200"
        autocomplete="street-address"
        placeholder="例如：株洲市天元区湘江大道 88 号"
        :disabled="saving"
        :aria-invalid="Boolean(issueFor('navigationAddress'))"
        @update:model-value="text('navigationAddress', $event)"
        @blur="touched.navigationAddress = true"
      />
      <p v-if="issueFor('navigationAddress')" class="field-error" role="alert"><AlertTriangle />{{ issueFor('navigationAddress')?.message }}</p>
    </div>

    <div class="space-y-2">
      <Label :for="inputId('totalSpaces')">总车位数 <span class="text-destructive" aria-hidden="true">*</span></Label>
      <div class="relative">
        <ParkingSquare class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          :id="inputId('totalSpaces')"
          data-field="totalSpaces"
          type="number"
          min="1"
          step="1"
          :model-value="Number.isFinite(value.totalSpaces) ? value.totalSpaces : ''"
          class="h-11 pl-9 tabular-nums"
          placeholder="请输入正整数"
          :disabled="saving"
          :aria-invalid="Boolean(issueFor('totalSpaces'))"
          @update:model-value="numeric('totalSpaces', $event)"
          @blur="touched.totalSpaces = true"
        />
      </div>
      <p v-if="issueFor('totalSpaces')" class="field-error" role="alert"><AlertTriangle />{{ issueFor('totalSpaces')?.message }}</p>
    </div>

    <div class="space-y-2">
      <Label :for="inputId('feeType')">收费类型 <span class="text-destructive" aria-hidden="true">*</span></Label>
      <Select :model-value="value.feeType" :disabled="saving" @update:model-value="handleFeeType">
        <SelectTrigger :id="inputId('feeType')" data-field="feeType" class="h-11 w-full"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem v-for="item in PARKING_FEE_TYPES" :key="item.value" :value="item.value">{{ item.label }}</SelectItem></SelectContent>
      </Select>
    </div>

    <div class="space-y-2">
      <Label :for="inputId('hourlyRateYuan')">每小时价格 <span v-if="value.feeType === 'paid'" class="text-destructive" aria-hidden="true">*</span></Label>
      <div class="relative">
        <CircleDollarSign class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          :id="inputId('hourlyRateYuan')"
          data-field="hourlyRateYuan"
          type="number"
          min="0.01"
          step="0.01"
          :model-value="value.hourlyRateYuan ?? ''"
          class="h-11 pl-9 tabular-nums"
          placeholder="例如：5"
          :disabled="saving || value.feeType === 'free'"
          :aria-invalid="Boolean(issueFor('hourlyRateYuan'))"
          @update:model-value="numeric('hourlyRateYuan', $event)"
          @blur="touched.hourlyRateYuan = true"
        />
      </div>
      <p v-if="issueFor('hourlyRateYuan')" class="field-error" role="alert"><AlertTriangle />{{ issueFor('hourlyRateYuan')?.message }}</p>
      <p v-else class="text-xs text-muted-foreground">{{ value.feeType === 'free' ? '免费停车场无需填写。' : '单位：元/小时，最多两位小数。' }}</p>
    </div>

    <div class="space-y-2">
      <Label :for="inputId('openStatus')">开放状态</Label>
      <Select :model-value="value.openStatus" :disabled="saving" @update:model-value="patch({ openStatus: $event as ParkingOpenStatus }); touched.openStatus = true">
        <SelectTrigger :id="inputId('openStatus')" data-field="openStatus" class="h-11 w-full"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem v-for="item in PARKING_OPEN_STATUSES" :key="item.value" :value="item.value">{{ item.label }}</SelectItem></SelectContent>
      </Select>
    </div>

    <div class="space-y-2">
      <Label :for="inputId('recommendationWeight')">推荐权重 <span class="text-destructive" aria-hidden="true">*</span></Label>
      <Input
        :id="inputId('recommendationWeight')"
        data-field="recommendationWeight"
        type="number"
        min="0"
        max="100"
        step="1"
        :model-value="Number.isFinite(value.recommendationWeight) ? value.recommendationWeight : ''"
        class="h-11 tabular-nums"
        :disabled="saving"
        :aria-invalid="Boolean(issueFor('recommendationWeight'))"
        @update:model-value="numeric('recommendationWeight', $event)"
        @blur="touched.recommendationWeight = true"
      />
      <p v-if="issueFor('recommendationWeight')" class="field-error" role="alert"><AlertTriangle />{{ issueFor('recommendationWeight')?.message }}</p>
      <p v-else class="text-xs text-muted-foreground">范围 0–100，数值越大推荐优先级越高。</p>
    </div>

    <div class="space-y-2">
      <Label :for="inputId('sortOrder')">排序号 <span class="text-destructive" aria-hidden="true">*</span></Label>
      <Input
        :id="inputId('sortOrder')"
        data-field="sortOrder"
        type="number"
        min="0"
        step="1"
        :model-value="Number.isFinite(value.sortOrder) ? value.sortOrder : ''"
        class="h-11 tabular-nums"
        :disabled="saving"
        :aria-invalid="Boolean(issueFor('sortOrder'))"
        @update:model-value="numeric('sortOrder', $event)"
        @blur="touched.sortOrder = true"
      />
      <p v-if="issueFor('sortOrder')" class="field-error" role="alert"><AlertTriangle />{{ issueFor('sortOrder')?.message }}</p>
      <p v-else class="text-xs text-muted-foreground">数值越小在列表中越靠前。</p>
    </div>

    <div class="col-span-2 space-y-2">
      <div class="flex items-center justify-between gap-3">
        <Label :for="inputId('remark')">备注</Label>
        <span class="text-xs tabular-nums text-muted-foreground">{{ value.remark.length }}/300</span>
      </div>
      <Textarea
        :id="inputId('remark')"
        data-field="remark"
        :model-value="value.remark"
        class="min-h-24 resize-y"
        maxlength="300"
        placeholder="填写其他运营说明"
        :disabled="saving"
        :aria-invalid="Boolean(issueFor('remark'))"
        @update:model-value="text('remark', $event)"
        @blur="touched.remark = true"
      />
      <p v-if="issueFor('remark')" class="field-error" role="alert"><AlertTriangle />{{ issueFor('remark')?.message }}</p>
    </div>

    <div class="col-span-2 flex min-h-20 items-center justify-between gap-4 rounded-xl border bg-muted/20 px-4 py-3">
      <div>
        <Label :for="inputId('enabled')" class="cursor-pointer">启用停车场</Label>
        <p class="mt-1 text-xs leading-5 text-muted-foreground">停用后保留档案，地图使用灰色状态表达。</p>
      </div>
      <Switch :id="inputId('enabled')" data-field="enabled" :model-value="value.enabled" :disabled="saving" @update:model-value="patch({ enabled: $event }); touched.enabled = true" />
    </div>
  </div>

  <AlertDialog :open="feeClearConfirmOpen" @update:open="feeClearConfirmOpen = $event">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>改为免费停车场？</AlertDialogTitle>
        <AlertDialogDescription>确认后将清空当前每小时收费价格。</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel class="h-11">继续保留收费</AlertDialogCancel>
        <AlertDialogAction class="h-11" @click="confirmClearFee">改为免费并清空</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>

<style scoped>
.field-error {
  display: flex;
  align-items: flex-start;
  gap: .375rem;
  color: var(--destructive);
  font-size: .75rem;
  line-height: 1.25rem;
}

.field-error :deep(svg) {
  width: .875rem;
  height: .875rem;
  margin-top: .125rem;
  flex-shrink: 0;
}
</style>
