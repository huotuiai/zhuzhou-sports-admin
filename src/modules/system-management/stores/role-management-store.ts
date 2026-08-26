import type {
  RoleBasicInfoInput,
  RoleCreateInput,
  RoleManagementService,
  RolePermissionInput,
  RoleQuery,
  SystemDepartment,
  SystemPermission,
  SystemRole,
  SystemUser,
  UserManagementService,
  UserQuery,
} from '../types'
import { computed, reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import { roleManagementService } from '../services/role-management-service'
import { userManagementService } from '../services/user-management-service'

const DEFAULT_QUERY: RoleQuery = { keyword: '' }
const DEFAULT_USER_QUERY: UserQuery = {
  keyword: '',
  departmentId: '',
  roleId: '',
  status: 'all',
}
const PAGE_SIZE = 20
const REFERENCE_PAGE_SIZE = 100

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : '操作失败，请稍后重试'
}

function mergeUsers(primary: readonly SystemUser[], secondary: readonly SystemUser[]): SystemUser[] {
  const users = new Map(primary.map(user => [user.id, user]))
  for (const user of secondary) if (!users.has(user.id)) users.set(user.id, user)
  return [...users.values()]
}

export function createRoleManagementStore(
  service: RoleManagementService,
  usersService: UserManagementService,
  storeId = 'role-management',
) {
  return defineStore(storeId, () => {
    const roles = ref<SystemRole[]>([])
    const permissions = ref<SystemPermission[]>([])
    const roleReferences = ref<SystemRole[]>([])
    const assignmentUsers = ref<SystemUser[]>([])
    const assignmentDepartments = ref<SystemDepartment[]>([])
    const assignmentBoundUserIds = ref<string[]>([])
    const assignmentRoleId = ref<string | null>(null)
    const query = reactive<RoleQuery>({ ...DEFAULT_QUERY })
    const page = ref(1)
    const pageSize = ref(PAGE_SIZE)
    const total = ref(0)
    const initialized = ref(false)
    const referencesLoaded = ref(false)
    const isLoading = ref(false)
    const isSaving = ref(false)
    const isLoadingReferences = ref(false)
    const isLoadingAssignment = ref(false)
    const loadingDetailId = ref<string | null>(null)
    const deletingId = ref<string | null>(null)
    const error = ref<string | null>(null)
    let initializePromise: Promise<boolean> | null = null
    let referencePromise: Promise<boolean> | null = null

    const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))

    async function fetchAllRoles(): Promise<SystemRole[]> {
      const first = await service.listRoles(DEFAULT_QUERY, 1, REFERENCE_PAGE_SIZE)
      const count = Math.ceil(first.total / REFERENCE_PAGE_SIZE)
      if (count <= 1) return first.roles
      const remaining = await Promise.all(
        Array.from({ length: count - 1 }, (_, index) => service.listRoles(DEFAULT_QUERY, index + 2, REFERENCE_PAGE_SIZE)),
      )
      return [first.roles, ...remaining.map(result => result.roles)].flat()
    }

    async function fetchAllUsers(): Promise<SystemUser[]> {
      const first = await usersService.listUsers(DEFAULT_USER_QUERY, 1, REFERENCE_PAGE_SIZE)
      const count = Math.ceil(first.total / REFERENCE_PAGE_SIZE)
      if (count <= 1) return first.users
      const remaining = await Promise.all(
        Array.from({ length: count - 1 }, (_, index) => usersService.listUsers(DEFAULT_USER_QUERY, index + 2, REFERENCE_PAGE_SIZE)),
      )
      return [first.users, ...remaining.map(result => result.users)].flat()
    }

    async function loadCurrentRoles(): Promise<void> {
      const result = await service.listRoles({ ...query }, page.value, pageSize.value)
      roles.value = result.roles
      total.value = result.total
      page.value = result.page
      pageSize.value = result.pageSize
    }

    async function initialize(force = false): Promise<boolean> {
      if (initialized.value && !force) return true
      if (initializePromise) return initializePromise
      isLoading.value = true
      error.value = null
      initializePromise = Promise.all([
        service.listRoles({ ...query }, page.value, pageSize.value),
        service.listMenus(),
      ]).then(([rolePage, menuList]) => {
        roles.value = rolePage.roles
        total.value = rolePage.total
        page.value = rolePage.page
        pageSize.value = rolePage.pageSize
        permissions.value = menuList
        initialized.value = true
        return true
      }).catch((cause) => {
        error.value = errorMessage(cause)
        return false
      }).finally(() => {
        isLoading.value = false
        initializePromise = null
      })
      return initializePromise
    }

    async function queryRoles(nextQuery?: RoleQuery): Promise<boolean> {
      if (nextQuery) Object.assign(query, nextQuery)
      page.value = 1
      isLoading.value = true
      error.value = null
      try {
        await loadCurrentRoles()
        return true
      }
      catch (cause) {
        error.value = errorMessage(cause)
        return false
      }
      finally {
        isLoading.value = false
      }
    }

    async function changePage(nextPage: number): Promise<boolean> {
      const normalized = Number.isFinite(nextPage) ? Math.trunc(nextPage) : 1
      page.value = Math.min(Math.max(1, normalized), pageCount.value)
      isLoading.value = true
      error.value = null
      try {
        await loadCurrentRoles()
        return true
      }
      catch (cause) {
        error.value = errorMessage(cause)
        return false
      }
      finally {
        isLoading.value = false
      }
    }

    async function getRole(id: string): Promise<SystemRole | null> {
      loadingDetailId.value = id
      error.value = null
      try {
        return await service.getRole(id)
      }
      catch (cause) {
        error.value = errorMessage(cause)
        return null
      }
      finally {
        loadingDetailId.value = null
      }
    }

    async function runRoleSave<T>(operation: () => Promise<T>, resetPage = false): Promise<T | null> {
      isSaving.value = true
      error.value = null
      try {
        const result = await operation()
        if (resetPage) page.value = 1
        await loadCurrentRoles()
        referencesLoaded.value = false
        return result
      }
      catch (cause) {
        error.value = errorMessage(cause)
        return null
      }
      finally {
        isSaving.value = false
      }
    }

    const createRole = (input: RoleCreateInput) => runRoleSave(() => service.createRole(input), true)
    const updateRole = (id: string, input: RoleBasicInfoInput) => runRoleSave(() => service.updateRole(id, input))

    async function updatePermissions(id: string, input: RolePermissionInput): Promise<SystemRole | null> {
      const role = roles.value.find(item => item.id === id) ?? roleReferences.value.find(item => item.id === id)
      if (role?.kind === 'super-admin') {
        error.value = '超级管理员权限只读，不允许修改'
        return null
      }
      return runRoleSave(() => service.replaceRoleMenus(id, input))
    }

    async function deleteRole(id: string): Promise<boolean> {
      const role = roles.value.find(item => item.id === id) ?? roleReferences.value.find(item => item.id === id)
      if (role?.kind !== 'custom') {
        error.value = '预置角色不能删除'
        return false
      }
      if ((role.userCount ?? 0) > 0) {
        error.value = '该角色已有绑定用户，请先解除全部绑定'
        return false
      }
      deletingId.value = id
      error.value = null
      try {
        await service.deleteRole(id)
        if (roles.value.length <= 1 && page.value > 1) page.value -= 1
        await loadCurrentRoles()
        referencesLoaded.value = false
        return true
      }
      catch (cause) {
        error.value = errorMessage(cause)
        return false
      }
      finally {
        deletingId.value = null
      }
    }

    async function loadRoleReferences(force = false): Promise<boolean> {
      if (referencesLoaded.value && !force) return true
      if (referencePromise) return referencePromise
      isLoadingReferences.value = true
      error.value = null
      referencePromise = fetchAllRoles().then((result) => {
        roleReferences.value = result
        referencesLoaded.value = true
        return true
      }).catch((cause) => {
        error.value = errorMessage(cause)
        return false
      }).finally(() => {
        isLoadingReferences.value = false
        referencePromise = null
      })
      return referencePromise
    }

    async function loadAssignment(roleId: string): Promise<boolean> {
      isLoadingAssignment.value = true
      error.value = null
      try {
        const [boundUsers, allUsers, departments] = await Promise.all([
          service.listRoleUsers(roleId),
          fetchAllUsers(),
          usersService.listDepartments(),
        ])
        const boundIds = new Set(boundUsers.map(user => user.id))
        assignmentUsers.value = mergeUsers(
          allUsers.filter(user => !user.builtIn || boundIds.has(user.id)),
          boundUsers,
        )
        assignmentDepartments.value = departments
        assignmentBoundUserIds.value = boundUsers.map(user => user.id)
        assignmentRoleId.value = roleId
        return true
      }
      catch (cause) {
        error.value = errorMessage(cause)
        return false
      }
      finally {
        isLoadingAssignment.value = false
      }
    }

    async function replaceRoleUsers(id: string, userIds: readonly string[]): Promise<boolean> {
      const role = roles.value.find(item => item.id === id) ?? roleReferences.value.find(item => item.id === id)
      if (role?.kind === 'super-admin') {
        error.value = '超级管理员的用户绑定只读，不允许修改'
        return false
      }
      const selected = new Set(userIds)
      const protectedIds = assignmentUsers.value
        .filter(user => user.builtIn && assignmentBoundUserIds.value.includes(user.id))
        .map(user => user.id)
      if (protectedIds.some(userId => !selected.has(userId))) {
        error.value = '已有超级管理员账号的受保护关系不能移除'
        return false
      }
      const allowedIds = new Set(assignmentUsers.value.map(user => user.id))
      if (userIds.some(userId => !allowedIds.has(userId))) {
        error.value = '所选用户不存在或不可绑定'
        return false
      }
      isSaving.value = true
      error.value = null
      try {
        await service.replaceRoleUsers(id, userIds)
        assignmentBoundUserIds.value = [...userIds]
        await loadCurrentRoles()
        return true
      }
      catch (cause) {
        error.value = errorMessage(cause)
        return false
      }
      finally {
        isSaving.value = false
      }
    }

    function resetError(): void {
      error.value = null
    }

    return {
      roles,
      permissions,
      roleReferences,
      assignmentUsers,
      assignmentDepartments,
      assignmentBoundUserIds,
      assignmentRoleId,
      query,
      page,
      pageSize,
      total,
      pageCount,
      initialized,
      referencesLoaded,
      isLoading,
      isSaving,
      isLoadingReferences,
      isLoadingAssignment,
      loadingDetailId,
      deletingId,
      error,
      initialize,
      queryRoles,
      changePage,
      getRole,
      createRole,
      updateRole,
      deleteRole,
      updatePermissions,
      loadRoleReferences,
      loadAssignment,
      replaceRoleUsers,
      resetError,
    }
  })
}

export const useRoleManagementStore = createRoleManagementStore(roleManagementService, userManagementService)
