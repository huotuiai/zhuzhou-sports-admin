<script setup lang="ts">
import type { ContactNumberValidationField, ContactNumberWriteInput, ValidationIssue } from '../types'
import { AlertTriangle, Eye, EyeOff, PhoneCall } from '@lucide/vue'
import { computed, nextTick, reactive, ref, useId, watch } from 'vue'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { validateContactNumberInput } from '../services/user-service-validation'

const props = withDefaults(defineProps<{
  mode: 'create' | 'edit'
  value: ContactNumberWriteInput
  issues?: readonly ValidationIssue<ContactNumberValidationField>[]
  saving?: boolean
}>(), {
  issues: () => [],
  saving: false,
})

const emit = defineEmits<{
  'update:value': [value: ContactNumberWriteInput]
}>()

const fieldsRef = ref<HTMLDivElement | null>(null)
const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, '')
const touched = reactive<Record<ContactNumberValidationField, boolean>>({ name: false, phone: false, sort: false })
const localIssues = computed(() => validateContactNumberInput(props.value))
const allIssues = computed(() => {
  const issues = [...props.issues]
  for (const issue of localIssues.value) {
    if (!issues.some((item) => item.field === issue.field)) issues.push(issue)
  }
  return issues
})

function patchValue(patch: Partial<ContactNumberWriteInput>): void {
  emit('update:value', { ...props.value, ...patch })
}

function issueFor(field: ContactNumberValidationField) {
  return touched[field] ? allIssues.value.find((item) => item.field === field) : undefined
}

function inputId(field: ContactNumberValidationField | 'displayEnabled'): string {
  return `contact-number-${instanceId}-${field}`
}

function validateAndFocus(): boolean {
  for (const field of Object.keys(touched) as ContactNumberValidationField[]) touched[field] = true
  const issue = allIssues.value[0]
  if (issue) {
    nextTick(() => fieldsRef.value?.querySelector<HTMLElement>(`[data-contact-field="${issue.field}"]`)?.focus())
    return false
  }
  return !props.saving
}

defineExpose({ validateAndFocus })

watch(() => props.mode, () => {
  for (const field of Object.keys(touched) as ContactNumberValidationField[]) touched[field] = false
}, { flush: 'sync' })
</script>

<template>
  <div ref="fieldsRef" class="grid grid-cols-2 gap-x-4 gap-y-5">
    <div class="space-y-2">
      <Label :for="inputId('name')">号码名称 <span class="text-destructive" aria-hidden="true">*</span></Label>
      <Input
        :id="inputId('name')"
        data-contact-field="name"
        required
        :model-value="value.name"
        class="h-11"
        placeholder="例如：服务热线"
        autocomplete="off"
        :disabled="saving"
        :aria-invalid="Boolean(issueFor('name'))"
        :aria-describedby="issueFor('name') ? `${inputId('name')}-error` : undefined"
        @update:model-value="patchValue({ name: String($event) })"
        @blur="touched.name = true"
      />
      <p v-if="issueFor('name')" :id="`${inputId('name')}-error`" class="flex items-center gap-1.5 text-xs text-destructive" role="alert">
        <AlertTriangle class="size-3.5" aria-hidden="true" />{{ issueFor('name')?.message }}
      </p>
    </div>

    <div class="space-y-2">
      <Label :for="inputId('sort')">排序 <span class="text-destructive" aria-hidden="true">*</span></Label>
      <Input
        :id="inputId('sort')"
        data-contact-field="sort"
        type="number"
        min="1"
        step="1"
        required
        inputmode="numeric"
        :model-value="Number.isFinite(value.sort) ? value.sort : ''"
        class="h-11 tabular-nums"
        :disabled="saving"
        :aria-invalid="Boolean(issueFor('sort'))"
        :aria-describedby="issueFor('sort') ? `${inputId('sort')}-error` : undefined"
        @update:model-value="patchValue({ sort: String($event).trim() ? Number($event) : Number.NaN })"
        @blur="touched.sort = true"
      />
      <p v-if="issueFor('sort')" :id="`${inputId('sort')}-error`" class="flex items-center gap-1.5 text-xs text-destructive" role="alert">
        <AlertTriangle class="size-3.5" aria-hidden="true" />{{ issueFor('sort')?.message }}
      </p>
    </div>

    <div class="col-span-2 space-y-2">
      <Label :for="inputId('phone')">联系电话 <span class="text-destructive" aria-hidden="true">*</span></Label>
      <div class="relative">
        <PhoneCall class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          :id="inputId('phone')"
          data-contact-field="phone"
          type="tel"
          required
          :model-value="value.phone"
          class="h-11 pl-9 font-mono tabular-nums"
          placeholder="例如：0731-2228 6666 或 13800138000"
          autocomplete="tel"
          :disabled="saving"
          :aria-invalid="Boolean(issueFor('phone'))"
          :aria-describedby="issueFor('phone') ? `${inputId('phone')}-error` : `${inputId('phone')}-hint`"
          @update:model-value="patchValue({ phone: String($event) })"
          @blur="touched.phone = true"
        />
      </div>
      <p v-if="issueFor('phone')" :id="`${inputId('phone')}-error`" class="flex items-center gap-1.5 text-xs text-destructive" role="alert">
        <AlertTriangle class="size-3.5" aria-hidden="true" />{{ issueFor('phone')?.message }}
      </p>
      <p v-else :id="`${inputId('phone')}-hint`" class="text-xs leading-5 text-muted-foreground">支持中国大陆手机号、带区号的固定电话以及 400/800 电话。</p>
    </div>

    <div class="col-span-2 flex min-h-20 items-center justify-between gap-4 rounded-xl border bg-muted/25 px-4 py-3">
      <div>
        <Label :for="inputId('displayEnabled')" class="cursor-pointer">
          <component :is="value.displayEnabled ? Eye : EyeOff" class="size-4 text-primary" aria-hidden="true" />
          H5 展示
        </Label>
        <p class="mt-1 text-xs leading-5 text-muted-foreground">
          {{ value.displayEnabled ? '该号码会作为联系我们数据源中的可展示号码。' : '号码继续保留，但不会提供给 H5 展示。' }}
        </p>
      </div>
      <Switch
        :id="inputId('displayEnabled')"
        :model-value="value.displayEnabled"
        :disabled="saving"
        :aria-label="value.displayEnabled ? '当前在 H5 展示' : '当前不在 H5 展示'"
        @update:model-value="patchValue({ displayEnabled: $event })"
      />
    </div>
  </div>
</template>
