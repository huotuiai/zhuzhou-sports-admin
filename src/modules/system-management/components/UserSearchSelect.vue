<script setup lang="ts">
import type { SystemUser } from '../types'
import { computed, ref } from 'vue'
import { Check, Search, X } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const props = defineProps<{
  users: readonly SystemUser[]
  modelValue: string | null
  disabled?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string | null] }>()
const keyword = ref('')
const selected = computed(() => props.users.find(user => user.id === props.modelValue) ?? null)
const candidates = computed(() => {
  const query = keyword.value.trim().normalize('NFKC').toLocaleLowerCase('zh-CN')
  return props.users.filter(user => !query || [user.name, user.username, user.phone].join(' ').normalize('NFKC').toLocaleLowerCase('zh-CN').includes(query)).slice(0, 8)
})
</script>

<template>
  <div class="space-y-2">
    <div v-if="selected" class="flex min-h-11 items-center gap-3 rounded-lg border border-primary/25 bg-primary/5 px-3">
      <span class="grid size-7 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{{ selected.name.slice(0, 1) }}</span>
      <span class="min-w-0 flex-1 truncate text-sm">{{ selected.name }} · {{ selected.username }}</span>
      <Button type="button" variant="ghost" size="icon-sm" :disabled="disabled" :aria-label="`清除主管${selected.name}`" @click="emit('update:modelValue', null)"><X aria-hidden="true" /></Button>
    </div>
    <div class="relative">
      <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input v-model="keyword" class="h-11 pl-9" placeholder="搜索姓名、用户名或手机号" :disabled="disabled" />
    </div>
    <div v-if="keyword" class="max-h-48 overflow-y-auto rounded-lg border bg-background p-1">
      <button v-for="user in candidates" :key="user.id" type="button" class="flex min-h-10 w-full items-center gap-2 rounded-md px-3 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50" :disabled="disabled" @click="emit('update:modelValue', user.id); keyword = ''">
        <Check class="size-4" :class="user.id === modelValue ? 'opacity-100 text-primary' : 'opacity-0'" aria-hidden="true" />
        <span class="min-w-0 flex-1 truncate">{{ user.name }} · {{ user.username }}</span>
      </button>
      <p v-if="!candidates.length" class="px-3 py-6 text-center text-sm text-muted-foreground">没有匹配的用户</p>
    </div>
  </div>
</template>
