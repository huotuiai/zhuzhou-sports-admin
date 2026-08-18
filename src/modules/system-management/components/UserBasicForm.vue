<script setup lang="ts">
import type { SystemDepartment, SystemRole, SystemUser, UserBasicInfoInput, ValidationIssue } from '../types'
import { computed, nextTick, ref } from 'vue'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import DepartmentTreeSelector from './DepartmentTreeSelector.vue'
import FormError from './FormError.vue'
import RoleSelector from './RoleSelector.vue'

const props = withDefaults(defineProps<{
  user: SystemUser
  value: UserBasicInfoInput
  departments: readonly SystemDepartment[]
  roles: readonly SystemRole[]
  issues?: readonly ValidationIssue<keyof UserBasicInfoInput>[]
  saving?: boolean
}>(), { issues: () => [], saving: false })

const emit = defineEmits<{ 'update:value': [value: UserBasicInfoInput] }>()
const fieldsRef = ref<HTMLDivElement | null>(null)
const issueMap = computed(() => new Map(props.issues.map(issue => [issue.field, issue.message])))
const protectedRoleIds = computed(() => props.user.builtIn ? props.roles.filter(role => role.kind === 'super-admin').map(role => role.id) : [])
function patch(value: Partial<UserBasicInfoInput>): void { emit('update:value', { ...props.value, ...value }) }
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
      <Label for="edit-user-username">用户名</Label>
      <Input id="edit-user-username" :model-value="user.username" class="h-11 font-mono" disabled />
    </div>
    <div class="space-y-2">
      <Label for="edit-user-name">姓名 <span class="text-destructive">*</span></Label>
      <Input id="edit-user-name" data-field="name" :model-value="value.name" class="h-11" autocomplete="name" :disabled="saving" :aria-invalid="Boolean(issueMap.get('name'))" @update:model-value="patch({ name: String($event) })" />
      <FormError :message="issueMap.get('name')" />
    </div>
    <div class="space-y-2 sm:col-span-2" data-field="departmentIds" tabindex="-1">
      <div class="flex items-center justify-between gap-3"><Label>所属部门 <span class="text-destructive">*</span></Label><span class="text-xs text-muted-foreground">已选择 {{ value.departmentIds.length }} 个</span></div>
      <DepartmentTreeSelector :departments="departments" :model-value="value.departmentIds" :disabled="saving" @update:model-value="patch({ departmentIds: $event })" />
      <FormError :message="issueMap.get('departmentIds')" />
    </div>
    <div class="space-y-2 sm:col-span-2" data-field="roleIds" tabindex="-1">
      <div class="flex items-center justify-between gap-3"><Label>绑定角色 <span class="text-destructive">*</span></Label><span class="text-xs text-muted-foreground">已选择 {{ value.roleIds.length }} 个</span></div>
      <RoleSelector :roles="roles" :model-value="value.roleIds" :disabled="saving" :protected-role-ids="protectedRoleIds" @update:model-value="patch({ roleIds: $event })" />
      <FormError :message="issueMap.get('roleIds')" />
    </div>
    <div class="space-y-2">
      <Label for="edit-user-phone">手机号</Label>
      <Input id="edit-user-phone" data-field="phone" :model-value="value.phone" class="h-11" placeholder="选填，11 位手机号" inputmode="tel" autocomplete="tel" :disabled="saving" :aria-invalid="Boolean(issueMap.get('phone'))" @update:model-value="patch({ phone: String($event) })" />
      <FormError :message="issueMap.get('phone')" />
    </div>
    <div class="space-y-2">
      <Label for="edit-user-status">账号状态</Label>
      <Select :model-value="value.status" :disabled="saving || user.builtIn || user.status === 'locked'" @update:model-value="patch({ status: $event as 'enabled' | 'disabled' })">
        <SelectTrigger id="edit-user-status" data-field="status" class="h-11 w-full"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="enabled">启用</SelectItem><SelectItem value="disabled">禁用</SelectItem><SelectItem v-if="user.status === 'locked'" value="locked" disabled>锁定（需列表解锁）</SelectItem></SelectContent>
      </Select>
      <p v-if="user.status === 'locked'" class="text-xs text-warning">锁定账号只能在列表操作中解锁。</p>
    </div>
  </div>
</template>
