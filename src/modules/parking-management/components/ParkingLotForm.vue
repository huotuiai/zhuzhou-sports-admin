<script setup lang="ts">
import type { CrudDialogMode } from '@/components/common'
import type { TicketGate } from '@/modules/ticket-gate-management/types'
import type {
  ParkingFeeType,
  ParkingLotFormValue,
  ParkingLotValidationField,
  ParkingLotValidationIssue,
  ParkingOpenStatus,
} from '../types'
import { AlertTriangle, Clock3, Link2, MapPin, ParkingSquare, Plus, Unlink } from '@lucide/vue'
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
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
  ticketGates?: readonly TicketGate[]
  ticketGatesLoading?: boolean
  ticketGatesError?: string
}>(), {
  issues: () => [],
  saving: false,
  ticketGates: () => [],
  ticketGatesLoading: false,
  ticketGatesError: '',
})

const emit = defineEmits<{ 'update:value': [value: ParkingLotFormValue] }>()
const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, '')
const container = ref<HTMLElement | null>(null)
const bindingSection = ref<HTMLElement | null>(null)
const feeClearConfirmOpen = ref(false)
const gateDraftId = ref('')
const walkingMinutesDraft = ref('')
const bindingDraftError = ref('')
const fields: ParkingLotValidationField[] = [
  'code',
  'name',
  'locationDescription',
  'point',
  'navigationAddress',
  'totalSpaces',
  'feeType',
  'feeStandard',
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

const gateById = computed(() => new Map(props.ticketGates.map((gate) => [gate.id, gate])))
const boundGateIds = computed(() => new Set(props.value.nearbyGateBindings.map((binding) => binding.gateId)))
const selectableGates = computed(() => props.ticketGates.filter((gate) => !boundGateIds.value.has(gate.id)))
const bindingValidationError = computed(() => {
  if (props.value.nearbyGateBindings.some((binding) => !Number.isInteger(binding.walkingMinutes) || Number(binding.walkingMinutes) <= 0)) {
    return '已绑定检票口的步行时间必须是大于 0 的整数'
  }
  if (!gateDraftId.value && !walkingMinutesDraft.value.trim()) return ''
  if (!gateDraftId.value) return '请选择检票口'
  const minutes = Number(walkingMinutesDraft.value)
  if (!Number.isInteger(minutes) || minutes <= 0) return '步行时间必须是大于 0 的整数'
  return ''
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
  field: 'code' | 'name' | 'locationDescription' | 'coordinateInput' | 'navigationAddress' | 'feeStandard' | 'remark',
  value: string | number,
): void {
  patch({ [field]: String(value) })
}

function numeric(
  field: 'totalSpaces' | 'recommendationWeight' | 'sortOrder',
  value: string | number,
): void {
  const source = String(value).trim()
  patch({ [field]: source ? Number(source) : Number.NaN })
}

function gateLabel(gateId: string): string {
  const gate = gateById.value.get(gateId)
  return gate ? `${gate.code} · ${gate.name}` : `检票口 ${gateId}`
}

function addGateBinding(): void {
  bindingDraftError.value = bindingValidationError.value || (!gateDraftId.value ? '请选择检票口' : '')
  if (bindingDraftError.value) return
  const walkingMinutes = Number(walkingMinutesDraft.value)
  patch({
    nearbyGateBindings: [
      ...props.value.nearbyGateBindings,
      { gateId: gateDraftId.value, walkingMinutes },
    ],
  })
  gateDraftId.value = ''
  walkingMinutesDraft.value = ''
}

function removeGateBinding(gateId: string): void {
  patch({ nearbyGateBindings: props.value.nearbyGateBindings.filter((binding) => binding.gateId !== gateId) })
  bindingDraftError.value = ''
}

function handleFeeType(value: unknown): void {
  const next = value as ParkingFeeType
  if (next === 'free' && props.value.feeStandard.trim()) {
    feeClearConfirmOpen.value = true
    return
  }
  patch({ feeType: next, feeStandard: next === 'free' ? '' : props.value.feeStandard })
  touched.feeType = true
}

function confirmClearFee(): void {
  feeClearConfirmOpen.value = false
  patch({ feeType: 'free', feeStandard: '' })
  touched.feeType = true
  touched.feeStandard = true
}

function validateAndFocus(): boolean {
  for (const field of fields) touched[field] = true
  const issue = allIssues.value[0]
  if (issue) {
    nextTick(() => container.value?.querySelector<HTMLElement>(`[data-field="${issue.field}"]`)?.focus())
    return false
  }
  bindingDraftError.value = bindingValidationError.value
  if (bindingDraftError.value) {
    nextTick(() => bindingSection.value?.querySelector<HTMLElement>('button, input')?.focus())
    return false
  }
  return !props.saving
}

defineExpose({ validateAndFocus })
watch(() => props.mode, () => {
  for (const field of fields) touched[field] = false
  feeClearConfirmOpen.value = false
  gateDraftId.value = ''
  walkingMinutesDraft.value = ''
  bindingDraftError.value = ''
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
      <Label :for="inputId('point')">定位（经度,纬度） <span class="text-destructive" aria-hidden="true">*</span></Label>
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
      <p v-else class="text-xs leading-5 text-muted-foreground">请使用 GCJ-02 坐标系，格式为“经度,纬度”。</p>
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

    <div class="col-span-2 space-y-2">
      <Label :for="inputId('feeType')">收费类型 <span class="text-destructive" aria-hidden="true">*</span></Label>
      <Select :model-value="value.feeType" :disabled="saving" @update:model-value="handleFeeType">
        <SelectTrigger :id="inputId('feeType')" data-field="feeType" class="h-11 w-full"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem v-for="item in PARKING_FEE_TYPES" :key="item.value" :value="item.value">{{ item.label }}</SelectItem></SelectContent>
      </Select>
    </div>

    <div class="col-span-2 space-y-2">
      <Label :for="inputId('feeStandard')">收费标准 <span v-if="value.feeType === 'paid'" class="text-destructive" aria-hidden="true">*</span></Label>
      <Textarea
        :id="inputId('feeStandard')"
        data-field="feeStandard"
        :model-value="value.feeStandard"
        class="min-h-20 resize-y"
        maxlength="300"
        placeholder="例如：首小时 5 元，之后每小时 2 元，24 小时封顶 30 元"
        :disabled="saving || value.feeType === 'free'"
        :aria-invalid="Boolean(issueFor('feeStandard'))"
        @update:model-value="text('feeStandard', $event)"
        @blur="touched.feeStandard = true"
      />
      <p v-if="issueFor('feeStandard')" class="field-error" role="alert"><AlertTriangle />{{ issueFor('feeStandard')?.message }}</p>
      <p v-else class="text-xs text-muted-foreground">{{ value.feeType === 'free' ? '免费停车场无需填写。' : '支持分时段、封顶价等阶梯收费说明。' }}</p>
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

    <div ref="bindingSection" class="col-span-2 rounded-xl border border-dashed bg-muted/15 p-4">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="flex items-center gap-2 text-sm font-semibold"><Link2 class="size-4 text-primary" aria-hidden="true" />附近检票口绑定 <span class="font-normal text-muted-foreground">（可选）</span></p>
          <p class="mt-1 text-xs leading-5 text-muted-foreground">可绑定多个附近检票口；添加后步行时间必填。</p>
        </div>
        <Badge variant="secondary">{{ value.nearbyGateBindings.length }} 个</Badge>
      </div>

      <div v-if="value.nearbyGateBindings.length" class="mt-4 space-y-2">
        <div v-for="binding in value.nearbyGateBindings" :key="binding.gateId" class="flex min-h-12 items-center gap-3 rounded-lg border bg-card/75 px-3 py-2">
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium">{{ gateLabel(binding.gateId) }}</p>
            <p class="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Clock3 class="size-3.5" aria-hidden="true" />{{ binding.walkingMinutes ? `步行约 ${binding.walkingMinutes} 分钟` : '步行时间待补充' }}</p>
          </div>
          <Button type="button" variant="ghost" size="sm" class="h-9 text-destructive hover:text-destructive" :disabled="saving" @click="removeGateBinding(binding.gateId)"><Unlink aria-hidden="true" />移除</Button>
        </div>
      </div>
      <div v-else class="mt-4 rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">暂未绑定附近检票口</div>

      <div class="mt-4 grid grid-cols-[minmax(0,1fr)_140px_auto] items-end gap-3">
        <div class="space-y-2">
          <Label for="parking-nearby-gate">选择检票口</Label>
          <Select v-model="gateDraftId" :disabled="saving || ticketGatesLoading" @update:model-value="bindingDraftError = ''">
            <SelectTrigger id="parking-nearby-gate" class="h-11 w-full"><SelectValue :placeholder="ticketGatesLoading ? '正在加载检票口' : '请选择检票口'" /></SelectTrigger>
            <SelectContent><SelectItem v-for="gate in selectableGates" :key="gate.id" :value="gate.id">{{ gate.code }} · {{ gate.name }}</SelectItem></SelectContent>
          </Select>
        </div>
        <div class="space-y-2">
          <Label for="parking-nearby-walking-minutes">步行分钟</Label>
          <Input id="parking-nearby-walking-minutes" v-model="walkingMinutesDraft" type="number" min="1" step="1" class="h-11" placeholder="必填" :disabled="saving" @input="bindingDraftError = ''" />
        </div>
        <Button type="button" class="h-11" :disabled="saving || ticketGatesLoading || !selectableGates.length" @click="addGateBinding"><Plus aria-hidden="true" />添加</Button>
      </div>
      <p v-if="bindingDraftError || bindingValidationError" class="field-error mt-2" role="alert"><AlertTriangle />{{ bindingDraftError || bindingValidationError }}</p>
      <p v-else-if="ticketGatesError" class="mt-2 text-xs text-warning">{{ ticketGatesError }}</p>
      <p v-else-if="!ticketGatesLoading && !selectableGates.length && ticketGates.length" class="mt-2 text-xs text-muted-foreground">所有检票口均已绑定。</p>
      <p v-else-if="!ticketGatesLoading && !ticketGates.length" class="mt-2 text-xs text-muted-foreground">暂无可选检票口，请先在检票口管理中新增。</p>
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
        <AlertDialogDescription>确认后将清空当前收费标准。</AlertDialogDescription>
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
