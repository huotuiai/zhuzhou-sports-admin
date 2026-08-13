<script setup lang="ts">
import { AlertTriangle } from '@lucide/vue'

defineProps<{
  id?: string
  message?: string
}>()
</script>

<template>
  <p v-if="message" :id="id" class="flex items-start gap-1.5 text-xs leading-5 text-destructive" role="alert">
    <AlertTriangle class="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
    {{ message }}
  </p>
</template>
