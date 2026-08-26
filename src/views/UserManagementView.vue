<script setup lang="ts">
import type { CrudDialogCloseRequest, DataTableColumn } from '@/components/common'
import type { SystemUser, UserBasicInfoInput, UserCreateInput, UserPasswordResetInput, UserQuery, UserStatus, ValidationIssue } from '@/modules/system-management/types'
import { Building2, Download, KeyRound, LockKeyholeOpen, MoreHorizontal, PencilLine, Plus, Power, Trash2, UserRoundPlus, UsersRound } from '@lucide/vue'
import { computed, nextTick, onMounted, ref } from 'vue'
import { toast } from 'vue-sonner'
import { CrudDialog, DataTable, PaginationBar, QueryPanel } from '@/components/common'
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import UserBasicForm from '@/modules/system-management/components/UserBasicForm.vue'
import UserCreateForm from '@/modules/system-management/components/UserCreateForm.vue'
import OrganizationManagementSheet from '@/modules/system-management/components/OrganizationManagementSheet.vue'
import UserPasswordResetForm from '@/modules/system-management/components/UserPasswordResetForm.vue'
import UserStatusBadge from '@/modules/system-management/components/UserStatusBadge.vue'
import { useUnsavedDialogGuard } from '@/modules/system-management/composables/use-unsaved-dialog-guard'
import { buildDepartmentTree, departmentNamesForUser, flattenDepartmentTree, roleNamesForUser } from '@/modules/system-management/lib/rbac'
import { validateUserBasicInfoInput, validateUserCreateInput, validateUserPasswordResetInput } from '@/modules/system-management/services/user-management-validation'
import { useUserManagementStore } from '@/modules/system-management/stores/user-management-store'
import { useAuthStore } from '@/stores/auth'

interface FormHandle { validateAndFocus(): boolean }
type DiscardAction = 'create-close' | 'edit-close' | 'switch-basic' | 'switch-password'

const PAGE_SIZE = 20
const ALL_FILTER_VALUE = '__all__'
const EMPTY_CREATE: UserCreateInput = { username: '', name: '', phone: '', departmentIds: [], roleIds: [], password: '', confirmPassword: '' }
const EMPTY_PASSWORD: UserPasswordResetInput = { password: '', confirmPassword: '' }
const columns: readonly DataTableColumn<SystemUser>[] = [
  { key: 'username', label: '用户名', minWidth: '150px' },
  { key: 'name', label: '姓名', minWidth: '130px' },
  { key: 'departments', label: '所属组织', minWidth: '220px' },
  { key: 'roles', label: '绑定角色', minWidth: '220px' },
  { key: 'phone', label: '联系方式', minWidth: '150px' },
  { key: 'status', label: '账号状态', width: '110px', align: 'center' },
  { key: 'lastLoginAt', label: '最后登录时间', minWidth: '170px' },
  { key: 'createdAt', label: '创建时间', minWidth: '170px' },
  { key: 'actions', label: '操作', width: '136px', align: 'right' },
]

const store = useUserManagementStore()
const authStore = useAuthStore()
const query = ref<UserQuery>({ keyword: '', departmentId: '', roleId: '', status: 'all' })
const createOpen = ref(false)
const createValue = ref<UserCreateInput>({ ...EMPTY_CREATE })
const createInitial = ref<UserCreateInput>({ ...EMPTY_CREATE })
const createIssues = ref<readonly ValidationIssue<keyof UserCreateInput>[]>([])
const createFormRef = ref<FormHandle | null>(null)
const editing = ref<SystemUser | null>(null)
const editTab = ref<'basic' | 'password'>('basic')
const basicValue = ref<UserBasicInfoInput>({ name: '', phone: '', departmentIds: [], roleIds: [], status: 'enabled' })
const basicInitial = ref<UserBasicInfoInput>({ ...basicValue.value })
const basicIssues = ref<readonly ValidationIssue<keyof UserBasicInfoInput>[]>([])
const basicFormRef = ref<FormHandle | null>(null)
const passwordValue = ref<UserPasswordResetInput>({ ...EMPTY_PASSWORD })
const passwordInitial = ref<UserPasswordResetInput>({ ...EMPTY_PASSWORD })
const passwordIssues = ref<readonly ValidationIssue<keyof UserPasswordResetInput>[]>([])
const passwordFormRef = ref<FormHandle | null>(null)
const pendingDiscard = ref<DiscardAction | null>(null)
const resetConfirmOpen = ref(false)
const deleteTarget = ref<SystemUser | null>(null)
const statusTarget = ref<{ user: SystemUser; status: Exclude<UserStatus, 'locked'> } | null>(null)
const organizationOpen = ref(false)

