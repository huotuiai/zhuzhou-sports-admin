<script setup lang="ts">
import type { CrudDialogCloseRequest, DataTableColumn } from '@/components/common'
import type {
  RoleBasicInfoInput,
  RoleCreateInput,
  RolePermissionInput,
  SystemRole,
  ValidationIssue,
} from '@/modules/system-management/types'
import { computed, nextTick, onMounted, ref } from 'vue'
import {
  CircleEllipsis,
  Download,
  KeyRound,
  PencilLine,
  Plus,
  ShieldCheck,
  Trash2,
  UsersRound,
} from '@lucide/vue'
import { toast } from 'vue-sonner'
import { CrudDialog, DataTable, PaginationBar, QueryPanel } from '@/components/common'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import RoleBasicForm from '@/modules/system-management/components/RoleBasicForm.vue'
import RoleCreateForm from '@/modules/system-management/components/RoleCreateForm.vue'
import RolePermissionForm from '@/modules/system-management/components/RolePermissionForm.vue'
import RoleUserAssignment from '@/modules/system-management/components/RoleUserAssignment.vue'
import { useUnsavedDialogGuard } from '@/modules/system-management/composables/use-unsaved-dialog-guard'
import { ROLE_KIND_LABELS, summarizeRolePermissions } from '@/modules/system-management/lib/rbac'
import {
  validateRoleBasicInfoInput,
  validateRoleCreateInput,
  validateRolePermissionInput,
} from '@/modules/system-management/services/role-management-validation'
import { useRoleManagementStore } from '@/modules/system-management/stores/role-management-store'

type DialogKind = 'create' | 'edit' | 'permission' | 'assignment'
interface FormHandle { validateAndFocus(): boolean }

const EMPTY_CREATE: RoleCreateInput = { name: '', description: '', permissionIds: [] }
const EMPTY_BASIC: RoleBasicInfoInput = { name: '', description: '' }
const EMPTY_PERMISSION: RolePermissionInput = { permissionIds: [] }

const columns: readonly DataTableColumn<SystemRole>[] = [
  { key: 'name', label: '角色名称', minWidth: '190px' },
  { key: 'kind', label: '标识', width: '100px', align: 'center' },
  { key: 'users', label: '绑定用户数', width: '120px', align: 'center' },
  { key: 'permissions', label: '权限范围', minWidth: '180px' },
  { key: 'description', label: '描述', minWidth: '240px' },
  { key: 'createdAt', label: '创建时间', minWidth: '130px' },
  { key: 'actions', label: '操作', width: '176px', align: 'right' },
]

const store = useRoleManagementStore()
const queryDraft = ref(store.query.keyword)

const createOpen = ref(false)
const createForm = ref<RoleCreateInput>({ ...EMPTY_CREATE, permissionIds: [] })
const createReferenceRoleId = ref<string | null>(null)
const createInitialJson = ref('')
const createIssues = ref<readonly ValidationIssue<keyof RoleCreateInput>[]>([])
const createFormRef = ref<FormHandle | null>(null)

const editRole = ref<SystemRole | null>(null)
const editForm = ref<RoleBasicInfoInput>({ ...EMPTY_BASIC })
const editInitialJson = ref('')
const editIssues = ref<readonly ValidationIssue<keyof RoleBasicInfoInput>[]>([])
const editFormRef = ref<FormHandle | null>(null)

const permissionRole = ref<SystemRole | null>(null)
const permissionForm = ref<RolePermissionInput>({ ...EMPTY_PERMISSION, permissionIds: [] })
const permissionInitialJson = ref('')
const permissionIssues = ref<readonly ValidationIssue<keyof RolePermissionInput>[]>([])
const permissionFormRef = ref<FormHandle | null>(null)

const assignmentRole = ref<SystemRole | null>(null)
const assignmentUserIds = ref<string[]>([])
const assignmentInitialJson = ref('')

const pendingDiscard = ref<DialogKind | null>(null)
const deleteTarget = ref<SystemRole | null>(null)

