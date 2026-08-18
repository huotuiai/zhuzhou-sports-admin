<script setup lang="ts">
import { computed, nextTick, ref, useId } from 'vue'
import { AlertTriangle, CalendarClock, MapPin, Navigation, Pin, SlidersHorizontal } from '@lucide/vue'
import type { ContentValidationField, ContentWriteInput, ValidationIssue } from '../types'
import FileMetadataPicker from './FileMetadataPicker.vue'
import RichTextEditor from './RichTextEditor.vue'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

export interface ContentFormHandle {
  validateAndFocus(): boolean
}

const props = withDefaults(defineProps<{
  value: ContentWriteInput
  issues?: readonly ValidationIssue<ContentValidationField>[]
  saving?: boolean
}>(), {
  issues: () => [],
  saving: false,
})

const emit = defineEmits<{
  'update:value': [value: ContentWriteInput]
}>()

const rootRef = ref<HTMLElement | null>(null)
const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, '')
const isActivity = computed(() => props.value.type === 'activity')
const isNotice = computed(() => props.value.type === 'notice')

function patch(patchValue: Partial<ContentWriteInput>): void {
  emit('update:value', { ...props.value, ...patchValue })
}

function fieldId(field: ContentValidationField): string {
  return `content-${instanceId}-${field}`
}

function errorFor(field: ContentValidationField): string | undefined {
  return props.issues.find((issue) => issue.field === field)?.message
}

function validateAndFocus(): boolean {
  const issue = props.issues[0]
  if (!issue) return !props.saving
  nextTick(() => rootRef.value?.querySelector<HTMLElement>(`[data-content-field="${issue.field}"]`)?.focus())
  return false
}

defineExpose<ContentFormHandle>({ validateAndFocus })
</script>

