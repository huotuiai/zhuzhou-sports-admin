import type { SignedRequestConfig } from '@/lib/http'
import { describe, expect, it } from 'vitest'
import {
  createFileUploadService,
  FileUploadServiceError,
  mapApiUpload,
  validateUploadImage,
} from './file-upload-service'

describe('file upload service', () => {
  it('uploads multipart image with scene-only signing parameters', async () => {
    const configs: SignedRequestConfig[] = []
    const service = createFileUploadService(async <T, D = unknown>(config: SignedRequestConfig<D>): Promise<T> => {
      configs.push(config as SignedRequestConfig)
      return {
        url: 'https://api.example.com/uploads/banner/2026/08/30/image.jpg',
        path: '/uploads/banner/2026/08/30/image.jpg',
        name: '开场图.jpg',
        size: 2048,
        mime: 'image/jpeg',
        scene: 'banner',
      } as T
    })
    const file = new File(['image'], '开场图.jpg', { type: 'image/jpeg' })

    await expect(service.uploadImage(file, 'banner')).resolves.toMatchObject({
      id: '/uploads/banner/2026/08/30/image.jpg',
      name: '开场图.jpg',
      size: 2048,
      mimeType: 'image/jpeg',
      sortOrder: 0,
    })

    expect(configs).toHaveLength(1)
    expect(configs[0]).toMatchObject({
      method: 'POST',
      url: 'api/v1/admin/uploads',
      signParams: { scene: 'banner' },
    })
    expect(configs[0]?.headers).toBeUndefined()
    expect(configs[0]?.data).toBeInstanceOf(FormData)
    expect((configs[0]?.data as FormData).get('scene')).toBe('banner')
    expect((configs[0]?.data as FormData).get('file')).toBeInstanceOf(File)
  })

  it('enforces the documented image types and file-size limit before requesting', () => {
    expect(() => validateUploadImage(new File(['pdf'], 'guide.pdf', { type: 'application/pdf' })))
      .toThrow(FileUploadServiceError)
    expect(() => validateUploadImage(new File([new Uint8Array(10)], 'large.png', { type: 'image/png' }), 5))
      .toThrow('图片大小不能超过')
  })

  it('rejects incomplete or unsupported upload responses', () => {
    expect(() => mapApiUpload({ url: '', path: '/uploads/a.jpg', name: 'a.jpg', size: 1, mime: 'image/jpeg' }))
      .toThrow('上传 URL')
    expect(() => mapApiUpload({ url: 'https://example.com/a.svg', path: '/uploads/a.svg', name: 'a.svg', size: 1, mime: 'image/svg+xml' }))
      .toThrow('文件类型不受支持')
  })
})
