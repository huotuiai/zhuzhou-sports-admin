import type {
  DepartmentWriteInput,
  SystemDepartment,
  SystemRole,
  SystemUser,
  UserBasicInfoInput,
  UserCreateInput,
  UserManagementService,
  UserManagementValidationContext,
  UserPasswordResetInput,
  UserQuery,
  UserStatus,
  UserUpdateOptions,
} from '../types'
import { computed, reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import { userManagementService } from '../services/user-management-service'

const DEFAULT_QUERY: UserQuery = {
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

export function createUserManagementStore(service: UserManagementService, storeId = 'user-management') {
  return defineStore(storeId, () => {
    const users = ref<SystemUser[]>([])
    const departments = ref<SystemDepartment[]>([])
    const roles = ref<SystemRole[]>([])
    const departmentLeaderCandidates = ref<SystemUser[]>([])
    const query = reactive<UserQuery>({ ...DEFAULT_QUERY })
    const page = ref(1)
    const pageSize = ref(PAGE_SIZE)
    const total = ref(0)
    const initialized = ref(false)
    const leaderCandidatesLoaded = ref(false)
    const isLoading = ref(false)
    const isSaving = ref(false)
    const isLoadingLeaderCandidates = ref(false)
    const loadingDetailId = ref<string | null>(null)
    const deletingId = ref<string | null>(null)
    const error = ref<string | null>(null)
    let initializePromise: Promise<boolean> | null = null

    const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
    const validationContext = computed<UserManagementValidationContext>(() => ({
      users: leaderCandidatesLoaded.value ? departmentLeaderCandidates.value : users.value,
      departments: departments.value,
      roles: roles.value,
    }))

    async function fetchAllRoles(): Promise<SystemRole[]> {
      const first = await service.listRoles(1, REFERENCE_PAGE_SIZE)
      const count = Math.ceil(first.total / REFERENCE_PAGE_SIZE)
      if (count <= 1) return first.roles
      const remaining = await Promise.all(
        Array.from({ length: count - 1 }, (_, index) => service.listRoles(index + 2, REFERENCE_PAGE_SIZE)),
      )
      return [first.roles, ...remaining.map(result => result.roles)].flat()
    }

    async function fetchAllUsers(): Promise<SystemUser[]> {
      const first = await service.listUsers(DEFAULT_QUERY, 1, REFERENCE_PAGE_SIZE)
      const count = Math.ceil(first.total / REFERENCE_PAGE_SIZE)
      if (count <= 1) return first.users
      const remaining = await Promise.all(
        Array.from({ length: count - 1 }, (_, index) => service.listUsers(DEFAULT_QUERY, index + 2, REFERENCE_PAGE_SIZE)),
      )
      return [first.users, ...remaining.map(result => result.users)].flat()
    }

    async function loadCurrentUsers(): Promise<void> {
      const result = await service.listUsers({ ...query }, page.value, pageSize.value)
      users.value = result.users
      total.value = result.total
      page.value = result.page
      pageSize.value = result.pageSize
    }

    async function refresh(): Promise<boolean> {
      if (initializePromise) return initializePromise
      isLoading.value = true
      error.value = null
      leaderCandidatesLoaded.value = false
      initializePromise = Promise.all([
        service.listUsers({ ...query }, page.value, pageSize.value),
        service.listDepartments(),
        fetchAllRoles(),
      ]).then(async ([userPage, departmentList, roleList]) => {
        let currentUserPage = userPage
        const validPage = Math.max(1, Math.ceil(userPage.total / userPage.pageSize))
        if (userPage.page > validPage) {
          currentUserPage = await service.listUsers({ ...query }, validPage, userPage.pageSize)
        }
        users.value = currentUserPage.users
        total.value = currentUserPage.total
        page.value = currentUserPage.page
        pageSize.value = currentUserPage.pageSize
        departments.value = departmentList
        roles.value = roleList
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

    async function initialize(force = false): Promise<boolean> {
      if (initialized.value && !force) return true
      return refresh()
    }

    async function queryUsers(nextQuery?: UserQuery): Promise<boolean> {
      if (nextQuery) Object.assign(query, nextQuery)
      page.value = 1
      isLoading.value = true
      error.value = null
      try {
        await loadCurrentUsers()
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
        await loadCurrentUsers()
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

    async function getUser(id: string): Promise<SystemUser | null> {
      loadingDetailId.value = id
      error.value = null
      try {
        return await service.getUser(id)
      }
      catch (cause) {
        error.value = errorMessage(cause)
        return null
      }
      finally {
        loadingDetailId.value = null
      }
    }

    async function runUserSave<T>(operation: () => Promise<T>, resetPage = false): Promise<T | null> {
      isSaving.value = true
      error.value = null
      try {
        const result = await operation()
        if (resetPage) page.value = 1
        await loadCurrentUsers()
        leaderCandidatesLoaded.value = false
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

    const createUser = (input: UserCreateInput) => runUserSave(() => service.createUser(input), true)
    const updateUser = (id: string, input: UserBasicInfoInput, options?: UserUpdateOptions) => runUserSave(() => service.updateUser(id, input, options))
    const changeStatus = (id: string, status: Exclude<UserStatus, 'locked'>) => runUserSave(() => service.changeUserStatus(id, status))

    async function resetPassword(id: string, input: UserPasswordResetInput): Promise<boolean> {
      return Boolean(await runUserSave(async () => {
        await service.resetUserPassword(id, input)
        return true
      }))
    }

    async function unlockUser(id: string): Promise<boolean> {
      return Boolean(await runUserSave(async () => {
        await service.unlockUser(id)
        return true
      }))
    }

    async function deleteUser(id: string): Promise<boolean> {
      deletingId.value = id
      error.value = null
      try {
        await service.deleteUser(id)
        if (users.value.length <= 1 && page.value > 1) page.value -= 1
        await loadCurrentUsers()
        leaderCandidatesLoaded.value = false
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

    async function loadDepartments(): Promise<boolean> {
      error.value = null
      try {
        departments.value = await service.listDepartments()
        return true
      }
      catch (cause) {
        error.value = errorMessage(cause)
        return false
      }
    }

    async function loadRoles(): Promise<boolean> {
      error.value = null
      try {
        roles.value = await fetchAllRoles()
        return true
      }
      catch (cause) {
        error.value = errorMessage(cause)
        return false
      }
    }

    async function loadDepartmentLeaderCandidates(force = false): Promise<boolean> {
      if (leaderCandidatesLoaded.value && !force) return true
      isLoadingLeaderCandidates.value = true
      error.value = null
      try {
        departmentLeaderCandidates.value = await fetchAllUsers()
        leaderCandidatesLoaded.value = true
        return true
      }
      catch (cause) {
        error.value = errorMessage(cause)
        return false
      }
      finally {
        isLoadingLeaderCandidates.value = false
      }
    }

    async function runDepartmentSave(operation: () => Promise<SystemDepartment>): Promise<SystemDepartment | null> {
      isSaving.value = true
      error.value = null
      try {
        const saved = await operation()
        departments.value = await service.listDepartments()
        return departments.value.find(item => item.id === saved.id) ?? saved
      }
      catch (cause) {
        error.value = errorMessage(cause)
        return null
      }
      finally {
        isSaving.value = false
      }
    }

    const createDepartment = (input: DepartmentWriteInput) => runDepartmentSave(() => service.createDepartment(input))
    const updateDepartment = (id: string, input: DepartmentWriteInput) => runDepartmentSave(() => service.updateDepartment(id, input))

    async function deleteDepartment(id: string): Promise<boolean> {
      deletingId.value = id
      error.value = null
      try {
        await service.deleteDepartment(id)
        departments.value = await service.listDepartments()
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

    function resetError(): void {
      error.value = null
    }

    return {
      users,
      departments,
      roles,
      departmentLeaderCandidates,
      query,
      page,
      pageSize,
      total,
      pageCount,
      validationContext,
      initialized,
      isLoading,
      isSaving,
      isLoadingLeaderCandidates,
      loadingDetailId,
      deletingId,
      error,
      initialize,
      refresh,
      queryUsers,
      changePage,
      getUser,
      createUser,
      updateUser,
      changeStatus,
      resetPassword,
      unlockUser,
      deleteUser,
      loadDepartments,
      createDepartment,
      updateDepartment,
      deleteDepartment,
      loadRoles,
      loadDepartmentLeaderCandidates,
      resetError,
    }
  })
}

export const useUserManagementStore = createUserManagementStore(userManagementService)
