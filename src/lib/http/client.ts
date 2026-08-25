import type {
  AxiosAdapter,
  AxiosInstance,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios'
import type { AuthSession } from '@/types/auth'
import type { ApiResponse, SignedRequestConfig } from './types'
import axios from 'axios'
import {
  clearAuthSession,
  isAuthSessionExpired,
  readAuthSession,
  shouldRefreshAuthSession,
} from '@/lib/auth-session'
import {
  collectBusinessParameters,
  createRequestNonce,
  createSignatureHeaders,
  extractBusinessParameters,
  serializeQueryParameters,
} from './signature'
import { ApiError } from './types'

const DEFAULT_API_BASE_URL = 'https://api_zzjj.hnhcsz.com/yhsql/'
const DEFAULT_TIMEOUT_MS = 15_000

export interface HttpAuthHandlers {
  refresh?: () => Promise<void>
  onUnauthorized?: () => void | Promise<void>
}

export interface ApiClientOptions {
  baseURL?: string
  timeout?: number
  adapter?: AxiosAdapter
  getSignSecret?: () => string
  getSession?: () => AuthSession | null
  clearSession?: () => void
  now?: () => number
  createNonce?: () => string
  authHandlers?: HttpAuthHandlers
}

const defaultAuthHandlers: HttpAuthHandlers = {}

export function configureHttpAuthHandlers(handlers: HttpAuthHandlers): void {
  defaultAuthHandlers.refresh = handlers.refresh
  defaultAuthHandlers.onUnauthorized = handlers.onUnauthorized
}

function normalizeBaseURL(baseURL: string): string {
  return `${baseURL.replace(/\/+$/, '')}/`
}

function isApiResponse(value: unknown): value is ApiResponse<unknown> {
  if (!value || typeof value !== 'object') return false
  const response = value as Partial<ApiResponse<unknown>>
  return typeof response.code === 'number' && typeof response.message === 'string' && 'data' in response
}

function readRequestId(response?: AxiosResponse): string | undefined {
  const value = response?.headers?.['x-request-id']
  return typeof value === 'string' && value ? value : undefined
}

function messageForBusinessError(code: number, backendMessage: string): string {
  if (code === 40110) return '请求验签信息不完整，请联系管理员'
  if (code === 40111) return '系统时间与服务器不同步，请校准时间后重试'
  if (code === 40112) return '请求签名校验失败，请检查当前环境的联调密钥'
  return backendMessage || '请求失败，请稍后重试'
}

function apiErrorFromResponse(response: AxiosResponse, cause?: unknown): ApiError {
  const envelope = isApiResponse(response.data) ? response.data : null
  const code = envelope?.code
  return new ApiError(
    code === undefined
      ? `服务器返回异常（${response.status}）`
      : messageForBusinessError(code, envelope?.message ?? ''),
    {
      code,
      httpStatus: response.status,
      requestId: readRequestId(response),
      kind: code === 40100 ? 'auth' : code === undefined ? 'response' : 'business',
      cause,
    },
  )
}

function sessionExpiredError(cause?: unknown): ApiError {
  return new ApiError('登录状态已失效，请重新登录', { code: 40100, kind: 'auth', cause })
}

export function createApiClient(options: ApiClientOptions = {}): AxiosInstance {
  const getSignSecret = options.getSignSecret ?? (() => import.meta.env.VITE_API_SIGN_SECRET ?? '')
  const getSession = options.getSession ?? readAuthSession
  const clearSession = options.clearSession ?? clearAuthSession
  const now = options.now ?? Date.now
  const nonceFactory = options.createNonce ?? createRequestNonce
  const authHandlers = options.authHandlers ?? defaultAuthHandlers
  let refreshPromise: Promise<void> | null = null

  const client = axios.create({
    baseURL: normalizeBaseURL(options.baseURL ?? import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL),
    timeout: options.timeout ?? DEFAULT_TIMEOUT_MS,
    adapter: options.adapter,
    headers: { Accept: 'application/json' },
    paramsSerializer: { serialize: serializeQueryParameters },
  })

  async function invalidateSession(): Promise<void> {
    clearSession()
    await authHandlers.onUnauthorized?.()
  }

  function runRefresh(): Promise<void> {
    if (!authHandlers.refresh) return Promise.reject(sessionExpiredError())
    if (!refreshPromise) {
      refreshPromise = authHandlers.refresh().finally(() => {
        refreshPromise = null
      })
    }
    return refreshPromise
  }

  client.interceptors.request.use(async (config) => {
    const secret = getSignSecret()
    if (config.signed !== false && !secret) {
      throw new ApiError('缺少 VITE_API_SIGN_SECRET，请配置当前 API 环境的验签密钥', {
        kind: 'configuration',
      })
    }

    if (config.requiresAuth !== false) {
      let session = getSession()
      if (!session || isAuthSessionExpired(session, now())) {
        if (!config.skipUnauthorizedRedirect) await invalidateSession()
        throw sessionExpiredError()
      }

      if (!config.skipAuthRefresh && shouldRefreshAuthSession(session, now())) {
        try {
          await runRefresh()
          session = getSession()
        }
        catch (error) {
          if (!config.skipUnauthorizedRedirect) await invalidateSession()
          throw sessionExpiredError(error)
        }
      }

      if (!session) throw sessionExpiredError()
      config.headers.set('Authorization', `${session.tokenType || 'Bearer'} ${session.accessToken}`)
    }

    if (config.signed !== false) {
      const bodyParameters = config._signingBodyParameters ?? config.signParams ?? extractBusinessParameters(config.data)
      config._signingBodyParameters = { ...bodyParameters }
      const businessParameters = collectBusinessParameters(undefined, config.params, bodyParameters)
      const signatureHeaders = await createSignatureHeaders(secret, businessParameters, {
        timestamp: String(Math.floor(now() / 1000)),
        nonce: nonceFactory(),
      })
      for (const [name, value] of Object.entries(signatureHeaders)) config.headers.set(name, value)
    }

    return config
  })

  async function retryAfterUnauthorized(
    config: InternalAxiosRequestConfig,
    response: AxiosResponse,
  ): Promise<AxiosResponse> {
    if (config.requiresAuth === false || config.skipAuthRefresh || config._authRetry) {
      if (config.requiresAuth !== false && !config.skipUnauthorizedRedirect) await invalidateSession()
      throw apiErrorFromResponse(response)
    }

    config._authRetry = true
    try {
      await runRefresh()
      return await client.request(config)
    }
    catch (error) {
      if (!config.skipUnauthorizedRedirect) await invalidateSession()
      throw sessionExpiredError(error)
    }
  }

  client.interceptors.response.use(
    async (response) => {
      if (!isApiResponse(response.data) || response.data.code === 0) return response
      if (response.data.code === 40100) return retryAfterUnauthorized(response.config, response)
      throw apiErrorFromResponse(response)
    },
    async (error: unknown) => {
      if (error instanceof ApiError) throw error
      if (!axios.isAxiosError(error)) {
        throw new ApiError('请求失败，请稍后重试', { kind: 'network', cause: error })
      }

      if (error.response) {
        const code = isApiResponse(error.response.data) ? error.response.data.code : undefined
        if (code === 40100 && error.config) return retryAfterUnauthorized(error.config, error.response)
        throw apiErrorFromResponse(error.response, error)
      }

      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        throw new ApiError('请求超时，请稍后重试', { kind: 'timeout', cause: error })
      }
      throw new ApiError('无法连接服务器，请检查网络后重试', { kind: 'network', cause: error })
    },
  )

  return client
}

export const apiClient = createApiClient()
export const rawHttpClient = apiClient

export async function requestData<T, D = unknown>(
  config: SignedRequestConfig<D>,
  client: AxiosInstance = apiClient,
): Promise<T> {
  const response = await client.request<ApiResponse<T>>(config)
  if (!isApiResponse(response.data)) {
    throw new ApiError('服务器响应格式异常', {
      httpStatus: response.status,
      requestId: readRequestId(response),
      kind: 'response',
    })
  }
  return response.data.data
}
