<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const title = computed(() => String(route.meta.title ?? '未命名页面'))
</script>

<template>
  <section class="min-h-[calc(100svh-4rem)]" :aria-labelledby="`empty-route-${String(route.name)}`">
    <h1 :id="`empty-route-${String(route.name)}`" class="sr-only">{{ title }}</h1>
  </section>
</template>
