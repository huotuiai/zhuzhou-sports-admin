<script setup lang="ts">
import type { CrudDialogCloseRequest, CrudDialogMode, DataTableColumn } from '@/components/common'
import type { RoleQuery, RoleWriteInput, SystemRole, ValidationIssue } from '@/modules/system-management/types'
import { PencilLine, Plus, ShieldCheck, Trash2 } from '@lucide/vue'
import { computed, nextTick, onMounted, ref } from 'vue'
import { toast } from 'vue-sonner'
import { CrudDialog, DataTable, PaginationBar, QueryPanel } from '@/components/common'
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import RoleForm from '@/modules/system-management/components/RoleForm.vue'
import StatusBadge from '@/modules/system-management/components/StatusBadge.vue'
import { useUnsavedDialogGuard } from '@/modules/system-management/composables/use-unsaved-dialog-guard'
import { DATA_SCOPE_LABELS } from '@/modules/system-management/lib/rbac'
import { validateRoleInput } from '@/modules/system-management/services/rbac-service'
import { useRbacStore } from '@/modules/system-management/stores/rbac-store'

interface FormHandle { validateAndFocus(): boolean }
const EMPTY_FORM: RoleWriteInput = { name: '', code: '', sort: 10, dataScope: 'self', permissionIds: [], enabled: true, remark: '' }
const columns: readonly DataTableColumn<SystemRole>[] = [
  { key: 'index', label: '序号', width: '72px', align: 'center' }, { key: 'name', label: '角色', minWidth: '200px' },
  { key: 'dataScope', label: '数据范围', minWidth: '170px' }, { key: 'permissions', label: '权限数量', width: '120px', align: 'center' },
  { key: 'users', label: '用户数量', width: '120px', align: 'center' }, { key: 'sort', label: '排序', width: '90px', align: 'center' },
  { key: 'enabled', label: '状态', width: '100px', align: 'center' }, { key: 'updatedAt', label: '更新时间', minWidth: '170px' },
  { key: 'actions', label: '操作', width: '164px', align: 'right' },
]

const store = useRbacStore()
const query = ref<RoleQuery>({ keyword: '', status: 'all' })
const appliedQuery = ref<RoleQuery>({ ...query.value })
const page = ref(1); const pageSize = ref(10)
const dialogOpen = ref(false); const dialogMode = ref<CrudDialogMode>('create'); const editing = ref<SystemRole | null>(null)
const formValue = ref<RoleWriteInput>({ ...EMPTY_FORM }); const initialValue = ref<RoleWriteInput>({ ...EMPTY_FORM })
const issues = ref<readonly ValidationIssue<keyof RoleWriteInput>[]>([]); const formRef = ref<FormHandle | null>(null)
const discardOpen = ref(false); const deleteTarget = ref<SystemRole | null>(null)
const filtered = computed(() => {
  const keyword = appliedQuery.value.keyword.trim().toLocaleLowerCase('zh-CN')
  return store.roles.filter((role) => (!keyword || `${role.name} ${role.code}`.toLocaleLowerCase('zh-CN').includes(keyword)) && (appliedQuery.value.status === 'all' || role.enabled === (appliedQuery.value.status === 'enabled')))
})
const rows = computed(() => filtered.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
const dirty = computed(() => JSON.stringify(formValue.value) !== JSON.stringify(initialValue.value))
useUnsavedDialogGuard(() => dialogOpen.value, () => dirty.value, '角色')
function formatDateTime(value: string): string { return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)) }
function applyQuery(): void { appliedQuery.value = { ...query.value }; page.value = 1 }
function resetQuery(): void { query.value = { keyword: '', status: 'all' }; applyQuery() }
function openCreate(): void { dialogMode.value = 'create'; editing.value = null; formValue.value = { ...EMPTY_FORM, permissionIds: [] }; initialValue.value = { ...formValue.value, permissionIds: [] }; issues.value = []; dialogOpen.value = true }
function openEdit(role: SystemRole): void { dialogMode.value = 'edit'; editing.value = role; formValue.value = { name: role.name, code: role.code, sort: role.sort, dataScope: role.dataScope, permissionIds: [...role.permissionIds], enabled: role.enabled, remark: role.remark }; initialValue.value = { ...formValue.value, permissionIds: [...formValue.value.permissionIds] }; issues.value = []; dialogOpen.value = true }
function closeDialog(): void { dialogOpen.value = false; discardOpen.value = false; editing.value = null; issues.value = [] }
function requestClose(request: CrudDialogCloseRequest): void { if (request.dirty) discardOpen.value = true; else closeDialog() }
function updateForm(value: RoleWriteInput): void { formValue.value = value; issues.value = []; store.resetError() }
async function save(): Promise<void> {
  issues.value = validateRoleInput(formValue.value, store.snapshot, editing.value?.id); await nextTick()
  if (!formRef.value?.validateAndFocus() || issues.value.length) return
  const saved = dialogMode.value === 'create' ? await store.createRole(formValue.value) : editing.value ? await store.updateRole(editing.value.id, formValue.value) : null
  if (!saved) { toast.error(store.error ?? '角色保存失败'); return }
  closeDialog(); toast.success(dialogMode.value === 'create' ? '角色已新增。' : '角色信息已更新。')
}
async function remove(): Promise<void> { if (!deleteTarget.value) return; const removed = await store.removeRole(deleteTarget.value.id); if (!removed) { toast.error(store.error ?? '角色删除失败'); deleteTarget.value = null; return }; deleteTarget.value = null; toast.success('角色已删除。') }
function userCount(roleId: string): number { return store.users.filter((user) => user.roleIds.includes(roleId)).length }
onMounted(async () => { if (!await store.load()) toast.error(store.error ?? '系统管理数据加载失败') })
</script>

