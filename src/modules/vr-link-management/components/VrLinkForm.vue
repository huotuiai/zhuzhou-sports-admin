<script setup lang="ts">
import type { CrudDialogMode } from '@/components/common'
import type { VrLinkValidationIssue, VrLinkWriteInput, VrPlaceOption, VrPlaceType } from '../types'
import { computed, nextTick, reactive, ref, useId, watch } from 'vue'
import { ExternalLink, Info, LoaderCircle, MapPin, TriangleAlert } from '@lucide/vue'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { validateVrLinkInput } from '../services/vr-link-service'

type Field = keyof VrLinkWriteInput

const props = withDefaults(defineProps<{
  mode: CrudDialogMode
  value: VrLinkWriteInput
  placeOptions: readonly VrPlaceOption[]
  issues?: readonly VrLinkValidationIssue[]
  saving?: boolean
  placeOptionsLoading?: boolean
  placeOptionsError?: string | null
}>(), {
  issues: () => [],
  saving: false,
  placeOptionsLoading: false,
  placeOptionsError: null,
})

const emit = defineEmits<{ 'update:value': [value: VrLinkWriteInput] }>()
const container = ref<HTMLElement | null>(null)
const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
const touched = reactive<Record<Field, boolean>>({
  title: false,
  vrUrl: false,
  placeType: false,
  placeId: false,
  status: false,
  remark: false,
})

const allIssues = computed(() => {
  const merged = new Map<Field, VrLinkValidationIssue>()
  for (const issue of validateVrLinkInput(props.value).issues) merged.set(issue.field, issue)
  for (const issue of props.issues) merged.set(issue.field, issue)
  return [...merged.values()]
})
const selectedOption = computed(() => props.placeOptions.find(option => option.id === props.value.placeId))
const availableOptionCount = computed(() => props.placeOptions.filter(option => option.available).length)

function patch(value: Partial<VrLinkWriteInput>): void {
  emit('update:value', { ...props.value, ...value })
}

function text(field: 'title' | 'vrUrl' | 'remark', value: string | number): void {
  const limit = field === 'title' ? 128 : field === 'vrUrl' ? 512 : undefined
  patch({ [field]: limit ? String(value).slice(0, limit) : String(value) })
}

function setPlaceType(value: unknown): void {
  touched.placeType = true
  touched.placeId = false
  patch({ placeType: value as VrPlaceType, placeId: '' })
}

function issueFor(field: Field): VrLinkValidationIssue | undefined {
  return touched[field] ? allIssues.value.find(issue => issue.field === field) : undefined
}

function inputId(field: Field): string {
  return `vr-link-${id}-${field}`
}

function errorId(field: Field): string | undefined {
  return issueFor(field) ? `${inputId(field)}-error` : undefined
}

function placeTypeLabel(type: VrPlaceType): string {
  return ({ gate: '检票口', parking: '停车场', shuttle_stop: '接驳站点' })[type]
}

function validateAndFocus(): boolean {
  for (const field of Object.keys(touched) as Field[]) touched[field] = true
  const issue = allIssues.value[0]
  if (issue) {
    nextTick(() => container.value?.querySelector<HTMLElement>(`[data-field="${issue.field}"]`)?.focus())
    return false
  }
  return !props.saving && !props.placeOptionsLoading
}

defineExpose({ validateAndFocus })
watch(() => [props.mode, props.value.placeType], () => {
  if (props.mode === 'create') touched.placeId = false
}, { flush: 'sync' })
</script>

