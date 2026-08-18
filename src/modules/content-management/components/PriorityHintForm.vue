<script setup lang="ts">
import { computed, nextTick, ref, useId } from 'vue'
import { AlertTriangle, CalendarRange, SlidersHorizontal } from '@lucide/vue'
import type { PriorityHintValidationField, PriorityHintWriteInput, SelectableReference, ValidationIssue } from '../types'
import ReferenceSelector from './ReferenceSelector.vue'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

export interface PriorityHintFormHandle {
  validateAndFocus(): boolean
}

const props = withDefaults(defineProps<{
  value: PriorityHintWriteInput
  references: readonly SelectableReference[]
  issues?: readonly ValidationIssue<PriorityHintValidationField>[]
  saving?: boolean
}>(), {
  issues: () => [],
  saving: false,
})

const emit = defineEmits<{
  'update:value': [value: PriorityHintWriteInput]
}>()

const rootRef = ref<HTMLElement | null>(null)
const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, '')
const availableReferences = computed(() => props.references.filter((reference) => reference.type === props.value.referenceType))

function patch(value: Partial<PriorityHintWriteInput>): void {
  emit('update:value', { ...props.value, ...value })
}

function fieldId(field: PriorityHintValidationField): string {
  return `priority-hint-${instanceId}-${field}`
}

function errorFor(field: PriorityHintValidationField): string | undefined {
  return props.issues.find((issue) => issue.field === field)?.message
}

function updateReferenceType(value: unknown): void {
  patch({ referenceType: value as PriorityHintWriteInput['referenceType'], targetId: '' })
}

function validateAndFocus(): boolean {
  const issue = props.issues[0]
  if (!issue) return !props.saving
  nextTick(() => rootRef.value?.querySelector<HTMLElement>(`[data-hint-field="${issue.field}"]`)?.focus())
  return false
}

defineExpose<PriorityHintFormHandle>({ validateAndFocus })
</script>

<template>
  <div ref="rootRef" class="grid grid-cols-2 gap-x-4 gap-y-5">
    <div class="col-span-2 space-y-2">
      <div class="flex items-center justify-between gap-3">
        <Label :for="fieldId('title')">提示标题 <span class="text-destructive" aria-hidden="true">*</span></Label>
        <span class="text-xs tabular-nums text-muted-foreground">{{ Array.from(value.title).length }}/50</span>
      </div>
      <Input
        :id="fieldId('title')"
        data-hint-field="title"
        :model-value="value.title"
        class="h-11"
        maxlength="50"
        placeholder="请输入高优提示标题"
        :disabled="saving"
        :aria-invalid="Boolean(errorFor('title'))"
        @update:model-value="patch({ title: String($event) })"
      />
      <p v-if="errorFor('title')" class="field-error" role="alert"><AlertTriangle aria-hidden="true" />{{ errorFor('title') }}</p>
    </div>

    <div class="space-y-2">
      <Label :for="fieldId('referenceType')">引用类型 <span class="text-destructive" aria-hidden="true">*</span></Label>
      <Select :model-value="value.referenceType" :disabled="saving" @update:model-value="updateReferenceType">
        <SelectTrigger :id="fieldId('referenceType')" data-hint-field="referenceType" class="h-11 w-full bg-background">
          <SelectValue placeholder="选择引用类型" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="traffic-control">交通管制</SelectItem>
          <SelectItem value="activity">活动</SelectItem>
          <SelectItem value="news">资讯</SelectItem>
          <SelectItem value="notice">公告通知</SelectItem>
        </SelectContent>
      </Select>
    </div>

    <div class="space-y-2" data-hint-field="targetId" tabindex="-1">
      <Label>引用目标 <span class="text-destructive" aria-hidden="true">*</span></Label>
      <ReferenceSelector
        :model-value="value.targetId || null"
        :options="availableReferences"
        :disabled="saving"
        :invalid="Boolean(errorFor('targetId'))"
        @update:model-value="patch({ targetId: $event ?? '' })"
      />
      <p v-if="errorFor('targetId')" class="field-error" role="alert"><AlertTriangle aria-hidden="true" />{{ errorFor('targetId') }}</p>
    </div>

    <div class="space-y-2">
      <Label :for="fieldId('priority')">优先级</Label>
      <div class="relative">
        <SlidersHorizontal class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          :id="fieldId('priority')"
          data-hint-field="priority"
          type="number"
          min="0"
          max="9999"
          step="1"
          :model-value="value.priority"
          class="h-11 pl-9 tabular-nums"
          :disabled="saving"
          :aria-invalid="Boolean(errorFor('priority'))"
          @update:model-value="patch({ priority: Number($event) })"
        />
      </div>
      <p v-if="errorFor('priority')" class="field-error" role="alert"><AlertTriangle aria-hidden="true" />{{ errorFor('priority') }}</p>
      <p v-else class="text-xs text-muted-foreground">按优先级升序取前 2 条展示</p>
    </div>

    <div class="flex min-h-20 items-center justify-between gap-4 rounded-xl border bg-muted/25 px-3 py-2.5">
      <div>
        <Label :for="fieldId('displayEnabled')" class="cursor-pointer">展示状态</Label>
        <p class="mt-1 text-xs text-muted-foreground">停用后 H5 不展示</p>
      </div>
      <Switch :id="fieldId('displayEnabled')" data-hint-field="displayEnabled" :model-value="value.displayEnabled" :disabled="saving" @update:model-value="patch({ displayEnabled: $event })" />
    </div>

    <div class="col-span-2 space-y-2">
      <Label>有效期 <span class="ml-1 text-xs font-normal text-muted-foreground">选填，起止需同时填写</span></Label>
      <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div class="relative">
          <CalendarRange class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input :id="fieldId('validFrom')" data-hint-field="validFrom" type="date" :model-value="value.validFrom ?? ''" class="h-11 pl-9" :disabled="saving" :aria-invalid="Boolean(errorFor('validFrom'))" @update:model-value="patch({ validFrom: String($event) || null })" />
        </div>
        <span class="text-xs text-muted-foreground">至</span>
        <div class="relative">
          <CalendarRange class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input :id="fieldId('validTo')" data-hint-field="validTo" type="date" :model-value="value.validTo ?? ''" class="h-11 pl-9" :disabled="saving" :aria-invalid="Boolean(errorFor('validTo'))" @update:model-value="patch({ validTo: String($event) || null })" />
        </div>
      </div>
      <p v-if="errorFor('validFrom') || errorFor('validTo')" class="field-error" role="alert"><AlertTriangle aria-hidden="true" />{{ errorFor('validFrom') || errorFor('validTo') }}</p>
      <p v-else class="text-xs text-muted-foreground">开始日期自动生效，结束日期当日结束后自动失效。</p>
    </div>
  </div>
</template>

<style scoped>
.field-error { display: flex; align-items: flex-start; gap: 0.375rem; color: var(--destructive); font-size: 0.75rem; line-height: 1.25rem; }
.field-error :deep(svg) { margin-top: 0.125rem; width: 0.875rem; height: 0.875rem; flex-shrink: 0; }
</style>
