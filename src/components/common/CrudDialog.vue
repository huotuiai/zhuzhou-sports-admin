<script setup lang="ts">
import type {
  CrudDialogCloseReason,
  CrudDialogCloseRequest,
  CrudDialogMode,
} from './contracts'
import { computed } from 'vue'
import { LoaderCircle, Save, X } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const props = withDefaults(defineProps<{
  open: boolean
  mode: CrudDialogMode
  title?: string
  description?: string
  saving?: boolean
  dirty?: boolean
  submitDisabled?: boolean
  submitLabel?: string
  cancelLabel?: string
  size?: 'default' | 'wide'
}>(), {
  title: undefined,
  description: undefined,
  saving: false,
  dirty: false,
  submitDisabled: false,
  submitLabel: undefined,
  cancelLabel: '取消',
  size: 'default',
})

const emit = defineEmits<{
  'update:open': [open: boolean]
  submit: []
  'request-close': [request: CrudDialogCloseRequest]
}>()

const resolvedTitle = computed(() => props.title ?? (props.mode === 'create' ? '新建记录' : '编辑记录'))
const resolvedSubmitLabel = computed(() => props.submitLabel ?? (props.mode === 'create' ? '确认新建' : '保存修改'))

function requestClose(reason: CrudDialogCloseReason) {
  if (props.saving) return
  emit('request-close', { reason, dirty: props.dirty })
}

function handleOpenChange(open: boolean) {
  if (open) {
    emit('update:open', true)
    return
  }
  requestClose('outside')
}

function handleEscape(event: Event) {
  event.preventDefault()
  requestClose('escape')
}

function handleOutside(event: Event) {
  if (event.defaultPrevented) return
  event.preventDefault()
  requestClose('outside')
}

function handleSubmit() {
  if (props.saving || props.submitDisabled) return
  emit('submit')
}
</script>

<template>
  <Dialog :open="open" @update:open="handleOpenChange">
    <DialogContent
      :class="[
        'max-h-[calc(100svh-2rem)] w-[calc(100vw-2rem)] overflow-hidden p-0',
        size === 'wide' ? 'max-w-4xl' : 'max-w-2xl',
      ]"
      @escape-key-down="handleEscape"
      @interact-outside="handleOutside"
    >
      <form class="flex max-h-[calc(100svh-2rem)] min-h-0 flex-col" novalidate @submit.prevent="handleSubmit">
        <DialogHeader class="relative shrink-0 border-b px-5 py-4 pr-16">
          <div class="flex min-w-0 items-center gap-2">
            <DialogTitle class="truncate text-lg font-semibold">{{ resolvedTitle }}</DialogTitle>
            <span
              v-if="dirty"
              class="shrink-0 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning"
            >
              未保存
            </span>
          </div>
          <DialogDescription :class="description ? 'mt-1.5 leading-5' : 'sr-only'">
            {{ description ?? (mode === 'create' ? '填写信息并创建一条新记录。' : '修改并保存当前记录。') }}
          </DialogDescription>

          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            class="absolute right-3 top-3 h-11 w-11"
            :disabled="saving"
            aria-label="关闭弹窗"
            @click="requestClose('close-button')"
          >
            <X aria-hidden="true" />
          </Button>
        </DialogHeader>

        <div class="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <slot :mode="mode" :saving="saving" />
        </div>

        <DialogFooter class="shrink-0 flex-row justify-end border-t bg-card/90 px-5 py-4">
          <slot name="footer-before" />
          <Button
            type="button"
            variant="outline"
            size="lg"
            class="h-11 min-w-24"
            :disabled="saving"
            @click="requestClose('cancel')"
          >
            {{ cancelLabel }}
          </Button>
          <Button
            type="submit"
            size="lg"
            class="h-11 min-w-28"
            :disabled="saving || submitDisabled"
          >
            <LoaderCircle v-if="saving" class="animate-spin motion-reduce:animate-none" aria-hidden="true" />
            <Save v-else aria-hidden="true" />
            {{ saving ? '保存中' : resolvedSubmitLabel }}
          </Button>
          <slot name="footer-after" />
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
