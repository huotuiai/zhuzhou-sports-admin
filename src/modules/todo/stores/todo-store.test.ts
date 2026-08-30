import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { todoRoute, todoSuffix } from '../lib/navigation'
import { createTodoStore } from './todo-store'

describe('todo store and navigation', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('hides zero counts and maps feedback navigation to the current application route', async () => {
    const useStore = createTodoStore({
      listTodos: async () => [
        { key: 'feedback', label: '未处理反馈', count: 3, path: '/service?handle_status=0' },
        { key: 'sync_fail', label: '同步失败', count: 0, path: '/integration?status=failed' },
      ],
    }, 'todo-filter-test')
    const store = useStore()

    expect(await store.initialize()).toBe(true)
    expect(store.visibleItems.map(item => item.key)).toEqual(['feedback'])
    expect(store.totalCount).toBe(3)
    expect(todoRoute(store.visibleItems[0]!)).toEqual({
      name: 'user-service-management',
      query: { handle_status: '0', tab: 'feedback', status: 'pending' },
    })
    expect(todoSuffix(store.visibleItems[0]!)).toBe('条')
  })

  it('clears stale items when refresh fails', async () => {
    let fail = false
    const useStore = createTodoStore({
      listTodos: async () => {
        if (fail) throw new Error('待办接口失败')
        return [{ key: 'content_draft', label: '内容草稿', count: 2, path: '/content?status=draft' }]
      },
    }, 'todo-failure-test')
    const store = useStore()

    await store.initialize()
    fail = true
    expect(await store.refresh()).toBe(false)
    expect(store.visibleItems).toEqual([])
    expect(store.error).toBe('待办接口失败')
  })

  it('refreshes changed counts and deduplicates concurrent route-triggered requests', async () => {
    let count = 1
    let calls = 0
    const useStore = createTodoStore({
      listTodos: async () => {
        calls += 1
        return [{ key: 'content_draft', label: '内容草稿', count, path: '/content?status=draft' }]
      },
    }, 'todo-refresh-test')
    const store = useStore()
    await store.initialize()
    count = 4

    await Promise.all([store.refresh(), store.refresh()])
    expect(store.totalCount).toBe(4)
    expect(calls).toBe(2)
  })
})