const createDirty = computed(() => JSON.stringify(createValue.value) !== JSON.stringify(createInitial.value))
const basicDirty = computed(() => JSON.stringify(basicValue.value) !== JSON.stringify(basicInitial.value))
const passwordDirty = computed(() => JSON.stringify(passwordValue.value) !== JSON.stringify(passwordInitial.value))
const editDirty = computed(() => editTab.value === 'basic' ? basicDirty.value : passwordDirty.value)
const departmentFilterItems = computed(() => flattenDepartmentTree(buildDepartmentTree(store.departments)).map(item => ({ id: item.id, label: `${'　'.repeat(item.depth)}${item.name}` })))
const roleFilterItems = computed(() => store.roles.map(role => ({ id: role.id, label: role.name })))
const createRoleOptions = computed(() => store.roles.filter(role => role.kind !== 'super-admin' && role.enabled !== false))
const editRoleOptions = computed(() => store.roles.filter(role =>
  (role.kind !== 'super-admin' && role.enabled !== false) || Boolean(editing.value?.roleIds.includes(role.id)),
))
const rows = computed(() => store.users)

useUnsavedDialogGuard(
  () => createOpen.value || Boolean(editing.value),
  () => createOpen.value ? createDirty.value : editDirty.value,
  '用户',
)

