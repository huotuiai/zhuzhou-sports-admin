import type {
  DepartmentWriteInput,
  RbacService,
  RbacSnapshot,
  RoleBasicInfoInput,
  RoleCreateInput,
  RolePermissionInput,
  SystemDepartment,
  SystemPermission,
  SystemRole,
  SystemUser,
  UserBasicInfoInput,
  UserCreateInput,
  UserPasswordResetInput,
  UserStatus,
} from '../types'
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { rbacService } from '../services/rbac-service'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败，请稍后重试'
}

export function createRbacStore(service: RbacService, storeId = 'rbac') {
  return defineStore(storeId, () => {
    const users = ref<SystemUser[]>([])
    const departments = ref<SystemDepartment[]>([])
    const roles = ref<SystemRole[]>([])
    const permissions = ref<SystemPermission[]>([])
    const initialized = ref(false)
    const isLoading = ref(false)
    const isSaving = ref(false)
    const deletingId = ref<string | null>(null)
    const error = ref<string | null>(null)

    const snapshot = computed<RbacSnapshot>(() => ({
      users: users.value,
      departments: departments.value,
      roles: roles.value,
      permissions: permissions.value,
    }))

    function applySnapshot(value: RbacSnapshot): void {
      users.value = value.users
      departments.value = value.departments
      roles.value = value.roles
      permissions.value = value.permissions
    }

    async function load(force = false): Promise<boolean> {
      if (initialized.value && !force) return true
      isLoading.value = true
      error.value = null
      try {
        applySnapshot(await service.load())
        initialized.value = true
        return true
      } catch (cause) {
        error.value = errorMessage(cause)
        return false
      } finally {
        isLoading.value = false
      }
    }

    async function runSave<T>(operation: () => Promise<T>): Promise<T | null> {
      isSaving.value = true
      error.value = null
      try {
        const result = await operation()
        applySnapshot(await service.load())
        return result
      } catch (cause) {
        error.value = errorMessage(cause)
        return null
      } finally {
        isSaving.value = false
      }
    }

    async function runRemove(id: string, operation: () => Promise<void>): Promise<boolean> {
      deletingId.value = id
      error.value = null
      try {
        await operation()
        applySnapshot(await service.load())
        return true
      } catch (cause) {
        error.value = errorMessage(cause)
        return false
      } finally {
        deletingId.value = null
      }
    }

    const createUser = (input: UserCreateInput) => runSave(() => service.createUser(input))
    const updateUserInfo = (id: string, input: UserBasicInfoInput) => runSave(() => service.updateUserInfo(id, input))
    const resetUserPassword = (id: string, input: UserPasswordResetInput) => runSave(() => service.resetUserPassword(id, input))
    const setUserStatus = (id: string, status: Exclude<UserStatus, 'locked'>) => runSave(() => service.setUserStatus(id, status))
    const unlockUser = (id: string) => runSave(() => service.unlockUser(id))
    const removeUser = (id: string) => runRemove(id, () => service.removeUser(id))
    const createDepartment = (input: DepartmentWriteInput) => runSave(() => service.createDepartment(input))
    const updateDepartment = (id: string, input: DepartmentWriteInput) => runSave(() => service.updateDepartment(id, input))
    const removeDepartment = (id: string) => runRemove(id, () => service.removeDepartment(id))
    const createRole = (input: RoleCreateInput) => runSave(() => service.createRole(input))
    const updateRoleInfo = (id: string, input: RoleBasicInfoInput) => runSave(() => service.updateRoleInfo(id, input))
    const updateRolePermissions = (id: string, input: RolePermissionInput) => runSave(() => service.updateRolePermissions(id, input))
    const assignRoleUsers = (id: string, userIds: readonly string[]) => runSave(() => service.assignRoleUsers(id, userIds))
    const removeRole = (id: string) => runRemove(id, () => service.removeRole(id))

    function resetError(): void {
      error.value = null
    }

    return {
      users,
      departments,
      roles,
      permissions,
      snapshot,
      initialized,
      isLoading,
      isSaving,
      deletingId,
      error,
      load,
      createUser,
      updateUserInfo,
      resetUserPassword,
      setUserStatus,
      unlockUser,
      removeUser,
      createDepartment,
      updateDepartment,
      removeDepartment,
      createRole,
      updateRoleInfo,
      updateRolePermissions,
      assignRoleUsers,
      removeRole,
      resetError,
    }
  })
}

export const useRbacStore = createRbacStore(rbacService)
