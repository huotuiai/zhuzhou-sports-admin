import type { SignedRequestConfig } from '@/lib/http'
import type { RemoteFileAsset } from '../types'
import { ApiError, requestData } from '@/lib/http'

export type UploadScene = 'cover' | 'banner' | 'attachment' | 'editor'

export interface ApiUploadVO {
  url?: unknown
  path?: unknown
  name?: unknown
  size?: unknown
  mime?: unknown
  scene?: unknown
}

export interface FileUploadRequester {
  <T, D = unknown>(config: SignedRequestConfig<D>): Promise<T>
}

export interface FileUploadService {
  uploadImage(file: File, scene: Exclude<UploadScene, 'attachment'>): Promise<RemoteFileAsset>
  uploadAttachment(file: File): Promise<RemoteFileAsset>
}

export const UPLOAD_MAX_BYTES = 5 * 1024 * 1024
export const ATTACHMENT_UPLOAD_MAX_BYTES = 10 * 1024 * 1024
const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const SUPPORTED_IMAGE_EXTENSION = /\.(?:gif|jpe?g|png|webp)$/i

export class FileUploadServiceError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'FileUploadServiceError'
  }
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ApiError(`服务器返回的${label}不完整`, { kind: 'response' })
  }
  return value.trim()
}

function nonNegativeInteger(value: unknown, label: string): number {
  const result = Number(value)
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new ApiError(`服务器返回的${label}无效`, { kind: 'response' })
  }
  return result
}

export function isSupportedUploadImage(file: Pick<File, 'name' | 'type'>): boolean {
  const mime = file.type.toLocaleLowerCase('en-US')
  return SUPPORTED_IMAGE_TYPES.has(mime) || (!mime && SUPPORTED_IMAGE_EXTENSION.test(file.name))
}

export function validateUploadImage(file: Pick<File, 'name' | 'size' | 'type'>, maxFileSize = UPLOAD_MAX_BYTES): void {
  if (!isSupportedUploadImage(file)) {
    throw new FileUploadServiceError('仅支持 JPG、PNG、WebP 或 GIF 图片')
  }
  const limit = Math.min(maxFileSize > 0 ? maxFileSize : UPLOAD_MAX_BYTES, UPLOAD_MAX_BYTES)
  if (file.size > limit) {
    throw new FileUploadServiceError(`图片大小不能超过 ${(limit / 1024 / 1024).toFixed(limit % (1024 * 1024) === 0 ? 0 : 1)}MB`)
  }
}

async function validateCoverImageRatio(file: File): Promise<void> {
  const url = URL.createObjectURL(file)
  try {
    const { width, height } = await new Promise<{ width: number, height: number }>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
      image.onerror = () => reject(new FileUploadServiceError('无法读取封面图片，请重新选择有效的图片'))
      image.src = url
    })
    if (width <= 0 || height <= 0) {
      throw new FileUploadServiceError('无法读取封面图片，请重新选择有效的图片')
    }
    if (width * 9 !== height * 16) {
      throw new FileUploadServiceError(`封面图宽高比必须为 16:9，当前尺寸为 ${width}×${height}，请重新选择图片`)
    }
  }
  finally {
    URL.revokeObjectURL(url)
  }
}

export function validateUploadAttachment(file: Pick<File, 'size'>, maxFileSize = ATTACHMENT_UPLOAD_MAX_BYTES): void {
  const limit = Math.min(maxFileSize > 0 ? maxFileSize : ATTACHMENT_UPLOAD_MAX_BYTES, ATTACHMENT_UPLOAD_MAX_BYTES)
  if (file.size > limit) {
    throw new FileUploadServiceError(`文件大小不能超过 ${(limit / 1024 / 1024).toFixed(limit % (1024 * 1024) === 0 ? 0 : 1)}MB`)
  }
}

export function mapApiUpload(value: ApiUploadVO, scene: UploadScene = 'cover'): RemoteFileAsset {
  const url = requiredText(value.url, '上传 URL')
  const path = requiredText(value.path, '上传路径')
  const name = requiredText(value.name, '原始文件名')
  const mimeType = requiredText(value.mime, '文件类型')
  if (scene !== 'attachment' && !SUPPORTED_IMAGE_TYPES.has(mimeType.toLocaleLowerCase('en-US'))) {
    throw new ApiError('服务器返回的文件类型不受支持', { kind: 'response' })
  }
  return {
    id: path,
    name,
    url,
    mimeType,
    size: nonNegativeInteger(value.size, '文件大小'),
    sortOrder: 0,
  }
}

export function createFileUploadService(request: FileUploadRequester = requestData): FileUploadService {
  async function upload(file: File, scene: UploadScene): Promise<RemoteFileAsset> {
    const data = new FormData()
    data.append('file', file, file.name)
    data.append('scene', scene)
    const response = await request<ApiUploadVO, FormData>({
      method: 'POST',
      url: 'api/v1/admin/uploads',
      data,
      signParams: { scene },
    })
    return mapApiUpload(response, scene)
  }

  return {
    async uploadImage(file, scene) {
      validateUploadImage(file)
      if (scene === 'cover') await validateCoverImageRatio(file)
      return upload(file, scene)
    },
    async uploadAttachment(file) {
      validateUploadAttachment(file)
      return upload(file, 'attachment')
    },
  }
}

export const fileUploadService = createFileUploadService()
