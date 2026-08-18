<script setup lang="ts">
import type { SidebarNavigationItem } from '@/config/navigation'
import { PanelLeftClose } from '@lucide/vue'
import { useRoute, useRouter } from 'vue-router'
import BrandMark from '@/components/brand/BrandMark.vue'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'
import { sidebarNavigation } from '@/config/navigation'

const route = useRoute()
const router = useRouter()

function isItemActive(item: SidebarNavigationItem) {
  if (!item.to) {
    return false
  }

  const targetName = router.resolve(item.to).name
  return route.matched.some((record) => record.name === targetName)
}

</script>

<template>
  <Sidebar variant="inset" collapsible="icon" class="border-0">
    <SidebarHeader class="px-3 pt-3 group-data-[collapsible=icon]:px-1 group-data-[collapsible=icon]:pt-2">
      <RouterLink
        :to="{ name: 'data-dashboard' }"
        class="flex h-16 w-full items-center gap-3 overflow-hidden rounded-2xl border border-sidebar-border/75 bg-sidebar-accent/50 px-3 shadow-[0_10px_30px_rgba(15,23,42,0.06)] transition-colors duration-200 hover:bg-sidebar-accent/75 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-sidebar-ring/50 motion-reduce:transition-none group-data-[collapsible=icon]:size-11 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:self-center group-data-[collapsible=icon]:rounded-xl group-data-[collapsible=icon]:px-0"
        aria-label="返回首页"
      >
        <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary group-data-[collapsible=icon]:bg-transparent">
          <BrandMark :size="34" />
        </span>
        <div class="min-w-0 transition-opacity duration-150 motion-reduce:transition-none group-data-[collapsible=icon]:w-0 group-data-[collapsible=icon]:opacity-0">
          <p class="truncate text-sm font-semibold tracking-tight text-sidebar-foreground">株洲体育中心</p>
          <p class="mt-0.5 truncate text-[11px] tracking-[0.08em] text-sidebar-foreground/60">智慧管理平台</p>
        </div>
      </RouterLink>
    </SidebarHeader>

    <SidebarContent class="px-1 pb-2 pt-2">
      <template v-for="group in sidebarNavigation" :key="group.id">
        <SidebarGroup class="px-3 py-2.5 group-data-[collapsible=icon]:px-1 group-data-[collapsible=icon]:py-1.5">
          <SidebarGroupLabel
            :id="`sidebar-group-${group.id}`"
            class="mb-1 h-8 px-2 text-xs font-semibold tracking-[0.08em] text-sidebar-foreground/50 group-data-[collapsible=icon]:hidden"
          >
            {{ group.label }}
          </SidebarGroupLabel>

          <SidebarGroupContent>
            <SidebarMenu
              :aria-labelledby="`sidebar-group-${group.id}`"
              class="gap-1 group-data-[collapsible=icon]:items-center"
            >
              <SidebarMenuItem v-for="item in group.items" :key="item.id">
                <SidebarMenuButton
                  as-child
                  :is-active="isItemActive(item)"
                  :tooltip="item.label"
                  class="h-12 rounded-xl px-3 text-sidebar-foreground/78 transition-colors duration-200 hover:bg-sidebar-accent/75 hover:text-sidebar-accent-foreground motion-reduce:transition-none data-[active=true]:bg-primary/18 data-[active=true]:font-semibold data-[active=true]:text-sidebar-accent-foreground data-[active=true]:ring-1 data-[active=true]:ring-primary/25 data-[active=true]:[&>svg]:text-primary group-data-[collapsible=icon]:size-11! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:rounded-xl group-data-[collapsible=icon]:p-0!"
                >
                  <RouterLink
                    :to="item.to"
                    :aria-label="item.label"
                    :aria-current="isItemActive(item) ? 'page' : undefined"
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
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </template>
    </SidebarContent>

    <SidebarFooter class="px-3 pb-3 pt-1 group-data-[collapsible=icon]:px-1">
      <div
        class="flex min-h-12 items-center gap-3 overflow-hidden rounded-xl border border-sidebar-border/70 bg-sidebar-accent/35 px-3 group-data-[collapsible=icon]:size-11 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:self-center group-data-[collapsible=icon]:px-0"
        title="使用 Ctrl/⌘ + B 展开或收起导航栏"
      >
        <span class="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <PanelLeftClose class="size-4" aria-hidden="true" />
        </span>
        <div class="min-w-0 group-data-[collapsible=icon]:hidden">
          <p class="truncate text-xs font-medium text-sidebar-foreground">快捷收缩</p>
          <p class="mt-0.5 truncate text-[10px] text-sidebar-foreground/55">Ctrl/⌘ + B</p>
        </div>
      </div>
    </SidebarFooter>

    <SidebarRail />
  </Sidebar>
</template>
