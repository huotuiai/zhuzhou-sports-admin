<script setup lang="ts">
import { computed } from 'vue'
import { ArrowRight, LogOut, ShieldX } from '@lucide/vue'
import { useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()
const router = useRouter()
const firstTarget = computed(() => authStore.firstAccessibleRoute)

async function goToAccessiblePage(): Promise<void> {
  if (firstTarget.value) await router.replace(firstTarget.value)
}

async function logout(): Promise<void> {
  await authStore.logout()
  await router.replace({ name: 'login' })
}
</script>

<template>
  <section class="tech-grid grid min-h-[calc(100svh-4rem)] place-items-center p-6" aria-labelledby="access-denied-title">
    <div class="w-full max-w-lg rounded-2xl border bg-card/90 p-8 text-center shadow-xl backdrop-blur-xl">
      <span class="mx-auto grid size-16 place-items-center rounded-2xl border border-destructive/25 bg-destructive/10 text-destructive">
        <ShieldX class="size-8" aria-hidden="true" />
      </span>
      <p class="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-destructive">403 Forbidden</p>
      <h1 id="access-denied-title" class="mt-2 text-2xl font-semibold tracking-tight">暂无页面访问权限</h1>
      <p class="mt-3 text-sm leading-6 text-muted-foreground">当前账号未获授权访问此页面。如工作职责已调整，请联系系统管理员更新角色权限后重新登录。</p>
      <div class="mt-7 flex flex-wrap justify-center gap-3">
        <Button v-if="firstTarget" size="lg" class="h-11" @click="goToAccessiblePage"><ArrowRight aria-hidden="true" />前往可访问页面</Button>
        <Button variant="outline" size="lg" class="h-11" @click="logout"><LogOut aria-hidden="true" />退出登录</Button>
      </div>
    </div>
  </section>
</template>
