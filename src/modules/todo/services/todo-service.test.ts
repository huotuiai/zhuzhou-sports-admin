import type { SignedRequestConfig } from '@/lib/http'
import { describe, expect, it } from 'vitest'
import { createTodoService } from './todo-service'

describe('todo API service', () => {
  it('maps documented items, int64 counts and ignores unknown keys', async () => {
    const configs: SignedRequestConfig[] = []
    const service = createTodoService(async <T>(config: SignedRequestConfig): Promise<T> => {
      configs.push(config)
      return {
        items: [
          { key: 'feedback', label: '未处理反馈', count: '3', path: '/service?handle_status=0' },
          { key: 'sync_fail', label: '同步失败', count: 0, path: '/integration?status=failed' },
          { key: 'future', label: '未来待办', count: 8, path: '/future' },
        ],
      } as T
    })

    expect(await service.listTodos()).toEqual([
      { key: 'feedback', label: '未处理反馈', count: 3, path: '/service?handle_status=0' },
      { key: 'sync_fail', label: '同步失败', count: 0, path: '/integration?status=failed' },
    ])
    expect(configs[0]).toMatchObject({ method: 'GET', url: 'api/v1/admin/todos' })
  })
})
