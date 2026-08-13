<script setup lang="ts">
import type { PermissionWriteInput, SystemPermission, ValidationIssue } from '../types'
import { computed, nextTick, ref } from 'vue'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { buildPermissionTree, flattenPermissionTree, getDescendantPermissionIds, PERMISSION_TYPE_LABELS } from '../lib/rbac'
import FormError from './FormError.vue'

const ROOT_VALUE = '__root__'

const props = withDefaults(defineProps<{
  value: PermissionWriteInput
  permissions: readonly SystemPermission[]
  editingId?: string | null
  issues?: readonly ValidationIssue<keyof PermissionWriteInput>[]
  saving?: boolean
  builtIn?: boolean
}>(), {
  editingId: null,
  issues: () => [],
  saving: false,
  builtIn: false,
})

const emit = defineEmits<{
  'update:value': [value: PermissionWriteInput]
}>()

const fieldsRef = ref<HTMLDivElement | null>(null)
const issueMap = computed(() => new Map(props.issues.map((issue) => [issue.field, issue.message])))
const parentOptions = computed(() => {
  const excludedIds = new Set(props.editingId
    ? [props.editingId, ...getDescendantPermissionIds(props.editingId, props.permissions)]
    : [])
  return flattenPermissionTree(buildPermissionTree(props.permissions))
    .filter((item) => {
      if (excludedIds.has(item.id) || item.type === 'button') return false
      if (props.value.type === 'button') return item.type === 'menu'
      if (props.value.type === 'directory') return item.type === 'directory'
      return true
    })
})

function patch(patchValue: Partial<PermissionWriteInput>): void {
  emit('update:value', { ...props.value, ...patchValue })
}

function updateType(type: PermissionWriteInput['type']): void {
  const parent = props.permissions.find((item) => item.id === props.value.parentId)
  const parentIsValid = !parent ||
    (type === 'button' && parent.type === 'menu') ||
    (type === 'directory' && parent.type === 'directory') ||
    (type === 'menu' && parent.type !== 'button')
  patch({
    type,
    parentId: parentIsValid ? props.value.parentId : null,
    routePath: type === 'menu' ? props.value.routePath : '',
    visible: type === 'button' ? false : props.value.visible,
  })
}

function updateParent(value: unknown): void {
  patch({ parentId: value === ROOT_VALUE ? null : String(value) })
}

function updatePermissionType(value: unknown): void {
  updateType(String(value) as PermissionWriteInput['type'])
}

function updateSort(value: string | number): void {
  patch({ sort: String(value).trim() ? Number(value) : Number.NaN })
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
    <div class="col-span-2 space-y-2">
      <Label for="permission-parent">上级权限</Label>
      <Select :model-value="value.parentId ?? ROOT_VALUE" :disabled="saving || builtIn" @update:model-value="updateParent">
        <SelectTrigger id="permission-parent" data-field="parentId" class="h-11 w-full" :aria-invalid="Boolean(issueMap.get('parentId'))"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem :value="ROOT_VALUE">顶级权限</SelectItem>
          <SelectItem v-for="item in parentOptions" :key="item.id" :value="item.id">
            {{ '—'.repeat(item.depth) }}{{ item.name }}（{{ PERMISSION_TYPE_LABELS[item.type] }}）
          </SelectItem>
        </SelectContent>
      </Select>
      <FormError :message="issueMap.get('parentId')" />
    </div>
    <div class="space-y-2">
      <Label for="permission-type">权限类型 <span class="text-destructive">*</span></Label>
      <Select :model-value="value.type" :disabled="saving || builtIn" @update:model-value="updatePermissionType">
        <SelectTrigger id="permission-type" data-field="type" class="h-11 w-full"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="directory">目录</SelectItem><SelectItem value="menu">菜单</SelectItem><SelectItem value="button">按钮</SelectItem></SelectContent>
      </Select>
    </div>
    <div class="space-y-2">
      <Label for="permission-name">权限名称 <span class="text-destructive">*</span></Label>
      <Input id="permission-name" data-field="name" :model-value="value.name" class="h-11" placeholder="例如：新增用户" :disabled="saving" :aria-invalid="Boolean(issueMap.get('name'))" @update:model-value="patch({ name: String($event) })" />
      <FormError :message="issueMap.get('name')" />
    </div>
    <div class="space-y-2">
      <Label for="permission-code">权限标识 <span class="text-destructive">*</span></Label>
      <Input id="permission-code" data-field="code" :model-value="value.code" class="h-11 font-mono" placeholder="例如：system:user:create" :disabled="saving || builtIn" :aria-invalid="Boolean(issueMap.get('code'))" @update:model-value="patch({ code: String($event).toLowerCase() })" />
      <FormError :message="issueMap.get('code')" />
    </div>
    <div class="space-y-2">
      <Label for="permission-sort">显示排序 <span class="text-destructive">*</span></Label>
      <Input id="permission-sort" data-field="sort" type="number" :model-value="Number.isFinite(value.sort) ? value.sort : ''" class="h-11" min="0" max="9999" step="1" inputmode="numeric" :disabled="saving" :aria-invalid="Boolean(issueMap.get('sort'))" @update:model-value="updateSort" />
      <FormError :message="issueMap.get('sort')" />
    </div>
    <div v-if="value.type === 'menu'" class="col-span-2 space-y-2">
      <Label for="permission-route">路由地址 <span class="text-destructive">*</span></Label>
      <Input id="permission-route" data-field="routePath" :model-value="value.routePath" class="h-11 font-mono" placeholder="例如：/system/users" :disabled="saving" :aria-invalid="Boolean(issueMap.get('routePath'))" @update:model-value="patch({ routePath: String($event) })" />
      <FormError :message="issueMap.get('routePath')" />
    </div>
    <div class="col-span-2 space-y-2">
      <div class="flex items-center justify-between gap-3"><Label for="permission-description">说明</Label><span class="text-xs text-muted-foreground">{{ value.description.length }}/300</span></div>
      <Textarea id="permission-description" data-field="description" :model-value="value.description" class="min-h-20" maxlength="300" placeholder="可选，填写权限用途" :disabled="saving" @update:model-value="patch({ description: String($event).slice(0, 300) })" />
      <FormError :message="issueMap.get('description')" />
    </div>
    <div class="col-span-2 grid grid-cols-2 gap-3">
      <div v-if="value.type !== 'button'" class="flex min-h-16 items-center justify-between gap-4 rounded-xl border bg-muted/25 px-3 py-2.5">
        <div><Label for="permission-visible" class="cursor-pointer">菜单可见</Label><p class="mt-1 text-xs text-muted-foreground">控制是否在导航菜单中展示。</p></div>
        <Switch id="permission-visible" :model-value="value.visible" :disabled="saving" @update:model-value="patch({ visible: $event })" />
      </div>
      <div class="flex min-h-16 items-center justify-between gap-4 rounded-xl border bg-muted/25 px-3 py-2.5" :class="value.type === 'button' ? 'col-span-2' : ''">
        <div><Label for="permission-enabled" class="cursor-pointer">启用权限</Label><p class="mt-1 text-xs text-muted-foreground">停用后不再参与角色授权。</p></div>
        <Switch id="permission-enabled" :model-value="value.enabled" :disabled="saving || builtIn" @update:model-value="patch({ enabled: $event })" />
      </div>
    </div>
  </div>
</template>
