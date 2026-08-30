<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowDown, ArrowUp, FileText, Image as ImageIcon, LoaderCircle, Trash2, UploadCloud } from '@lucide/vue'
import type { RemoteFileAsset } from '../types'
import type { UploadScene } from '../services/file-upload-service'
import { fileUploadService, UPLOAD_MAX_BYTES, validateUploadImage } from '../services/file-upload-service'
import { Button } from '@/components/ui/button'

const props = withDefaults(defineProps<{
  modelValue: readonly RemoteFileAsset[]
  accept?: string
  scene?: UploadScene
  maxFileSize?: number
  maxFiles?: number
  multiple?: boolean
  disabled?: boolean
  invalid?: boolean
  hint?: string
}>(), {
  accept: 'image/jpeg,image/png,image/webp,image/gif',
  scene: 'cover',
  maxFileSize: UPLOAD_MAX_BYTES,
  maxFiles: 1,
  multiple: false,
  disabled: false,
  invalid: false,
  hint: '',
})

const emit = defineEmits<{
  'update:modelValue': [value: RemoteFileAsset[]]
  'update:uploading': [value: boolean]
}>()

const inputRef = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const uploadError = ref('')
const maxCount = computed(() => Math.max(1, Math.trunc(props.maxFiles)))
const selectionDisabled = computed(() => props.disabled || uploading.value || (props.multiple && props.modelValue.length >= maxCount.value))

function isImage(file: RemoteFileAsset): boolean {
  return file.mimeType.startsWith('image/') || /\.(?:avif|gif|jpe?g|png|webp)$/i.test(file.url)
}

function formatSize(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return '远程资源'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '图片上传失败，请稍后重试'
}

function normalizedOrder(files: readonly RemoteFileAsset[]): RemoteFileAsset[] {
  return files.map((file, index) => ({ ...file, sortOrder: index }))
}

async function uploadFiles(source: FileList | readonly File[]): Promise<void> {
  if (selectionDisabled.value) return
  const selected = Array.from(source)
  const files = props.multiple ? selected.slice(0, Math.max(0, maxCount.value - props.modelValue.length)) : selected.slice(0, 1)
  if (!files.length) return

  uploadError.value = ''
  uploading.value = true
  emit('update:uploading', true)
  const uploaded: RemoteFileAsset[] = []
  for (const file of files) {
    try {
      validateUploadImage(file, props.maxFileSize)
      uploaded.push(await fileUploadService.uploadImage(file, props.scene))
    }
    catch (error) {
      uploadError.value ||= `${file.name}：${errorMessage(error)}`
    }
  }
  uploading.value = false
  emit('update:uploading', false)

  if (uploaded.length) {
    const next = props.multiple ? [...props.modelValue, ...uploaded] : uploaded
    emit('update:modelValue', normalizedOrder(next.slice(0, maxCount.value)))
  }
}

function openPicker(): void {
  if (!selectionDisabled.value) inputRef.value?.click()
}

function handleInput(event: Event): void {
  const input = event.target as HTMLInputElement
  if (input.files) void uploadFiles(input.files)
  input.value = ''
}

function handleDrop(event: DragEvent): void {
  if (!selectionDisabled.value && event.dataTransfer?.files.length) void uploadFiles(event.dataTransfer.files)
}

function removeFile(index: number): void {
  if (props.disabled || uploading.value) return
  emit('update:modelValue', normalizedOrder(props.modelValue.filter((_, itemIndex) => itemIndex !== index)))
  uploadError.value = ''
}

function moveFile(index: number, offset: -1 | 1): void {
  if (props.disabled || uploading.value) return
  const target = index + offset
  if (target < 0 || target >= props.modelValue.length) return
  const files = [...props.modelValue]
  const [file] = files.splice(index, 1)
  if (!file) return
  files.splice(target, 0, file)
  emit('update:modelValue', normalizedOrder(files))
}
</script>

<template>
  <div class="space-y-3">
    <input
      ref="inputRef"
      class="sr-only"
      type="file"
      :accept="accept"
      :multiple="multiple"
      :disabled="selectionDisabled"
      tabindex="-1"
      @change="handleInput"
    >

    <button
      type="button"
      class="flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/25 px-4 py-5 text-center transition-colors"
      :class="[
        invalid || uploadError ? 'border-destructive/60 bg-destructive/5' : 'border-border hover:border-primary/50 hover:bg-primary/5',
        selectionDisabled ? 'cursor-not-allowed opacity-65' : 'cursor-pointer',
      ]"
      :disabled="selectionDisabled"
      @click="openPicker"
      @dragover.prevent
      @drop.prevent="handleDrop"
    >
      <span class="grid size-10 place-items-center rounded-full border bg-background text-muted-foreground">
        <LoaderCircle v-if="uploading" class="size-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        <UploadCloud v-else class="size-5" aria-hidden="true" />
      </span>
      <p class="text-sm font-medium">{{ uploading ? '图片上传中…' : multiple ? '点击或拖拽图片上传' : modelValue.length ? '点击替换图片' : '点击或拖拽图片上传' }}</p>
      <p class="text-xs leading-5 text-muted-foreground">
        {{ hint || '支持 JPG、PNG、WebP、GIF，单张不超过 5MB' }}
        <span v-if="multiple" class="block">最多 {{ maxCount }} 张，已选 {{ modelValue.length }} 张</span>
      </p>
    </button>

    <p v-if="uploadError" class="text-xs leading-5 text-destructive" role="alert">{{ uploadError }}</p>

    <ul v-if="modelValue.length" class="space-y-2" aria-label="已上传资源">
      <li
        v-for="(file, index) in modelValue"
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
        <div v-if="multiple" class="flex shrink-0 items-center">
          <Button type="button" variant="ghost" size="icon-sm" :disabled="disabled || uploading || index === 0" :aria-label="`上移 ${file.name}`" @click="moveFile(index, -1)"><ArrowUp aria-hidden="true" /></Button>
          <Button type="button" variant="ghost" size="icon-sm" :disabled="disabled || uploading || index === modelValue.length - 1" :aria-label="`下移 ${file.name}`" @click="moveFile(index, 1)"><ArrowDown aria-hidden="true" /></Button>
        </div>
        <ImageIcon v-if="isImage(file)" class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <Button type="button" variant="ghost" size="icon-sm" class="shrink-0 text-destructive hover:text-destructive" :disabled="disabled || uploading" :aria-label="`移除 ${file.name}`" @click="removeFile(index)"><Trash2 aria-hidden="true" /></Button>
      </li>
    </ul>
  </div>
</template>
