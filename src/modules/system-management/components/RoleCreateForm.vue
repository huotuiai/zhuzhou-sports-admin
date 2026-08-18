<script setup lang="ts">
import type { RoleCreateInput, SystemPermission, SystemRole, ValidationIssue } from '../types'
import { computed, nextTick, ref } from 'vue'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import FormError from './FormError.vue'
import PermissionTreeSelector from './PermissionTreeSelector.vue'

const NO_REFERENCE = '__none__'

const props = withDefaults(defineProps<{
  value: RoleCreateInput
  referenceRoleId: string | null
  roles: readonly SystemRole[]
  permissions: readonly SystemPermission[]
  issues?: readonly ValidationIssue<keyof RoleCreateInput>[]
  saving?: boolean
}>(), {
  issues: () => [],
  saving: false,
})

const emit = defineEmits<{
  'update:value': [value: RoleCreateInput]
  'update:referenceRoleId': [value: string | null]
}>()

const fieldsRef = ref<HTMLDivElement | null>(null)
const issueMap = computed(() => new Map(props.issues.map((issue) => [issue.field, issue.message])))

function patch(value: Partial<RoleCreateInput>): void {
  emit('update:value', { ...props.value, ...value })
}

function updateReference(value: unknown): void {
  const id = String(value)
  const role = props.roles.find((item) => item.id === id)
  emit('update:referenceRoleId', role?.id ?? null)
  patch({ permissionIds: role ? [...role.permissionIds] : [] })
}

function validateAndFocus(): boolean {
  const issue = props.issues[0]
  if (!issue) return !props.saving
  nextTick(() => fieldsRef.value?.querySelector<HTMLElement>(`[data-field="${issue.field}"]`)?.focus())
  return false
}

defineExpose({ validateAndFocus })
</script>

<template>
  <div ref="fieldsRef" class="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">
    <div class="space-y-2">
      <div class="flex items-center justify-between gap-3">
        <Label for="role-create-name">角色名称 <span class="text-destructive" aria-hidden="true">*</span></Label>
        <span class="text-xs tabular-nums text-muted-foreground">{{ Array.from(value.name).length }}/20</span>
      </div>
      <Input
        id="role-create-name"
        data-field="name"
        :model-value="value.name"
        class="h-11"
        maxlength="20"
        placeholder="请输入 2–20 个字符"
        :disabled="saving"
        :aria-invalid="Boolean(issueMap.get('name'))"
        @update:model-value="patch({ name: String($event) })"
      />
      <FormError :message="issueMap.get('name')" />
    </div>

    <div class="space-y-2">
      <Label for="role-copy-reference">复制参考角色 <span class="text-xs font-normal text-muted-foreground">选填</span></Label>
      <Select :model-value="referenceRoleId ?? NO_REFERENCE" :disabled="saving" @update:model-value="updateReference">
        <SelectTrigger id="role-copy-reference" class="h-11 w-full bg-background">
          <SelectValue placeholder="不复制（空白开始）" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem :value="NO_REFERENCE">不复制（空白开始）</SelectItem>
          <SelectItem v-for="role in roles" :key="role.id" :value="role.id">{{ role.name }}</SelectItem>
        </SelectContent>
      </Select>
      <p class="text-xs leading-5 text-muted-foreground">选择后会替换为参考角色的权限，仍可继续调整。</p>
    </div>

    <div class="space-y-2 sm:col-span-2">
      <div class="flex items-center justify-between gap-3">
        <Label for="role-create-description">描述</Label>
        <span class="text-xs tabular-nums text-muted-foreground">{{ Array.from(value.description).length }}/300</span>
      </div>
      <Textarea
        id="role-create-description"
        data-field="description"
        :model-value="value.description"
        class="min-h-20"
        maxlength="300"
        placeholder="选填，填写角色职责说明"
        :disabled="saving"
        :aria-invalid="Boolean(issueMap.get('description'))"
        @update:model-value="patch({ description: String($event) })"
      />
      <FormError :message="issueMap.get('description')" />
    </div>

    <div class="space-y-2 sm:col-span-2" data-field="permissionIds" tabindex="-1">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <Label>权限范围 <span class="text-destructive" aria-hidden="true">*</span></Label>
        <span class="text-xs text-muted-foreground">至少选择 1 个功能点；操作包含页面内所有写操作</span>
      </div>
      <PermissionTreeSelector
        :permissions="permissions"
        :model-value="value.permissionIds"
        :disabled="saving"
        @update:model-value="patch({ permissionIds: $event })"
      />
      <FormError :message="issueMap.get('permissionIds')" />
    </div>
  </div>
</template>
