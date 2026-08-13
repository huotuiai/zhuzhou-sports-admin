import type {
  PermissionWriteInput,
  RbacService,
  RbacSnapshot,
  RoleWriteInput,
  SystemPermission,
  SystemRole,
  SystemUser,
  UserWriteInput,
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
    const roles = ref<SystemRole[]>([])
    const permissions = ref<SystemPermission[]>([])
    const initialized = ref(false)
    const isLoading = ref(false)
    const isSaving = ref(false)
    const deletingId = ref<string | null>(null)
    const error = ref<string | null>(null)

    const snapshot = computed<RbacSnapshot>(() => ({
      users: users.value,
      roles: roles.value,
      permissions: permissions.value,
    }))

    function applySnapshot(value: RbacSnapshot): void {
      users.value = value.users
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

    const createUser = (input: UserWriteInput) => runSave(() => service.createUser(input))
    const updateUser = (id: string, input: UserWriteInput) => runSave(() => service.updateUser(id, input))
    const removeUser = (id: string) => runRemove(id, () => service.removeUser(id))
    const createRole = (input: RoleWriteInput) => runSave(() => service.createRole(input))
    const updateRole = (id: string, input: RoleWriteInput) => runSave(() => service.updateRole(id, input))
    const removeRole = (id: string) => runRemove(id, () => service.removeRole(id))
    const createPermission = (input: PermissionWriteInput) => runSave(() => service.createPermission(input))
    const updatePermission = (id: string, input: PermissionWriteInput) => runSave(() => service.updatePermission(id, input))
    const removePermission = (id: string) => runRemove(id, () => service.removePermission(id))

    function resetError(): void {
      error.value = null
    }

    return {
      users,
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
      updateUser,
      removeUser,
      createRole,
      updateRole,
      removeRole,
      createPermission,
      updatePermission,
      removePermission,
      resetError,
    }
  })
}

export const useRbacStore = createRbacStore(rbacService)
