<script setup lang="ts">
import type { DepartmentWriteInput, SystemDepartment, SystemUser, ValidationIssue } from '../types'
import { computed, nextTick, ref } from 'vue'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import FormError from './FormError.vue'
import UserSearchSelect from './UserSearchSelect.vue'

const ROOT_VALUE = '__root__'
const props = withDefaults(defineProps<{
  value: DepartmentWriteInput
  departments: readonly SystemDepartment[]
  users: readonly SystemUser[]
  issues?: readonly ValidationIssue<keyof DepartmentWriteInput>[]
  excludedIds?: readonly string[]
  saving?: boolean
}>(), { issues: () => [], excludedIds: () => [], saving: false })
const emit = defineEmits<{ 'update:value': [value: DepartmentWriteInput] }>()
const fieldsRef = ref<HTMLDivElement | null>(null)
const issueMap = computed(() => new Map(props.issues.map(issue => [issue.field, issue.message])))
const parentOptions = computed(() => props.departments.filter(item => !props.excludedIds.includes(item.id)))
function patch(value: Partial<DepartmentWriteInput>): void { emit('update:value', { ...props.value, ...value }) }
function validateAndFocus(): boolean {
  const issue = props.issues[0]
  if (issue) nextTick(() => fieldsRef.value?.querySelector<HTMLElement>(`[data-field="${issue.field}"]`)?.focus())
  return !issue && !props.saving
}
defineExpose({ validateAndFocus })
</script>

<template>
  <div ref="fieldsRef" class="grid gap-5 sm:grid-cols-2">
    <div class="space-y-2 sm:col-span-2">
      <Label for="department-name">部门名称 <span class="text-destructive">*</span></Label>
      <Input id="department-name" data-field="name" :model-value="value.name" class="h-11" placeholder="请输入部门名称" :disabled="saving" :aria-invalid="Boolean(issueMap.get('name'))" @update:model-value="patch({ name: String($event) })" />
      <FormError :message="issueMap.get('name')" />
    </div>
    <div class="space-y-2">
      <Label for="department-parent">上级部门</Label>
      <Select :model-value="value.parentId ?? ROOT_VALUE" :disabled="saving" @update:model-value="patch({ parentId: $event === ROOT_VALUE ? null : String($event) })">
        <SelectTrigger id="department-parent" data-field="parentId" class="h-11 w-full" :aria-invalid="Boolean(issueMap.get('parentId'))"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem :value="ROOT_VALUE">无（根部门）</SelectItem><SelectItem v-for="department in parentOptions" :key="department.id" :value="department.id">{{ department.name }}</SelectItem></SelectContent>
      </Select>
      <FormError :message="issueMap.get('parentId')" />
    </div>
    <div class="space-y-2">
      <Label for="department-sort">排序 <span class="text-destructive">*</span></Label>
      <Input id="department-sort" data-field="sort" type="number" min="0" max="9999" step="1" :model-value="value.sort" class="h-11" :disabled="saving" :aria-invalid="Boolean(issueMap.get('sort'))" @update:model-value="patch({ sort: Number($event) })" />
      <FormError :message="issueMap.get('sort')" />
    </div>
    <div class="space-y-2 sm:col-span-2" data-field="ownerUserId" tabindex="-1">
      <Label>部门主管</Label>
      <UserSearchSelect :users="users" :model-value="value.ownerUserId" :disabled="saving" @update:model-value="patch({ ownerUserId: $event })" />
      <FormError :message="issueMap.get('ownerUserId')" />
    </div>
    <div class="space-y-2 sm:col-span-2">
      <Label for="department-status">部门状态</Label>
      <Select :model-value="value.status" :disabled="saving" @update:model-value="patch({ status: $event as 'enabled' | 'disabled' })">
        <SelectTrigger id="department-status" data-field="status" class="h-11 w-full"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="enabled">启用</SelectItem><SelectItem value="disabled">停用</SelectItem></SelectContent>
      </Select>
      <p class="text-xs leading-5 text-muted-foreground">停用后保留已有用户关系，但新建或编辑用户时不能新增选择该部门。</p>
    </div>
  </div>
</template>
