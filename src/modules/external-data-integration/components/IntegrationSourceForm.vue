<script setup lang="ts">
import type { CrudDialogMode } from '@/components/common'
import type { IntegrationSourceWriteInput, WritableIntegrationSourceType } from '../types'
import type { IntegrationValidationField, IntegrationValidationIssue } from '../lib/integration-validation'
import { computed, nextTick, ref, useId } from 'vue'
import { AlertTriangle, KeyRound, Link2, Timer, Unplug } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

export interface IntegrationSourceFormHandle {
  validateAndFocus(): boolean
}

const props = withDefaults(defineProps<{
  value: IntegrationSourceWriteInput
  mode: CrudDialogMode
  apiKeyMasked?: string
  issues?: readonly IntegrationValidationIssue[]
  saving?: boolean
}>(), {
  apiKeyMasked: '',
  issues: () => [],
  saving: false,
})

const emit = defineEmits<{
  'update:value': [value: IntegrationSourceWriteInput]
}>()

const rootRef = ref<HTMLElement | null>(null)
const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, '')
const keyHint = computed(() => props.mode === 'create'
  ? '密钥只在保存时提交，服务端会加密存储。'
  : props.apiKeyMasked
    ? `当前密钥：${props.apiKeyMasked}；留空表示不更换。`
    : '留空表示不更换现有密钥。')

function patch(value: Partial<IntegrationSourceWriteInput>): void {
  emit('update:value', { ...props.value, ...value })
}

function fieldId(field: IntegrationValidationField): string {
  return `integration-source-${instanceId}-${field}`
}

function errorFor(field: IntegrationValidationField): string | undefined {
  return props.issues.find(issue => issue.field === field)?.message
}

function validateAndFocus(): boolean {
  const issue = props.issues[0]
  if (!issue) return !props.saving
  nextTick(() => rootRef.value?.querySelector<HTMLElement>(`[data-integration-field="${issue.field}"]`)?.focus())
  return false
}

defineExpose<IntegrationSourceFormHandle>({ validateAndFocus })
</script>

