<script setup lang="ts">
import type { CrudDialogCloseRequest, CrudDialogMode, DataTableColumn } from '@/components/common'
import type { PermissionQuery, PermissionTreeNode, PermissionWriteInput, SystemPermission, ValidationIssue } from '@/modules/system-management/types'
import { ChevronDown, ChevronRight, KeyRound, PencilLine, Plus, Trash2 } from '@lucide/vue'
import { computed, nextTick, onMounted, ref } from 'vue'
import { toast } from 'vue-sonner'
import { CrudDialog, DataTable, QueryPanel } from '@/components/common'
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import PermissionForm from '@/modules/system-management/components/PermissionForm.vue'
import StatusBadge from '@/modules/system-management/components/StatusBadge.vue'
import { useUnsavedDialogGuard } from '@/modules/system-management/composables/use-unsaved-dialog-guard'
import { buildPermissionTree, flattenPermissionTree, PERMISSION_TYPE_LABELS } from '@/modules/system-management/lib/rbac'
import { validatePermissionInput } from '@/modules/system-management/services/rbac-service'
import { useRbacStore } from '@/modules/system-management/stores/rbac-store'

interface FormHandle { validateAndFocus(): boolean }
const EMPTY_FORM: PermissionWriteInput = { parentId: null, name: '', code: '', type: 'menu', routePath: '', sort: 10, visible: true, enabled: true, description: '' }
const columns: readonly DataTableColumn<PermissionTreeNode>[] = [
  { key: 'name', label: '权限名称', minWidth: '280px' }, { key: 'type', label: '类型', width: '100px', align: 'center' },
  { key: 'code', label: '权限标识', minWidth: '210px' }, { key: 'routePath', label: '路由地址', minWidth: '180px' },
  { key: 'sort', label: '排序', width: '80px', align: 'center' }, { key: 'visible', label: '可见', width: '90px', align: 'center' },
  { key: 'enabled', label: '状态', width: '100px', align: 'center' }, { key: 'actions', label: '操作', width: '208px', align: 'right' },
]
const store = useRbacStore()
const query = ref<PermissionQuery>({ keyword: '', type: 'all', status: 'all' }); const appliedQuery = ref<PermissionQuery>({ ...query.value })
const expandedIds = ref(new Set<string>()); const dialogOpen = ref(false); const dialogMode = ref<CrudDialogMode>('create'); const editing = ref<SystemPermission | null>(null)
const formValue = ref<PermissionWriteInput>({ ...EMPTY_FORM }); const initialValue = ref<PermissionWriteInput>({ ...EMPTY_FORM }); const issues = ref<readonly ValidationIssue<keyof PermissionWriteInput>[]>([])
const formRef = ref<FormHandle | null>(null); const discardOpen = ref(false); const deleteTarget = ref<SystemPermission | null>(null)
const tree = computed(() => buildPermissionTree(store.permissions))
const hasQuery = computed(() => Boolean(appliedQuery.value.keyword || appliedQuery.value.type !== 'all' || appliedQuery.value.status !== 'all'))
const rows = computed(() => {
  const keyword = appliedQuery.value.keyword.trim().toLocaleLowerCase('zh-CN')
  const matches = (item: PermissionTreeNode) => (!keyword || `${item.name} ${item.code} ${item.routePath}`.toLocaleLowerCase('zh-CN').includes(keyword)) && (appliedQuery.value.type === 'all' || item.type === appliedQuery.value.type) && (appliedQuery.value.status === 'all' || item.enabled === (appliedQuery.value.status === 'enabled'))
  if (hasQuery.value) return flattenPermissionTree(tree.value).filter(matches)
  const visible: PermissionTreeNode[] = []
  function visit(nodes: readonly PermissionTreeNode[]) { for (const node of nodes) { visible.push(node); if (expandedIds.value.has(node.id)) visit(node.children) } }
  visit(tree.value); return visible
})
const dirty = computed(() => JSON.stringify(formValue.value) !== JSON.stringify(initialValue.value))
useUnsavedDialogGuard(() => dialogOpen.value, () => dirty.value, '权限')
function applyQuery(): void { appliedQuery.value = { ...query.value } }
function resetQuery(): void { query.value = { keyword: '', type: 'all', status: 'all' }; applyQuery() }
function toggleExpanded(id: string): void { const next = new Set(expandedIds.value); if (next.has(id)) next.delete(id); else next.add(id); expandedIds.value = next }
function openCreate(parent?: SystemPermission): void { dialogMode.value = 'create'; editing.value = null; formValue.value = { ...EMPTY_FORM, parentId: parent?.id ?? null, type: parent?.type === 'menu' ? 'button' : 'menu' }; initialValue.value = { ...formValue.value }; issues.value = []; dialogOpen.value = true }
function openEdit(permission: SystemPermission): void { dialogMode.value = 'edit'; editing.value = permission; formValue.value = { parentId: permission.parentId, name: permission.name, code: permission.code, type: permission.type, routePath: permission.routePath, sort: permission.sort, visible: permission.visible, enabled: permission.enabled, description: permission.description }; initialValue.value = { ...formValue.value }; issues.value = []; dialogOpen.value = true }
function closeDialog(): void { dialogOpen.value = false; discardOpen.value = false; editing.value = null; issues.value = [] }
function requestClose(request: CrudDialogCloseRequest): void { if (request.dirty) discardOpen.value = true; else closeDialog() }
function updateForm(value: PermissionWriteInput): void { formValue.value = value; issues.value = []; store.resetError() }
async function save(): Promise<void> { issues.value = validatePermissionInput(formValue.value, store.snapshot, editing.value?.id); await nextTick(); if (!formRef.value?.validateAndFocus() || issues.value.length) return; const saved = dialogMode.value === 'create' ? await store.createPermission(formValue.value) : editing.value ? await store.updatePermission(editing.value.id, formValue.value) : null; if (!saved) { toast.error(store.error ?? '权限保存失败'); return }; if (saved.parentId) expandedIds.value.add(saved.parentId); closeDialog(); toast.success(dialogMode.value === 'create' ? '权限已新增。' : '权限信息已更新。') }
async function remove(): Promise<void> { if (!deleteTarget.value) return; const removed = await store.removePermission(deleteTarget.value.id); if (!removed) { toast.error(store.error ?? '权限删除失败'); deleteTarget.value = null; return }; deleteTarget.value = null; toast.success('权限已删除。') }
onMounted(async () => { if (!await store.load()) toast.error(store.error ?? '系统管理数据加载失败'); expandedIds.value = new Set(store.permissions.filter((item) => item.type !== 'button').map((item) => item.id)) })
</script>

