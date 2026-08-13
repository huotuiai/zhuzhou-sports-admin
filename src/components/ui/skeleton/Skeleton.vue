<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

interface SkeletonProps {
  class?: HTMLAttributes['class']
}

const props = defineProps<SkeletonProps>()
</script>

<template>
  <div
    data-slot="skeleton"
    :class="cn('skeleton-shimmer overflow-hidden rounded-md bg-muted', props.class)"
  />
</template>

<style scoped>
.skeleton-shimmer {
  position: relative;
}

.skeleton-shimmer::after {
  position: absolute;
  inset: 0;
  content: '';
  transform: translateX(-110%);
  background: linear-gradient(
    90deg,
    transparent,
    color-mix(in srgb, var(--foreground) 8%, transparent),
    transparent
  );
  animation: skeleton-shimmer 1.35s ease-in-out infinite;
}

@keyframes skeleton-shimmer {
  to {
    transform: translateX(110%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton-shimmer::after {
    display: none;
  }
}
</style>
