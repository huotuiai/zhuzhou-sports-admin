<script setup lang="ts">
import type { SystemRole, UserWriteInput, ValidationIssue } from '../types'
import { computed, nextTick, ref } from 'vue'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import FormError from './FormError.vue'
import RoleSelector from './RoleSelector.vue'

const props = withDefaults(defineProps<{
  value: UserWriteInput
  roles: readonly SystemRole[]
  issues?: readonly ValidationIssue<keyof UserWriteInput>[]
  saving?: boolean
  builtIn?: boolean
  mode?: 'create' | 'edit'
}>(), {
  issues: () => [],
  saving: false,
  builtIn: false,
  mode: 'create',
})

const emit = defineEmits<{
  'update:value': [value: UserWriteInput]
}>()

const fieldsRef = ref<HTMLDivElement | null>(null)
const issueMap = computed(() => new Map(props.issues.map((issue) => [issue.field, issue.message])))

function patch(patchValue: Partial<UserWriteInput>): void {
  emit('update:value', { ...props.value, ...patchValue })
}

function validateAndFocus(): boolean {
  const issue = props.issues[0]
  if (issue) {
    nextTick(() => fieldsRef.value?.querySelector<HTMLElement>(`[data-field="${issue.field}"]`)?.focus())
    return false
  }
  return !props.saving
}

defineExpose({ validateAndFocus })
</script>

<template>
  <div ref="fieldsRef" class="grid grid-cols-2 gap-x-4 gap-y-5">
    <div class="space-y-2">
      <Label for="user-username">登录账号 <span class="text-destructive">*</span></Label>
      <Input id="user-username" data-field="username" :model-value="value.username" class="h-11 font-mono" placeholder="例如：admin01" autocomplete="off" :disabled="saving || builtIn" :aria-invalid="Boolean(issueMap.get('username'))" @update:model-value="patch({ username: String($event) })" />
      <FormError :message="issueMap.get('username')" />
    </div>
    <div class="space-y-2">
      <Label for="user-name">用户姓名 <span class="text-destructive">*</span></Label>
      <Input id="user-name" data-field="name" :model-value="value.name" class="h-11" placeholder="请输入真实姓名" autocomplete="name" :disabled="saving" :aria-invalid="Boolean(issueMap.get('name'))" @update:model-value="patch({ name: String($event) })" />
      <FormError :message="issueMap.get('name')" />
    </div>
    <div class="col-span-2 space-y-2">
      <Label for="user-password">{{ mode === 'create' ? '初始密码' : '重置密码' }} <span v-if="mode === 'create'" class="text-destructive">*</span></Label>
      <Input id="user-password" data-field="password" type="password" :model-value="value.password" class="h-11" :placeholder="mode === 'create' ? '请输入 6–32 位初始密码' : '留空表示不修改密码'" autocomplete="new-password" :disabled="saving" :aria-invalid="Boolean(issueMap.get('password'))" @update:model-value="patch({ password: String($event) })" />
      <p v-if="!issueMap.get('password')" class="text-xs leading-5 text-muted-foreground">密码属于写入字段，不会在用户列表或本地档案中明文保存。</p>
      <FormError :message="issueMap.get('password')" />
    </div>
    <div class="space-y-2">
      <Label for="user-phone">手机号</Label>
      <Input id="user-phone" data-field="phone" :model-value="value.phone" class="h-11" placeholder="请输入 11 位手机号" inputmode="tel" autocomplete="tel" :disabled="saving" :aria-invalid="Boolean(issueMap.get('phone'))" @update:model-value="patch({ phone: String($event) })" />
      <FormError :message="issueMap.get('phone')" />
    </div>
    <div class="space-y-2">
      <Label for="user-email">邮箱</Label>
      <Input id="user-email" data-field="email" type="email" :model-value="value.email" class="h-11" placeholder="name@example.com" autocomplete="email" :disabled="saving" :aria-invalid="Boolean(issueMap.get('email'))" @update:model-value="patch({ email: String($event) })" />
      <FormError :message="issueMap.get('email')" />
    </div>
    <div class="col-span-2 space-y-2">
      <Label for="user-department">所属部门 <span class="text-destructive">*</span></Label>
      <Input id="user-department" data-field="department" :model-value="value.department" class="h-11" placeholder="例如：场馆运营部" autocomplete="organization" :disabled="saving" :aria-invalid="Boolean(issueMap.get('department'))" @update:model-value="patch({ department: String($event) })" />
      <FormError :message="issueMap.get('department')" />
    </div>
    <div class="col-span-2 space-y-2" data-field="roleIds" tabindex="-1">
      <div class="flex items-center justify-between gap-3">
        <Label>分配角色 <span class="text-destructive">*</span></Label>
        <span class="text-xs text-muted-foreground">已选择 {{ value.roleIds.length }} 个角色</span>
      </div>
      <RoleSelector :roles="roles" :model-value="value.roleIds" :disabled="saving || builtIn" @update:model-value="patch({ roleIds: $event })" />
      <FormError :message="issueMap.get('roleIds')" />
    </div>
    <div class="col-span-2 space-y-2">
      <div class="flex items-center justify-between gap-3"><Label for="user-remark">备注</Label><span class="text-xs text-muted-foreground">{{ value.remark.length }}/300</span></div>
      <Textarea id="user-remark" data-field="remark" :model-value="value.remark" class="min-h-20" maxlength="300" placeholder="可选，填写用户说明" :disabled="saving" @update:model-value="patch({ remark: String($event).slice(0, 300) })" />
      <FormError :message="issueMap.get('remark')" />
    </div>
    <div class="col-span-2 flex min-h-16 items-center justify-between gap-4 rounded-xl border bg-muted/25 px-3 py-2.5">
      <div><Label for="user-enabled" class="cursor-pointer">启用账号</Label><p class="mt-1 text-xs text-muted-foreground">停用后该用户将不能登录系统。</p></div>
      <Switch id="user-enabled" :model-value="value.enabled" :disabled="saving || builtIn" @update:model-value="patch({ enabled: $event })" />
    </div>
  </div>
</template>