<template>
  <section class="tech-grid min-h-[calc(100svh-4rem)] p-6" aria-labelledby="permission-management-title"><div class="mx-auto flex w-full max-w-[1680px] flex-col gap-4">
                                                                                                           <header class="flex items-center justify-between gap-4"><div class="flex items-center gap-3"><span class="grid size-11 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary"><KeyRound class="size-5" /></span><div><h1 id="permission-management-title" class="text-2xl font-semibold tracking-tight">权限管理</h1><p class="mt-1 text-sm text-muted-foreground">维护目录、菜单和按钮权限树</p></div></div><Button size="lg" class="h-11" @click="openCreate()"><Plus />新增权限</Button></header>
                                                                                                           <QueryPanel :loading="store.isLoading" @query="applyQuery" @reset="resetQuery"><div class="space-y-2"><Label for="permission-query-keyword">权限信息</Label><Input id="permission-query-keyword" v-model="query.keyword" class="h-11" placeholder="名称、标识或路由" /></div><div class="space-y-2"><Label for="permission-query-type">权限类型</Label><Select v-model="query.type"><SelectTrigger id="permission-query-type" class="h-11 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部类型</SelectItem><SelectItem value="directory">目录</SelectItem><SelectItem value="menu">菜单</SelectItem><SelectItem value="button">按钮</SelectItem></SelectContent></Select></div><div class="space-y-2"><Label for="permission-query-status">权限状态</Label><Select v-model="query.status"><SelectTrigger id="permission-query-status" class="h-11 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部状态</SelectItem><SelectItem value="enabled">启用</SelectItem><SelectItem value="disabled">停用</SelectItem></SelectContent></Select></div></QueryPanel>
                                                                                                           <DataTable :columns="columns" :rows="rows" row-key="id" :loading="store.isLoading" empty-text="暂无权限" caption="系统权限树">
                                                                                                             <template #cell-name="{ row }"><div class="flex items-center gap-1" :style="{ paddingLeft: `${row.depth * 24}px` }"><Button v-if="row.children.length && !hasQuery" variant="ghost" size="icon-sm" class="size-7" :aria-label="expandedIds.has(row.id) ? `收起${row.name}` : `展开${row.name}`" @click="toggleExpanded(row.id)"><ChevronDown v-if="expandedIds.has(row.id)" /><ChevronRight v-else /></Button><span v-else class="size-7" /><span class="font-medium">{{ row.name }}</span><Badge v-if="row.builtIn" variant="outline" class="ml-1 h-5 text-[10px]">内置</Badge></div></template>
                                                                                                             <template #cell-type="{ row }"><Badge variant="secondary">{{ PERMISSION_TYPE_LABELS[row.type] }}</Badge></template><template #cell-code="{ row }"><code class="rounded border bg-muted/35 px-2 py-1 text-xs">{{ row.code }}</code></template><template #cell-routePath="{ row }"><code class="text-xs text-muted-foreground">{{ row.routePath || '—' }}</code></template><template #cell-sort="{ row }"><span>{{ row.sort }}</span></template><template #cell-visible="{ row }"><span>{{ row.type === 'button' ? '—' : row.visible ? '显示' : '隐藏' }}</span></template><template #cell-enabled="{ row }"><StatusBadge :enabled="row.enabled" /></template>
                                                                                                             <template #cell-actions="{ row }"><div class="flex justify-end gap-1"><Button v-if="row.type !== 'button'" variant="ghost" size="icon-lg" class="h-11 w-11" :aria-label="`在${row.name}下新增权限`" @click="openCreate(row)"><Plus /></Button><Button variant="ghost" size="lg" class="h-11 px-3" @click="openEdit(row)"><PencilLine />编辑</Button><Button variant="ghost" size="icon-lg" class="h-11 w-11 text-destructive" :disabled="row.builtIn" :aria-label="row.builtIn ? '内置权限不能删除' : `删除${row.name}`" @click="deleteTarget = row"><Trash2 /></Button></div></template>
                                                                                                           </DataTable>
                                                                                                         </div>
    <CrudDialog :open="dialogOpen" :mode="dialogMode" :title="dialogMode === 'create' ? '新增权限' : '编辑权限'" description="目录用于分组，菜单对应页面，按钮对应页面内操作。" :saving="store.isSaving" :dirty="dirty" @submit="save" @request-close="requestClose"><PermissionForm ref="formRef" :value="formValue" :permissions="store.permissions" :editing-id="editing?.id" :issues="issues" :saving="store.isSaving" :built-in="editing?.builtIn" @update:value="updateForm" /></CrudDialog>
    <AlertDialog :open="discardOpen" @update:open="discardOpen = $event"><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>放弃未保存的修改？</AlertDialogTitle><AlertDialogDescription>当前填写内容尚未保存，关闭后将无法恢复。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>继续编辑</AlertDialogCancel><Button variant="destructive" @click="closeDialog">放弃修改</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog :open="Boolean(deleteTarget)" @update:open="!$event && (deleteTarget = null)"><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>确认删除“{{ deleteTarget?.name }}”？</AlertDialogTitle><AlertDialogDescription>仅无下级且未被角色使用的自定义权限可以删除。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><Button variant="destructive" :disabled="Boolean(store.deletingId)" @click="remove"><Trash2 />{{ store.deletingId ? '删除中' : '确认删除' }}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>
</template>
