<script setup lang="ts">
import type { CrudDialogCloseReason, CrudDialogCloseRequest, CrudDialogMode } from './contracts'
import { computed } from 'vue'
import { LoaderCircle, Save, X } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'

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
  size?: 'narrow' | 'default' | 'wide'
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
const widthClass = computed(() => ({
  narrow: '!w-[min(440px,calc(100vw-2rem))] !max-w-none sm:!max-w-[440px]',
  default: '!w-[min(680px,calc(100vw-2rem))] !max-w-none sm:!max-w-[680px]',
  wide: '!w-[min(760px,calc(100vw-2rem))] !max-w-none sm:!max-w-[760px]',
})[props.size])

function requestClose(reason: CrudDialogCloseReason): void {
  if (props.saving) return
  emit('request-close', { reason, dirty: props.dirty })
}

function handleOpenChange(open: boolean): void {
  if (open) emit('update:open', true)
  else requestClose('outside')
}

function handleEscape(event: Event): void {
  event.preventDefault()
  requestClose('escape')
}

function handleOutside(event: Event): void {
  if (event.defaultPrevented) return
  event.preventDefault()
  requestClose('outside')
}

function handleSubmit(): void {
  if (!props.saving && !props.submitDisabled) emit('submit')
}
</script>

<template>
  <Sheet :open="open" @update:open="handleOpenChange">
    <SheetContent
      side="right"
      :show-close-button="false"
      :class="['gap-0 p-0', widthClass]"
      @escape-key-down="handleEscape"
      @interact-outside="handleOutside"
    >
      <form class="flex h-full min-h-0 flex-col" novalidate @submit.prevent="handleSubmit">
        <SheetHeader class="relative shrink-0 border-b px-5 py-4 pr-16 text-left">
          <div class="flex min-w-0 items-center gap-2">
            <SheetTitle class="truncate text-lg font-semibold">{{ resolvedTitle }}</SheetTitle>
            <span v-if="dirty" class="shrink-0 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">
              未保存
            </span>
          </div>
          <SheetDescription :class="description ? 'mt-1.5 leading-5' : 'sr-only'">
            {{ description ?? (mode === 'create' ? '填写信息并创建一条新记录。' : '修改并保存当前记录。') }}
          </SheetDescription>
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            class="absolute right-3 top-3 h-11 w-11"
            :disabled="saving"
            aria-label="关闭抽屉"
            @click="requestClose('close-button')"
          >
            <X aria-hidden="true" />
          </Button>
        </SheetHeader>

        <div class="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <slot :mode="mode" :saving="saving" />
        </div>

        <SheetFooter class="shrink-0 flex-row justify-end border-t bg-card/90 px-5 py-4">
          <slot name="footer-before" />
          <Button type="button" variant="outline" size="lg" class="h-11 min-w-24" :disabled="saving" @click="requestClose('cancel')">
            {{ cancelLabel }}
          </Button>
          <Button type="submit" size="lg" class="h-11 min-w-28" :disabled="saving || submitDisabled">
            <LoaderCircle v-if="saving" class="animate-spin motion-reduce:animate-none" aria-hidden="true" />
            <Save v-else aria-hidden="true" />
            {{ saving ? '保存中' : resolvedSubmitLabel }}
          </Button>
          <slot name="footer-after" />
        </SheetFooter>
      </form>
    </SheetContent>
  </Sheet>
</template>
