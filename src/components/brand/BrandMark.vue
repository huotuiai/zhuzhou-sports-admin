<script setup lang="ts">
withDefaults(defineProps<{
  size?: number
  title?: string
}>(), {
  size: 44,
  title: '株洲体育中心智慧管理平台标识',
})
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 64 64"
    fill="none"
    role="img"
    :aria-label="title"
  >
    <defs>
      <linearGradient id="brand-mark-gradient" x1="8" y1="7" x2="56" y2="58" gradientUnits="userSpaceOnUse">
        <stop stop-color="#38BDF8" />
        <stop offset="1" stop-color="#06B6D4" />
      </linearGradient>
      <filter id="brand-mark-glow" x="-12" y="-12" width="88" height="88" filterUnits="userSpaceOnUse">
        <feGaussianBlur stdDeviation="2.5" />
      </filter>
    </defs>
    <path
      d="M32 5L54.5 18V46L32 59L9.5 46V18L32 5Z"
      fill="url(#brand-mark-gradient)"
      fill-opacity="0.16"
      stroke="url(#brand-mark-gradient)"
      stroke-width="2"
    />
    <path
      d="M16 39.5C20.2 32 25.1 28.2 32 28.2C38.9 28.2 43.8 32 48 39.5"
      stroke="#38BDF8"
      stroke-width="3"
      stroke-linecap="round"
    />
    <path
      d="M20 42.5H44M24.5 35L27 42.5M39.5 35L37 42.5"
      stroke="#22D3EE"
      stroke-width="2.4"
      stroke-linecap="round"
    />
    <circle cx="32" cy="21" r="4" fill="#7DD3FC" />
    <circle cx="32" cy="21" r="7" fill="#22D3EE" fill-opacity="0.25" filter="url(#brand-mark-glow)" />
  </svg>
</template>
