<script setup lang="ts">
import { FileText, Image as ImageIcon, LockKeyhole, UploadCloud } from '@lucide/vue'
import type { RemoteFileAsset } from '../types'

withDefaults(defineProps<{
  modelValue: readonly RemoteFileAsset[]
  accept?: string
  maxFileSize?: number
  maxFiles?: number
  multiple?: boolean
  disabled?: boolean
  invalid?: boolean
  hint?: string
}>(), {
  accept: '',
  maxFileSize: 0,
  maxFiles: 1,
  multiple: false,
  disabled: false,
  invalid: false,
  hint: '',
})

function isImage(file: RemoteFileAsset): boolean {
  return file.mimeType.startsWith('image/') || /\.(?:avif|gif|jpe?g|png|webp)$/i.test(file.url)
}

function formatSize(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return '远程资源'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}
</script>

<template>
  <div class="space-y-3">
    <div
      class="flex min-h-28 cursor-not-allowed flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/25 px-4 py-5 text-center"
      :class="invalid ? 'border-destructive/60 bg-destructive/5' : 'border-border'"
      aria-disabled="true"
    >
      <span class="grid size-10 place-items-center rounded-full border bg-background text-muted-foreground">
        <UploadCloud class="size-5" aria-hidden="true" />
      </span>
      <p class="text-sm font-medium text-muted-foreground">文件上传暂不可用</p>
      <p class="text-xs leading-5 text-muted-foreground">
        {{ hint || '等待后端提供上传接口' }}
        <span class="block font-medium text-warning">等待后端提供上传接口</span>
      </p>
    </div>

    <div v-if="modelValue.length" class="space-y-2">
      <p class="flex items-center gap-1.5 text-xs text-muted-foreground">
        <LockKeyhole class="size-3.5" aria-hidden="true" />
        已有远程资源仅作展示，保存时会原样保留
      </p>
      <ul class="space-y-2" aria-label="已有远程资源">
        <li
          v-for="file in modelValue"
          :key="file.id || file.url"
          class="flex min-w-0 items-center gap-3 rounded-xl border bg-background p-2.5"
        >
          <img v-if="isImage(file)" :src="file.url" :alt="file.name" class="size-12 shrink-0 rounded-lg border object-cover">
          <span v-else class="grid size-12 shrink-0 place-items-center rounded-lg border bg-muted/35 text-muted-foreground">
            <FileText class="size-5" aria-hidden="true" />
          </span>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium" :title="file.name">{{ file.name || '远程文件' }}</p>
            <p class="mt-1 text-xs text-muted-foreground">{{ formatSize(file.size) }}</p>
          </div>
          <ImageIcon v-if="isImage(file)" class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </li>
      </ul>
    </div>
  </div>
</template>
