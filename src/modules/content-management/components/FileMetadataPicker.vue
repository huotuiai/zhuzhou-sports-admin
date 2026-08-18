<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { FileText, Image as ImageIcon, Trash2, UploadCloud } from '@lucide/vue'
import type { FileAssetMetadata } from '../types'
import { Button } from '@/components/ui/button'
import { createClientId } from '@/lib/id'

const props = withDefaults(defineProps<{
  modelValue: readonly FileAssetMetadata[]
  accept: string
  maxFileSize: number
  multiple?: boolean
  maxFiles?: number
  disabled?: boolean
  invalid?: boolean
  hint?: string
}>(), {
  multiple: false,
  maxFiles: 1,
  disabled: false,
  invalid: false,
  hint: '',
})

const emit = defineEmits<{
  'update:modelValue': [files: FileAssetMetadata[]]
}>()

const inputRef = ref<HTMLInputElement | null>(null)
const localError = ref('')
const inputId = `file-picker-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
const formattedMaxSize = computed(() => props.maxFileSize >= 1024 * 1024
  ? `${Math.round(props.maxFileSize / 1024 / 1024)}MB`
  : `${Math.round(props.maxFileSize / 1024)}KB`)

function extension(name: string): string {
  return name.includes('.') ? `.${name.split('.').pop()!.toLocaleLowerCase()}` : ''
}

function isAccepted(file: File): boolean {
  const rules = props.accept.split(',').map((item) => item.trim().toLocaleLowerCase()).filter(Boolean)
  if (rules.length === 0) return true
  return rules.some((rule) => {
    if (rule.endsWith('/*')) return file.type.toLocaleLowerCase().startsWith(rule.slice(0, -1))
    if (rule.startsWith('.')) return extension(file.name) === rule
    return file.type.toLocaleLowerCase() === rule
  })
}

function toMetadata(file: File): FileAssetMetadata {
  return {
    id: createClientId(),
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    lastModified: file.lastModified,
    previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
  }
}

function chooseFiles(): void {
  if (!props.disabled) inputRef.value?.click()
}

function handleFiles(event: Event): void {
  const target = event.target as HTMLInputElement
  const selected = Array.from(target.files ?? [])
  target.value = ''
  localError.value = ''
  if (!selected.length) return

  const invalidType = selected.find((file) => !isAccepted(file))
  if (invalidType) {
    localError.value = `“${invalidType.name}”的文件类型不受支持`
    return
  }
  const oversized = selected.find((file) => file.size > props.maxFileSize)
  if (oversized) {
    localError.value = `“${oversized.name}”超过 ${formattedMaxSize.value} 限制`
    return
  }

  const additions = selected.map(toMetadata)
  const next = props.multiple ? [...props.modelValue, ...additions] : additions.slice(0, 1)
  if (next.length > props.maxFiles) {
    additions.forEach((asset) => { if (asset.previewUrl) URL.revokeObjectURL(asset.previewUrl) })
    localError.value = `最多可选择 ${props.maxFiles} 个文件`
    return
  }
  emit('update:modelValue', next)
}

function removeFile(id: string): void {
  const removed = props.modelValue.find((file) => file.id === id)
  if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl)
  emit('update:modelValue', props.modelValue.filter((file) => file.id !== id))
  localError.value = ''
}

function formatSize(size: number): string {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(size / 1024))} KB`
}
</script>

<template>
  <div class="space-y-2">
    <input
      :id="inputId"
      ref="inputRef"
      class="sr-only"
      type="file"
      :accept="accept"
      :multiple="multiple"
      :disabled="disabled"
      @change="handleFiles"
    >
    <button
      type="button"
      class="flex min-h-24 w-full items-center justify-center gap-3 rounded-xl border border-dashed bg-muted/20 px-4 py-4 text-left transition-colors hover:border-primary/55 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-50"
      :class="invalid || localError ? 'border-destructive/70' : ''"
      :disabled="disabled"
      :aria-describedby="localError ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined"
      @click="chooseFiles"
    >
      <span class="grid size-10 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/8 text-primary">
        <UploadCloud class="size-5" aria-hidden="true" />
      </span>
      <span>
        <span class="block text-sm font-medium">点击选择{{ multiple ? '文件' : '图片' }}</span>
        <span class="mt-1 block text-xs leading-5 text-muted-foreground">{{ hint || `单文件不超过 ${formattedMaxSize}` }}</span>
      </span>
    </button>

    <p v-if="localError" :id="`${inputId}-error`" class="text-xs text-destructive" role="alert">{{ localError }}</p>
    <p v-else-if="hint" :id="`${inputId}-hint`" class="sr-only">{{ hint }}</p>

    <ul v-if="modelValue.length" class="grid gap-2" :class="multiple ? 'grid-cols-1' : ''" aria-label="已选择文件">
      <li v-for="file in modelValue" :key="file.id" class="flex min-w-0 items-center gap-3 rounded-xl border bg-muted/20 p-2.5">
        <img v-if="file.previewUrl" :src="file.previewUrl" :alt="`${file.name}预览`" class="h-12 w-20 shrink-0 rounded-lg border object-cover">
        <span v-else class="grid size-10 shrink-0 place-items-center rounded-lg border bg-background text-muted-foreground">
          <ImageIcon v-if="file.mimeType.startsWith('image/')" class="size-4" aria-hidden="true" />
          <FileText v-else class="size-4" aria-hidden="true" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block truncate text-sm font-medium" :title="file.name">{{ file.name }}</span>
          <span class="mt-0.5 block text-xs text-muted-foreground">{{ formatSize(file.size) }} · 本地文件元数据</span>
        </span>
        <Button type="button" variant="ghost" size="icon-lg" class="h-10 w-10 text-destructive hover:text-destructive" :disabled="disabled" :aria-label="`移除${file.name}`" @click="removeFile(file.id)">
          <Trash2 aria-hidden="true" />
        </Button>
      </li>
    </ul>
  </div>
</template>
