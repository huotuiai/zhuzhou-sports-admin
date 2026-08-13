<script setup lang="ts">
defineProps<{
  code: string
}>()

const emit = defineEmits<{
  refresh: []
}>()
</script>

<template>
  <button
    type="button"
    class="captcha relative h-11 min-w-28 overflow-hidden rounded-lg border border-primary/30 bg-primary/8 px-4 font-mono text-base font-bold tracking-[0.28em] text-primary transition-colors duration-200 hover:border-primary/60 hover:bg-primary/12 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    aria-label="刷新图形验证码"
    title="点击刷新验证码"
    @click="emit('refresh')"
  >
    <svg class="pointer-events-none absolute inset-0 size-full opacity-40" viewBox="0 0 120 44" preserveAspectRatio="none" aria-hidden="true">
      <path d="M-8 32L34 7L78 35L130 8" stroke="currentColor" stroke-width="1" fill="none" />
      <path d="M-12 12L22 37L58 9L92 32L132 17" stroke="currentColor" stroke-width="0.75" fill="none" />
      <circle cx="18" cy="13" r="1.4" fill="currentColor" />
      <circle cx="96" cy="29" r="1.8" fill="currentColor" />
    </svg>
    <span class="relative pl-1">{{ code }}</span>
  </button>
</template>
