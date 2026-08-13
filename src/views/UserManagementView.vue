<script setup lang="ts">
import type { CrudDialogCloseRequest, CrudDialogMode, DataTableColumn } from '@/components/common'
import type { SystemUser, UserQuery, UserWriteInput, ValidationIssue } from '@/modules/system-management/types'
import { PencilLine, Plus, Trash2, UsersRound } from '@lucide/vue'
import { computed, nextTick, onMounted, ref } from 'vue'
import { toast } from 'vue-sonner'
import { CrudDialog, DataTable, PaginationBar, QueryPanel } from '@/components/common'
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import StatusBadge from '@/modules/system-management/components/StatusBadge.vue'
import UserForm from '@/modules/system-management/components/UserForm.vue'
import { useUnsavedDialogGuard } from '@/modules/system-management/composables/use-unsaved-dialog-guard'
import { roleNamesForUser } from '@/modules/system-management/lib/rbac'
import { validateUserInput } from '@/modules/system-management/services/rbac-service'
import { useRbacStore } from '@/modules/system-management/stores/rbac-store'

interface FormHandle { validateAndFocus(): boolean }

const EMPTY_FORM: UserWriteInput = { username: '', password: '', name: '', phone: '', email: '', department: '', roleIds: [], enabled: true, remark: '' }
const columns: readonly DataTableColumn<SystemUser>[] = [
  { key: 'index', label: '序号', width: '72px', align: 'center' },
  { key: 'username', label: '用户', minWidth: '190px' },
  { key: 'contact', label: '联系方式', minWidth: '180px' },
  { key: 'department', label: '所属部门', minWidth: '150px' },
  { key: 'roles', label: '角色', minWidth: '220px' },
  { key: 'enabled', label: '状态', width: '100px', align: 'center' },
  { key: 'updatedAt', label: '更新时间', minWidth: '170px' },
  { key: 'actions', label: '操作', width: '164px', align: 'right' },
]

const store = useRbacStore()
const query = ref<UserQuery>({ keyword: '', roleId: 'all', status: 'all' })
const appliedQuery = ref<UserQuery>({ ...query.value })
const page = ref(1)
const pageSize = ref(10)
const dialogOpen = ref(false)
const dialogMode = ref<CrudDialogMode>('create')
const editing = ref<SystemUser | null>(null)
const formValue = ref<UserWriteInput>({ ...EMPTY_FORM })
const initialValue = ref<UserWriteInput>({ ...EMPTY_FORM })
const issues = ref<readonly ValidationIssue<keyof UserWriteInput>[]>([])
const formRef = ref<FormHandle | null>(null)
const discardOpen = ref(false)
const deleteTarget = ref<SystemUser | null>(null)

const filtered = computed(() => {
  const keyword = appliedQuery.value.keyword.trim().normalize('NFKC').toLocaleLowerCase('zh-CN')
  return store.users.filter((user) => {
    const text = [user.username, user.name, user.phone, user.email, user.department].join(' ').toLocaleLowerCase('zh-CN')
    return (!keyword || text.includes(keyword)) &&
      (appliedQuery.value.roleId === 'all' || user.roleIds.includes(appliedQuery.value.roleId)) &&
      (appliedQuery.value.status === 'all' || user.enabled === (appliedQuery.value.status === 'enabled'))
  })
})
const rows = computed(() => filtered.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
const dirty = computed(() => JSON.stringify(formValue.value) !== JSON.stringify(initialValue.value))
useUnsavedDialogGuard(() => dialogOpen.value, () => dirty.value, '用户')

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))
}
function applyQuery(): void { appliedQuery.value = { ...query.value }; page.value = 1 }
function resetQuery(): void { query.value = { keyword: '', roleId: 'all', status: 'all' }; applyQuery() }
function openCreate(): void { dialogMode.value = 'create'; editing.value = null; formValue.value = { ...EMPTY_FORM, roleIds: [] }; initialValue.value = { ...formValue.value, roleIds: [] }; issues.value = []; dialogOpen.value = true }
function openEdit(user: SystemUser): void {
  dialogMode.value = 'edit'; editing.value = user
  formValue.value = { username: user.username, password: '', name: user.name, phone: user.phone, email: user.email, department: user.department, roleIds: [...user.roleIds], enabled: user.enabled, remark: user.remark }
  initialValue.value = { ...formValue.value, roleIds: [...formValue.value.roleIds] }; issues.value = []; dialogOpen.value = true
}
function closeDialog(): void { dialogOpen.value = false; discardOpen.value = false; editing.value = null; issues.value = [] }
function requestClose(request: CrudDialogCloseRequest): void { if (request.dirty) discardOpen.value = true; else closeDialog() }
function updateForm(value: UserWriteInput): void { formValue.value = value; issues.value = []; store.resetError() }
async function save(): Promise<void> {
  issues.value = validateUserInput(formValue.value, store.snapshot, editing.value?.id)
  await nextTick()
  if (!formRef.value?.validateAndFocus() || issues.value.length) return
  const saved = dialogMode.value === 'create' ? await store.createUser(formValue.value) : editing.value ? await store.updateUser(editing.value.id, formValue.value) : null
  if (!saved) { toast.error(store.error ?? '用户保存失败'); return }
  closeDialog(); toast.success(dialogMode.value === 'create' ? '用户已新增。' : '用户信息已更新。')
}
async function remove(): Promise<void> {
  if (!deleteTarget.value) return
  const removed = await store.removeUser(deleteTarget.value.id)
  if (!removed) { toast.error(store.error ?? '用户删除失败'); return }
  deleteTarget.value = null; toast.success('用户已删除。')
}

