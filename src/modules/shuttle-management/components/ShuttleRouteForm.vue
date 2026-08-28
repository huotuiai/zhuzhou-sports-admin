<script setup lang="ts">
import type { ShuttleRouteCreateInput, ShuttleRouteValidationField, ShuttleRouteValidationIssue } from '../types'
import { computed, nextTick, reactive, ref, useId, watch } from 'vue'
import { AlertTriangle, Clock3, Info, Route } from '@lucide/vue'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { validateShuttleRouteCreateInput, validateShuttleRouteUpdateInput } from '../services/shuttle-route-service'

const props = withDefaults(defineProps<{
  mode: 'create' | 'edit'
  value: ShuttleRouteCreateInput
  issues?: readonly ShuttleRouteValidationIssue[]
  saving?: boolean
}>(), { issues: () => [], saving: false })

const emit = defineEmits<{ 'update:value': [value: ShuttleRouteCreateInput] }>()
const container = ref<HTMLDivElement | null>(null)
const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
const fields: ShuttleRouteValidationField[] = [
  'code', 'name', 'direction', 'description', 'firstDeparture', 'lastDeparture', 'schedule',
  'departureIntervalMinutes', 'durationMinutes', 'operatingStatus', 'sortOrder', 'enabled',
]
const touched = reactive(Object.fromEntries(fields.map((field) => [field, false])) as Record<ShuttleRouteValidationField, boolean>)
const allIssues = computed(() => {
  const local = props.mode === 'create'
    ? validateShuttleRouteCreateInput(props.value).issues
    : validateShuttleRouteUpdateInput(props.value).issues
  const result = [...props.issues]
  for (const issue of local) if (!result.some((item) => item.field === issue.field)) result.push(issue)
  return result
})

function patch(value: Partial<ShuttleRouteCreateInput>): void {
  emit('update:value', { ...props.value, ...value })
}

function text(field: 'code' | 'name' | 'description' | 'firstDeparture' | 'lastDeparture', value: string | number): void {
  patch({ [field]: String(value) })
}

function numberValue(field: 'departureIntervalMinutes' | 'durationMinutes' | 'sortOrder', value: string | number): void {
  const source = String(value).trim()
  patch({ [field]: source ? Number(source) : Number.NaN })
}

function issueFor(field: ShuttleRouteValidationField): ShuttleRouteValidationIssue | undefined {
  const scheduleTouched = field === 'schedule' && (touched.firstDeparture || touched.lastDeparture)
  return touched[field] || scheduleTouched ? allIssues.value.find((item) => item.field === field) : undefined
}

function fieldIssue(field: ShuttleRouteValidationField): ShuttleRouteValidationIssue | undefined {
  if (field === 'firstDeparture' || field === 'lastDeparture') return issueFor(field) ?? issueFor('schedule')
  return issueFor(field)
}

function inputId(field: ShuttleRouteValidationField): string {
  return `shuttle-route-${id}-${String(field)}`
}

function validateAndFocus(): boolean {
  for (const field of fields) touched[field] = true
  const issue = allIssues.value[0]
  if (issue) {
    nextTick(() => container.value?.querySelector<HTMLElement>(`[data-field="${issue.field === 'schedule' ? 'firstDeparture' : issue.field}"]`)?.focus())
    return false
  }
  return !props.saving
}

defineExpose({ validateAndFocus })
watch(() => props.mode, () => { for (const field of fields) touched[field] = false }, { flush: 'sync' })
</script>

