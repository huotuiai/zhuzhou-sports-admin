<script setup lang="ts">
import type { AuthorizedNavigationNode } from '@/config/navigation'
import { computed, useId } from 'vue'
import { useRoute } from 'vue-router'
import {
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu'

const props = defineProps<{ item: AuthorizedNavigationNode }>()
const route = useRoute()
const descriptionId = useId()
const active = computed(() => {
  const item = props.item
  return item.kind === 'page' && route.matched.some(record => record.name === item.routeName)
})
</script>

<template>
  <DropdownMenuItem v-if="item.kind === 'page'" as-child class="min-h-11 gap-2 rounded-lg px-3" :class="active ? 'bg-primary/10 font-semibold text-primary' : ''">
    <RouterLink :to="{ name: item.routeName }" :aria-current="active ? 'page' : undefined">
      <component :is="item.icon" aria-hidden="true" />
      <span>{{ item.label }}</span>
    </RouterLink>
  </DropdownMenuItem>

  <template v-else-if="item.kind === 'placeholder'">
    <DropdownMenuItem disabled as-child class="min-h-11 gap-2 rounded-lg px-3">
      <button type="button" disabled :aria-describedby="descriptionId" :title="item.description" class="w-full">
        <component :is="item.icon" aria-hidden="true" />
        <span>{{ item.label }}</span>
        <span class="ml-auto text-[10px]">待开放</span>
      </button>
    </DropdownMenuItem>
    <span :id="descriptionId" class="sr-only">{{ item.description }}</span>
  </template>

  <DropdownMenuSub v-else>
    <DropdownMenuSubTrigger class="min-h-11 gap-2 rounded-lg px-3">
      <component :is="item.icon" aria-hidden="true" />
      <span>{{ item.label }}</span>
    </DropdownMenuSubTrigger>
    <DropdownMenuPortal>
      <DropdownMenuSubContent class="min-w-48">
        <AppSidebarDropdownNode v-for="child in item.children" :key="child.id" :item="child" />
      </DropdownMenuSubContent>
    </DropdownMenuPortal>
  </DropdownMenuSub>
</template>
