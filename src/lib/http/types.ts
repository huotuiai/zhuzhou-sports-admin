import type { AxiosRequestConfig } from 'axios'
import type { BusinessParameters } from './signature'

export interface ApiResponse<T> {
  code: number
  message: string
  data: T
}

export type ApiErrorKind = 'auth' | 'business' | 'configuration' | 'network' | 'response' | 'timeout'

export interface ApiErrorDetails {
  code?: number
  httpStatus?: number
  requestId?: string
  kind?: ApiErrorKind
  cause?: unknown
}

export class ApiError extends Error {
  readonly code?: number
  readonly httpStatus?: number
  readonly requestId?: string
  readonly kind: ApiErrorKind
  override readonly cause?: unknown

  constructor(message: string, details: ApiErrorDetails = {}) {
    super(message)
    this.name = 'ApiError'
    this.code = details.code
    this.httpStatus = details.httpStatus
    this.requestId = details.requestId
    this.kind = details.kind ?? 'business'
    this.cause = details.cause
  }
}

declare module 'axios' {
  interface AxiosRequestConfig {
    signed?: boolean
    requiresAuth?: boolean
    skipAuthRefresh?: boolean
    skipUnauthorizedRedirect?: boolean
    signParams?: BusinessParameters
    _authRetry?: boolean
    _signingBodyParameters?: BusinessParameters
  }
}

export interface SignedRequestConfig<D = unknown> extends AxiosRequestConfig<D> {
  signed?: boolean
  requiresAuth?: boolean
  skipAuthRefresh?: boolean
  skipUnauthorizedRedirect?: boolean
  signParams?: BusinessParameters
}
