<script setup lang="ts">
import type { TodoItem } from '@/modules/todo/types'
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  BellRingIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  LogOutIcon,
  UserRoundIcon,
} from '@lucide/vue'
import AppSidebar from '@/components/navigation/AppSidebar.vue'
import AccessDeniedView from '@/views/AccessDeniedView.vue'
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
import { todoRoute, todoSuffix } from '@/modules/todo/lib/navigation'
import { useTodoStore } from '@/modules/todo/stores/todo-store'

const authStore = useAuthStore()
const todoStore = useTodoStore()
const route = useRoute()
const router = useRouter()
const currentUserName = computed(() => authStore.user?.name ?? '平台管理员')
const currentUsername = computed(() => authStore.user?.username ?? 'admin')
const currentPageTitle = computed(() => String(route.meta.title ?? '未命名页面'))
const currentSectionTitle = computed(() => route.meta.sectionTitle
  ? String(route.meta.sectionTitle)
  : '')
const pageAuthorized = computed(() => {
  const menuPath = typeof route.meta.menuPath === 'string' ? route.meta.menuPath : ''
  const permission = typeof route.meta.requiredPermission === 'string' ? route.meta.requiredPermission : ''
  if (!menuPath) return true
  return authStore.canAccessPath(menuPath) && (!permission || authStore.hasPermission(permission))
})
const visibleTodos = computed(() => todoStore.visibleItems.filter((item) => {
  const path = router.resolve(todoRoute(item)).path
  return authStore.canAccessPath(path)
}))
const visibleTodoCount = computed(() => visibleTodos.value.reduce((total, item) => total + item.count, 0))

async function handleTodo(item: TodoItem) {
  const target = todoRoute(item)
  if (authStore.canAccessPath(router.resolve(target).path)) await router.push(target)
}

async function handleLogout() {
  await authStore.logout()
  await router.replace({ name: 'login' })
}

watch(
  () => route.name,
  () => void todoStore.refresh(),
  { immediate: true },
)
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

        <div class="ml-auto flex min-w-0 items-center gap-2">
          <div id="admin-page-actions" class="contents" />
          <div v-if="visibleTodos.length" class="hidden max-w-[600px] items-center gap-1 overflow-x-auto rounded-full border border-primary/20 bg-primary/6 p-1 xl:flex" aria-label="运营待办">
            <BellRingIcon class="mx-1 size-4 shrink-0 text-primary" aria-hidden="true" />
            <button
              v-for="item in visibleTodos"
              :key="item.key"
              type="button"
              class="inline-flex min-h-8 shrink-0 cursor-pointer items-center gap-1 rounded-full border border-primary/20 bg-card px-2.5 text-[11px] text-primary transition-colors duration-150 hover:border-primary/45 hover:bg-primary/8 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none"
              @click="handleTodo(item)"
            >
              {{ item.label }}
              <strong class="tabular-nums" :class="item.key === 'content_draft' ? 'text-primary' : 'text-danger'">{{ item.count }}</strong>
              {{ todoSuffix(item) }}
            </button>
          </div>

          <DropdownMenu v-if="visibleTodos.length">
            <DropdownMenuTrigger as-child>
              <Button variant="outline" size="icon" class="relative xl:hidden" :aria-label="`查看 ${visibleTodoCount} 项运营待办`">
                <BellRingIcon aria-hidden="true" />
                <span class="absolute -right-1 -top-1 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[9px] font-bold leading-4 text-white">{{ visibleTodoCount }}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" :side-offset="8" class="w-64">
              <DropdownMenuLabel>运营待办</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                v-for="item in visibleTodos"
                :key="item.key"
                class="min-h-10 cursor-pointer justify-between"
                @select="handleTodo(item)"
              >
                <span>{{ item.label }}</span>
                <strong class="tabular-nums text-danger">{{ item.count }} {{ todoSuffix(item) }}</strong>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

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
        <RouterView v-if="pageAuthorized" v-slot="{ Component, route: resolvedRoute }">
          <Transition name="page-view" mode="out-in">
            <component :is="Component" :key="String(resolvedRoute.name ?? resolvedRoute.path)" />
          </Transition>
        </RouterView>
        <AccessDeniedView v-else />
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
