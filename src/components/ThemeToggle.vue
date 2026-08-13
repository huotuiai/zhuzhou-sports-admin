<script setup lang="ts">
import { MoonIcon, SunIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { useThemeStore } from '@/stores/theme'

const themeStore = useThemeStore()
</script>

<template>
  <Button
    variant="ghost"
    size="icon-lg"
    class="text-muted-foreground hover:text-foreground"
    :aria-label="themeStore.mode === 'dark' ? '切换到亮色主题' : '切换到深色主题'"
    :title="themeStore.mode === 'dark' ? '切换到亮色主题' : '切换到深色主题'"
    @click="themeStore.toggleTheme"
  >
    <SunIcon v-if="themeStore.mode === 'dark'" aria-hidden="true" />
    <MoonIcon v-else aria-hidden="true" />
  </Button>
</template>
