import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios'
import type { AuthSession } from '@/types/auth'
import { AxiosHeaders } from 'axios'
import { describe, expect, it } from 'vitest'
import { createApiClient, requestData } from './client'
import { ApiError } from './types'

function session(accessToken: string, expiresInMs = 60 * 60 * 1000): AuthSession {
  return {
    accessToken,
    tokenType: 'Bearer',
    expiresAt: new Date(Date.now() + expiresInMs).toISOString(),
    user: { id: '1', username: 'admin', name: '管理员' },
    roleIds: ['1'],
    roleCodes: ['super'],
    menus: [],
  }
}

function success(config: InternalAxiosRequestConfig, data: unknown = { value: 'ok' }) {
  return {
    data: { code: 0, message: 'ok', data },
    status: 200,
    statusText: 'OK',
    headers: new AxiosHeaders({ 'x-request-id': 'request-1' }),
    config,
  }
}

describe('API client', () => {
  it('adds signature and bearer headers and unwraps the response', async () => {
    let captured: InternalAxiosRequestConfig | null = null
    const adapter: AxiosAdapter = async (config) => {
      captured = config
      return success(config)
    }
    const client = createApiClient({
      baseURL: 'https://example.test/root/',
      adapter,
      getSignSecret: () => 'test-secret',
      getSession: () => session('token-1'),
      now: () => 1_733_880_000_000,
      createNonce: () => 'abc12345',
    })

    await expect(requestData<{ value: string }>({
      method: 'POST',
      url: 'api/v1/admin/example',
      data: { name: '东门' },
    }, client)).resolves.toEqual({ value: 'ok' })

    const headers = captured!.headers
    expect(headers.get('Authorization')).toBe('Bearer token-1')
    expect(headers.get('X-Timestamp')).toBe('1733880000')
    expect(headers.get('X-Nonce')).toBe('abc12345')
    expect(headers.get('X-Sign')).toMatch(/^[a-f0-9]{64}$/)
  })

  it('surfaces missing configuration and signing business errors clearly', async () => {
    const adapter: AxiosAdapter = async (config) => ({
      data: { code: 40112, message: '签名校验失败', data: {} },
      status: 200,
      statusText: 'OK',
      headers: new AxiosHeaders(),
      config,
    })
    const missingSecretClient = createApiClient({ adapter, getSignSecret: () => '' })
    await expect(requestData({ url: 'api/v1/ping', requiresAuth: false }, missingSecretClient)).rejects.toMatchObject({
      kind: 'configuration',
    })

    const signedClient = createApiClient({ adapter, getSignSecret: () => 'wrong', getSession: () => null })
    const error = await requestData({ url: 'api/v1/ping', requiresAuth: false }, signedClient).catch((cause: unknown) => cause)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ code: 40112, kind: 'business' })
    expect((error as Error).message).toContain('联调密钥')
  })

  it('refreshes once for concurrent 40100 responses and retries with the new token', async () => {
    let currentSession = session('old-token')
    let refreshCount = 0
    let oldTokenRequests = 0
    let newTokenRequests = 0
    const adapter: AxiosAdapter = async (config) => {
      const authorization = String(config.headers.get('Authorization'))
      if (authorization.includes('old-token')) {
        oldTokenRequests += 1
        return {
          data: { code: 40100, message: 'JWT 无效', data: {} },
          status: 200,
          statusText: 'OK',
          headers: new AxiosHeaders(),
          config,
        }
      }
      newTokenRequests += 1
      return success(config, { authorized: true })
    }
    const client = createApiClient({
      adapter,
      getSignSecret: () => 'test-secret',
      getSession: () => currentSession,
      authHandlers: {
        refresh: async () => {
          refreshCount += 1
          await new Promise<void>((resolve) => setTimeout(resolve, 0))
          currentSession = session('new-token')
        },
      },
    })

    const requests = [
      requestData<{ authorized: boolean }>({ url: 'api/v1/admin/first' }, client),
      requestData<{ authorized: boolean }>({ url: 'api/v1/admin/second' }, client),
    ]
    await expect(Promise.all(requests)).resolves.toEqual([{ authorized: true }, { authorized: true }])
    expect(refreshCount).toBe(1)
    expect(oldTokenRequests).toBe(2)
    expect(newTokenRequests).toBe(2)
  })

  it('refreshes proactively when the token has at most five minutes left', async () => {
    let currentSession = session('old-token', 60_000)
    let refreshCount = 0
    const adapter: AxiosAdapter = async (config) => {
      expect(config.headers.get('Authorization')).toBe('Bearer new-token')
      return success(config)
    }
    const client = createApiClient({
      adapter,
      getSignSecret: () => 'test-secret',
      getSession: () => currentSession,
      authHandlers: {
        refresh: async () => {
          refreshCount += 1
          currentSession = session('new-token')
        },
      },
    })

    await requestData({ url: 'api/v1/admin/example' }, client)
    expect(refreshCount).toBe(1)
  })

  it('parses JSON business errors returned as blobs for file requests', async () => {
    const adapter: AxiosAdapter = async (config) => ({
      data: new Blob([JSON.stringify({ code: 40300, message: '没有导出权限', data: {} })], { type: 'application/json' }),
      status: 200,
      statusText: 'OK',
      headers: new AxiosHeaders({ 'content-type': 'application/json' }),
      config,
    })
    const client = createApiClient({
      adapter,
      getSignSecret: () => 'test-secret',
      getSession: () => session('token-1'),
    })

    await expect(client.request({ url: 'api/v1/admin/audits/export', responseType: 'blob' })).rejects.toMatchObject({
      code: 40300,
      message: '没有导出权限',
      kind: 'business',
    })
  })

  it('refreshes and retries when a blob file response carries 40100', async () => {
    let currentSession = session('old-token')
    let refreshCount = 0
    const csv = new Blob(['\uFEFF操作时间,操作者'], { type: 'text/csv' })
    const adapter: AxiosAdapter = async (config) => {
      if (String(config.headers.get('Authorization')).includes('old-token')) {
        return {
          data: new Blob([JSON.stringify({ code: 40100, message: 'JWT 无效', data: {} })], { type: 'application/json' }),
          status: 200,
          statusText: 'OK',
          headers: new AxiosHeaders({ 'content-type': 'application/json' }),
          config,
        }
      }
      return {
        data: csv,
        status: 200,
        statusText: 'OK',
        headers: new AxiosHeaders({ 'content-type': 'text/csv' }),
        config,
      }
    }
    const client = createApiClient({
      adapter,
      getSignSecret: () => 'test-secret',
      getSession: () => currentSession,
      authHandlers: {
        refresh: async () => {
          refreshCount += 1
          currentSession = session('new-token')
        },
      },
    })

    const response = await client.request<Blob>({ url: 'api/v1/admin/audits/export', responseType: 'blob' })
    expect(response.data).toBe(csv)
    expect(refreshCount).toBe(1)
  })
})
