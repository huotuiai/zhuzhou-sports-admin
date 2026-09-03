<script setup lang="ts">
import { ref } from 'vue'
import { ExternalLink, Maximize2, Minimize2 } from '@lucide/vue'
import { useFullscreen } from '@vueuse/core'
import { toast } from 'vue-sonner'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

// const DATA_SCREEN_URL = 'https://apizzjj.hnhcsz.com/yhsql/ddp/'
const DATA_SCREEN_URL = 'http://127.0.0.1:5176/'

const screenRef = ref<HTMLElement | null>(null)
const promptOpen = ref(true)
const { isFullscreen, isSupported, enter, exit } = useFullscreen(screenRef, { autoExit: true })

function openInNewTab(): void {
  window.open(DATA_SCREEN_URL, '_blank', 'noopener,noreferrer')
}

function fallbackOpenExternal(): void {
  openInNewTab()
  toast.info('当前浏览器无法全屏，已在新标签页打开')
}

async function requestScreenFullscreen(): Promise<boolean> {
  if (!isSupported.value) return false
  try {
    await enter()
    return true
  }
  catch {
    return false
  }
}

async function confirmFullscreen(): Promise<void> {
  const ok = await requestScreenFullscreen()
  promptOpen.value = false
  if (!ok) fallbackOpenExternal()
}

async function toggleFullscreen(): Promise<void> {
  if (isFullscreen.value) {
    await exit()
    return
  }
  if (!await requestScreenFullscreen()) fallbackOpenExternal()
}
</script>

<template>
  <section
    ref="screenRef"
    class="flex h-[calc(100svh-4rem)] min-w-0 flex-col overflow-hidden bg-background"
    :class="{ 'bg-black': isFullscreen }"
    aria-labelledby="data-screen-title"
  >
    <h1 id="data-screen-title" class="sr-only">数据大屏</h1>

    <Teleport defer to="#admin-page-actions">
      <Button
        v-if="!isFullscreen"
        variant="outline"
        class="h-9"
        aria-label="全屏打开"
        @click="toggleFullscreen"
      >
        <Maximize2 aria-hidden="true" />
        全屏
      </Button>
      <Button
        v-if="!isFullscreen"
        variant="outline"
        class="h-9"
        aria-label="在新标签页打开数据大屏"
        @click="openInNewTab"
      >
        <ExternalLink aria-hidden="true" />
        新窗口
      </Button>
    </Teleport>

    <div
      v-if="isFullscreen"
      class="flex h-11 shrink-0 items-center justify-end gap-2 border-b border-white/15 bg-zinc-950 px-4"
    >
      <Button
        variant="outline"
        class="h-8 border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
        aria-label="退出全屏"
        @click="toggleFullscreen"
      >
        <Minimize2 aria-hidden="true" />
        退出全屏
      </Button>
      <Button
        variant="outline"
        class="h-8 border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
        aria-label="在新标签页打开数据大屏"
        @click="openInNewTab"
      >
        <ExternalLink aria-hidden="true" />
        新窗口
      </Button>
    </div>

    <iframe
      :src="DATA_SCREEN_URL"
      title="数据大屏"
      allow="fullscreen"
      allowfullscreen
      referrerpolicy="no-referrer-when-downgrade"
      class="min-h-0 w-full flex-1 border-0 bg-black"
    />

    <AlertDialog :open="promptOpen" @update:open="promptOpen = $event">
      <AlertDialogContent class="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogMedia class="bg-primary/10 text-primary">
            <Maximize2 aria-hidden="true" />
          </AlertDialogMedia>
          <AlertDialogTitle>全屏打开数据大屏？</AlertDialogTitle>
          <AlertDialogDescription>
            数据大屏适合在全屏下查看。选择「全屏打开」后将铺满屏幕，按 Esc 可退出全屏。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel class="h-11">当前窗口查看</AlertDialogCancel>
          <Button class="h-11" @click="confirmFullscreen">
            <Maximize2 aria-hidden="true" />
            全屏打开
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>
</template>
