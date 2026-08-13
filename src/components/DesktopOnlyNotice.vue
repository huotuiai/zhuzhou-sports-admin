<script setup lang="ts">
import { MonitorUp } from '@lucide/vue'
import BrandMark from '@/components/brand/BrandMark.vue'
import ThemeToggle from '@/components/ThemeToggle.vue'
</script>

<template>
  <main class="tech-grid relative grid min-h-svh place-items-center overflow-hidden bg-background px-6 py-12" aria-labelledby="desktop-only-title">
    <div class="pointer-events-none absolute inset-0" aria-hidden="true">
      <div class="absolute left-[-8rem] top-[-8rem] size-80 rounded-full bg-primary/10 blur-3xl" />
      <div class="absolute bottom-[-10rem] right-[-8rem] size-96 rounded-full bg-cyan-400/8 blur-3xl" />
    </div>

    <div class="absolute right-4 top-4 z-10">
      <ThemeToggle />
    </div>

    <section class="glass-panel relative z-10 w-full max-w-md rounded-2xl border px-6 py-8 text-center" role="status">
      <div class="mx-auto flex size-16 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10">
        <MonitorUp class="size-7 text-primary" aria-hidden="true" />
      </div>
      <h1 id="desktop-only-title" class="mt-6 text-2xl font-semibold tracking-tight text-foreground">
        请使用电脑访问
      </h1>
      <p class="mt-3 text-sm leading-6 text-muted-foreground">
        本管理平台仅支持 PC 端使用，请在电脑浏览器中打开，或将当前窗口宽度调整至 1024 像素及以上。
      </p>
      <div class="mt-7 flex items-center justify-center gap-3 border-t border-border/70 pt-5">
        <BrandMark :size="30" />
        <div class="text-left">
          <p class="text-xs font-semibold text-foreground">株洲体育中心</p>
          <p class="mt-0.5 text-[11px] text-muted-foreground">智慧管理平台</p>
        </div>
      </div>
    </section>
  </main>
</template>
