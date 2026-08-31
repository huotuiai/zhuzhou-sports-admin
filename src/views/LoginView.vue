<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowRightIcon,
  EyeIcon,
  EyeOffIcon,
  KeyRoundIcon,
  LoaderCircleIcon,
  LockKeyholeIcon,
  UserRoundIcon,
} from '@lucide/vue'
import BrandMark from '@/components/brand/BrandMark.vue'
import CaptchaCode from '@/components/login/CaptchaCode.vue'
import TechnologyVisual from '@/components/login/TechnologyVisual.vue'
import ThemeToggle from '@/components/ThemeToggle.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthStore } from '@/stores/auth'
import { isRegisteredAdminPath } from '@/lib/access-control'

type FieldName = 'username' | 'password' | 'captcha'
type FieldErrors = Partial<Record<FieldName, string>>

const CAPTCHA_CHARACTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

const authStore = useAuthStore()
const router = useRouter()
const route = useRoute()

const rememberedUsername = authStore.getRememberedUsername()
const username = ref(rememberedUsername)
const password = ref('')
const captchaInput = ref('')
const rememberUsername = ref(Boolean(rememberedUsername))
const showPassword = ref(false)
const captchaCode = ref(generateCaptcha())
const fieldErrors = ref<FieldErrors>({})
const submitError = ref('')

const hasError = computed(() => Object.keys(fieldErrors.value).length > 0 || Boolean(submitError.value))

function generateCaptcha() {
  const values = crypto.getRandomValues(new Uint32Array(4))
  return Array.from(values, (value) => CAPTCHA_CHARACTERS[value % CAPTCHA_CHARACTERS.length]).join('')
}

function refreshCaptcha() {
  captchaCode.value = generateCaptcha()
  captchaInput.value = ''
  fieldErrors.value.captcha = ''
}

function clearFieldError(field: FieldName) {
  fieldErrors.value[field] = ''
  submitError.value = ''
}

function validateForm() {
  const errors: FieldErrors = {}
  if (!username.value.trim()) errors.username = '请输入登录账号'
  if (!password.value) errors.password = '请输入登录密码'
  if (!captchaInput.value.trim()) {
    errors.captcha = '请输入图形验证码'
  } else if (captchaInput.value.trim().toUpperCase() !== captchaCode.value) {
    errors.captcha = '验证码不正确，请重新输入'
  }
  fieldErrors.value = errors
  return Object.keys(errors).length === 0
}

async function handleSubmit() {
  submitError.value = ''
  if (!validateForm()) {
    await nextTick()
    const firstInvalidField = document.querySelector<HTMLElement>('[aria-invalid="true"]')
    firstInvalidField?.focus()
    return
  }

  try {
    await authStore.login(
      { username: username.value.trim(), password: password.value },
      rememberUsername.value,
    )
    const requestedPath = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/')
      ? route.query.redirect
      : ''
    const target = requestedPath && isRegisteredAdminPath(router.resolve(requestedPath).path)
      ? requestedPath
      : authStore.firstAccessibleRoute ?? { name: 'no-access' }
    await router.replace(target)
  } catch (error) {
    submitError.value = error instanceof Error ? error.message : '登录失败，请稍后重试'
    password.value = ''
    refreshCaptcha()
    await nextTick()
    document.querySelector<HTMLInputElement>('#username')?.focus()
  }
}
</script>

