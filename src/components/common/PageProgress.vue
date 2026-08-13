<script setup lang="ts">
import { computed } from 'vue'
import { pageProgress } from '@/composables/use-page-progress'

const progressStyle = computed(() => ({
  transform: `scaleX(${pageProgress.progress.value / 100})`,
}))
</script>

<template>
  <Transition name="page-progress-fade">
    <div
      v-if="pageProgress.visible.value"
      class="page-progress"
      role="progressbar"
      aria-label="正在加载页面"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="Math.round(pageProgress.progress.value)"
    >
      <span class="page-progress__bar" :style="progressStyle" />
    </div>
  </Transition>
</template>

<style scoped>
.page-progress {
  position: fixed;
  z-index: 100;
  top: 0;
  right: 0;
  left: 0;
  height: 2px;
  overflow: hidden;
  pointer-events: none;
}

.page-progress-fade-enter-active,
.page-progress-fade-leave-active {
  transition: opacity 120ms ease;
}

.page-progress-fade-enter-from,
.page-progress-fade-leave-to {
  opacity: 0;
}

.page-progress__bar {
  position: absolute;
  inset: 0;
  transform: scaleX(0);
  transform-origin: left center;
  background: linear-gradient(90deg, var(--primary), var(--chart-2));
  box-shadow:
    0 0 8px color-mix(in srgb, var(--primary) 70%, transparent),
    0 0 18px color-mix(in srgb, var(--chart-2) 42%, transparent);
  transition: transform 180ms ease-out;
  will-change: transform;
}

@media (prefers-reduced-motion: reduce) {
  .page-progress-fade-enter-active,
  .page-progress-fade-leave-active,
  .page-progress__bar {
    transition: none;
  }
}
</style>