<template>
  <div ref="rootRef" class="grid grid-cols-2 gap-x-4 gap-y-5">
    <div v-if="!isActivity" class="col-span-2 space-y-2">
      <Label :for="fieldId('type')">内容类型 <span class="text-destructive" aria-hidden="true">*</span></Label>
      <Select :model-value="value.type" :disabled="saving" @update:model-value="patch({ type: $event as ContentWriteInput['type'], attachments: $event === 'notice' ? value.attachments : [] })">
        <SelectTrigger :id="fieldId('type')" data-content-field="type" class="h-11 w-full bg-background">
          <SelectValue placeholder="选择内容类型" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="news">资讯</SelectItem>
          <SelectItem value="notice">公告通知</SelectItem>
        </SelectContent>
      </Select>
    </div>

    <div class="col-span-2 space-y-2">
      <div class="flex items-center justify-between gap-3">
        <Label :for="fieldId('title')">标题 <span class="text-destructive" aria-hidden="true">*</span></Label>
        <span class="text-xs tabular-nums text-muted-foreground">{{ Array.from(value.title).length }}/50</span>
      </div>
      <Input
        :id="fieldId('title')"
        data-content-field="title"
        :model-value="value.title"
        class="h-11"
        maxlength="50"
        placeholder="请输入 2–50 个字符"
        :disabled="saving"
        :aria-invalid="Boolean(errorFor('title'))"
        @update:model-value="patch({ title: String($event) })"
      />
      <p v-if="errorFor('title')" class="field-error" role="alert"><AlertTriangle aria-hidden="true" />{{ errorFor('title') }}</p>
    </div>

    <div class="col-span-2 space-y-2" data-content-field="cover" tabindex="-1">
      <Label>
        封面图
        <span v-if="isActivity" class="text-destructive" aria-hidden="true">*</span>
        <span v-else class="ml-1 text-xs font-normal text-muted-foreground">选填</span>
      </Label>
      <FileMetadataPicker
        :model-value="value.cover ? [value.cover] : []"
        accept="image/*"
        :max-file-size="2 * 1024 * 1024"
        hint="支持常用图片格式，≤2MB，建议 750×420"
        :disabled="saving"
        :invalid="Boolean(errorFor('cover'))"
        @update:model-value="patch({ cover: $event[0] ?? null })"
      />
      <p v-if="errorFor('cover')" class="field-error" role="alert"><AlertTriangle aria-hidden="true" />{{ errorFor('cover') }}</p>
    </div>

    <div class="col-span-2 space-y-2" data-content-field="bodyHtml" tabindex="-1">
      <Label>正文</Label>
      <RichTextEditor :model-value="value.bodyHtml" :disabled="saving" @update:model-value="patch({ bodyHtml: $event })" />
    </div>

    <div v-if="isNotice" class="col-span-2 space-y-2" data-content-field="attachments" tabindex="-1">
      <Label>公告附件 <span class="ml-1 text-xs font-normal text-muted-foreground">选填，可多选</span></Label>
      <FileMetadataPicker
        :model-value="value.attachments"
        accept="image/*,.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        :max-file-size="10 * 1024 * 1024"
        :max-files="10"
        multiple
        hint="支持图片、PDF、DOC、DOCX，单文件 ≤10MB"
        :disabled="saving"
        @update:model-value="patch({ attachments: $event })"
      />
    </div>

    <template v-if="isActivity">
      <div class="space-y-2">
        <Label :for="fieldId('activityStartAt')">活动开始时间 <span class="text-destructive" aria-hidden="true">*</span></Label>
        <div class="relative">
          <CalendarClock class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            :id="fieldId('activityStartAt')"
            data-content-field="activityStartAt"
            type="datetime-local"
            :model-value="value.activityStartAt ?? ''"
            class="h-11 pl-9"
            :disabled="saving"
            :aria-invalid="Boolean(errorFor('activityStartAt'))"
            @update:model-value="patch({ activityStartAt: String($event) || null })"
          />
        </div>
        <p v-if="errorFor('activityStartAt')" class="field-error" role="alert"><AlertTriangle aria-hidden="true" />{{ errorFor('activityStartAt') }}</p>
      </div>

      <div class="space-y-2">
        <Label :for="fieldId('activityEndAt')">活动结束时间 <span class="text-destructive" aria-hidden="true">*</span></Label>
        <div class="relative">
          <CalendarClock class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            :id="fieldId('activityEndAt')"
            data-content-field="activityEndAt"
            type="datetime-local"
            :model-value="value.activityEndAt ?? ''"
            class="h-11 pl-9"
            :disabled="saving"
            :aria-invalid="Boolean(errorFor('activityEndAt'))"
            @update:model-value="patch({ activityEndAt: String($event) || null })"
          />
        </div>
        <p v-if="errorFor('activityEndAt')" class="field-error" role="alert"><AlertTriangle aria-hidden="true" />{{ errorFor('activityEndAt') }}</p>
      </div>

      <div class="space-y-2">
        <Label :for="fieldId('activityLocation')">活动地点 <span class="text-destructive" aria-hidden="true">*</span></Label>
        <div class="relative">
          <MapPin class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            :id="fieldId('activityLocation')"
            data-content-field="activityLocation"
            :model-value="value.activityLocation"
            class="h-11 pl-9"
            placeholder="请输入活动地点"
            :disabled="saving"
            :aria-invalid="Boolean(errorFor('activityLocation'))"
            @update:model-value="patch({ activityLocation: String($event) })"
          />
        </div>
        <p v-if="errorFor('activityLocation')" class="field-error" role="alert"><AlertTriangle aria-hidden="true" />{{ errorFor('activityLocation') }}</p>
      </div>

      <div class="space-y-2">
        <Label :for="fieldId('navigationLocation')">导航地址 / 经纬度</Label>
        <div class="relative">
          <Navigation class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            :id="fieldId('navigationLocation')"
            data-content-field="navigationLocation"
            :model-value="value.navigationLocation"
            class="h-11 pl-9"
            placeholder="地址或 113.1462, 27.8165"
            :disabled="saving"
            :aria-invalid="Boolean(errorFor('navigationLocation'))"
            @update:model-value="patch({ navigationLocation: String($event) })"
          />
        </div>
        <p v-if="errorFor('navigationLocation')" class="field-error" role="alert"><AlertTriangle aria-hidden="true" />{{ errorFor('navigationLocation') }}</p>
      </div>
    </template>

    <div class="space-y-2">
      <Label :for="fieldId('priority')">优先级</Label>
      <div class="relative">
        <SlidersHorizontal class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          :id="fieldId('priority')"
          data-content-field="priority"
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
      <p v-else class="text-xs text-muted-foreground">数值越小越靠前，范围 0–9999</p>
    </div>

    <div class="space-y-2">
      <Label :for="fieldId('publishAt')">发布时间</Label>
      <div class="relative">
        <CalendarClock class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          :id="fieldId('publishAt')"
          data-content-field="publishAt"
          type="datetime-local"
          :model-value="value.publishAt ?? ''"
          class="h-11 pl-9"
          :disabled="saving"
          @update:model-value="patch({ publishAt: String($event) || null })"
        />
      </div>
      <p class="text-xs text-muted-foreground">未来时间保存为草稿，到点自动发布；留空后可在列表手动发布。</p>
    </div>

    <div class="col-span-2 flex min-h-16 items-center justify-between gap-4 rounded-xl border bg-muted/25 px-3 py-2.5">
      <div class="flex items-start gap-3">
        <Pin class="mt-0.5 size-4 text-muted-foreground" aria-hidden="true" />
        <div>
          <Label :for="fieldId('pinned')" class="cursor-pointer">置顶内容</Label>
          <p class="mt-1 text-xs leading-5 text-muted-foreground">置顶内容会在同优先级内容之前展示。</p>
        </div>
      </div>
      <Switch :id="fieldId('pinned')" data-content-field="pinned" :model-value="value.pinned" :disabled="saving" @update:model-value="patch({ pinned: $event })" />
    </div>
  </div>
</template>

<style scoped>
.field-error {
  display: flex;
  align-items: flex-start;
  gap: 0.375rem;
  color: var(--destructive);
  font-size: 0.75rem;
  line-height: 1.25rem;
}

.field-error :deep(svg) {
  margin-top: 0.125rem;
  width: 0.875rem;
  height: 0.875rem;
  flex-shrink: 0;
}
</style>
