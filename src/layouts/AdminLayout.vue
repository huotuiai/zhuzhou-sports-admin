<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ChevronDownIcon,
  ChevronRightIcon,
  LogOutIcon,
  UserRoundIcon,
} from '@lucide/vue'
import AppSidebar from '@/components/navigation/AppSidebar.vue'
import ThemeToggle from '@/components/ThemeToggle.vue'
import { Avatar, AvatarBadge, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()
const route = useRoute()
const router = useRouter()
const currentUserName = computed(() => authStore.user?.name ?? '平台管理员')
const currentUsername = computed(() => authStore.user?.username ?? 'admin')
const currentPageTitle = computed(() => String(route.meta.title ?? '未命名页面'))
const currentSectionTitle = computed(() => route.meta.sectionTitle
  ? String(route.meta.sectionTitle)
  : '')

async function handleLogout() {
  await authStore.logout()
  await router.replace({ name: 'login' })
}
</script>

<template>
  <SidebarProvider>
    <a class="skip-link" href="#main-content">跳转到主要内容</a>

    <AppSidebar />

    <SidebarInset class="min-w-0 overflow-hidden border border-border/60 bg-background/88 shadow-xl backdrop-blur-xl">
      <header class="glass-header sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-border/60 px-4 md:px-6">
        <SidebarTrigger class="size-10 rounded-xl border border-border/60 bg-background/55 shadow-sm" />
        <span class="h-5 w-px bg-border/75" aria-hidden="true" />
        <nav class="min-w-0" aria-label="面包屑导航">
          <ol class="flex items-center gap-2 text-sm">
            <li v-if="currentSectionTitle" class="truncate text-muted-foreground">
              {{ currentSectionTitle }}
            </li>
            <li v-if="currentSectionTitle" aria-hidden="true">
              <ChevronRightIcon class="size-3.5 text-muted-foreground/70" />
            </li>
            <li class="truncate font-medium text-foreground" aria-current="page">{{ currentPageTitle }}</li>
          </ol>
        </nav>

        <div class="ml-auto flex items-center gap-2">
          <ThemeToggle />

          <span class="mx-0.5 h-6 w-px bg-border/70" aria-hidden="true" />

          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button
                variant="ghost"
                class="group/user-menu h-11 gap-2.5 rounded-xl border border-transparent bg-background/30 px-2 py-1.5 pr-2.5 shadow-none transition-colors duration-200 hover:border-border/70 hover:bg-background/75 aria-expanded:border-primary/25 aria-expanded:bg-primary/8 aria-expanded:shadow-sm motion-reduce:transition-none"
                :aria-label="`打开${currentUserName}的用户菜单`"
              >
                <Avatar class="size-8 bg-primary/10 ring-1 ring-primary/15">
                  <AvatarFallback class="bg-transparent text-primary">
                    <UserRoundIcon class="size-4" aria-hidden="true" />
                  </AvatarFallback>
                  <AvatarBadge class="size-2.5! border border-background bg-success ring-1 ring-background" />
                </Avatar>
                <span class="hidden min-w-0 text-left lg:block">
                  <span class="block max-w-28 truncate text-xs font-semibold leading-4 text-foreground">
                    {{ currentUserName }}
                  </span>
                  <span class="block max-w-28 truncate text-[10px] leading-3.5 text-muted-foreground">
                    {{ currentUsername }}
                  </span>
                </span>
                <ChevronDownIcon
                  class="size-3.5 text-muted-foreground transition-transform duration-200 group-aria-expanded/user-menu:rotate-180 motion-reduce:transition-none"
                  aria-hidden="true"
                />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              :side-offset="8"
              class="w-64 rounded-xl border border-border/70 bg-popover/98 p-1.5 shadow-[0_16px_48px_rgba(15,23,42,0.14)] backdrop-blur-xl"
            >
              <DropdownMenuLabel class="p-2.5 text-foreground">
                <div class="flex items-center gap-3">
                  <Avatar size="lg" class="bg-primary/10 ring-1 ring-primary/15">
                    <AvatarFallback class="bg-transparent text-primary">
                      <UserRoundIcon class="size-5" aria-hidden="true" />
                    </AvatarFallback>
                    <AvatarBadge class="border border-background bg-success" />
                  </Avatar>
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm font-semibold leading-5 text-foreground">{{ currentUserName }}</p>
                    <div class="mt-0.5 flex items-center gap-1.5 text-[11px] font-normal text-muted-foreground">
                      <span class="size-1.5 rounded-full bg-success" aria-hidden="true" />
                      <span class="truncate">{{ currentUsername }} · 已登录</span>
                    </div>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator class="mx-1 my-1.5" />
              <DropdownMenuItem
                variant="destructive"
                class="min-h-11 cursor-pointer gap-3 rounded-lg px-2.5 py-2 transition-colors duration-150 motion-reduce:transition-none"
                @select="handleLogout"
              >
                <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-destructive/8">
                  <LogOutIcon class="size-4" aria-hidden="true" />
                </span>
                <span class="min-w-0">
                  <span class="block text-sm font-medium leading-4">退出登录</span>
                  <span class="mt-0.5 block text-[10px] font-normal leading-3 text-destructive/70">结束当前管理会话</span>
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <main id="main-content" class="min-h-[calc(100svh-4rem)] min-w-0">
        <RouterView v-slot="{ Component, route: resolvedRoute }">
          <Transition name="page-view" mode="out-in">
            <component :is="Component" :key="String(resolvedRoute.name ?? resolvedRoute.path)" />
          </Transition>
        </RouterView>
      </main>
    </SidebarInset>
  </SidebarProvider>
</template>

<style scoped>
.page-view-enter-active {
  transition: opacity 200ms ease-out, transform 200ms ease-out;
}

.page-view-leave-active {
  transition: opacity 140ms ease-in;
}

.page-view-enter-from {
  opacity: 0;
  transform: translateY(4px);
}

.page-view-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .page-view-enter-active,
  .page-view-leave-active {
    transition: none;
  }

  .page-view-enter-from {
    transform: none;
  }
}
</style>