<template>
  <div ref="container" class="space-y-6">
    <section class="space-y-4" aria-labelledby="shuttle-route-basic-heading">
      <div class="flex items-center gap-2 border-b pb-2">
        <Route class="size-4 text-primary" aria-hidden="true" />
        <h3 id="shuttle-route-basic-heading" class="font-semibold">线路信息</h3>
      </div>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div class="space-y-2">
          <Label :for="inputId('code')">线路编号 <span class="text-destructive">*</span></Label>
          <Input :id="inputId('code')" data-field="code" :model-value="value.code" maxlength="10" class="h-11 font-mono uppercase" placeholder="例如：L1" :disabled="saving || mode === 'edit'" :aria-invalid="Boolean(issueFor('code'))" @update:model-value="text('code', $event)" @blur="touched.code = true" />
          <p v-if="mode === 'edit'" class="text-xs text-muted-foreground">线路编号已被站点引用，编辑时不可修改。</p>
          <p v-else-if="issueFor('code')" class="field-error"><AlertTriangle />{{ issueFor('code')?.message }}</p>
          <p v-else class="text-xs text-muted-foreground">2–10 位字母或数字，保存时自动转为大写。</p>
        </div>
        <div class="space-y-2">
          <Label :for="inputId('name')">线路名称 <span class="text-destructive">*</span></Label>
          <Input :id="inputId('name')" data-field="name" :model-value="value.name" class="h-11" placeholder="例如：高铁站专线" :disabled="saving" :aria-invalid="Boolean(issueFor('name'))" @update:model-value="text('name', $event)" @blur="touched.name = true" />
          <p v-if="issueFor('name')" class="field-error"><AlertTriangle />{{ issueFor('name')?.message }}</p>
        </div>
        <div class="space-y-2 sm:col-span-2">
          <Label :for="inputId('direction')">线路方向 <span class="text-destructive">*</span></Label>
          <Select :model-value="value.direction" :disabled="saving" @update:model-value="patch({ direction: $event as ShuttleRouteCreateInput['direction'] }); touched.direction = true">
            <SelectTrigger :id="inputId('direction')" data-field="direction" class="h-11 w-full" :aria-invalid="Boolean(issueFor('direction'))"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="inbound">进场</SelectItem><SelectItem value="outbound">出场</SelectItem></SelectContent>
          </Select>
          <p class="text-xs leading-5 text-muted-foreground">方向决定站点顺序语义；往返线路请分别建立进场、出场两条记录。</p>
        </div>
        <div class="space-y-2 sm:col-span-2">
          <Label :for="inputId('description')">线路描述</Label>
          <Textarea :id="inputId('description')" :model-value="value.description" class="min-h-20 resize-y" placeholder="填写线路覆盖范围或运营说明" :disabled="saving" @update:model-value="text('description', $event)" />
        </div>
      </div>
    </section>

    <section class="space-y-4" aria-labelledby="shuttle-route-schedule-heading">
      <div class="flex items-center gap-2 border-b pb-2">
        <Clock3 class="size-4 text-primary" aria-hidden="true" />
        <h3 id="shuttle-route-schedule-heading" class="font-semibold">班次设置</h3>
      </div>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div class="space-y-2">
          <Label :for="inputId('firstDeparture')">首班时间 <span class="text-destructive">*</span></Label>
          <Input :id="inputId('firstDeparture')" data-field="firstDeparture" type="time" :model-value="value.firstDeparture" class="h-11 tabular-nums" :disabled="saving" :aria-invalid="Boolean(fieldIssue('firstDeparture'))" @update:model-value="text('firstDeparture', $event)" @blur="touched.firstDeparture = true" />
        </div>
        <div class="space-y-2">
          <Label :for="inputId('lastDeparture')">末班时间 <span class="text-destructive">*</span></Label>
          <Input :id="inputId('lastDeparture')" data-field="lastDeparture" type="time" :model-value="value.lastDeparture" class="h-11 tabular-nums" :disabled="saving" :aria-invalid="Boolean(fieldIssue('lastDeparture'))" @update:model-value="text('lastDeparture', $event)" @blur="touched.lastDeparture = true" />
        </div>
        <p v-if="fieldIssue('firstDeparture') || fieldIssue('lastDeparture')" class="field-error sm:col-span-2"><AlertTriangle />{{ fieldIssue('firstDeparture')?.message ?? fieldIssue('lastDeparture')?.message }}</p>
        <div class="space-y-2">
          <Label :for="inputId('departureIntervalMinutes')">发车间隔（分钟）<span class="text-destructive">*</span></Label>
          <Input :id="inputId('departureIntervalMinutes')" data-field="departureIntervalMinutes" type="number" min="5" step="1" :model-value="Number.isFinite(value.departureIntervalMinutes) ? value.departureIntervalMinutes : ''" class="h-11 tabular-nums" :disabled="saving" :aria-invalid="Boolean(issueFor('departureIntervalMinutes'))" @update:model-value="numberValue('departureIntervalMinutes', $event)" @blur="touched.departureIntervalMinutes = true" />
          <p v-if="issueFor('departureIntervalMinutes')" class="field-error"><AlertTriangle />{{ issueFor('departureIntervalMinutes')?.message }}</p>
        </div>
        <div class="space-y-2">
          <Label :for="inputId('durationMinutes')">全程时长（分钟）<span class="text-destructive">*</span></Label>
          <Input :id="inputId('durationMinutes')" data-field="durationMinutes" type="number" min="1" step="1" :model-value="Number.isFinite(value.durationMinutes) ? value.durationMinutes : ''" class="h-11 tabular-nums" :disabled="saving" :aria-invalid="Boolean(issueFor('durationMinutes'))" @update:model-value="numberValue('durationMinutes', $event)" @blur="touched.durationMinutes = true" />
          <p v-if="issueFor('durationMinutes')" class="field-error"><AlertTriangle />{{ issueFor('durationMinutes')?.message }}</p>
        </div>
      </div>
    </section>

    <section class="space-y-4" aria-labelledby="shuttle-route-status-heading">
      <h3 id="shuttle-route-status-heading" class="border-b pb-2 font-semibold">状态与排序</h3>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div class="space-y-2">
          <Label :for="inputId('operatingStatus')">运营状态</Label>
          <Select :model-value="value.operatingStatus" :disabled="saving" @update:model-value="patch({ operatingStatus: $event as ShuttleRouteCreateInput['operatingStatus'] }); touched.operatingStatus = true">
            <SelectTrigger :id="inputId('operatingStatus')" data-field="operatingStatus" class="h-11 w-full"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="operating">运营中</SelectItem><SelectItem value="suspended">停运</SelectItem><SelectItem value="partial">部分运营</SelectItem></SelectContent>
          </Select>
        </div>
        <div class="space-y-2">
          <Label :for="inputId('sortOrder')">排序号</Label>
          <Input :id="inputId('sortOrder')" data-field="sortOrder" type="number" min="0" step="1" :model-value="Number.isFinite(value.sortOrder) ? value.sortOrder : ''" class="h-11 tabular-nums" :disabled="saving" :aria-invalid="Boolean(issueFor('sortOrder'))" @update:model-value="numberValue('sortOrder', $event)" @blur="touched.sortOrder = true" />
          <p v-if="issueFor('sortOrder')" class="field-error"><AlertTriangle />{{ issueFor('sortOrder')?.message }}</p>
        </div>
      </div>
      <div class="flex min-h-16 items-center justify-between gap-4 rounded-xl border bg-muted/25 px-3 py-2.5">
        <div><Label :for="inputId('enabled')" class="cursor-pointer">启用线路</Label><p class="mt-1 text-xs text-muted-foreground">停用后保留班次和站点配置。</p></div>
        <Switch :id="inputId('enabled')" :model-value="value.enabled" :disabled="saving" @update:model-value="patch({ enabled: $event })" />
      </div>
      <div class="flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs leading-5 text-muted-foreground">
        <Info class="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        线路保存后可从列表进入“站点配置”，手动维护有序站点及经纬度。
      </div>
    </section>
  </div>
</template>

<style scoped>
.field-error { display: flex; align-items: flex-start; gap: .375rem; color: var(--destructive); font-size: .75rem; line-height: 1.25rem; }
.field-error :deep(svg) { width: .875rem; height: .875rem; margin-top: .125rem; flex-shrink: 0; }
</style>
