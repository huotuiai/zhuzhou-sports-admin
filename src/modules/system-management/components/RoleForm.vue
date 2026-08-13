<script setup lang="ts">
import type { RoleWriteInput, SystemPermission, ValidationIssue } from '../types'
import { computed, nextTick, ref } from 'vue'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import FormError from './FormError.vue'
import PermissionTreeSelector from './PermissionTreeSelector.vue'

const props = withDefaults(defineProps<{
  value: RoleWriteInput
  permissions: readonly SystemPermission[]
  issues?: readonly ValidationIssue<keyof RoleWriteInput>[]
  saving?: boolean
  builtIn?: boolean
}>(), {
  issues: () => [],
  saving: false,
  builtIn: false,
})

const emit = defineEmits<{
  'update:value': [value: RoleWriteInput]
}>()

const fieldsRef = ref<HTMLDivElement | null>(null)
const issueMap = computed(() => new Map(props.issues.map((issue) => [issue.field, issue.message])))

function patch(patchValue: Partial<RoleWriteInput>): void {
  emit('update:value', { ...props.value, ...patchValue })
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
    <div class="space-y-2">
      <Label for="role-name">角色名称 <span class="text-destructive">*</span></Label>
      <Input id="role-name" data-field="name" :model-value="value.name" class="h-11" placeholder="例如：场馆运营人员" :disabled="saving" :aria-invalid="Boolean(issueMap.get('name'))" @update:model-value="patch({ name: String($event) })" />
      <FormError :message="issueMap.get('name')" />
    </div>
    <div class="space-y-2">
      <Label for="role-code">角色编码 <span class="text-destructive">*</span></Label>
      <Input id="role-code" data-field="code" :model-value="value.code" class="h-11 font-mono uppercase" placeholder="例如：VENUE_OPERATOR" :disabled="saving || builtIn" :aria-invalid="Boolean(issueMap.get('code'))" @update:model-value="patch({ code: String($event).toUpperCase() })" />
      <FormError :message="issueMap.get('code')" />
    </div>
    <div class="space-y-2">
      <Label for="role-sort">显示排序 <span class="text-destructive">*</span></Label>
      <Input id="role-sort" data-field="sort" type="number" :model-value="Number.isFinite(value.sort) ? value.sort : ''" class="h-11" min="0" max="9999" step="1" inputmode="numeric" :disabled="saving" :aria-invalid="Boolean(issueMap.get('sort'))" @update:model-value="updateSort" />
      <FormError :message="issueMap.get('sort')" />
    </div>
    <div class="space-y-2">
      <Label for="role-data-scope">数据范围 <span class="text-destructive">*</span></Label>
      <Select :model-value="value.dataScope" :disabled="saving" @update:model-value="patch({ dataScope: String($event) as RoleWriteInput['dataScope'] })">
        <SelectTrigger id="role-data-scope" data-field="dataScope" class="h-11 w-full"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全部数据</SelectItem>
          <SelectItem value="department-and-children">本部门及下级数据</SelectItem>
          <SelectItem value="department">本部门数据</SelectItem>
          <SelectItem value="self">仅本人数据</SelectItem>
        </SelectContent>
      </Select>
    </div>
    <div class="col-span-2 space-y-2" data-field="permissionIds" tabindex="-1">
      <div class="flex items-center justify-between gap-3"><Label>选择权限 <span class="text-destructive">*</span></Label><span class="text-xs text-muted-foreground">勾选菜单或按钮，父级权限将自动关联</span></div>
      <PermissionTreeSelector :permissions="permissions" :model-value="value.permissionIds" :disabled="saving || builtIn" @update:model-value="patch({ permissionIds: $event })" />
      <FormError :message="issueMap.get('permissionIds')" />
    </div>
    <div class="col-span-2 space-y-2">
      <div class="flex items-center justify-between gap-3"><Label for="role-remark">备注</Label><span class="text-xs text-muted-foreground">{{ value.remark.length }}/300</span></div>
      <Textarea id="role-remark" data-field="remark" :model-value="value.remark" class="min-h-20" maxlength="300" placeholder="可选，填写角色职责说明" :disabled="saving" @update:model-value="patch({ remark: String($event).slice(0, 300) })" />
      <FormError :message="issueMap.get('remark')" />
    </div>
    <div class="col-span-2 flex min-h-16 items-center justify-between gap-4 rounded-xl border bg-muted/25 px-3 py-2.5">
      <div><Label for="role-enabled" class="cursor-pointer">启用角色</Label><p class="mt-1 text-xs text-muted-foreground">停用后不能再分配给新用户，已有用户关联会保留。</p></div>
      <Switch id="role-enabled" :model-value="value.enabled" :disabled="saving || builtIn" @update:model-value="patch({ enabled: $event })" />
    </div>
  </div>
</template>