const rows = computed(() => store.roles)
const createDirty = computed(() => JSON.stringify({ value: createForm.value, referenceRoleId: createReferenceRoleId.value }) !== createInitialJson.value)
const editDirty = computed(() => JSON.stringify(editForm.value) !== editInitialJson.value)
const permissionDirty = computed(() => JSON.stringify(permissionForm.value) !== permissionInitialJson.value)
const assignmentDirty = computed(() => JSON.stringify([...assignmentUserIds.value].sort()) !== assignmentInitialJson.value)
const anyDialogOpen = computed(() => createOpen.value || Boolean(editRole.value || permissionRole.value || assignmentRole.value))
const anyDialogDirty = computed(() => createOpen.value ? createDirty.value : editRole.value ? editDirty.value : permissionRole.value ? permissionDirty.value : assignmentRole.value ? assignmentDirty.value : false)
const deleteBoundCount = computed(() => deleteTarget.value?.userCount ?? 0)
const assignmentReadOnly = computed(() => assignmentRole.value?.kind === 'super-admin')
const assignmentProtectedUserIds = computed(() => store.assignmentUsers
  .filter(user => user.builtIn && assignmentUserIds.value.includes(user.id))
  .map(user => user.id))

useUnsavedDialogGuard(() => anyDialogOpen.value, () => anyDialogDirty.value, '角色')

async function applyQuery(): Promise<void> {
  if (!await store.queryRoles({ keyword: queryDraft.value })) showStoreError('角色查询失败')
}

async function resetQuery(): Promise<void> {
  queryDraft.value = ''
  await applyQuery()
}

async function changePage(page: number): Promise<void> {
  if (!await store.changePage(page)) showStoreError('角色列表加载失败')
}

async function changePageSize(pageSize: number): Promise<void> {
  if (!await store.changePageSize(pageSize)) showStoreError('角色列表加载失败')
}