<template>
  <section class="tech-grid min-h-[calc(100svh-4rem)] p-6" aria-labelledby="role-management-title"><div class="mx-auto flex w-full max-w-[1680px] flex-col gap-4">
                                                                                                     <header class="flex items-center justify-between gap-4"><div class="flex items-center gap-3"><span class="grid size-11 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary"><ShieldCheck class="size-5" /></span><div><h1 id="role-management-title" class="text-2xl font-semibold tracking-tight">角色管理</h1><p class="mt-1 text-sm text-muted-foreground">配置角色的数据范围和功能权限</p></div></div><Button size="lg" class="h-11" @click="openCreate"><Plus />新增角色</Button></header>
                                                                                                     <QueryPanel :loading="store.isLoading" @query="applyQuery" @reset="resetQuery"><div class="space-y-2"><Label for="role-query-keyword">角色信息</Label><Input id="role-query-keyword" v-model="query.keyword" class="h-11" placeholder="角色名称或编码" /></div><div class="space-y-2"><Label for="role-query-status">角色状态</Label><Select v-model="query.status"><SelectTrigger id="role-query-status" class="h-11 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部状态</SelectItem><SelectItem value="enabled">启用</SelectItem><SelectItem value="disabled">停用</SelectItem></SelectContent></Select></div></QueryPanel>
                                                                                                     <DataTable :columns="columns" :rows="rows" row-key="id" :loading="store.isLoading" empty-text="暂无角色" caption="系统角色列表">
                                                                                                       <template #cell-index="{ rowIndex }"><span class="text-muted-foreground">{{ (page - 1) * pageSize + rowIndex + 1 }}</span></template>
                                                                                                       <template #cell-name="{ row }"><div><div class="flex items-center gap-2"><span class="font-medium">{{ row.name }}</span><Badge v-if="row.builtIn" variant="outline" class="h-5 text-[10px]">内置</Badge></div><code class="mt-1 block text-xs text-muted-foreground">{{ row.code }}</code></div></template>
                                                                                                       <template #cell-dataScope="{ row }"><span>{{ DATA_SCOPE_LABELS[row.dataScope] }}</span></template>
                                                                                                       <template #cell-permissions="{ row }"><Badge variant="secondary">{{ row.permissionIds.length }} 项</Badge></template>
                                                                                                       <template #cell-users="{ row }"><span class="tabular-nums">{{ userCount(row.id) }}</span></template><template #cell-sort="{ row }"><span class="tabular-nums">{{ row.sort }}</span></template>
                                                                                                       <template #cell-enabled="{ row }"><StatusBadge :enabled="row.enabled" /></template><template #cell-updatedAt="{ row }"><time class="text-xs text-muted-foreground">{{ formatDateTime(row.updatedAt) }}</time></template>
                                                                                                       <template #cell-actions="{ row }"><div class="flex justify-end gap-1"><Button variant="ghost" size="lg" class="h-11 px-3" @click="openEdit(row)"><PencilLine />编辑</Button><Button variant="ghost" size="icon-lg" class="h-11 w-11 text-destructive" :disabled="row.builtIn" :aria-label="row.builtIn ? '内置角色不能删除' : `删除${row.name}`" @click="deleteTarget = row"><Trash2 /></Button></div></template>
                                                                                                     </DataTable><PaginationBar :page="page" :page-size="pageSize" :total="filtered.length" :disabled="store.isLoading" @update:page="page = $event" @update:page-size="pageSize = $event; page = 1" />
                                                                                                   </div>
    <CrudDialog :open="dialogOpen" :mode="dialogMode" :title="dialogMode === 'create' ? '新增角色' : '编辑角色'" description="设置角色基本信息、数据范围并从权限树中授权。" :saving="store.isSaving" :dirty="dirty" @submit="save" @request-close="requestClose"><RoleForm ref="formRef" :value="formValue" :permissions="store.permissions" :issues="issues" :saving="store.isSaving" :built-in="editing?.builtIn" @update:value="updateForm" /></CrudDialog>
    <AlertDialog :open="discardOpen" @update:open="discardOpen = $event"><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>放弃未保存的修改？</AlertDialogTitle><AlertDialogDescription>当前填写内容尚未保存，关闭后将无法恢复。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>继续编辑</AlertDialogCancel><Button variant="destructive" @click="closeDialog">放弃修改</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog :open="Boolean(deleteTarget)" @update:open="!$event && (deleteTarget = null)"><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>确认删除“{{ deleteTarget?.name }}”？</AlertDialogTitle><AlertDialogDescription>仅未分配给任何用户的角色可以删除。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><Button variant="destructive" :disabled="Boolean(store.deletingId)" @click="remove"><Trash2 />{{ store.deletingId ? '删除中' : '确认删除' }}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>
</template>
