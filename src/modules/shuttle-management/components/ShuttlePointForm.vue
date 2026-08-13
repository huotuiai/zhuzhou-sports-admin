<script setup lang="ts">
import type { ShuttlePointValidationIssue, ShuttlePointWriteInput, ShuttleVehicle } from '../types'
import { AlertTriangle, BusFront, GripVertical, MapPin, Plus, Trash2 } from '@lucide/vue'
import { computed, nextTick, reactive, ref, useId, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { createClientId } from '@/lib/id'
import { validateShuttlePointInput } from '../services/shuttle-point-service'

type Field = keyof ShuttlePointWriteInput
type TextField = 'name' | 'code' | 'address' | 'contactName' | 'contactPhone' | 'routeName' | 'firstDeparture' | 'lastDeparture' | 'remark'

const props = withDefaults(defineProps<{
  mode: 'create' | 'edit'
  value: ShuttlePointWriteInput
  issues?: readonly ShuttlePointValidationIssue[]
  saving?: boolean
}>(), { issues: () => [], saving: false })

const emit = defineEmits<{ 'update:value': [value: ShuttlePointWriteInput] }>()
const container = ref<HTMLDivElement | null>(null)
const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
const touched = reactive<Record<Field, boolean>>({ name: false, code: false, address: false, contactName: false, contactPhone: false, routeName: false, stations: false, vehicles: false, firstDeparture: false, lastDeparture: false, departureInterval: false, enabled: false, remark: false })
const allIssues = computed(() => {
  const issues = [...props.issues]
  for (const issue of validateShuttlePointInput(props.value).issues) {
    if (!issues.some((item) => item.field === issue.field)) issues.push(issue)
  }
  return issues
})

function patch(value: Partial<ShuttlePointWriteInput>): void { emit('update:value', { ...props.value, ...value }) }
function text(field: TextField, value: string | number): void { patch({ [field]: String(value).slice(0, field === 'remark' ? 300 : undefined) }) }
function issueFor(field: Field): ShuttlePointValidationIssue | undefined { return touched[field] ? allIssues.value.find((item) => item.field === field) : undefined }
function inputId(field: Field): string { return `shuttle-${id}-${field}` }
function addStation(): void { patch({ stations: [...props.value.stations, { id: createClientId(), name: '' }] }) }
function updateStation(index: number, name: string | number): void { patch({ stations: props.value.stations.map((item, itemIndex) => itemIndex === index ? { ...item, name: String(name) } : item) }) }
function removeStation(index: number): void { patch({ stations: props.value.stations.filter((_, itemIndex) => itemIndex !== index) }); touched.stations = true }
function addVehicle(): void { patch({ vehicles: [...props.value.vehicles, { id: createClientId(), name: '', plateNumber: '', capacity: 20 }] }) }
function updateVehicle(index: number, value: Partial<ShuttleVehicle>): void { patch({ vehicles: props.value.vehicles.map((item, itemIndex) => itemIndex === index ? { ...item, ...value } : item) }) }
function updateCapacity(index: number, value: string | number): void { const source = String(value).trim(); updateVehicle(index, { capacity: source ? Number(source) : Number.NaN }) }
function removeVehicle(index: number): void { patch({ vehicles: props.value.vehicles.filter((_, itemIndex) => itemIndex !== index) }); touched.vehicles = true }
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
  <div ref="container" class="space-y-6">
    <section class="space-y-4" aria-labelledby="shuttle-basic-heading">
      <div class="flex items-center gap-2 border-b pb-2"><MapPin class="size-4 text-primary" /><h3 id="shuttle-basic-heading" class="font-semibold">接驳点信息</h3></div>
      <div class="grid grid-cols-2 gap-4">
        <div class="col-span-2 space-y-2"><Label :for="inputId('name')">接驳点名称 <span class="text-destructive">*</span></Label><Input :id="inputId('name')" data-field="name" :model-value="value.name" class="h-11" placeholder="例如：体育中心东广场接驳点" :disabled="saving" :aria-invalid="Boolean(issueFor('name'))" @update:model-value="text('name', $event)" @blur="touched.name = true" /><p v-if="issueFor('name')" class="field-error"><AlertTriangle />{{ issueFor('name')?.message }}</p></div>
        <div class="space-y-2"><Label :for="inputId('code')">接驳点编码 <span class="text-destructive">*</span></Label><Input :id="inputId('code')" data-field="code" :model-value="value.code" class="h-11 font-mono uppercase" placeholder="例如：SHUTTLE-E01" :disabled="saving" :aria-invalid="Boolean(issueFor('code'))" @update:model-value="text('code', $event)" @blur="touched.code = true" /><p v-if="issueFor('code')" class="field-error"><AlertTriangle />{{ issueFor('code')?.message }}</p></div>
        <div class="space-y-2"><Label :for="inputId('contactName')">联系人</Label><Input :id="inputId('contactName')" :model-value="value.contactName" class="h-11" placeholder="现场负责人" :disabled="saving" @update:model-value="text('contactName', $event)" /></div>
        <div class="col-span-2 space-y-2"><Label :for="inputId('address')">接驳点地址 / 位置说明</Label><Input :id="inputId('address')" :model-value="value.address" class="h-11" placeholder="详细地址或现场定位说明" :disabled="saving" @update:model-value="text('address', $event)" /></div>
        <div class="space-y-2"><Label :for="inputId('contactPhone')">联系电话</Label><Input :id="inputId('contactPhone')" data-field="contactPhone" :model-value="value.contactPhone" class="h-11" placeholder="手机号或固定电话" :disabled="saving" :aria-invalid="Boolean(issueFor('contactPhone'))" @update:model-value="text('contactPhone', $event)" @blur="touched.contactPhone = true" /><p v-if="issueFor('contactPhone')" class="field-error"><AlertTriangle />{{ issueFor('contactPhone')?.message }}</p></div>
      </div>
    </section>

    <section class="space-y-4" aria-labelledby="shuttle-route-heading">
      <div class="flex items-center gap-2 border-b pb-2"><GripVertical class="size-4 text-primary" /><h3 id="shuttle-route-heading" class="font-semibold">线路与站点</h3></div>
      <div class="space-y-2"><Label :for="inputId('routeName')">线路名称 <span class="text-destructive">*</span></Label><Input :id="inputId('routeName')" data-field="routeName" :model-value="value.routeName" class="h-11" placeholder="例如：体育中心—神农城广场线" :disabled="saving" :aria-invalid="Boolean(issueFor('routeName'))" @update:model-value="text('routeName', $event)" @blur="touched.routeName = true" /><p v-if="issueFor('routeName')" class="field-error"><AlertTriangle />{{ issueFor('routeName')?.message }}</p></div>
      <div class="space-y-2" data-field="stations" tabindex="-1">
        <div class="flex items-center justify-between"><Label>线路站点 <span class="text-destructive">*</span></Label><Button type="button" variant="outline" class="h-9" :disabled="saving" @click="addStation"><Plus />添加站点</Button></div>
        <div class="space-y-2 rounded-xl border bg-muted/20 p-3">
          <div v-for="(station, index) in value.stations" :key="station.id" class="flex items-center gap-2">
            <span class="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold tabular-nums text-primary">{{ index + 1 }}</span>
            <Input :model-value="station.name" class="h-10" :placeholder="index === 0 ? '起点名称' : index === value.stations.length - 1 ? '终点名称' : '途经站点名称'" :disabled="saving" @update:model-value="updateStation(index, $event)" @blur="touched.stations = true" />
            <Button type="button" variant="ghost" size="icon" class="size-10 shrink-0 text-destructive hover:text-destructive" :disabled="saving || value.stations.length <= 2" :aria-label="`删除第 ${index + 1} 个站点`" @click="removeStation(index)"><Trash2 /></Button>
          </div>
        </div>
        <p v-if="issueFor('stations')" class="field-error"><AlertTriangle />{{ issueFor('stations')?.message }}</p>
      </div>
      <div class="grid grid-cols-3 gap-4">
        <div class="space-y-2"><Label :for="inputId('firstDeparture')">首班时间 <span class="text-destructive">*</span></Label><Input :id="inputId('firstDeparture')" data-field="firstDeparture" type="time" :model-value="value.firstDeparture" class="h-11 tabular-nums" :disabled="saving" :aria-invalid="Boolean(issueFor('firstDeparture'))" @update:model-value="text('firstDeparture', $event)" @blur="touched.firstDeparture = true" /></div>
        <div class="space-y-2"><Label :for="inputId('lastDeparture')">末班时间 <span class="text-destructive">*</span></Label><Input :id="inputId('lastDeparture')" data-field="lastDeparture" type="time" :model-value="value.lastDeparture" class="h-11 tabular-nums" :disabled="saving" :aria-invalid="Boolean(issueFor('lastDeparture'))" @update:model-value="text('lastDeparture', $event)" @blur="touched.lastDeparture = true" /></div>
        <div class="space-y-2"><Label :for="inputId('departureInterval')">发车间隔（分钟）<span class="text-destructive">*</span></Label><Input :id="inputId('departureInterval')" data-field="departureInterval" type="number" min="1" step="1" :model-value="Number.isFinite(value.departureInterval) ? value.departureInterval : ''" class="h-11 tabular-nums" :disabled="saving" :aria-invalid="Boolean(issueFor('departureInterval'))" @update:model-value="patch({ departureInterval: String($event).trim() ? Number($event) : Number.NaN })" @blur="touched.departureInterval = true" /></div>
        <p v-if="issueFor('firstDeparture') || issueFor('lastDeparture') || issueFor('departureInterval')" class="field-error col-span-3"><AlertTriangle />{{ issueFor('firstDeparture')?.message ?? issueFor('lastDeparture')?.message ?? issueFor('departureInterval')?.message }}</p>
      </div>
    </section>

    <section class="space-y-4" aria-labelledby="shuttle-vehicle-heading">
      <div class="flex items-center gap-2 border-b pb-2"><BusFront class="size-4 text-primary" /><h3 id="shuttle-vehicle-heading" class="font-semibold">接驳车信息</h3></div>
      <div class="flex items-center justify-between"><p class="text-xs text-muted-foreground">可先配置车辆档案，后续对接车辆调度接口。</p><Button type="button" variant="outline" class="h-9" :disabled="saving" @click="addVehicle"><Plus />添加车辆</Button></div>
      <div data-field="vehicles" tabindex="-1" class="space-y-2">
        <div v-if="!value.vehicles.length" class="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">暂未配置车辆，不影响先保存线路基础信息。</div>
        <div v-for="(vehicle, index) in value.vehicles" :key="vehicle.id" class="grid grid-cols-[1fr_1fr_110px_40px] items-end gap-2 rounded-xl border bg-card/70 p-3">
          <div class="space-y-1.5"><Label class="text-xs">车辆名称</Label><Input :model-value="vehicle.name" class="h-10" placeholder="例如：1 号接驳车" :disabled="saving" @update:model-value="updateVehicle(index, { name: String($event) })" @blur="touched.vehicles = true" /></div>
          <div class="space-y-1.5"><Label class="text-xs">车牌号</Label><Input :model-value="vehicle.plateNumber" class="h-10 uppercase" placeholder="例如：湘B12345" :disabled="saving" @update:model-value="updateVehicle(index, { plateNumber: String($event) })" @blur="touched.vehicles = true" /></div>
          <div class="space-y-1.5"><Label class="text-xs">载客数</Label><Input type="number" min="1" step="1" :model-value="Number.isFinite(vehicle.capacity) ? vehicle.capacity : ''" class="h-10 tabular-nums" :disabled="saving" @update:model-value="updateCapacity(index, $event)" @blur="touched.vehicles = true" /></div>
          <Button type="button" variant="ghost" size="icon" class="size-10 text-destructive hover:text-destructive" :disabled="saving" :aria-label="`删除${vehicle.name || '车辆'}`" @click="removeVehicle(index)"><Trash2 /></Button>
        </div>
        <p v-if="issueFor('vehicles')" class="field-error"><AlertTriangle />{{ issueFor('vehicles')?.message }}</p>
      </div>
    </section>

    <section class="space-y-4" aria-labelledby="shuttle-other-heading">
      <h3 id="shuttle-other-heading" class="border-b pb-2 font-semibold">其他设置</h3>
      <div class="space-y-2"><div class="flex justify-between"><Label :for="inputId('remark')">备注</Label><span class="text-xs tabular-nums text-muted-foreground">{{ value.remark.length }}/300</span></div><Textarea :id="inputId('remark')" :model-value="value.remark" maxlength="300" class="min-h-20 resize-y" placeholder="填写运行日期、保障要求等补充说明" :disabled="saving" @update:model-value="text('remark', $event)" /></div>
      <div class="flex min-h-16 items-center justify-between gap-4 rounded-xl border bg-muted/25 px-3 py-2.5"><div><Label :for="inputId('enabled')" class="cursor-pointer">启用接驳线路</Label><p class="mt-1 text-xs text-muted-foreground">停用后保留点位、车辆和班次配置。</p></div><Switch :id="inputId('enabled')" :model-value="value.enabled" :disabled="saving" @update:model-value="patch({ enabled: $event })" /></div>
    </section>
  </div>
</template>

<style scoped>
.field-error { display: flex; align-items: flex-start; gap: .375rem; color: var(--destructive); font-size: .75rem; line-height: 1.25rem; }
.field-error :deep(svg) { width: .875rem; height: .875rem; margin-top: .125rem; flex-shrink: 0; }
</style>
