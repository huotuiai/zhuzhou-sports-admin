<script setup lang="ts">
import type { AuthorizedNavigationNode } from '@/config/navigation'
import { ChevronDownIcon } from '@lucide/vue'
import { computed, ref, useId, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, useSidebar } from '@/components/ui/sidebar'
import AppSidebarDropdownNode from './AppSidebarDropdownNode.vue'

const props = defineProps<{ item: AuthorizedNavigationNode }>()
const route = useRoute()
const { state, isMobile, setOpenMobile } = useSidebar()
const iconOnly = computed(() => state.value === 'collapsed' && !isMobile.value)
const expanded = ref(false)
const childrenId = useId()
const descriptionId = useId()
const buttonClass = 'h-12 rounded-xl px-3 text-sidebar-foreground/78 transition-colors duration-200 hover:bg-sidebar-accent/75 hover:text-sidebar-accent-foreground motion-reduce:transition-none data-[active=true]:bg-primary/18 data-[active=true]:font-semibold data-[active=true]:text-sidebar-accent-foreground data-[active=true]:ring-1 data-[active=true]:ring-primary/25 data-[active=true]:[&>svg]:text-primary group-data-[collapsible=icon]:size-11! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:rounded-xl group-data-[collapsible=icon]:p-0!'

function containsCurrentPage(item: AuthorizedNavigationNode): boolean {
  if (item.kind === 'directory') return item.children.some(containsCurrentPage)
  return item.kind === 'page' && route.matched.some(record => record.name === item.routeName)
}

const active = computed(() => containsCurrentPage(props.item))

watch([() => route.fullPath, active], () => {
  if (active.value) expanded.value = true
}, { immediate: true })
</script>

<template>
  <SidebarMenuItem>
    <SidebarMenuButton
      v-if="item.kind === 'page'"
      as-child
      :is-active="active"
      :tooltip="item.label"
      :class="buttonClass"
    >
      <RouterLink
        :to="{ name: item.routeName }"
        :aria-label="item.label"
        :aria-current="active ? 'page' : undefined"
        @click="setOpenMobile(false)"
      >
        <component :is="item.icon" aria-hidden="true" />
        <span class="group-data-[collapsible=icon]:hidden">{{ item.label }}</span>
        <component
          :is="item.trailingIcon"
          v-if="item.trailingIcon"
          class="ml-auto size-4 text-sidebar-foreground/45 group-data-[collapsible=icon]:hidden"
          aria-hidden="true"
        />
      </RouterLink>
    </SidebarMenuButton>

    <template v-else-if="item.kind === 'placeholder'">
      <SidebarMenuButton
        type="button"
        disabled
        :aria-label="`${item.label}，待开放`"
        :aria-describedby="descriptionId"
        :title="item.description"
        :class="buttonClass"
      >
        <component :is="item.icon" aria-hidden="true" />
        <span class="group-data-[collapsible=icon]:hidden">{{ item.label }}</span>
        <span class="ml-auto shrink-0 text-[10px] font-normal group-data-[collapsible=icon]:hidden">待开放</span>
      </SidebarMenuButton>
      <span :id="descriptionId" class="sr-only">{{ item.description }}</span>
    </template>

    <DropdownMenu v-else-if="iconOnly">
      <DropdownMenuTrigger as-child>
        <SidebarMenuButton :is-active="active" :aria-label="item.label" :title="item.label" :class="buttonClass">
          <component :is="item.icon" aria-hidden="true" />
          <span class="sr-only">{{ item.label }}</span>
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="start" :side-offset="8" class="w-56">
        <DropdownMenuLabel>{{ item.label }}</DropdownMenuLabel>
        <AppSidebarDropdownNode v-for="child in item.children" :key="child.id" :item="child" />
      </DropdownMenuContent>
    </DropdownMenu>

    <template v-else>
      <SidebarMenuButton
        type="button"
        :is-active="active"
        :aria-label="item.label"
        :aria-expanded="expanded"
        :aria-controls="childrenId"
        :class="buttonClass"
        @click="expanded = !expanded"
      >
        <component :is="item.icon" aria-hidden="true" />
        <span>{{ item.label }}</span>
        <ChevronDownIcon
          class="ml-auto size-4 transition-transform duration-200 motion-reduce:transition-none"
          :class="expanded ? '' : '-rotate-90'"
          aria-hidden="true"
        />
      </SidebarMenuButton>
      <SidebarMenuSub v-show="expanded" :id="childrenId" class="mx-2 mr-0 mt-1 px-2 pr-0" :aria-label="item.label">
        <AppSidebarNode v-for="child in item.children" :key="child.id" :item="child" />
      </SidebarMenuSub>
    </template>
  </SidebarMenuItem>
</template>