onMounted(async () => { if (!await store.load()) toast.error(store.error ?? '系统管理数据加载失败') })
</script>

<template>
  <section class="tech-grid min-h-[calc(100svh-4rem)] p-6" aria-labelledby="user-management-title">
    <div class="mx-auto flex w-full max-w-[1680px] flex-col gap-4">
      <header class="flex items-center justify-between gap-4">
        <div class="flex items-center gap-3"><span class="grid size-11 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary"><UsersRound class="size-5" /></span><div><h1 id="user-management-title" class="text-2xl font-semibold tracking-tight">用户管理</h1><p class="mt-1 text-sm text-muted-foreground">维护登录账号并为用户分配角色</p></div></div>
        <Button size="lg" class="h-11" @click="openCreate"><Plus />新增用户</Button>
      </header>
      <QueryPanel :loading="store.isLoading" @query="applyQuery" @reset="resetQuery">
        <div class="space-y-2"><Label for="user-query-keyword">用户信息</Label><Input id="user-query-keyword" v-model="query.keyword" class="h-11" placeholder="账号、姓名、手机号或部门" /></div>
        <div class="space-y-2"><Label for="user-query-role">所属角色</Label><Select v-model="query.roleId"><SelectTrigger id="user-query-role" class="h-11 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部角色</SelectItem><SelectItem v-for="role in store.roles" :key="role.id" :value="role.id">{{ role.name }}</SelectItem></SelectContent></Select></div>
        <div class="space-y-2"><Label for="user-query-status">账号状态</Label><Select v-model="query.status"><SelectTrigger id="user-query-status" class="h-11 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部状态</SelectItem><SelectItem value="enabled">启用</SelectItem><SelectItem value="disabled">停用</SelectItem></SelectContent></Select></div>
      </QueryPanel>
      <DataTable :columns="columns" :rows="rows" row-key="id" :loading="store.isLoading" empty-text="暂无用户" caption="系统用户列表">
        <template #cell-index="{ rowIndex }"><span class="text-muted-foreground">{{ (page - 1) * pageSize + rowIndex + 1 }}</span></template>
        <template #cell-username="{ row }"><div><div class="flex items-center gap-2"><span class="font-medium">{{ row.name }}</span><Badge v-if="row.builtIn" variant="outline" class="h-5 text-[10px]">内置</Badge></div><code class="mt-1 block text-xs text-muted-foreground">{{ row.username }}</code></div></template>
        <template #cell-contact="{ row }"><div class="text-xs leading-5"><p>{{ row.phone || '—' }}</p><p class="text-muted-foreground">{{ row.email || '—' }}</p></div></template>
        <template #cell-department="{ row }"><span>{{ row.department }}</span></template>
        <template #cell-roles="{ row }"><div class="flex max-w-72 flex-wrap gap-1"><Badge v-for="name in roleNamesForUser(row, store.roles)" :key="name" variant="secondary">{{ name }}</Badge><span v-if="!row.roleIds.length">—</span></div></template>
        <template #cell-enabled="{ row }"><StatusBadge :enabled="row.enabled" /></template>
        <template #cell-updatedAt="{ row }"><time class="text-xs text-muted-foreground">{{ formatDateTime(row.updatedAt) }}</time></template>
        <template #cell-actions="{ row }"><div class="flex justify-end gap-1"><Button variant="ghost" size="lg" class="h-11 px-3" @click="openEdit(row)"><PencilLine />编辑</Button><Button variant="ghost" size="icon-lg" class="h-11 w-11 text-destructive" :disabled="row.builtIn" :aria-label="row.builtIn ? '内置用户不能删除' : `删除${row.name}`" @click="deleteTarget = row"><Trash2 /></Button></div></template>
      </DataTable>
      <PaginationBar :page="page" :page-size="pageSize" :total="filtered.length" :disabled="store.isLoading" @update:page="page = $event" @update:page-size="pageSize = $event; page = 1" />
    </div>
    <CrudDialog :open="dialogOpen" :mode="dialogMode" :title="dialogMode === 'create' ? '新增用户' : '编辑用户'" description="填写用户档案并分配一个或多个角色。" :saving="store.isSaving" :dirty="dirty" @submit="save" @request-close="requestClose">
      <UserForm ref="formRef" :value="formValue" :roles="store.roles" :issues="issues" :saving="store.isSaving" :built-in="editing?.builtIn" :mode="dialogMode" @update:value="updateForm" />
    </CrudDialog>
    <AlertDialog :open="discardOpen" @update:open="discardOpen = $event"><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>放弃未保存的修改？</AlertDialogTitle><AlertDialogDescription>当前填写内容尚未保存，关闭后将无法恢复。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>继续编辑</AlertDialogCancel><Button variant="destructive" @click="closeDialog">放弃修改</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog :open="Boolean(deleteTarget)" @update:open="!$event && (deleteTarget = null)"><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>确认删除“{{ deleteTarget?.name }}”？</AlertDialogTitle><AlertDialogDescription>删除后该账号将无法登录，且操作不可恢复。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><Button variant="destructive" :disabled="Boolean(store.deletingId)" @click="remove"><Trash2 />{{ store.deletingId ? '删除中' : '确认删除' }}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>
</template>
