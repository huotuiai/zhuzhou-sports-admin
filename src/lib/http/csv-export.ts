import type { AxiosResponse } from 'axios'

export interface BackendCsvExportFile {
  content: Blob
  filename: string
  truncated: boolean
  count: number | null
  total: number | null
}

function headerValue(response: AxiosResponse, name: string): string | null {
  const direct = response.headers?.[name]
  if (typeof direct === 'string') return direct
  const headers = response.headers as { get?: (headerName: string) => unknown }
  const result = typeof headers.get === 'function' ? headers.get(name) : null
  return typeof result === 'string' ? result : null
}

function safeFilename(value: string, fallback: string): string {
  const sanitized = Array.from(value, (character) => {
    const code = character.charCodeAt(0)
    return code <= 31 || code === 127 ? '_' : character
  }).join('')
  return sanitized.replace(/[\\/]/g, '_').trim() || fallback
}

export function csvExportFilename(contentDisposition: string | null, fallback: string): string {
  if (!contentDisposition) return fallback
  const encoded = contentDisposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i)?.[1]
  if (encoded) {
    try {
      return safeFilename(decodeURIComponent(encoded.replace(/^"|"$/g, '')), fallback)
    }
    catch {
      // Fall through to the plain filename when the encoded value is malformed.
    }
  }
  const plain = contentDisposition.match(/filename\s*=\s*(?:"([^"]+)"|([^;]+))/i)
  return safeFilename((plain?.[1] ?? plain?.[2] ?? fallback).trim(), fallback)
}

function nonNegativeIntegerHeader(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value.trim())) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

export function mapCsvExportResponse(
  response: AxiosResponse<Blob>,
  fallbackFilename: string,
): BackendCsvExportFile {
  const count = nonNegativeIntegerHeader(headerValue(response, 'x-export-count'))
  const total = nonNegativeIntegerHeader(headerValue(response, 'x-export-total'))
  const truncatedHeader = headerValue(response, 'x-export-truncated')?.trim().toLocaleLowerCase('en-US')
  return {
    content: response.data,
    filename: csvExportFilename(headerValue(response, 'content-disposition'), fallbackFilename),
    truncated: truncatedHeader === '1' || truncatedHeader === 'true' || (count !== null && total !== null && count < total),
    count,
    total,
  }
}
