<script setup lang="ts">
import type { DepartmentTreeNode, DepartmentWriteInput, SystemDepartment, ValidationIssue } from '../types'
import { computed, nextTick, ref, watch } from 'vue'
import { Building2, ChevronDown, ChevronRight, CirclePlus, LoaderCircle, PencilLine, Plus, Save, Trash2, UserRound, Users, X } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { buildDepartmentTree, getDepartmentDescendantIds } from '../lib/rbac'
import { validateDepartmentInput } from '../services/rbac-service'
import { useRbacStore } from '../stores/rbac-store'
import { useUnsavedDialogGuard } from '../composables/use-unsaved-dialog-guard'
import DepartmentForm from './DepartmentForm.vue'

interface FormHandle { validateAndFocus(): boolean }
type EditMode = 'view' | 'create' | 'edit'
type PendingAction = { type: 'close' } | { type: 'cancel' } | { type: 'select'; id: string }

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()
const store = useRbacStore()
const selectedId = ref<string | null>(null)
const expandedIds = ref(new Set<string>())
const mode = ref<EditMode>('view')
const formValue = ref<DepartmentWriteInput>({ parentId: null, name: '', ownerUserId: null, sort: 0, status: 'enabled' })
const initialValue = ref<DepartmentWriteInput>({ ...formValue.value })
const issues = ref<readonly ValidationIssue<keyof DepartmentWriteInput>[]>([])
const formRef = ref<FormHandle | null>(null)
const pendingAction = ref<PendingAction | null>(null)
const deleteTarget = ref<SystemDepartment | null>(null)

const roots = computed(() => buildDepartmentTree(store.departments))
const visibleRows = computed(() => {
  const rows: DepartmentTreeNode[] = []
  const visit = (nodes: readonly DepartmentTreeNode[]) => {
    for (const node of nodes) {
      rows.push(node)
      if (expandedIds.value.has(node.id)) visit(node.children)
    }
  }
  visit(roots.value)
  return rows
})
const selected = computed(() => store.departments.find(item => item.id === selectedId.value) ?? null)
const formDirty = computed(() => JSON.stringify(formValue.value) !== JSON.stringify(initialValue.value))
const excludedParentIds = computed(() => mode.value === 'edit' && selected.value
  ? [selected.value.id, ...getDepartmentDescendantIds(selected.value.id, store.departments)]
  : [])
const selectedParent = computed(() => store.departments.find(item => item.id === selected.value?.parentId) ?? null)
const selectedOwner = computed(() => store.users.find(user => user.id === selected.value?.ownerUserId) ?? null)
const selectedChildCount = computed(() => store.departments.filter(item => item.parentId === selected.value?.id).length)
const selectedUserCount = computed(() => store.users.filter(user => selected.value && user.departmentIds.includes(selected.value.id)).length)
const deleteChildCount = computed(() => store.departments.filter(item => item.parentId === deleteTarget.value?.id).length)
const deleteUserCount = computed(() => store.users.filter(user => deleteTarget.value && user.departmentIds.includes(deleteTarget.value.id)).length)
const deleteBlocked = computed(() => deleteChildCount.value > 0 || deleteUserCount.value > 0)

useUnsavedDialogGuard(() => props.open && mode.value !== 'view', () => formDirty.value, '组织架构')

watch(() => store.departments.map(item => item.id), (ids) => {
  if (!selectedId.value || !ids.includes(selectedId.value)) selectedId.value = ids[0] ?? null
  const next = new Set([...expandedIds.value].filter(id => ids.includes(id)))
  if (next.size === 0) ids.forEach(id => next.add(id))
  expandedIds.value = next
}, { immediate: true })

watch(() => props.open, (open) => {
  if (!open) return
  if (!selected.value) selectedId.value = store.departments[0]?.id ?? null
  mode.value = 'view'
  issues.value = []
})

