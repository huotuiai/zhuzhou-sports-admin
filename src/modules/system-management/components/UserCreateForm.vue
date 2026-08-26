<script setup lang="ts">
import type { SystemDepartment, SystemRole, UserCreateInput, ValidationIssue } from '../types'
import { computed, nextTick, ref } from 'vue'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import DepartmentTreeSelector from './DepartmentTreeSelector.vue'
import FormError from './FormError.vue'
import RoleSelector from './RoleSelector.vue'

const props = withDefaults(defineProps<{
  value: UserCreateInput
  departments: readonly SystemDepartment[]
  roles: readonly SystemRole[]
  issues?: readonly ValidationIssue<keyof UserCreateInput>[]
  saving?: boolean
}>(), { issues: () => [], saving: false })

const emit = defineEmits<{ 'update:value': [value: UserCreateInput] }>()
const fieldsRef = ref<HTMLDivElement | null>(null)
const issueMap = computed(() => new Map(props.issues.map(issue => [issue.field, issue.message])))

function patch(value: Partial<UserCreateInput>): void { emit('update:value', { ...props.value, ...value }) }
function validateAndFocus(): boolean {
  const issue = props.issues[0]
  if (issue) nextTick(() => fieldsRef.value?.querySelector<HTMLElement>(`[data-field="${issue.field}"]`)?.focus())
  return !issue && !props.saving
}
defineExpose({ validateAndFocus })
</script>

<template>
  <div ref="fieldsRef" class="grid gap-x-4 gap-y-5 sm:grid-cols-2">
    <div class="space-y-2">
      <Label for="create-user-username">用户名 <span class="text-destructive">*</span></Label>
      <Input id="create-user-username" data-field="username" :model-value="value.username" class="h-11 font-mono" placeholder="字母开头，4–32 位字母、数字或下划线" autocomplete="off" :disabled="saving" :aria-invalid="Boolean(issueMap.get('username'))" @update:model-value="patch({ username: String($event) })" />
      <FormError :message="issueMap.get('username')" />
    </div>
    <div class="space-y-2">
      <Label for="create-user-name">姓名 <span class="text-destructive">*</span></Label>
      <Input id="create-user-name" data-field="name" :model-value="value.name" class="h-11" placeholder="请输入姓名" autocomplete="name" :disabled="saving" :aria-invalid="Boolean(issueMap.get('name'))" @update:model-value="patch({ name: String($event) })" />
      <FormError :message="issueMap.get('name')" />
    </div>
    <div class="space-y-2 sm:col-span-2" data-field="departmentIds" tabindex="-1">
      <div class="flex items-center justify-between gap-3"><Label>所属部门 <span class="text-destructive">*</span></Label><span class="text-xs text-muted-foreground">已选择 {{ value.departmentIds.length }} 个</span></div>
      <DepartmentTreeSelector :departments="departments" :model-value="value.departmentIds" :disabled="saving" :allow-disabled-selected="false" @update:model-value="patch({ departmentIds: $event })" />
      <FormError :message="issueMap.get('departmentIds')" />
    </div>
    <div class="space-y-2 sm:col-span-2" data-field="roleIds" tabindex="-1">
      <div class="flex items-center justify-between gap-3"><Label>绑定角色 <span class="text-destructive">*</span></Label><span class="text-xs text-muted-foreground">已选择 {{ value.roleIds.length }} 个</span></div>
      <RoleSelector :roles="roles" :model-value="value.roleIds" :disabled="saving" @update:model-value="patch({ roleIds: $event })" />
      <FormError :message="issueMap.get('roleIds')" />
    </div>
    <div class="space-y-2 sm:col-span-2">
      <Label for="create-user-phone">手机号</Label>
      <Input id="create-user-phone" data-field="phone" :model-value="value.phone" class="h-11" placeholder="选填，11 位手机号" inputmode="tel" autocomplete="tel" :disabled="saving" :aria-invalid="Boolean(issueMap.get('phone'))" @update:model-value="patch({ phone: String($event) })" />
      <FormError :message="issueMap.get('phone')" />
    </div>
    <div class="space-y-2">
      <Label for="create-user-password">初始密码 <span class="text-destructive">*</span></Label>
      <Input id="create-user-password" data-field="password" type="password" :model-value="value.password" class="h-11" placeholder="8–64 位，包含字母和数字" autocomplete="new-password" :disabled="saving" :aria-invalid="Boolean(issueMap.get('password'))" @update:model-value="patch({ password: String($event) })" />
      <FormError :message="issueMap.get('password')" />
    </div>
    <div class="space-y-2">
      <Label for="create-user-confirm-password">确认密码 <span class="text-destructive">*</span></Label>
      <Input id="create-user-confirm-password" data-field="confirmPassword" type="password" :model-value="value.confirmPassword" class="h-11" placeholder="再次输入初始密码" autocomplete="new-password" :disabled="saving" :aria-invalid="Boolean(issueMap.get('confirmPassword'))" @update:model-value="patch({ confirmPassword: String($event) })" />
      <FormError :message="issueMap.get('confirmPassword')" />
    </div>
    <p class="text-xs leading-5 text-muted-foreground sm:col-span-2">密码仅用于本次创建请求，不会以明文或可恢复形式写入浏览器存储。</p>
  </div>
</template>