function formatDateTime(value: string | null): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))
}
function maskPhone(phone: string): string { return phone ? phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2') : '—' }
function showError(fallback: string): void { toast.error(store.error ?? fallback); store.resetError() }
async function applyQuery(): Promise<void> { if (!await store.queryUsers({ ...query.value })) showError('用户查询失败') }
async function resetQuery(): Promise<void> {
  query.value = { keyword: '', departmentId: '', roleId: '', status: 'all' }
  await applyQuery()
}
async function changePage(value: number): Promise<void> { if (!await store.changePage(value)) showError('用户分页加载失败') }
function isCurrentUser(user: SystemUser): boolean { return user.id === authStore.user?.id }
function canManageUser(user: SystemUser): boolean { return Boolean(authStore.user?.isSuper) || !user.builtIn }
function isStatusProtected(user: SystemUser): boolean { return user.builtIn || isCurrentUser(user) }
function canCreateUser(): boolean { return Boolean(authStore.user?.isSuper) }

function openCreate(): void {
  if (!canCreateUser()) { toast.info('只有超级管理员可以新增用户。'); return }
  createValue.value = { ...EMPTY_CREATE, departmentIds: [], roleIds: [] }
  createInitial.value = { ...createValue.value, departmentIds: [], roleIds: [] }
  createIssues.value = []
  createOpen.value = true
}
function closeCreate(): void { createOpen.value = false; createIssues.value = []; pendingDiscard.value = null }
function requestCreateClose(request: CrudDialogCloseRequest): void { if (request.dirty) pendingDiscard.value = 'create-close'; else closeCreate() }
async function saveCreate(): Promise<void> {
  createIssues.value = validateUserCreateInput(createValue.value, store.validationContext)
  await nextTick()
  if (!createFormRef.value?.validateAndFocus() || createIssues.value.length) return
  const saved = await store.createUser(createValue.value)
  if (!saved) return showError('用户新增失败')
  closeCreate(); toast.success('用户已新增。')
}

async function openEdit(user: SystemUser, tab: 'basic' | 'password' = 'basic'): Promise<void> {
  if (!canManageUser(user)) { toast.info('当前账号无权修改超级管理员。'); return }
  const detail = await store.getUser(user.id)
  if (!detail) return showError('用户详情加载失败')
  editing.value = detail
  editTab.value = tab
  basicValue.value = { name: detail.name, phone: detail.phone, departmentIds: [...detail.departmentIds], roleIds: [...detail.roleIds], status: detail.status }
  basicInitial.value = { ...basicValue.value, departmentIds: [...basicValue.value.departmentIds], roleIds: [...basicValue.value.roleIds] }
  passwordValue.value = { ...EMPTY_PASSWORD }
  passwordInitial.value = { ...EMPTY_PASSWORD }
  basicIssues.value = []
  passwordIssues.value = []
}
function closeEdit(): void { editing.value = null; basicIssues.value = []; passwordIssues.value = []; resetConfirmOpen.value = false; pendingDiscard.value = null }
function requestEditClose(request: CrudDialogCloseRequest): void { if (request.dirty) pendingDiscard.value = 'edit-close'; else closeEdit() }
function requestTab(tab: 'basic' | 'password'): void {
  if (tab === editTab.value) return
  if (editDirty.value) pendingDiscard.value = tab === 'basic' ? 'switch-basic' : 'switch-password'
  else editTab.value = tab
}
function discardChanges(): void {
  const action = pendingDiscard.value
  pendingDiscard.value = null
  if (action === 'create-close') closeCreate()
  else if (action === 'edit-close') closeEdit()
  else if (action === 'switch-basic') { passwordValue.value = { ...passwordInitial.value }; passwordIssues.value = []; editTab.value = 'basic' }
  else if (action === 'switch-password') {
    basicValue.value = { ...basicInitial.value, departmentIds: [...basicInitial.value.departmentIds], roleIds: [...basicInitial.value.roleIds] }
    basicIssues.value = []
    editTab.value = 'password'
  }
}
async function submitEdit(): Promise<void> {
  if (!editing.value) return
  if (editTab.value === 'basic') {
    basicIssues.value = validateUserBasicInfoInput(basicValue.value, store.validationContext, editing.value)
    await nextTick()
    if (!basicFormRef.value?.validateAndFocus() || basicIssues.value.length) return
    const includeStatus = !isStatusProtected(editing.value) && basicValue.value.status !== editing.value.status
    const saved = await store.updateUser(editing.value.id, basicValue.value, { includeStatus })
    if (!saved) return showError('用户信息保存失败')
    closeEdit(); toast.success('用户信息已更新。')
    return
  }
  passwordIssues.value = validateUserPasswordResetInput(passwordValue.value)
  await nextTick()
  if (!passwordFormRef.value?.validateAndFocus() || passwordIssues.value.length) return
  resetConfirmOpen.value = true
}
async function confirmPasswordReset(): Promise<void> {
  if (!editing.value) return
  const saved = await store.resetPassword(editing.value.id, passwordValue.value)
  if (!saved) return showError('密码重置失败')
  closeEdit(); toast.success('密码已重置，用户下次登录需修改密码。')
}

function canDelete(user: SystemUser): boolean { return !user.builtIn && !isCurrentUser(user) }
function requestDelete(user: SystemUser): void {
  if (!canDelete(user)) { toast.info('当前登录账号、内置管理员和超级管理员账号不能删除。'); return }
  deleteTarget.value = user
}
async function removeUser(): Promise<void> {
  if (!deleteTarget.value) return
  const removed = await store.deleteUser(deleteTarget.value.id)
  if (!removed) return showError('用户删除失败')
  deleteTarget.value = null; toast.success('用户已删除。')
}
async function unlockUser(user: SystemUser): Promise<void> {
  if (isStatusProtected(user) || !canManageUser(user)) { toast.info('当前账号不能执行此解锁操作。'); return }
  const saved = await store.unlockUser(user.id)
  if (!saved) return showError('用户解锁失败')
  toast.success(`${user.name}已解锁。`)
}
async function confirmStatus(): Promise<void> {
  if (!statusTarget.value) return
  const { user, status } = statusTarget.value
  if (isStatusProtected(user) || !canManageUser(user)) { statusTarget.value = null; toast.info('当前账号不能修改该用户状态。'); return }
  const saved = await store.changeStatus(user.id, status)
  if (!saved) return showError('账号状态更新失败')
  statusTarget.value = null; toast.success(`账号已${status === 'enabled' ? '启用' : '禁用'}。`)
}
function csvCell(value: unknown): string { return `"${String(value ?? '').replaceAll('"', '""')}"` }
function exportUsers(): void {
  const records = store.users.map(user => [
    user.username, user.name, departmentNamesForUser(user, store.departments).join(' / '), roleNamesForUser(user, store.roles).join(' / '),
    user.phone, ({ enabled: '启用', disabled: '禁用', locked: '锁定' } as const)[user.status], formatDateTime(user.lastLoginAt), formatDateTime(user.createdAt),
  ])
  const csv = `\uFEFF${[['用户名', '姓名', '所属组织', '绑定角色', '手机号', '账号状态', '最后登录时间', '创建时间'], ...records].map(record => record.map(csvCell).join(',')).join('\r\n')}`
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `用户管理-${new Date().toISOString().slice(0, 10)}.csv`; anchor.click(); URL.revokeObjectURL(url)
  toast.success('已导出当前页用户。')
}

onMounted(async () => { if (!await store.initialize()) showError('用户数据加载失败') })
</script>

<template>
  <section class="tech-grid min-h-[calc(100svh-4rem)] min-w-0 overflow-x-hidden p-4 lg:p-6" aria-labelledby="user-management-title">
    <div class="mx-auto flex w-full max-w-[1680px] flex-col gap-4">
      <header class="flex flex-col items-stretch gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div class="flex min-w-0 items-center gap-3">
          <span class="grid size-11 shrink-0 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary"><UsersRound class="size-5" aria-hidden="true" /></span>
          <div class="min-w-0"><h1 id="user-management-title" class="text-2xl font-semibold tracking-tight">用户管理</h1><p class="mt-1 text-sm text-muted-foreground">管理系统账号、组织归属与角色绑定</p></div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="lg" class="h-11" @click="organizationOpen = true"><Building2 aria-hidden="true" />组织架构管理</Button>
          <Button variant="outline" size="lg" class="h-11" @click="exportUsers"><Download aria-hidden="true" />导出当前页</Button>
          <Button size="lg" class="h-11" :disabled="!canCreateUser()" @click="openCreate"><Plus aria-hidden="true" />新增用户</Button>
        </div>
      </header>

      <QueryPanel :loading="store.isLoading" @query="applyQuery" @reset="resetQuery">
        <div class="space-y-2"><Label for="user-query-department">所属部门</Label><Select :model-value="query.departmentId || ALL_FILTER_VALUE" @update:model-value="query.departmentId = $event === ALL_FILTER_VALUE ? '' : String($event)"><SelectTrigger id="user-query-department" class="h-11 w-full"><SelectValue placeholder="全部部门" /></SelectTrigger><SelectContent><SelectItem :value="ALL_FILTER_VALUE">全部部门</SelectItem><SelectItem v-for="item in departmentFilterItems" :key="item.id" :value="item.id">{{ item.label }}</SelectItem></SelectContent></Select></div>
        <div class="space-y-2"><Label for="user-query-role">绑定角色</Label><Select :model-value="query.roleId || ALL_FILTER_VALUE" @update:model-value="query.roleId = $event === ALL_FILTER_VALUE ? '' : String($event)"><SelectTrigger id="user-query-role" class="h-11 w-full"><SelectValue placeholder="全部角色" /></SelectTrigger><SelectContent><SelectItem :value="ALL_FILTER_VALUE">全部角色</SelectItem><SelectItem v-for="item in roleFilterItems" :key="item.id" :value="item.id">{{ item.label }}</SelectItem></SelectContent></Select></div>
        <div class="space-y-2"><Label for="user-query-status">账号状态</Label><Select v-model="query.status"><SelectTrigger id="user-query-status" class="h-11 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部状态</SelectItem><SelectItem value="enabled">启用</SelectItem><SelectItem value="disabled">禁用</SelectItem><SelectItem value="locked">锁定</SelectItem></SelectContent></Select></div>
        <div class="space-y-2"><Label for="user-query-keyword">用户名 / 姓名</Label><Input id="user-query-keyword" v-model="query.keyword" class="h-11" placeholder="请输入用户名或姓名" /></div>
      </QueryPanel>

      <DataTable :columns="columns" :rows="rows" row-key="id" :loading="store.isLoading" empty-text="暂无匹配用户" caption="系统用户列表">
        <template #empty><div class="flex flex-col items-center py-8 text-muted-foreground"><UserRoundPlus class="size-8" aria-hidden="true" /><p class="mt-3 text-sm">暂无匹配用户</p><Button v-if="!store.users.length && canCreateUser()" variant="outline" class="mt-4 h-11" @click="openCreate"><Plus />新增首个用户</Button></div></template>
        <template #cell-username="{ row }"><div class="flex items-center gap-2"><code class="text-xs font-semibold">{{ row.username }}</code><Badge v-if="row.builtIn" variant="outline" class="h-5 text-[10px]">超管</Badge></div></template>
        <template #cell-name="{ row }"><span class="font-medium">{{ row.name }}</span></template>
        <template #cell-departments="{ row }"><div class="flex max-w-72 flex-wrap gap-1"><Badge v-for="name in departmentNamesForUser(row, store.departments)" :key="name" variant="outline">{{ name }}</Badge><span v-if="!row.departmentIds.length" class="text-muted-foreground">—</span></div></template>
        <template #cell-roles="{ row }"><div class="flex max-w-72 flex-wrap gap-1"><Badge v-for="name in roleNamesForUser(row, store.roles)" :key="name" variant="secondary">{{ name }}</Badge><span v-if="!row.roleIds.length" class="text-muted-foreground">—</span></div></template>
        <template #cell-phone="{ row }"><span class="font-mono text-xs">{{ maskPhone(row.phone) }}</span></template>
        <template #cell-status="{ row }"><UserStatusBadge :status="row.status" /></template>
        <template #cell-lastLoginAt="{ row }"><time class="text-xs text-muted-foreground">{{ formatDateTime(row.lastLoginAt) }}</time></template>
        <template #cell-createdAt="{ row }"><time class="text-xs text-muted-foreground">{{ formatDateTime(row.createdAt) }}</time></template>
        <template #cell-actions="{ row }">
          <div class="flex justify-end gap-1">
            <Button variant="ghost" size="icon-lg" class="h-11 w-11" :disabled="Boolean(store.loadingDetailId) || !canManageUser(row)" :aria-label="`编辑${row.name}`" @click="openEdit(row)"><PencilLine aria-hidden="true" /></Button>
            <DropdownMenu><DropdownMenuTrigger as-child><Button variant="ghost" size="icon-lg" class="h-11 w-11" :aria-label="`${row.name}更多操作`"><MoreHorizontal aria-hidden="true" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" class="min-w-44">
              <DropdownMenuItem v-if="row.status === 'locked'" class="min-h-10" :disabled="isStatusProtected(row) || !canManageUser(row)" @select="unlockUser(row)"><LockKeyholeOpen />解锁账号</DropdownMenuItem>
              <DropdownMenuItem v-else class="min-h-10" :disabled="isStatusProtected(row) || !canManageUser(row)" @select="statusTarget = { user: row, status: row.status === 'enabled' ? 'disabled' : 'enabled' }"><Power />{{ row.status === 'enabled' ? '禁用账号' : '启用账号' }}</DropdownMenuItem>
              <DropdownMenuItem class="min-h-10" :disabled="!canManageUser(row)" @select="openEdit(row, 'password')"><KeyRound />重置密码</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" class="min-h-10" :disabled="!canDelete(row)" @select="requestDelete(row)"><Trash2 />删除用户</DropdownMenuItem>
            </DropdownMenuContent></DropdownMenu>
          </div>
        </template>
      </DataTable>
      <PaginationBar :page="store.page" :page-size="PAGE_SIZE" :page-sizes="[PAGE_SIZE]" :total="store.total" :disabled="store.isLoading" @update:page="changePage" />
    </div>

    <CrudDialog :open="createOpen" mode="create" title="新增用户" description="创建账号并配置所属部门与绑定角色。" size="wide" :saving="store.isSaving" :dirty="createDirty" @submit="saveCreate" @request-close="requestCreateClose">
      <UserCreateForm ref="createFormRef" :value="createValue" :departments="store.departments" :roles="createRoleOptions" :issues="createIssues" :saving="store.isSaving" @update:value="createValue = $event; createIssues = []" />
    </CrudDialog>

    <CrudDialog :open="Boolean(editing)" mode="edit" :title="`编辑用户 · ${editing?.name ?? ''}`" description="基本资料与密码重置分开保存。" size="wide" :saving="store.isSaving" :dirty="editDirty" :submit-label="editTab === 'basic' ? '保存基本信息' : '确认重置密码'" @submit="submitEdit" @request-close="requestEditClose">
      <div class="mb-5 grid grid-cols-2 rounded-xl bg-muted/60 p-1" role="tablist" aria-label="编辑用户页签">
        <button type="button" role="tab" class="min-h-11 rounded-lg px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50" :class="editTab === 'basic' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'" :aria-selected="editTab === 'basic'" @click="requestTab('basic')">基本信息</button>
        <button type="button" role="tab" class="min-h-11 rounded-lg px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50" :class="editTab === 'password' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'" :aria-selected="editTab === 'password'" @click="requestTab('password')">重置密码</button>
      </div>
      <UserBasicForm v-if="editing && editTab === 'basic'" ref="basicFormRef" :user="editing" :value="basicValue" :departments="store.departments" :roles="editRoleOptions" :issues="basicIssues" :saving="store.isSaving" :status-protected="isStatusProtected(editing)" @update:value="basicValue = $event; basicIssues = []" />
      <UserPasswordResetForm v-else-if="editing" ref="passwordFormRef" :value="passwordValue" :issues="passwordIssues" :saving="store.isSaving" @update:value="passwordValue = $event; passwordIssues = []" />
    </CrudDialog>

    <AlertDialog :open="Boolean(pendingDiscard)" @update:open="!$event && (pendingDiscard = null)"><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>放弃未保存的修改？</AlertDialogTitle><AlertDialogDescription>当前页签存在未保存内容，继续后这些修改将无法恢复。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>继续编辑</AlertDialogCancel><Button variant="destructive" @click="discardChanges">放弃修改</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog :open="resetConfirmOpen" @update:open="resetConfirmOpen = $event"><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>确认重置“{{ editing?.name }}”的密码？</AlertDialogTitle><AlertDialogDescription>重置后该用户下次登录需要修改密码；密码明文不会保存到浏览器。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>返回检查</AlertDialogCancel><Button :disabled="store.isSaving" @click="confirmPasswordReset"><KeyRound />确认重置</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog :open="Boolean(statusTarget)" @update:open="!$event && (statusTarget = null)"><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>确认{{ statusTarget?.status === 'enabled' ? '启用' : '禁用' }}“{{ statusTarget?.user.name }}”？</AlertDialogTitle><AlertDialogDescription>{{ statusTarget?.status === 'enabled' ? '启用后该账号可恢复使用。' : '禁用后该账号将不能登录系统，已有配置关系会保留。' }}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><Button :variant="statusTarget?.status === 'disabled' ? 'destructive' : 'default'" :disabled="store.isSaving" @click="confirmStatus"><Power />确认{{ statusTarget?.status === 'enabled' ? '启用' : '禁用' }}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog :open="Boolean(deleteTarget)" @update:open="!$event && (deleteTarget = null)"><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>确认删除“{{ deleteTarget?.name }}”？</AlertDialogTitle><AlertDialogDescription>删除后不可恢复；如该用户是部门主管，对应主管引用会自动置空。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><Button variant="destructive" :disabled="Boolean(store.deletingId)" @click="removeUser"><Trash2 />{{ store.deletingId ? '删除中' : '确认删除' }}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>

    <OrganizationManagementSheet :open="organizationOpen" @update:open="organizationOpen = $event" />
  </section>
</template>
