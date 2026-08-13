<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import { RouterView } from 'vue-router'
import DesktopOnlyNotice from '@/components/DesktopOnlyNotice.vue'
import PageProgress from '@/components/common/PageProgress.vue'
import { Toaster } from '@/components/ui/sonner'

const isDesktopViewport = useMediaQuery('(min-width: 1024px)')
</script>

<template>
  <PageProgress />
  <template v-if="isDesktopViewport">
    <RouterView />
    <Toaster position="top-right" :duration="3200" close-button />
  </template>
  <DesktopOnlyNotice v-else />
</template>