<template>
  <div ref="rootRef" class="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">
    <div class="space-y-2 sm:col-span-2">
      <Label :for="fieldId('name')">对接源名称 <span class="text-destructive" aria-hidden="true">*</span></Label>
      <Input
        :id="fieldId('name')"
        data-integration-field="name"
        :model-value="value.name"
        class="h-11"
        placeholder="如：停车场系统"
        :disabled="saving"
        :aria-invalid="Boolean(errorFor('name'))"
        @update:model-value="patch({ name: String($event) })"
      />
      <p v-if="errorFor('name')" class="field-error" role="alert"><AlertTriangle aria-hidden="true" />{{ errorFor('name') }}</p>
    </div>

    <div class="space-y-2">
      <Label :for="fieldId('sourceType')">类型 <span class="text-destructive" aria-hidden="true">*</span></Label>
      <Select
        :model-value="value.sourceType"
        :disabled="saving"
        @update:model-value="patch({ sourceType: $event as WritableIntegrationSourceType })"
      >
        <SelectTrigger
          :id="fieldId('sourceType')"
          data-integration-field="sourceType"
          class="h-11 w-full bg-background"
          :aria-invalid="Boolean(errorFor('sourceType'))"
        >
          <SelectValue placeholder="选择对接类型" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="parking">停车场</SelectItem>
          <SelectItem value="yun720">720 云 VR</SelectItem>
        </SelectContent>
      </Select>
      <p v-if="errorFor('sourceType')" class="field-error" role="alert"><AlertTriangle aria-hidden="true" />{{ errorFor('sourceType') }}</p>
    </div>

    <div class="space-y-2">
      <Label :for="fieldId('intervalMinutes')">同步频率 <span class="text-destructive" aria-hidden="true">*</span></Label>
      <div class="relative">
        <Timer class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          :id="fieldId('intervalMinutes')"
          data-integration-field="intervalMinutes"
          type="number"
          min="1"
          step="1"
          :model-value="value.intervalMinutes"
          class="h-11 pl-9 pr-16 tabular-nums"
          :disabled="saving"
          :aria-invalid="Boolean(errorFor('intervalMinutes'))"
          @update:model-value="patch({ intervalMinutes: Number($event) })"
        />
        <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">分钟</span>
      </div>
      <p v-if="errorFor('intervalMinutes')" class="field-error" role="alert"><AlertTriangle aria-hidden="true" />{{ errorFor('intervalMinutes') }}</p>
    </div>

    <div class="space-y-2 sm:col-span-2">
      <Label :for="fieldId('apiUrl')">API 地址 <span class="text-destructive" aria-hidden="true">*</span></Label>
      <div class="flex flex-col gap-2 sm:flex-row">
        <div class="relative min-w-0 flex-1">
          <Link2 class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            :id="fieldId('apiUrl')"
            data-integration-field="apiUrl"
            :model-value="value.apiUrl"
            class="h-11 pl-9 font-mono text-xs"
            placeholder="https://api.example.com/v1"
            :disabled="saving"
            :aria-invalid="Boolean(errorFor('apiUrl'))"
            @update:model-value="patch({ apiUrl: String($event) })"
          />
        </div>
        <span title="等待后端提供连接测试接口">
          <Button type="button" variant="outline" size="lg" class="h-11 w-full sm:w-auto" disabled>
            <Unplug aria-hidden="true" />测试连接
          </Button>
        </span>
      </div>
      <p v-if="errorFor('apiUrl')" class="field-error" role="alert"><AlertTriangle aria-hidden="true" />{{ errorFor('apiUrl') }}</p>
      <p v-else class="text-xs text-muted-foreground">当前后端未提供连接测试接口；保存时仍会提交真实配置。</p>
    </div>

    <div class="space-y-2 sm:col-span-2">
      <Label :for="fieldId('apiKey')">
        API 密钥 <span v-if="mode === 'create'" class="text-destructive" aria-hidden="true">*</span>
      </Label>
      <div class="relative">
        <KeyRound class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          :id="fieldId('apiKey')"
          data-integration-field="apiKey"
          type="password"
          autocomplete="new-password"
          :model-value="value.apiKey"
          class="h-11 pl-9 font-mono"
          :placeholder="mode === 'create' ? '输入对接方提供的密钥' : '留空表示不更换'"
          :disabled="saving"
          :aria-invalid="Boolean(errorFor('apiKey'))"
          @update:model-value="patch({ apiKey: String($event) })"
        />
      </div>
      <p v-if="errorFor('apiKey')" class="field-error" role="alert"><AlertTriangle aria-hidden="true" />{{ errorFor('apiKey') }}</p>
      <p v-else class="text-xs text-muted-foreground">{{ keyHint }}</p>
    </div>

    <div class="space-y-2">
      <Label for="integration-source-enabled">启停状态</Label>
      <Select :model-value="value.enabled ? 'enabled' : 'disabled'" :disabled="saving" @update:model-value="patch({ enabled: $event === 'enabled' })">
        <SelectTrigger id="integration-source-enabled" class="h-11 w-full bg-background"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="enabled">启用</SelectItem><SelectItem value="disabled">停用</SelectItem></SelectContent>
      </Select>
    </div>

    <div class="space-y-2 sm:col-span-2">
      <Label for="integration-source-remark">备注 <span class="text-xs font-normal text-muted-foreground">选填</span></Label>
      <Textarea
        id="integration-source-remark"
        :model-value="value.remark"
        class="min-h-24 resize-y"
        placeholder="补充对接说明或异常处理备注"
        :disabled="saving"
        @update:model-value="patch({ remark: String($event) })"
      />
    </div>

    <div class="rounded-lg border border-primary/15 bg-primary/5 px-3 py-2.5 text-xs leading-5 text-muted-foreground sm:col-span-2">
      同一类型仅允许 1 个启用中的对接源；连续失败达到阈值时后端会自动停用。停用后对应定时同步停止，依赖业务使用上次成功数据或手动维护。
    </div>
  </div>
</template>