<template>
  <div ref="container" class="grid grid-cols-2 gap-x-4 gap-y-5">
    <div class="col-span-2 space-y-2">
      <div class="flex items-center justify-between gap-3">
        <Label :for="inputId('title')">展示名称 <span class="text-destructive" aria-hidden="true">*</span></Label>
        <span class="text-xs tabular-nums text-muted-foreground">{{ value.title.length }}/128</span>
      </div>
      <Input
        :id="inputId('title')"
        data-field="title"
        :model-value="value.title"
        maxlength="128"
        class="h-11"
        placeholder="例如：东门主入口 VR 导览"
        autocomplete="off"
        :disabled="saving"
        :aria-invalid="Boolean(issueFor('title'))"
        :aria-describedby="errorId('title')"
        @update:model-value="text('title', $event)"
        @blur="touched.title = true"
      />
      <p v-if="issueFor('title')" :id="errorId('title')" class="field-error" role="alert"><TriangleAlert />{{ issueFor('title')?.message }}</p>
    </div>

    <div class="col-span-2 space-y-2">
      <div class="flex items-center justify-between gap-3">
        <Label :for="inputId('vrUrl')">VR 打开地址 <span class="text-destructive" aria-hidden="true">*</span></Label>
        <span class="text-xs tabular-nums text-muted-foreground">{{ value.vrUrl.length }}/512</span>
      </div>
      <div class="relative">
        <ExternalLink class="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground" aria-hidden="true" />
        <Input
          :id="inputId('vrUrl')"
          data-field="vrUrl"
          type="url"
          inputmode="url"
          :model-value="value.vrUrl"
          maxlength="512"
          class="h-11 pl-9 font-mono text-xs"
          placeholder="https://www.720yun.com/t/..."
          autocomplete="url"
          :disabled="saving"
          :aria-invalid="Boolean(issueFor('vrUrl'))"
          :aria-describedby="errorId('vrUrl')"
          @update:model-value="text('vrUrl', $event)"
          @blur="touched.vrUrl = true"
        />
      </div>
      <p v-if="issueFor('vrUrl')" :id="errorId('vrUrl')" class="field-error" role="alert"><TriangleAlert />{{ issueFor('vrUrl')?.message }}</p>
      <p v-else class="text-xs leading-5 text-muted-foreground">仅支持可公开访问的 HTTP/HTTPS 链接，用户将在新窗口中打开。</p>
    </div>

    <div class="space-y-2">
      <Label :for="inputId('placeType')">地点类型 <span class="text-destructive" aria-hidden="true">*</span></Label>
      <Select :model-value="value.placeType" :disabled="saving" @update:model-value="setPlaceType">
        <SelectTrigger :id="inputId('placeType')" data-field="placeType" class="h-11 w-full" :aria-invalid="Boolean(issueFor('placeType'))">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="gate">检票口</SelectItem>
          <SelectItem value="parking">停车场</SelectItem>
          <SelectItem value="shuttle_stop">接驳站点</SelectItem>
        </SelectContent>
      </Select>
      <p v-if="issueFor('placeType')" :id="errorId('placeType')" class="field-error" role="alert"><TriangleAlert />{{ issueFor('placeType')?.message }}</p>
    </div>

    <div class="space-y-2">
      <Label :for="inputId('placeId')">绑定地点 <span class="text-destructive" aria-hidden="true">*</span></Label>
      <Select
        :model-value="value.placeId"
        :disabled="saving || placeOptionsLoading || placeOptions.length === 0"
        @update:model-value="patch({ placeId: String($event) }); touched.placeId = true"
      >
        <SelectTrigger
          :id="inputId('placeId')"
          data-field="placeId"
          class="h-11 w-full"
          :aria-invalid="Boolean(issueFor('placeId'))"
          :aria-describedby="errorId('placeId')"
        >
          <LoaderCircle v-if="placeOptionsLoading" class="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          <SelectValue :placeholder="placeOptionsLoading ? '正在加载地点' : '请选择地点'" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="option in placeOptions" :key="option.id" :value="option.id" :disabled="!option.available">
            {{ option.name }}{{ option.extra ? ` · ${option.extra}` : '' }}{{ option.available ? '' : '（已停用或删除）' }}
          </SelectItem>
        </SelectContent>
      </Select>
      <p v-if="issueFor('placeId')" :id="errorId('placeId')" class="field-error" role="alert"><TriangleAlert />{{ issueFor('placeId')?.message }}</p>
      <p v-else-if="placeOptionsError" class="field-error" role="alert"><TriangleAlert />{{ placeOptionsError }}</p>
      <p v-else-if="!placeOptionsLoading && availableOptionCount === 0 && !selectedOption" class="text-xs leading-5 text-warning">
        暂无可绑定的{{ placeTypeLabel(value.placeType) }}，请先在对应场地模块中启用地点。
      </p>
      <p v-else-if="selectedOption && !selectedOption.available" class="text-xs leading-5 text-warning">
        当前地点已停用或删除；可保留原绑定，也可改选其他启用地点。
      </p>
      <p v-else class="text-xs leading-5 text-muted-foreground">同一地点只能绑定一个 VR 地址，重复绑定将无法保存。</p>
    </div>

    <div class="col-span-2 space-y-2">
      <Label :for="inputId('status')">状态</Label>
      <Select :model-value="value.status" :disabled="saving" @update:model-value="patch({ status: $event as VrLinkWriteInput['status'] })">
        <SelectTrigger :id="inputId('status')" data-field="status" class="h-11 w-full"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="enabled">启用</SelectItem><SelectItem value="disabled">停用</SelectItem></SelectContent>
      </Select>
      <div class="flex items-start gap-2 rounded-lg bg-muted/35 px-3 py-2 text-xs leading-5 text-muted-foreground">
        <Info class="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />H5 仅读取启用中的地点绑定；停用不会删除绑定数据。
      </div>
    </div>

    <div class="col-span-2 space-y-2">
      <Label :for="inputId('remark')">备注</Label>
      <Textarea
        :id="inputId('remark')"
        data-field="remark"
        :model-value="value.remark"
        class="min-h-24 resize-y"
        placeholder="填写来源、维护人或现场说明（选填）"
        :disabled="saving"
        @update:model-value="text('remark', $event)"
      />
    </div>

    <div class="col-span-2 flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/6 p-4 text-sm text-muted-foreground">
      <MapPin class="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
      <p class="leading-5">绑定关系按地点主键保存；地点改名后列表会自动显示最新名称。</p>
    </div>
  </div>
</template>

<style scoped>
.field-error { display: flex; align-items: flex-start; gap: .375rem; color: var(--destructive); font-size: .75rem; line-height: 1.25rem; }
.field-error :deep(svg) { width: .875rem; height: .875rem; margin-top: .125rem; flex-shrink: 0; }
</style>
