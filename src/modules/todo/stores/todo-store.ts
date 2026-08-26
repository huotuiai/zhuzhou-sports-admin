import type { TodoItem, TodoService } from '../types'
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { todoService } from '../services/todo-service'

export function createTodoStore(service: TodoService, storeId = 'todo-summary') {
  return defineStore(storeId, () => {
    const items = ref<TodoItem[]>([])
    const initialized = ref(false)
    const isLoading = ref(false)
    const error = ref<string | null>(null)
    let loadingPromise: Promise<boolean> | null = null

    const visibleItems = computed(() => items.value.filter(item => item.count > 0))
    const totalCount = computed(() => visibleItems.value.reduce((sum, item) => sum + item.count, 0))

    async function refresh(): Promise<boolean> {
      if (loadingPromise) return loadingPromise
      isLoading.value = true
      error.value = null
      loadingPromise = service.listTodos().then((result) => {
        items.value = result
        initialized.value = true
        return true
      }).catch((cause: unknown) => {
        items.value = []
        error.value = cause instanceof Error && cause.message ? cause.message : '待办加载失败'
        return false
      }).finally(() => {
        isLoading.value = false
        loadingPromise = null
      })
      return loadingPromise
    }

    async function initialize(): Promise<boolean> {
      return initialized.value ? true : refresh()
    }

    return { items, visibleItems, totalCount, initialized, isLoading, error, initialize, refresh }
  })
}

export const useTodoStore = createTodoStore(todoService)
