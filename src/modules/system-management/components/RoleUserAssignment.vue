<script setup lang="ts">
import type { SystemDepartment, SystemUser } from '../types'
import { computed, ref, watch } from 'vue'
import { Search, UserMinus, UserPlus, Users } from '@lucide/vue'
import { PaginationBar } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { departmentNamesForUser } from '../lib/rbac'

const PAGE_SIZES = [20, 50, 100] as const
const PAGE_SIZE = PAGE_SIZES[0]

const props = withDefaults(defineProps<{
  users: readonly SystemUser[]
  departments: readonly SystemDepartment[]
  modelValue: readonly string[]
  protectedUserIds?: readonly string[]
  disabled?: boolean
}>(), {
  protectedUserIds: () => [],
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string[]]
}>()

const keyword = ref('')
const page = ref(1)
const pageSize = ref<number>(PAGE_SIZE)
const selectedSet = computed(() => new Set(props.modelValue))
const protectedSet = computed(() => new Set(props.protectedUserIds))
const boundUsers = computed(() => props.users.filter((user) => selectedSet.value.has(user.id)))
const candidates = computed(() => {
  const query = keyword.value.trim().normalize('NFKC').toLocaleLowerCase('zh-CN')
  return props.users.filter((user) => {
    if (selectedSet.value.has(user.id)) return false
    if (!query) return true
    return [user.name, user.username, user.phone, ...departmentNamesForUser(user, props.departments)].join(' ').normalize('NFKC').toLocaleLowerCase('zh-CN').includes(query)
  })
})
const paginatedCandidates = computed(() => candidates.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))

watch([keyword, () => props.modelValue], () => { page.value = 1 })

function setPageSize(value: number): void {
  if (!PAGE_SIZES.includes(value as typeof PAGE_SIZES[number])) return
  pageSize.value = value
  page.value = 1
}

function addUser(userId: string, checked: boolean | 'indeterminate'): void {
  if (checked !== true || props.disabled) return
  emit('update:modelValue', [...new Set([...props.modelValue, userId])])
}

function removeUser(userId: string): void {
  if (props.disabled || protectedSet.value.has(userId)) return
  emit('update:modelValue', props.modelValue.filter((id) => id !== userId))
}
</script>

<template>
  <div class="grid min-h-0 gap-5 md:grid-cols-2">
    <section class="min-w-0 md:border-r md:pr-5" aria-labelledby="bound-user-title">
      <div class="mb-3 flex items-center justify-between gap-3">
        <h3 id="bound-user-title" class="flex items-center gap-2 text-sm font-semibold">
          <Users class="size-4 text-primary" aria-hidden="true" />已绑定用户
        </h3>
        <span class="rounded-full border bg-muted/40 px-2 py-0.5 text-xs tabular-nums">{{ boundUsers.length }}</span>
      </div>
      <div class="max-h-80 space-y-2 overflow-y-auto pr-1">
        <div v-for="user in boundUsers" :key="user.id" class="flex min-h-14 items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
          <span class="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{{ user.name.slice(0, 1) }}</span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-medium">{{ user.name }}</span>
            <span class="mt-0.5 block truncate text-xs text-muted-foreground">{{ user.username }} · {{ departmentNamesForUser(user, departments).join(' / ') || '未分配部门' }}</span>
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            class="h-10 w-10 text-destructive hover:text-destructive"
            :disabled="disabled || protectedSet.has(user.id)"
            :aria-label="protectedSet.has(user.id) ? `${user.name}不能解除超级管理员角色` : `移除${user.name}`"
            :title="protectedSet.has(user.id) ? '内置管理员不能解除超级管理员角色' : undefined"
            @click="removeUser(user.id)"
          >
            <UserMinus aria-hidden="true" />
          </Button>
        </div>
        <div v-if="boundUsers.length === 0" class="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          该角色暂未绑定用户
        </div>
      </div>
    </section>

    <section class="min-w-0" aria-labelledby="candidate-user-title">
      <div class="mb-3 flex items-center justify-between gap-3">
        <h3 id="candidate-user-title" class="flex items-center gap-2 text-sm font-semibold">
          <UserPlus class="size-4 text-primary" aria-hidden="true" />全部用户
        </h3>
        <span class="text-xs text-muted-foreground">勾选后加入已绑定列表</span>
      </div>
      <div class="relative mb-3">
        <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input v-model="keyword" class="h-11 pl-9" placeholder="搜索姓名、账号、手机号或部门" :disabled="disabled" />
      </div>
      <div class="max-h-60 space-y-2 overflow-y-auto pr-1">
        <label
          v-for="user in paginatedCandidates"
          :key="user.id"
          class="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border bg-background/70 p-3 transition-colors hover:border-primary/35 hover:bg-primary/5"
          :class="disabled ? 'cursor-not-allowed opacity-60' : ''"
        >
          <Checkbox :model-value="false" :disabled="disabled" :aria-label="`绑定用户：${user.name}`" @update:model-value="addUser(user.id, $event)" />
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-medium">{{ user.name }}</span>
            <span class="mt-0.5 block truncate text-xs text-muted-foreground">{{ user.username }} · {{ departmentNamesForUser(user, departments).join(' / ') || '未分配部门' }}</span>
          </span>
        </label>
        <div v-if="paginatedCandidates.length === 0" class="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          {{ keyword ? '没有匹配的未绑定用户' : '所有用户均已绑定' }}
        </div>
      </div>
      <PaginationBar
        v-if="candidates.length > 0"
        class="mt-3"
        :page="page"
        :page-size="pageSize"
        :page-sizes="PAGE_SIZES"
        :total="candidates.length"
        :disabled="disabled"
        @update:page="page = $event"
        @update:page-size="setPageSize"
      />
    </section>
  </div>
</template>