function userCount(role: SystemRole): number {
  return role.userCount ?? 0
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

function roleKindClass(role: SystemRole): string {
  if (role.kind === 'super-admin') return 'border-destructive/30 bg-destructive/10 text-destructive'
  if (role.kind === 'preset') return 'border-primary/30 bg-primary/10 text-primary'
  return 'border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-300'
}

function permissionSummary(role: SystemRole): string {
  return summarizeRolePermissions(role, store.permissions).label
}

async function openCreate(): Promise<void> {
  if (!await store.loadRoleReferences()) return showStoreError('参考角色加载失败')
  createForm.value = { ...EMPTY_CREATE, permissionIds: [] }
  createReferenceRoleId.value = null
  createIssues.value = []
  createInitialJson.value = JSON.stringify({ value: createForm.value, referenceRoleId: null })
  createOpen.value = true
}

async function openEdit(role: SystemRole): Promise<void> {
  const [referencesLoaded, detail] = await Promise.all([
    store.loadRoleReferences(),
    store.getRole(role.id),
  ])
  if (!referencesLoaded || !detail) return showStoreError('角色详情加载失败')
  editRole.value = detail
  editForm.value = { name: detail.name, description: detail.description }
  editInitialJson.value = JSON.stringify(editForm.value)
  editIssues.value = []
}

async function openPermission(role: SystemRole): Promise<void> {
  const detail = await store.getRole(role.id)
  if (!detail) return showStoreError('角色详情加载失败')
  permissionRole.value = detail
  permissionForm.value = {
    permissionIds: detail.kind === 'super-admin'
      ? store.permissions.map(permission => permission.id)
      : [...detail.permissionIds],
  }
  permissionInitialJson.value = JSON.stringify(permissionForm.value)
  permissionIssues.value = []
}

async function openAssignment(role: SystemRole): Promise<void> {
  if (!await store.loadAssignment(role.id)) return showStoreError('角色用户加载失败')
  assignmentRole.value = role
  assignmentUserIds.value = [...store.assignmentBoundUserIds]
  assignmentInitialJson.value = JSON.stringify([...assignmentUserIds.value].sort())
}

function closeDialog(kind: DialogKind): void {
  if (kind === 'create') {
    createOpen.value = false
    createIssues.value = []
  }
  if (kind === 'edit') {
    editRole.value = null
    editIssues.value = []
  }
  if (kind === 'permission') {
    permissionRole.value = null
    permissionIssues.value = []
  }
  if (kind === 'assignment') assignmentRole.value = null
  pendingDiscard.value = null
}

function requestClose(kind: DialogKind, request: CrudDialogCloseRequest): void {
  if (request.dirty) pendingDiscard.value = kind
  else closeDialog(kind)
}

function discardChanges(): void {
  if (pendingDiscard.value) closeDialog(pendingDiscard.value)
}

async function saveCreate(): Promise<void> {
  createIssues.value = validateRoleCreateInput(createForm.value, store.roleReferences, store.permissions)
  await nextTick()
  if (!createFormRef.value?.validateAndFocus() || createIssues.value.length) return
  const saved = await store.createRole(createForm.value)
  if (!saved) return showStoreError('角色创建失败')
  closeDialog('create')
  toast.success('角色已创建。')
}

async function saveEdit(): Promise<void> {
  if (!editRole.value) return
  editIssues.value = validateRoleBasicInfoInput(editForm.value, store.roleReferences, editRole.value.id)
  await nextTick()
  if (!editFormRef.value?.validateAndFocus() || editIssues.value.length) return
  const saved = await store.updateRole(editRole.value.id, editForm.value)
  if (!saved) return showStoreError('角色更新失败')
  closeDialog('edit')
  toast.success('角色信息已更新。')
}

async function savePermissions(): Promise<void> {
  if (!permissionRole.value || permissionRole.value.kind === 'super-admin') return
  permissionIssues.value = validateRolePermissionInput(permissionForm.value, store.permissions)
  await nextTick()
  if (!permissionFormRef.value?.validateAndFocus() || permissionIssues.value.length) return
  const saved = await store.updatePermissions(permissionRole.value.id, permissionForm.value)
  if (!saved) return showStoreError('权限保存失败')
  closeDialog('permission')
  toast.success('角色权限已更新。')
}

async function saveAssignment(): Promise<void> {
  if (!assignmentRole.value || assignmentReadOnly.value) return
  const saved = await store.replaceRoleUsers(assignmentRole.value.id, assignmentUserIds.value)
  if (!saved) return showStoreError('角色分配保存失败')
  closeDialog('assignment')
  toast.success('角色用户绑定已更新。')
}

function requestDelete(role: SystemRole): void {
  if (role.kind !== 'custom') return
  deleteTarget.value = role
}

async function removeRole(): Promise<void> {
  if (!deleteTarget.value || deleteBoundCount.value > 0) return
  const removed = await store.deleteRole(deleteTarget.value.id)
  if (!removed) return showStoreError('角色删除失败')
  deleteTarget.value = null
  toast.success('角色已删除。')
}

function showStoreError(fallback: string): void {
  toast.error(store.error ?? fallback)
  store.resetError()
}

function csvCell(value: unknown): string {
  return `"${String(value ?? '').replaceAll('"', '""')}"`
}

function exportRoles(): void {
  const headers = ['角色名称', '标识', '绑定用户数', '权限范围', '描述', '创建时间']
  const records = rows.value.map((role) => [
    role.name,
    ROLE_KIND_LABELS[role.kind],
    userCount(role),
    permissionSummary(role),
    role.description,
    formatDate(role.createdAt),
  ])
  const csv = `\uFEFF${[headers, ...records].map((record) => record.map(csvCell).join(',')).join('\r\n')}`
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `角色管理-${new Date().toISOString().slice(0, 10)}.csv`
  anchor.click()
  URL.revokeObjectURL(url)
  toast.success('已导出当前页角色。')
}

onMounted(async () => {
  if (!await store.refresh()) showStoreError('角色数据加载失败')
  queryDraft.value = store.query.keyword
})
</script>

<template>
  <section class="tech-grid min-h-[calc(100svh-4rem)] min-w-0 overflow-x-hidden p-4 lg:p-6" aria-labelledby="role-management-title">
    <div class="mx-auto flex w-full max-w-[1680px] flex-col gap-4">
      <header class="flex flex-col items-stretch gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div class="flex min-w-0 items-center gap-3">
          <span class="grid size-11 shrink-0 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
            <ShieldCheck class="size-5" aria-hidden="true" />
          </span>
          <div class="min-w-0">
            <h1 id="role-management-title" class="text-2xl font-semibold tracking-tight">角色管理</h1>
            <p class="mt-1 text-sm text-muted-foreground">管理角色、固定权限范围与用户绑定</p>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="lg" class="h-11" :disabled="rows.length === 0" @click="exportRoles">
            <Download aria-hidden="true" />导出当前页
          </Button>
          <Button size="lg" class="h-11" @click="openCreate">
            <Plus aria-hidden="true" />新增角色
          </Button>
        </div>
      </header>

      <QueryPanel :loading="store.isLoading" @query="applyQuery" @reset="resetQuery">
        <div class="space-y-2">
          <Label for="role-query-name">角色名称</Label>
          <Input id="role-query-name" v-model="queryDraft" class="h-11" placeholder="输入角色名称关键字" @keydown.enter.prevent="applyQuery" />
        </div>
      </QueryPanel>

      <DataTable :columns="columns" :rows="rows" row-key="id" :loading="store.isLoading" empty-text="暂无角色" caption="系统角色列表">
        <template #cell-name="{ row }">
          <span class="block max-w-52 truncate font-medium" :title="row.name">{{ row.name }}</span>
        </template>
        <template #cell-kind="{ row }">
          <Badge variant="outline" :class="roleKindClass(row)">{{ ROLE_KIND_LABELS[row.kind] }}</Badge>
        </template>
        <template #cell-users="{ row }">
          <span class="font-semibold tabular-nums">{{ userCount(row) }}</span>
        </template>
        <template #cell-permissions="{ row }">
          <span class="whitespace-nowrap text-sm">{{ permissionSummary(row) }}</span>
        </template>
        <template #cell-description="{ row }">
          <span class="block max-w-72 truncate text-sm text-muted-foreground" :title="row.description">{{ row.description || '—' }}</span>
        </template>
        <template #cell-createdAt="{ row }">
          <time class="whitespace-nowrap text-xs tabular-nums text-muted-foreground" :datetime="row.createdAt">{{ formatDate(row.createdAt) }}</time>
        </template>
        <template #cell-actions="{ row }">
          <div class="flex justify-end gap-1">
            <Button variant="ghost" size="lg" class="h-10 px-3" @click="openEdit(row)">
              <PencilLine aria-hidden="true" />编辑
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button variant="ghost" size="icon-lg" class="h-10 w-10" :aria-label="`${row.name}更多操作`">
                  <CircleEllipsis aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" class="w-44">
                <DropdownMenuLabel>{{ row.name }}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem @select="openPermission(row)"><KeyRound aria-hidden="true" />权限分配</DropdownMenuItem>
                <DropdownMenuItem @select="openAssignment(row)"><UsersRound aria-hidden="true" />分配用户</DropdownMenuItem>
                <template v-if="row.kind === 'custom'">
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" @select="requestDelete(row)"><Trash2 aria-hidden="true" />删除</DropdownMenuItem>
                </template>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </template>
      </DataTable>

      <PaginationBar
        :page="store.page"
        :page-size="store.pageSize"
        :page-sizes="[20, 50, 100]"
        :total="store.total"
        :disabled="store.isLoading"
        @update:page="changePage"
        @update:page-size="changePageSize"
      />
    </div>

    <CrudDialog
      :open="createOpen"
      mode="create"
      size="wide"
      title="新增角色"
      description="填写基本信息，可复制参考角色后继续调整权限。"
      :saving="store.isSaving"
      :dirty="createDirty"
      @submit="saveCreate"
      @request-close="requestClose('create', $event)"
    >
      <RoleCreateForm
        ref="createFormRef"
        :value="createForm"
        :reference-role-id="createReferenceRoleId"
        :roles="store.roleReferences"
        :permissions="store.permissions"
        :issues="createIssues"
        :saving="store.isSaving"
        @update:value="createForm = $event; createIssues = []"
        @update:reference-role-id="createReferenceRoleId = $event"
      />
    </CrudDialog>

    <CrudDialog
      :open="Boolean(editRole)"
      mode="edit"
      :title="`编辑角色 · ${editRole?.name ?? ''}`"
      description="编辑角色名称与职责描述，权限请通过“更多 → 权限分配”维护。"
      :saving="store.isSaving"
      :dirty="editDirty"
      @submit="saveEdit"
      @request-close="requestClose('edit', $event)"
    >
      <RoleBasicForm
        ref="editFormRef"
        :value="editForm"
        :issues="editIssues"
        :saving="store.isSaving"
        :super-admin="editRole?.kind === 'super-admin'"
        @update:value="editForm = $event; editIssues = []"
      />
    </CrudDialog>

    <CrudDialog
      :open="Boolean(permissionRole)"
      mode="edit"
      size="wide"
      :title="`权限分配 · ${permissionRole?.name ?? ''}`"
      description="权限项由系统代码预置，角色可按页面与功能点进行授权。"
      submit-label="保存权限"
      :saving="store.isSaving"
      :dirty="permissionDirty"
      :submit-disabled="permissionRole?.kind === 'super-admin'"
      @submit="savePermissions"
      @request-close="requestClose('permission', $event)"
    >
      <RolePermissionForm
        ref="permissionFormRef"
        :value="permissionForm"
        :permissions="store.permissions"
        :issues="permissionIssues"
        :saving="store.isSaving"
        :locked="permissionRole?.kind === 'super-admin'"
        @update:value="permissionForm = $event; permissionIssues = []"
      />
    </CrudDialog>

    <CrudDialog
      :open="Boolean(assignmentRole)"
      mode="edit"
      size="wide"
      :title="`角色分配 · ${assignmentRole?.name ?? ''}`"
      :description="assignmentReadOnly ? '超级管理员的用户绑定仅作只读展示。' : '用户可同时绑定多个角色，此处仅调整当前角色的绑定关系。'"
      submit-label="保存分配"
      :saving="store.isSaving"
      :dirty="assignmentDirty"
      :submit-disabled="assignmentReadOnly"
      @submit="saveAssignment"
      @request-close="requestClose('assignment', $event)"
    >
      <RoleUserAssignment
        :users="store.assignmentUsers"
        :departments="store.assignmentDepartments"
        :model-value="assignmentUserIds"
        :protected-user-ids="assignmentProtectedUserIds"
        :disabled="store.isSaving || assignmentReadOnly"
        @update:model-value="assignmentUserIds = $event"
      />
    </CrudDialog>

    <AlertDialog :open="Boolean(pendingDiscard)" @update:open="!$event && (pendingDiscard = null)">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>放弃未保存的修改？</AlertDialogTitle>
          <AlertDialogDescription>当前角色信息尚未保存，关闭后无法恢复。</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>继续编辑</AlertDialogCancel>
          <Button variant="destructive" @click="discardChanges">放弃修改</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog :open="Boolean(deleteTarget)" @update:open="!$event && (deleteTarget = null)">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{{ deleteBoundCount ? '该角色无法删除' : `确认删除“${deleteTarget?.name ?? ''}”？` }}</AlertDialogTitle>
          <AlertDialogDescription v-if="deleteBoundCount">
            该角色已绑定 {{ deleteBoundCount }} 个用户，请先通过“分配用户”解除全部绑定。
          </AlertDialogDescription>
          <AlertDialogDescription v-else>
            删除后不可恢复，该角色的权限关系将一并删除。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{{ deleteBoundCount ? '我知道了' : '取消' }}</AlertDialogCancel>
          <Button v-if="!deleteBoundCount" variant="destructive" :disabled="Boolean(store.deletingId)" @click="removeRole">
            <Trash2 aria-hidden="true" />{{ store.deletingId ? '删除中' : '确认删除' }}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>
</template>
