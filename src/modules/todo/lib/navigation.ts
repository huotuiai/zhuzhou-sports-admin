import type { RouteLocationRaw } from 'vue-router'
import type { TodoItem } from '../types'

function pathQuery(path: string): Record<string, string> {
  try {
    const url = new URL(path, 'https://todo.local')
    return Object.fromEntries(url.searchParams.entries())
  }
  catch {
    return {}
  }
}

export function todoRoute(item: TodoItem): RouteLocationRaw {
  const query = pathQuery(item.path)
  if (item.key === 'feedback') {
    return { name: 'user-service-management', query: { ...query, tab: 'feedback', status: 'pending' } }
  }
  if (item.key === 'sync_fail') {
    return { name: 'external-data-integration', query: { ...query, status: query.status || 'failed' } }
  }
  return { name: 'content-management', query: { ...query, status: query.status || 'draft' } }
}

export function todoSuffix(item: TodoItem): string {
  return item.key === 'sync_fail' ? '项' : '条'
}
