import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import type { SignedRequestConfig } from '@/lib/http'
import type { UserQuery } from '../types'
import { describe, expect, it } from 'vitest'
import { createApiClient, createSignatureHeaders } from '@/lib/http'
import { createRoleManagementService } from './role-management-service'
import { createUserManagementService } from './user-management-service'

const query: UserQuery = { keyword: ' 场馆Ａ ', departmentId: '9007199254740993', roleId: '11', status: 'locked' }
const emptyQuery: UserQuery = { keyword: ' ', departmentId: '', roleId: '', status: 'all' }
const now = 1_733_880_000_000

function fileClient(options: { data?: Blob; headers?: Record<string, string>; status?: number } = {}) {
  const requests: InternalAxiosRequestConfig[] = []
  const content = options.data ?? new Blob(['\uFEFF编码,名称\r\nvenue,场馆运营\r\n'], { type: 'text/csv;charset=utf-8' })
  const client = createApiClient({
    baseURL: 'https://example.test/yhsql/',
    getSignSecret: () => 'test-secret',
    now: () => now,
    createNonce: () => 'export-nonce',
    getSession: () => ({
      accessToken: 'test-export-token', tokenType: 'Bearer', expiresAt: new Date(now + 3_600_000).toISOString(),
      user: { id: '1', username: 'admin', name: '管理员' }, roleIds: ['1'], roleCodes: ['super'], menus: [],
    }),
    adapter: async (config) => {
      requests.push(config)
      return {
        config, data: content, status: options.status ?? 200, statusText: 'test response',
        headers: { 'content-type': content.type, ...options.headers },
      } satisfies AxiosResponse<Blob>
    },
  })
  return { content, requests, requestFile: (config: SignedRequestConfig) => client.request<Blob>(config) }
}

const cases = [
  { name: 'users', filename: 'sys_users.csv', create: createUserManagementService, params: { keyword: '场馆A', dept_id: query.departmentId, role_id: '11', status: 2 } },
  { name: 'roles', filename: 'sys_roles.csv', create: createRoleManagementService, params: { keyword: '场馆A' } },
] as const

describe.each(cases)('$name CSV export API', ({ name, filename, create, params }) => {
  it('signs current filters without pagination and preserves backend CSV bytes and filename', async () => {
    const { requestFile, requests, content } = fileClient({
      headers: {
        'content-disposition': "attachment; filename*=UTF-8''%E5%AF%BC%E5%87%BA.csv",
        'x-export-count': '5000', 'x-export-total': '6000', 'x-export-truncated': '1',
      },
    })
    const file = await create(undefined, requestFile).exportCsv(query)

    expect(file).toEqual({ content, filename: '导出.csv', truncated: true, count: 5000, total: 6000 })
    expect(file.content).toBe(content)
    expect(Array.from(new Uint8Array(await file.content.arrayBuffer()).slice(0, 3))).toEqual([239, 187, 191])
    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({ method: 'get', url: `api/v1/admin/${name}/export`, params, responseType: 'blob' })
    expect(requests[0]!.params).toEqual(params)
    expect(requests[0]!.headers.get('Accept')).toBe('text/csv')
    expect(requests[0]!.headers.get('Authorization')).toBe('Bearer test-export-token')
    const signature = await createSignatureHeaders('test-secret', params, { timestamp: String(now / 1000), nonce: 'export-nonce' })
    expect(requests[0]!.headers.get('X-Sign')).toBe(signature['X-Sign'])
  })

  it('omits empty filters and uses the documented default filename when headers are absent', async () => {
    const { requestFile, requests } = fileClient()
    const result = await create(undefined, requestFile).exportCsv(emptyQuery)
    expect(requests[0]!.params).toEqual({})
    expect(result).toMatchObject({ filename, count: null, total: null, truncated: false })
  })

  it.each([200, 403])('rejects JSON business errors in blob responses with HTTP %i', async (status) => {
    const { requestFile } = fileClient({
      status,
      data: new Blob([JSON.stringify({ code: 40300, message: '没有导出权限', data: {} })], { type: 'application/json' }),
    })
    await expect(create(undefined, requestFile).exportCsv(query)).rejects.toMatchObject({ message: '没有导出权限', code: 40300 })
  })
})

it.each([['enabled', 1], ['disabled', 0], ['locked', 2], ['all', undefined]] as const)(
  'serializes user export status %s as %s', async (status, expected) => {
    const { requestFile, requests } = fileClient()
    await createUserManagementService(undefined, requestFile).exportCsv({ ...emptyQuery, status })
    expect(requests[0]!.params).toEqual(expected === undefined ? {} : { status: expected })
  },
)