function showError(fallback: string): void { toast.error(store.error ?? fallback); store.resetError() }
function hasChildren(id: string): boolean { return store.departments.some(item => item.parentId === id) }
function toggleExpanded(id: string): void {
  const next = new Set(expandedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedIds.value = next
}
function applySelection(id: string): void { selectedId.value = id; mode.value = 'view'; issues.value = [] }
function requestSelection(id: string): void {
  if (id === selectedId.value) return
  if (mode.value !== 'view' && formDirty.value) pendingAction.value = { type: 'select', id }
  else applySelection(id)
}
function siblingSort(parentId: string | null): number {
  const max = Math.max(0, ...store.departments.filter(item => item.parentId === parentId).map(item => item.sort))
  return Math.min(9999, max + 10)
}
function startCreate(parentId: string | null): void {
  mode.value = 'create'
  formValue.value = { parentId, name: '', ownerUserId: null, sort: siblingSort(parentId), status: 'enabled' }
  initialValue.value = { ...formValue.value }
  issues.value = []
  nextTick(() => document.querySelector<HTMLElement>('#department-name')?.focus())
}
function startEdit(): void {
  if (!selected.value) return
  mode.value = 'edit'
  formValue.value = { parentId: selected.value.parentId, name: selected.value.name, ownerUserId: selected.value.ownerUserId, sort: selected.value.sort, status: selected.value.status }
  initialValue.value = { ...formValue.value }
  issues.value = []
}
function requestCancel(): void {
  if (formDirty.value) pendingAction.value = { type: 'cancel' }
  else mode.value = 'view'
}
function requestClose(): void {
  if (mode.value !== 'view' && formDirty.value) pendingAction.value = { type: 'close' }
  else { mode.value = 'view'; emit('update:open', false) }
}
function discardAndContinue(): void {
  const action = pendingAction.value
  pendingAction.value = null
  mode.value = 'view'
  issues.value = []
  if (action?.type === 'close') emit('update:open', false)
  else if (action?.type === 'select') selectedId.value = action.id
}
function handleOpenChange(open: boolean): void { if (open) emit('update:open', true); else requestClose() }
function handleEscape(event: Event): void { event.preventDefault(); requestClose() }
function handleOutside(event: Event): void { event.preventDefault(); requestClose() }
async function saveDepartment(): Promise<void> {
  const isCreate = mode.value === 'create'
  issues.value = validateDepartmentInput(formValue.value, store.snapshot, mode.value === 'edit' ? selected.value?.id : undefined)
  await nextTick()
  if (!formRef.value?.validateAndFocus() || issues.value.length) return
  const saved = isCreate
    ? await store.createDepartment(formValue.value)
    : selected.value ? await store.updateDepartment(selected.value.id, formValue.value) : null
  if (!saved) return showError(isCreate ? '部门新增失败' : '部门保存失败')
  selectedId.value = saved.id
  expandedIds.value = new Set([...expandedIds.value, ...(saved.parentId ? [saved.parentId] : [])])
  mode.value = 'view'
  toast.success(isCreate ? '部门已新增。' : '部门信息已更新。')
}
async function removeDepartment(): Promise<void> {
  if (!deleteTarget.value || deleteBlocked.value) return
  const id = deleteTarget.value.id
  const parentId = deleteTarget.value.parentId
  const removed = await store.removeDepartment(id)
  if (!removed) return showError('部门删除失败')
  deleteTarget.value = null
  selectedId.value = parentId ?? store.departments[0]?.id ?? null
  toast.success('部门已删除。')
}
</script>

<template>
  <Sheet :open="open" @update:open="handleOpenChange">
    <SheetContent side="right" :show-close-button="false" class="!w-[min(900px,calc(100vw-1rem))] !max-w-none gap-0 p-0 sm:!max-w-[900px]" @escape-key-down="handleEscape" @interact-outside="handleOutside">
      <SheetHeader class="relative shrink-0 border-b px-5 py-4 pr-16 text-left">
        <div class="flex min-w-0 items-center gap-2"><SheetTitle class="truncate text-lg font-semibold">组织架构管理</SheetTitle><Badge variant="outline">{{ store.departments.length }} 个部门</Badge></div>
        <SheetDescription class="mt-1.5 leading-5">维护多级部门、主管、排序和状态；停用部门会保留已有用户关系。</SheetDescription>
        <Button type="button" variant="ghost" size="icon-lg" class="absolute right-3 top-3 h-11 w-11" :disabled="store.isSaving" aria-label="关闭组织架构管理" @click="requestClose"><X aria-hidden="true" /></Button>
      </SheetHeader>

      <div class="grid min-h-0 flex-1 md:grid-cols-[300px_minmax(0,1fr)]">
        <aside class="flex min-h-0 flex-col border-b bg-muted/15 md:border-b-0 md:border-r" aria-label="部门树">
          <div class="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
            <div><h3 class="text-sm font-semibold">部门树</h3><p class="mt-0.5 text-xs text-muted-foreground">支持多个根部门</p></div>
            <Button type="button" variant="outline" size="sm" class="h-10" :disabled="mode !== 'view' || store.isSaving" @click="startCreate(null)"><Plus aria-hidden="true" />根部门</Button>
          </div>
          <div class="min-h-0 flex-1 overflow-y-auto p-2">
            <div v-for="department in visibleRows" :key="department.id" class="group flex min-h-11 items-center gap-1 rounded-lg" :class="selectedId === department.id ? 'bg-primary/10 text-primary' : 'hover:bg-muted/70'" :style="{ paddingLeft: `${4 + department.depth * 18}px` }">
              <Button v-if="hasChildren(department.id)" type="button" variant="ghost" size="icon-sm" class="size-8 shrink-0" :aria-label="`${expandedIds.has(department.id) ? '收起' : '展开'}${department.name}`" @click.stop="toggleExpanded(department.id)"><ChevronDown v-if="expandedIds.has(department.id)" aria-hidden="true" /><ChevronRight v-else aria-hidden="true" /></Button>
              <span v-else class="w-8 shrink-0" aria-hidden="true" />
              <button type="button" class="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-md px-1 text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50" :disabled="store.isSaving" @click="requestSelection(department.id)">
                <Building2 class="size-4 shrink-0" aria-hidden="true" />
                <span class="min-w-0 flex-1 truncate text-sm font-medium">{{ department.name }}</span>
                <span v-if="department.status === 'disabled'" class="size-2 shrink-0 rounded-full bg-muted-foreground" title="已停用" />
              </button>
            </div>
            <div v-if="!visibleRows.length" class="px-4 py-12 text-center"><Building2 class="mx-auto size-8 text-muted-foreground" aria-hidden="true" /><p class="mt-3 text-sm text-muted-foreground">暂无部门</p><Button type="button" variant="outline" class="mt-4 h-11" @click="startCreate(null)"><Plus />新增根部门</Button></div>
          </div>
        </aside>

        <main class="min-h-0 overflow-y-auto p-5 lg:p-6">
          <template v-if="mode === 'view' && selected">
            <div class="flex flex-wrap items-start justify-between gap-4 border-b pb-5">
              <div><div class="flex items-center gap-2"><h3 class="text-xl font-semibold">{{ selected.name }}</h3><Badge :variant="selected.status === 'enabled' ? 'default' : 'outline'">{{ selected.status === 'enabled' ? '启用' : '停用' }}</Badge></div><p class="mt-2 text-sm text-muted-foreground">{{ selectedParent ? `上级部门：${selectedParent.name}` : '根部门' }}</p></div>
              <div class="flex flex-wrap gap-2"><Button type="button" variant="outline" class="h-11" @click="startCreate(selected.parentId)"><CirclePlus />新增同级</Button><Button type="button" variant="outline" class="h-11" @click="startCreate(selected.id)"><CirclePlus />新增下级</Button><Button type="button" class="h-11" @click="startEdit"><PencilLine />编辑</Button></div>
            </div>
            <div class="mt-5 grid gap-3 sm:grid-cols-2">
              <div class="rounded-xl border bg-card/70 p-4"><p class="text-xs text-muted-foreground">部门主管</p><div class="mt-3 flex items-center gap-3"><span class="grid size-9 place-items-center rounded-full bg-primary/10 text-primary"><UserRound class="size-4" /></span><div><p class="text-sm font-medium">{{ selectedOwner?.name ?? '暂未设置' }}</p><p class="mt-0.5 text-xs text-muted-foreground">{{ selectedOwner?.username ?? '可在编辑中搜索选择' }}</p></div></div></div>
              <div class="rounded-xl border bg-card/70 p-4"><p class="text-xs text-muted-foreground">引用概况</p><div class="mt-3 flex items-center gap-3"><span class="grid size-9 place-items-center rounded-full bg-primary/10 text-primary"><Users class="size-4" /></span><div><p class="text-sm font-medium">{{ selectedUserCount }} 个用户</p><p class="mt-0.5 text-xs text-muted-foreground">{{ selectedChildCount }} 个直属下级部门</p></div></div></div>
              <div class="rounded-xl border bg-card/70 p-4"><p class="text-xs text-muted-foreground">同级排序</p><p class="mt-3 text-lg font-semibold tabular-nums">{{ selected.sort }}</p></div>
              <div class="rounded-xl border bg-card/70 p-4"><p class="text-xs text-muted-foreground">最后更新</p><p class="mt-3 text-sm font-medium">{{ new Date(selected.updatedAt).toLocaleString('zh-CN', { hour12: false }) }}</p></div>
            </div>
            <div class="mt-6 rounded-xl border border-destructive/20 bg-destructive/5 p-4"><div class="flex flex-wrap items-center justify-between gap-4"><div><p class="text-sm font-semibold">删除部门</p><p class="mt-1 text-xs leading-5 text-muted-foreground">存在下级或仍被用户引用时不可删除。</p></div><Button type="button" variant="destructive" class="h-11" @click="deleteTarget = selected"><Trash2 />删除部门</Button></div></div>
          </template>

          <template v-else-if="mode !== 'view'">
            <div class="mb-5 border-b pb-4"><div class="flex items-center gap-2"><h3 class="text-xl font-semibold">{{ mode === 'create' ? '新增部门' : '编辑部门' }}</h3><Badge v-if="formDirty" class="border-warning/30 bg-warning/10 text-warning hover:bg-warning/10">未保存</Badge></div><p class="mt-2 text-sm text-muted-foreground">{{ mode === 'create' ? '配置部门层级、主管、排序与状态。' : `正在编辑：${selected?.name ?? ''}` }}</p></div>
            <DepartmentForm ref="formRef" :value="formValue" :departments="store.departments" :users="store.users" :issues="issues" :excluded-ids="excludedParentIds" :saving="store.isSaving" @update:value="formValue = $event; issues = []" />
            <div class="mt-6 flex justify-end gap-2 border-t pt-5"><Button type="button" variant="outline" class="h-11 min-w-24" :disabled="store.isSaving" @click="requestCancel">取消</Button><Button type="button" class="h-11 min-w-28" :disabled="store.isSaving" @click="saveDepartment"><LoaderCircle v-if="store.isSaving" class="animate-spin motion-reduce:animate-none" /><Save v-else />{{ store.isSaving ? '保存中' : '保存部门' }}</Button></div>
          </template>

          <div v-else class="grid min-h-80 place-items-center text-center"><div><Building2 class="mx-auto size-10 text-muted-foreground" /><p class="mt-3 text-sm text-muted-foreground">请从左侧选择部门，或新增根部门。</p></div></div>
        </main>
      </div>
    </SheetContent>
  </Sheet>

  <AlertDialog :open="Boolean(pendingAction)" @update:open="!$event && (pendingAction = null)"><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>放弃未保存的部门修改？</AlertDialogTitle><AlertDialogDescription>当前部门表单尚未保存，继续后这些修改将无法恢复。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>继续编辑</AlertDialogCancel><Button variant="destructive" @click="discardAndContinue">放弃修改</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
  <AlertDialog :open="Boolean(deleteTarget)" @update:open="!$event && (deleteTarget = null)"><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{{ deleteBlocked ? '该部门无法删除' : `确认删除“${deleteTarget?.name ?? ''}”？` }}</AlertDialogTitle><AlertDialogDescription v-if="deleteBlocked">该部门有 {{ deleteChildCount }} 个直属下级部门、被 {{ deleteUserCount }} 个用户引用。请先迁移或解除这些关系。</AlertDialogDescription><AlertDialogDescription v-else>删除后不可恢复，部门主管配置也会一并移除。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{{ deleteBlocked ? '我知道了' : '取消' }}</AlertDialogCancel><Button v-if="!deleteBlocked" variant="destructive" :disabled="Boolean(store.deletingId)" @click="removeDepartment"><Trash2 />{{ store.deletingId ? '删除中' : '确认删除' }}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
</template>
