<script setup lang="ts">
import type { CrudDialogMode } from '@/components/common'
import type { TicketGateStatus, TicketGateValidationIssue, TicketGateWriteInput } from '../types'
import { computed, nextTick, reactive, ref, useId, watch } from 'vue'
import { AlertTriangle, Info } from '@lucide/vue'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { validateTicketGateInput } from '../services/ticket-gate-service'

type Field = keyof TicketGateWriteInput

const props = withDefaults(defineProps<{
  mode: CrudDialogMode
  value: TicketGateWriteInput
  issues?: readonly TicketGateValidationIssue[]
  saving?: boolean
}>(), { issues: () => [], saving: false })

const emit = defineEmits<{ 'update:value': [value: TicketGateWriteInput] }>()
const id = useId()
const container = ref<HTMLElement | null>(null)
const touched = reactive<Record<Field, boolean>>({
  code: false,
  name: false,
  floor: false,
  locationDescription: false,
  mapCoordinates: false,
  navigationAddress: false,
  navigationLongitude: false,
  navigationLatitude: false,
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

function numberValue(field: 'navigationLongitude' | 'navigationLatitude', value: string | number): void {
  const source = String(value).trim()
  patch({ [field]: source ? Number(source) : null })
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
      <Label :for="inputId('floor')">楼层 <span class="text-destructive" aria-hidden="true">*</span></Label>
      <Select :model-value="value.floor" :disabled="saving" @update:model-value="patch({ floor: $event as TicketGateWriteInput['floor'] }); touched.floor = true">
        <SelectTrigger :id="inputId('floor')" data-field="floor" class="h-11 w-full"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="一层">一层</SelectItem><SelectItem value="二层">二层</SelectItem></SelectContent>
      </Select>
    </div>

    <div class="space-y-2">
      <Label :for="inputId('sortOrder')">排序号 <span class="text-destructive" aria-hidden="true">*</span></Label>
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
      <Label :for="inputId('mapCoordinates')">地图坐标（JSON）</Label>
      <Textarea
        :id="inputId('mapCoordinates')"
        data-field="mapCoordinates"
        :model-value="value.mapCoordinates"
        class="min-h-24 resize-y font-mono text-xs"
        placeholder="例如：[{&quot;lng&quot;:113.1462,&quot;lat&quot;:27.8165}]"
        :disabled="saving"
        :aria-invalid="Boolean(issueFor('mapCoordinates'))"
        @update:model-value="text('mapCoordinates', $event)"
        @blur="touched.mapCoordinates = true"
      />
      <p v-if="issueFor('mapCoordinates')" class="field-error" role="alert"><AlertTriangle />{{ issueFor('mapCoordinates')?.message }}</p>
      <p v-else class="text-xs leading-5 text-muted-foreground">选填。格式为包含 lng、lat 数值的 JSON 数组。</p>
    </div>

    <div class="col-span-2 rounded-xl border bg-muted/20 p-4">
      <div class="mb-4 flex items-start gap-2">
        <Info class="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <p class="text-xs leading-5 text-muted-foreground">导航地址与完整经纬度至少填写一项，用于 H5 拉起第三方导航。</p>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div class="col-span-2 space-y-2">
          <Label :for="inputId('navigationAddress')">导航地址</Label>
          <Input
            :id="inputId('navigationAddress')"
            data-field="navigationAddress"
            :model-value="value.navigationAddress"
            class="h-11"
            placeholder="例如：株洲市天元区体育中心北门"
            :disabled="saving"
            :aria-invalid="Boolean(issueFor('navigationAddress'))"
            @update:model-value="text('navigationAddress', $event)"
            @blur="touched.navigationAddress = true"
          />
          <p v-if="issueFor('navigationAddress')" class="field-error" role="alert"><AlertTriangle />{{ issueFor('navigationAddress')?.message }}</p>
        </div>
        <div class="space-y-2">
          <Label :for="inputId('navigationLongitude')">经度（lng）</Label>
          <Input
            :id="inputId('navigationLongitude')"
            data-field="navigationLongitude"
            type="number"
            step="any"
            :model-value="value.navigationLongitude ?? ''"
            class="h-11 tabular-nums"
            placeholder="113.1462"
            :disabled="saving"
            :aria-invalid="Boolean(issueFor('navigationLongitude'))"
            @update:model-value="numberValue('navigationLongitude', $event)"
            @blur="touched.navigationLongitude = true"
          />
          <p v-if="issueFor('navigationLongitude')" class="field-error" role="alert"><AlertTriangle />{{ issueFor('navigationLongitude')?.message }}</p>
        </div>
        <div class="space-y-2">
          <Label :for="inputId('navigationLatitude')">纬度（lat）</Label>
          <Input
            :id="inputId('navigationLatitude')"
            data-field="navigationLatitude"
            type="number"
            step="any"
            :model-value="value.navigationLatitude ?? ''"
            class="h-11 tabular-nums"
            placeholder="27.8165"
            :disabled="saving"
            :aria-invalid="Boolean(issueFor('navigationLatitude'))"
            @update:model-value="numberValue('navigationLatitude', $event)"
            @blur="touched.navigationLatitude = true"
          />
          <p v-if="issueFor('navigationLatitude')" class="field-error" role="alert"><AlertTriangle />{{ issueFor('navigationLatitude')?.message }}</p>
        </div>
      </div>
    </div>

    <div class="col-span-2 space-y-2">
      <Label :for="inputId('status')">状态</Label>
      <Select :model-value="value.status" :disabled="saving" @update:model-value="setStatus($event as TicketGateStatus)">
        <SelectTrigger :id="inputId('status')" data-field="status" class="h-11 w-full"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="open">开放</SelectItem><SelectItem value="closed">关闭</SelectItem><SelectItem value="restricted">管制</SelectItem></SelectContent>
      </Select>
    </div>

    <div v-if="value.status !== 'open'" class="col-span-2 space-y-2">
      <Label :for="inputId('statusRemark')">状态说明</Label>
      <Textarea
        :id="inputId('statusRemark')"
        data-field="statusRemark"
        :model-value="value.statusRemark"
        class="min-h-20 resize-y"
        placeholder="例如：临时关闭，请走东门"
        :disabled="saving"
        @update:model-value="text('statusRemark', $event)"
      />
      <p class="text-xs leading-5 text-warning">保存后，该检票口将在 H5 座位匹配中自动排除。</p>
    </div>
  </div>
</template>

<style scoped>
.field-error { display: flex; align-items: flex-start; gap: .375rem; color: var(--destructive); font-size: .75rem; line-height: 1.25rem; }
.field-error :deep(svg) { width: .875rem; height: .875rem; margin-top: .125rem; flex-shrink: 0; }
</style>