<template>
  <main class="login-shell tech-grid relative min-h-svh overflow-hidden bg-background">
    <a class="skip-link" href="#login-form">跳转到登录表单</a>

    <div class="pointer-events-none absolute inset-0" aria-hidden="true">
      <div class="absolute -left-24 top-[-8rem] size-[32rem] rounded-full bg-sky-500/10 blur-3xl dark:bg-sky-500/14" />
      <div class="absolute -right-32 bottom-[-12rem] size-[38rem] rounded-full bg-cyan-400/10 blur-3xl dark:bg-cyan-400/12" />
    </div>

    <header class="absolute inset-x-0 top-0 z-20 flex h-20 items-center justify-between px-5 sm:px-8 lg:px-12">
      <div class="flex items-center gap-3 lg:hidden">
        <BrandMark :size="36" />
        <div>
          <p class="text-sm font-semibold text-foreground">株洲体育中心</p>
          <p class="text-[11px] text-muted-foreground">智慧管理平台</p>
        </div>
      </div>
      <div class="ml-auto flex items-center gap-2">
        <ThemeToggle />
      </div>
    </header>

    <div class="relative z-10 mx-auto grid min-h-svh w-full max-w-[1480px] items-center gap-10 px-5 py-24 sm:px-8 lg:grid-cols-[1.08fr_0.92fr] lg:gap-20 lg:px-12 xl:px-20">
      <section class="relative hidden lg:flex lg:min-h-[660px] lg:items-center lg:justify-center" aria-label="科技视觉装饰">
        <div class="absolute left-0 top-1 flex items-center gap-3">
          <BrandMark :size="42" />
          <div>
            <p class="text-sm font-semibold tracking-[0.12em] text-foreground">株洲体育中心</p>
            <p class="mt-1 text-[11px] tracking-[0.24em] text-muted-foreground">SMART MANAGEMENT PLATFORM</p>
          </div>
        </div>
        <TechnologyVisual />
      </section>

      <section class="mx-auto w-full max-w-[460px]" aria-labelledby="login-title">
        <Card class="glass-strong border-white/30 py-0 shadow-[0_32px_100px_rgba(2,6,23,0.25)] dark:border-white/10">
          <CardHeader class="gap-2 border-b border-border/60 px-6 pb-5 pt-7 sm:px-8 sm:pt-8">
            <div class="mb-2 flex items-center justify-between">
              <div class="grid size-10 place-items-center rounded-xl bg-primary/12 text-primary">
                <KeyRoundIcon class="size-5" aria-hidden="true" />
              </div>
            </div>
            <CardTitle id="login-title" class="text-2xl font-semibold tracking-tight">欢迎登录</CardTitle>
            <CardDescription class="text-sm leading-6">请使用政务工作账号进入智慧管理平台</CardDescription>
          </CardHeader>

          <CardContent class="px-6 pb-7 pt-6 sm:px-8 sm:pb-8">
            <form id="login-form" class="space-y-5" novalidate @submit.prevent="handleSubmit">
              <div class="space-y-2">
                <Label for="username">登录账号</Label>
                <div class="relative">
                  <UserRoundIcon class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input
                    id="username"
                    v-model="username"
                    name="username"
                    type="text"
                    autocomplete="username"
                    placeholder="请输入登录账号"
                    class="h-11 pl-10"
                    :aria-invalid="Boolean(fieldErrors.username)"
                    :aria-describedby="fieldErrors.username ? 'username-error' : undefined"
                    @input="clearFieldError('username')"
                  />
                </div>
                <p v-if="fieldErrors.username" id="username-error" class="text-xs text-destructive">{{ fieldErrors.username }}</p>
              </div>

              <div class="space-y-2">
                <Label for="password">登录密码</Label>
                <div class="relative">
                  <LockKeyholeIcon class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input
                    id="password"
                    v-model="password"
                    name="password"
                    :type="showPassword ? 'text' : 'password'"
                    autocomplete="current-password"
                    placeholder="请输入登录密码"
                    class="h-11 px-10"
                    :aria-invalid="Boolean(fieldErrors.password)"
                    :aria-describedby="fieldErrors.password ? 'password-error' : undefined"
                    @input="clearFieldError('password')"
                  />
                  <button
                    type="button"
                    class="absolute right-0 top-0 grid size-11 place-items-center rounded-r-lg text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    :aria-label="showPassword ? '隐藏密码' : '显示密码'"
                    @click="showPassword = !showPassword"
                  >
                    <EyeOffIcon v-if="showPassword" class="size-4" aria-hidden="true" />
                    <EyeIcon v-else class="size-4" aria-hidden="true" />
                  </button>
                </div>
                <p v-if="fieldErrors.password" id="password-error" class="text-xs text-destructive">{{ fieldErrors.password }}</p>
              </div>

              <div class="space-y-2">
                <Label for="captcha">图形验证码</Label>
                <div class="grid grid-cols-[1fr_auto] gap-2">
                  <Input
                    id="captcha"
                    v-model="captchaInput"
                    name="captcha"
                    type="text"
                    inputmode="text"
                    autocomplete="off"
                    maxlength="4"
                    placeholder="输入验证码"
                    class="h-11 uppercase tracking-widest"
                    :aria-invalid="Boolean(fieldErrors.captcha)"
                    :aria-describedby="fieldErrors.captcha ? 'captcha-error' : undefined"
                    @input="clearFieldError('captcha')"
                  />
                  <CaptchaCode :code="captchaCode" @refresh="refreshCaptcha" />
                </div>
                <p v-if="fieldErrors.captcha" id="captcha-error" class="text-xs text-destructive">{{ fieldErrors.captcha }}</p>
              </div>

              <div class="flex items-center justify-between gap-4">
                <Label for="remember-username" class="flex cursor-pointer items-center gap-2 text-xs font-normal text-muted-foreground">
                  <Checkbox id="remember-username" v-model="rememberUsername" />
                  记住登录账号
                </Label>
              </div>

              <div
                v-if="submitError"
                class="rounded-lg border border-destructive/25 bg-destructive/8 px-3 py-2.5 text-sm text-destructive"
                role="alert"
              >
                {{ submitError }}
              </div>

              <Button type="submit" size="lg" class="h-11 w-full shadow-[0_12px_30px_rgba(2,132,199,0.22)]" :disabled="authStore.isLoading">
                <LoaderCircleIcon v-if="authStore.isLoading" class="size-4 animate-spin" aria-hidden="true" />
                <template v-if="authStore.isLoading">正在安全登录...</template>
                <template v-else>进入管理平台<ArrowRightIcon class="ml-1 size-4" aria-hidden="true" /></template>
              </Button>

              <p class="sr-only" aria-live="polite">
                {{ authStore.isLoading ? '正在验证登录信息' : hasError ? '登录表单存在错误' : '' }}
              </p>
            </form>
          </CardContent>
        </Card>

      </section>
    </div>
  </main>
</template>
