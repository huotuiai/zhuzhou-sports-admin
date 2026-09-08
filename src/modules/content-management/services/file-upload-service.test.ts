import type { SignedRequestConfig } from '@/lib/http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createFileUploadService,
  FileUploadServiceError,
  mapApiUpload,
  validateUploadAttachment,
  validateUploadImage,
} from './file-upload-service'

describe('file upload service', () => {
  describe('cover image ratio', () => {
    afterEach(() => {
      vi.restoreAllMocks()
      vi.unstubAllGlobals()
    })

    function setupImage(width: number, height: number) {
      const image = {
        naturalWidth: width,
        naturalHeight: height,
        src: '',
        onload: null as (() => void) | null,
        onerror: null as (() => void) | null,
      }
      vi.stubGlobal('Image', vi.fn(function () { return image }))
      const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:cover-image')
      const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
      const request = vi.fn(async () => ({
        url: 'https://api.example.com/uploads/cover/image.jpg',
        path: '/uploads/cover/image.jpg',
        name: '封面.jpg',
        size: 5,
        mime: 'image/jpeg',
      }))
      return {
        image, request, createObjectURL, revokeObjectURL,
        file: new File(['image'], '封面.jpg', { type: 'image/jpeg' }),
        service: createFileUploadService(async <T>(): Promise<T> => await request() as T),
      }
    }

    it.each([[1280, 720], [1920, 1080]])('uploads a %i×%i cover only after checking its dimensions', async (width, height) => {
      const { image, request, file, service, createObjectURL, revokeObjectURL } = setupImage(width, height)
      const upload = service.uploadImage(file, 'cover')

      expect(request).not.toHaveBeenCalled()
      expect(createObjectURL).toHaveBeenCalledWith(file)
      expect(image.src).toBe('blob:cover-image')
      image.onload?.()

      await expect(upload).resolves.toMatchObject({ name: file.name })
      expect(request).toHaveBeenCalledOnce()
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:cover-image')
    })

    it.each([[800, 800], [1080, 1920], [750, 420], [1280, 721]])('rejects a %i×%i cover without uploading it', async (width, height) => {
      const { image, request, file, service, revokeObjectURL } = setupImage(width, height)
      const upload = service.uploadImage(file, 'cover')
      image.onload?.()

      await expect(upload).rejects.toThrow(`封面图宽高比必须为 16:9，当前尺寸为 ${width}×${height}`)
      expect(request).not.toHaveBeenCalled()
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:cover-image')
    })

    it.each(['onerror', 'onload'] as const)('rejects unreadable or empty covers on %s and releases their object URLs', async (event) => {
      const { image, request, file, service, revokeObjectURL } = setupImage(0, 0)
      const upload = service.uploadImage(file, 'cover')
      image[event]?.()

      await expect(upload).rejects.toThrow('无法读取封面图片，请重新选择有效的图片')
      expect(request).not.toHaveBeenCalled()
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:cover-image')
    })

    it.each(['banner', 'editor'] as const)('does not restrict the aspect ratio for %s images', async (scene) => {
      const { request, file, service, createObjectURL } = setupImage(800, 800)

      await expect(service.uploadImage(file, scene)).resolves.toMatchObject({ name: file.name })
      expect(request).toHaveBeenCalledOnce()
      expect(createObjectURL).not.toHaveBeenCalled()
    })
  })

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

  it.each([
    { name: '公告.pdf', type: 'application/pdf' },
    { name: '公告.doc', type: 'application/msword' },
    { name: '公告.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
    { name: '资料.zip', type: 'application/zip' },
    { name: '数据.custom', type: 'application/x-custom' },
    { name: '未识别文件', type: '' },
  ])('uploads attachment $name without a MIME whitelist', async ({ name, type }) => {
    const configs: SignedRequestConfig[] = []
    const responseMime = type || 'application/octet-stream'
    const file = new File(['attachment'], name, { type })
    const service = createFileUploadService(async <T, D = unknown>(config: SignedRequestConfig<D>): Promise<T> => {
      configs.push(config as SignedRequestConfig)
      return {
        url: 'https://api.example.com/uploads/attachment/file',
        path: '/uploads/attachment/file',
        name,
        size: file.size,
        mime: responseMime,
        scene: 'attachment',
      } as T
    })

    await expect(service.uploadAttachment(file)).resolves.toMatchObject({
      id: '/uploads/attachment/file',
      name,
      mimeType: responseMime,
      size: file.size,
    })

    expect(configs).toHaveLength(1)
    expect(configs[0]).toMatchObject({
      method: 'POST',
      url: 'api/v1/admin/uploads',
      signParams: { scene: 'attachment' },
    })
    expect(configs[0]?.headers).toBeUndefined()
    expect(configs[0]?.data).toBeInstanceOf(FormData)
    const data = configs[0]?.data as FormData
    expect(data.get('scene')).toBe('attachment')
    expect(data.get('file')).toBeInstanceOf(File)
    expect(data.get('file')).toMatchObject({ name, type, size: file.size })
  })

  it('uploads an attachment exactly 10MB in size', async () => {
    const file = new File([new Uint8Array(10 * 1024 * 1024)], '完整资料.pdf', { type: 'application/pdf' })
    const configs: SignedRequestConfig[] = []
    const service = createFileUploadService(async <T, D = unknown>(config: SignedRequestConfig<D>): Promise<T> => {
      configs.push(config as SignedRequestConfig)
      return {
        url: 'https://api.example.com/uploads/attachment/file.pdf',
        path: '/uploads/attachment/file.pdf',
        name: file.name,
        size: file.size,
        mime: file.type,
      } as T
    })

    await expect(service.uploadAttachment(file)).resolves.toMatchObject({ size: 10 * 1024 * 1024 })
    expect(configs).toHaveLength(1)
    expect((configs[0]?.data as FormData).get('file')).toMatchObject({ size: file.size })
  })

  it('rejects attachments over 10MB before sending a request', async () => {
    let requested = false
    const service = createFileUploadService(async <T>(): Promise<T> => {
      requested = true
      return {} as T
    })
    const file = new File([new Uint8Array(10 * 1024 * 1024 + 1)], '超限文件.bin')

    await expect(service.uploadAttachment(file)).rejects.toThrow('文件大小不能超过 10MB')
    expect(requested).toBe(false)
  })

  it('respects stricter attachment limits and cannot raise the 10MB maximum', () => {
    expect(() => validateUploadAttachment({ size: 1024 * 1024 }, 1024 * 1024)).not.toThrow()
    expect(() => validateUploadAttachment({ size: 1024 * 1024 + 1 }, 1024 * 1024))
      .toThrow('文件大小不能超过 1MB')
    expect(() => validateUploadAttachment({ size: 10 * 1024 * 1024 + 1 }, 20 * 1024 * 1024))
      .toThrow('文件大小不能超过 10MB')
  })

  it.each(['cover', 'banner', 'editor'] as const)('preserves image format and 5MB restrictions for %s', async (scene) => {
    let requested = false
    const service = createFileUploadService(async <T>(): Promise<T> => {
      requested = true
      return {} as T
    })

    await expect(service.uploadImage(new File(['pdf'], '公告.pdf', { type: 'application/pdf' }), scene))
      .rejects.toThrow('仅支持 JPG、PNG、WebP 或 GIF 图片')
    await expect(service.uploadImage(new File([new Uint8Array(5 * 1024 * 1024 + 1)], '封面.png', { type: 'image/png' }), scene))
      .rejects.toThrow('图片大小不能超过 5MB')
    expect(requested).toBe(false)
  })

  it('continues to require attachment URL, path, filename and MIME in server responses', () => {
    const response = {
      url: 'https://api.example.com/uploads/attachment/file.pdf',
      path: '/uploads/attachment/file.pdf',
      name: '公告.pdf',
      size: 1024,
      mime: 'application/pdf',
    }

    expect(() => mapApiUpload({ ...response, url: '' }, 'attachment')).toThrow('上传 URL')
    expect(() => mapApiUpload({ ...response, path: '' }, 'attachment')).toThrow('上传路径')
    expect(() => mapApiUpload({ ...response, name: '' }, 'attachment')).toThrow('原始文件名')
    expect(() => mapApiUpload({ ...response, mime: '' }, 'attachment')).toThrow('文件类型')
  })

  it('rejects incomplete or unsupported upload responses', () => {
    expect(() => mapApiUpload({ url: '', path: '/uploads/a.jpg', name: 'a.jpg', size: 1, mime: 'image/jpeg' }))
      .toThrow('上传 URL')
    expect(() => mapApiUpload({ url: 'https://example.com/a.svg', path: '/uploads/a.svg', name: 'a.svg', size: 1, mime: 'image/svg+xml' }))
      .toThrow('文件类型不受支持')
  })
})
