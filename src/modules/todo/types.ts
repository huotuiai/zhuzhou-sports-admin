export type TodoKey = 'feedback' | 'sync_fail' | 'content_draft'

export interface TodoItem {
  key: TodoKey
  label: string
  count: number
  path: string
}

export interface TodoService {
  listTodos(): Promise<TodoItem[]>
}
