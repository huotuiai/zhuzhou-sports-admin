<script setup lang="ts">
import type { UserStatus } from '../types'
import { LockKeyhole } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'

defineProps<{ status: UserStatus }>()
</script>

<template>
  <Badge v-if="status === 'enabled'" class="border-success/30 bg-success/10 text-success hover:bg-success/10">启用</Badge>
  <Badge v-else-if="status === 'disabled'" variant="outline" class="text-muted-foreground">禁用</Badge>
  <Badge v-else class="border-warning/30 bg-warning/10 text-warning hover:bg-warning/10">
    <LockKeyhole class="size-3" aria-hidden="true" />锁定
  </Badge>
</template>
