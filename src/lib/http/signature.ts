export type BusinessParameters = Record<string, unknown>

const EXCLUDED_PARAMETER_NAMES = new Set(['nonce', 'sign', 'timestamp'])

function isPlainRecord(value: unknown): value is BusinessParameters {
  if (!value || typeof value !== 'object') return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function entriesToRecord(entries: Iterable<[string, unknown]>): BusinessParameters {
  const result: BusinessParameters = {}
  for (const [key, value] of entries) result[key] = value
  return result
}

export function extractBusinessParameters(value: unknown): BusinessParameters {
  if (!value) return {}
  if (value instanceof URLSearchParams) return entriesToRecord(value.entries())
  if (typeof FormData !== 'undefined' && value instanceof FormData) {
    return entriesToRecord(Array.from(value.entries(), ([key, entry]) => {
      if (typeof entry !== 'string') {
        throw new Error(`FormData 字段 ${key} 包含文件，请通过 signParams 提供参与验签的业务参数`)
      }
      return [key, entry]
    }))
  }
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value)
      return isPlainRecord(parsed) ? parsed : {}
    }
    catch {
      return {}
    }
  }
  return isPlainRecord(value) ? value : {}
}

export function flattenSignValue(value: unknown): string {
  if (value === null) return ''
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number' && !Number.isFinite(value)) return ''
  if (typeof value === 'object') return JSON.stringify(value) ?? ''
  return String(value)
}

export function collectBusinessParameters(
  body: unknown,
  query: unknown,
  signParams?: BusinessParameters,
): BusinessParameters {
  const bodyParameters = signParams ?? extractBusinessParameters(body)
  const queryParameters = extractBusinessParameters(query)
  const combined: BusinessParameters = { ...bodyParameters, ...queryParameters }

  for (const key of Object.keys(combined)) {
    if (combined[key] === undefined || EXCLUDED_PARAMETER_NAMES.has(key)) delete combined[key]
  }
  return combined
}

export function buildSignString(parameters: BusinessParameters): string {
  return Object.entries(parameters)
    .filter(([key, value]) => value !== undefined && key !== 'sign')
    .sort(([first], [second]) => first < second ? -1 : first > second ? 1 : 0)
    .map(([key, value]) => `${key}=${flattenSignValue(value)}`)
    .join('&')
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message))
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function createRequestNonce(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID().replaceAll('-', '').slice(0, 16)
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export interface SignatureHeaderOptions {
  timestamp?: string
  nonce?: string
}

export async function createSignatureHeaders(
  secret: string,
  businessParameters: BusinessParameters,
  options: SignatureHeaderOptions = {},
): Promise<Record<'X-Timestamp' | 'X-Nonce' | 'X-Sign', string>> {
  const timestamp = options.timestamp ?? String(Math.floor(Date.now() / 1000))
  const nonce = options.nonce ?? createRequestNonce()
  const stringToSign = buildSignString({ ...businessParameters, timestamp, nonce })
  const sign = await hmacSha256Hex(secret, stringToSign)
  return { 'X-Timestamp': timestamp, 'X-Nonce': nonce, 'X-Sign': sign }
}

export function serializeQueryParameters(parameters: unknown): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(extractBusinessParameters(parameters))) {
    if (value === undefined) continue
    search.append(key, flattenSignValue(value))
  }
  return search.toString()
}
