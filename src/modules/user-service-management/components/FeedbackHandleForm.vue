<script setup lang="ts">
import type { FeedbackHandleDraft, FeedbackHandleValidationField, UserFeedback, ValidationIssue } from '../types'
import { AlertTriangle, CheckCircle2, Clock3, MessageSquareText, Phone } from '@lucide/vue'
import { computed, nextTick, reactive, ref, useId, watch } from 'vue'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

const props = withDefaults(defineProps<{
  feedback: UserFeedback
  value: FeedbackHandleDraft
  issues?: readonly ValidationIssue<FeedbackHandleValidationField>[]
  saving?: boolean
}>(), {
  issues: () => [],
  saving: false,
})

const emit = defineEmits<{
  'update:value': [value: FeedbackHandleDraft]
}>()

const fieldsRef = ref<HTMLDivElement | null>(null)
const touched = reactive({ remark: false })
const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, '')
const remarkId = `feedback-handle-${instanceId}-remark`
const remarkErrorId = `${remarkId}-error`
const processed = computed(() => props.feedback.status === 'processed')
const localIssue = computed<ValidationIssue<FeedbackHandleValidationField> | undefined>(() => {
  if (!props.value.remark.trim()) return { field: 'remark', code: 'required', message: '请填写处理备注' }
  return undefined
})
const remarkIssue = computed(() => props.issues.find((item) => item.field === 'remark') ?? localIssue.value)

function patchValue(patch: Partial<FeedbackHandleDraft>): void {
  emit('update:value', { ...props.value, ...patch })
}

function validateAndFocus(): boolean {
  touched.remark = true
  if (remarkIssue.value) {
    nextTick(() => fieldsRef.value?.querySelector<HTMLElement>('[data-feedback-field="remark"]')?.focus())
    return false
  }
  return !props.saving
}

defineExpose({ validateAndFocus })

watch(() => props.feedback.id, () => { touched.remark = false }, { flush: 'sync' })
</script>

<template>
  <div ref="fieldsRef" class="space-y-5">
    <div class="rounded-xl border bg-muted/25 p-4">
      <div class="flex flex-wrap items-center gap-2">
        <Badge variant="outline" class="font-mono">{{ feedback.code }}</Badge>
        <Badge
          variant="outline"
          :class="processed ? 'border-success/30 bg-success/10 text-success' : 'border-destructive/30 bg-destructive/10 text-destructive'"
        >
          {{ processed ? '已处理' : '未处理' }}
        </Badge>
      </div>
      <p class="mt-3 text-sm leading-7 text-foreground">{{ feedback.content }}</p>
      <div class="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
        <span class="inline-flex items-center gap-1.5"><Phone class="size-3.5" aria-hidden="true" />{{ feedback.contact ?? '未留联系方式' }}</span>
        <span class="inline-flex items-center gap-1.5"><Clock3 class="size-3.5" aria-hidden="true" />提交时间由列表记录</span>
      </div>
    </div>

    <div class="space-y-2">
      <div class="flex items-center justify-between gap-3">
        <Label :for="remarkId">
          处理备注
          <span class="text-destructive" aria-hidden="true">*</span>
        </Label>
        <span class="text-xs tabular-nums text-muted-foreground">{{ value.remark.length }}</span>
      </div>
      <Textarea
        :id="remarkId"
        data-feedback-field="remark"
        required
        :model-value="value.remark"
        class="min-h-32 resize-y leading-6"
        placeholder="填写处理方式、回访结果或后续跟进计划"
        :disabled="saving"
        :aria-invalid="touched.remark && Boolean(remarkIssue)"
        :aria-describedby="touched.remark && remarkIssue ? remarkErrorId : undefined"
        @update:model-value="patchValue({ remark: String($event) })"
        @blur="touched.remark = true"
      />
      <p v-if="touched.remark && remarkIssue" :id="remarkErrorId" class="flex items-center gap-1.5 text-xs text-destructive" role="alert">
        <AlertTriangle class="size-3.5" aria-hidden="true" />{{ remarkIssue.message }}
      </p>
      <p v-else class="text-xs leading-5 text-muted-foreground">有联系方式时可线下回访，并在备注中记录结果。</p>
    </div>

    <div class="flex min-h-16 items-center justify-between gap-4 rounded-xl border bg-muted/25 px-3.5 py-3">
      <div class="min-w-0">
        <Label :for="`feedback-handle-${instanceId}-processed`" :class="processed ? '' : 'cursor-pointer'">
          <CheckCircle2 class="size-4 text-success" aria-hidden="true" />
          标记为已处理
        </Label>
        <p class="mt-1 text-xs leading-5 text-muted-foreground">
          {{ processed ? '该反馈已完成处理，只允许补充或修改备注，状态不会回退。' : '取消勾选时仅保存备注，反馈继续保留在未处理队列。' }}
        </p>
      </div>
      <Checkbox
        :id="`feedback-handle-${instanceId}-processed`"
        :model-value="processed ? true : value.markProcessed"
        :disabled="processed || saving"
        :aria-label="processed ? '反馈已处理，不可回退' : '保存后标记为已处理'"
        @update:model-value="patchValue({ markProcessed: $event === true })"
      />
    </div>

    <div class="flex gap-3 rounded-xl border border-primary/25 bg-primary/8 p-3 text-primary">
      <MessageSquareText class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p class="text-xs leading-5">保存后会记录当前操作人和操作时间，并写入本模块的审计记录。</p>
    </div>
  </div>
</template>
