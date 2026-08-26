import type { SignedRequestConfig } from '@/lib/http'
import type { TodoItem, TodoKey, TodoService } from '../types'
import { requestData } from '@/lib/http'

export interface ApiTodoItem {
  key: string
  label: string
  count: number | string
  path: string
}

interface ApiTodoSummary {
  items: ApiTodoItem[]
}

export interface TodoDataRequester {
  <T>(config: SignedRequestConfig): Promise<T>
}

const TODO_KEYS: readonly TodoKey[] = ['feedback', 'sync_fail', 'content_draft']

function mapTodoItem(value: ApiTodoItem): TodoItem | null {
  if (!TODO_KEYS.includes(value.key as TodoKey)) return null
  const count = Number(value.count)
  return {
    key: value.key as TodoKey,
    label: typeof value.label === 'string' && value.label.trim() ? value.label.trim() : value.key,
    count: Number.isInteger(count) && count > 0 ? count : 0,
    path: typeof value.path === 'string' ? value.path : '',
  }
}

export function createTodoService(request: TodoDataRequester = requestData): TodoService {
  return {
    async listTodos() {
      const result = await request<ApiTodoSummary>({ method: 'GET', url: 'api/v1/admin/todos' })
      return Array.isArray(result.items)
        ? result.items.map(mapTodoItem).filter((item): item is TodoItem => item !== null)
        : []
    },
  }
}

export const todoService = createTodoService()
