import { describe, expect, it } from 'vitest'
import type { BannerWriteInput, ContentWriteInput, PriorityHintWriteInput } from '../types'
import {
  CONTENT_MANAGEMENT_STORAGE_KEY,
  ContentManagementServiceError,
  LocalContentManagementService,
  buildSelectableReferences,
  getActivityStatus,
  isWithinValidity,
  sortContents,
  validateBannerInput,
  validateContentInput,
  validatePriorityHintInput,
} from './content-management-service'

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

function createService(now = '2026-08-17T04:00:00.000Z') {
  const storage = new MemoryStorage()
  let sequence = 0
  const service = new LocalContentManagementService({
    storage,
    now: () => new Date(now),
    createId: () => `generated-${++sequence}`,
  })
  return { service, storage }
}

function newsInput(patch: Partial<ContentWriteInput> = {}): ContentWriteInput {
  return {
    type: 'news',
    title: '新的场馆资讯',
    bodyHtml: '<p>正文</p>',
    cover: null,
    attachments: [],
    publishAt: null,
    pinned: false,
    priority: 50,
    activityStartAt: null,
    activityEndAt: null,
    activityLocation: '',
    navigationLocation: '',
    ...patch,
  }
}

function image() {
  return { id: 'asset-new', name: 'banner.jpg', mimeType: 'image/jpeg', size: 1024, lastModified: 1, previewUrl: 'blob:preview' }
}

describe('content management service', () => {
  it('seeds the prototype snapshot and persists a versioned envelope', async () => {
    const { service, storage } = createService()
    const snapshot = await service.load()

    expect(snapshot.contents).toHaveLength(6)
    expect(snapshot.banners).toHaveLength(2)
    expect(snapshot.priorityHints).toHaveLength(2)
    expect(JSON.parse(storage.getItem(CONTENT_MANAGEMENT_STORAGE_KEY) ?? '{}')).toMatchObject({ schemaVersion: 2 })
  })

  it('creates content, generates the next code, and strips object URLs from storage', async () => {
    const { service, storage } = createService()
    const created = await service.createContent(newsInput({ cover: image() }))

    expect(created.code).toBe('CT-007')
    expect(created.publishStatus).toBe('draft')
    expect(created.cover?.previewUrl).toBe('blob:preview')
    expect((await service.load()).contents.find((item) => item.id === created.id)?.cover?.previewUrl).toBe('blob:preview')
    expect(storage.getItem(CONTENT_MANAGEMENT_STORAGE_KEY)).not.toContain('blob:preview')
    const refreshedSession = new LocalContentManagementService({ storage })
    expect((await refreshedSession.load()).contents.find((item) => item.id === created.id)?.cover?.previewUrl).toBeUndefined()
  })

  it('reconciles scheduled publishing against the injected clock', async () => {
    const storage = new MemoryStorage()
    const earlyService = new LocalContentManagementService({ storage, now: () => new Date('2026-08-17T02:00:00.000Z') })
    const scheduled = await earlyService.createContent(newsInput({ publishAt: '2026-08-21T01:00:00.000Z' }))
    expect(scheduled.publishStatus).toBe('draft')

    const lateService = new LocalContentManagementService({ storage, now: () => new Date('2026-08-22T02:00:00.000Z') })
    expect((await lateService.load()).contents.find((item) => item.id === scheduled.id)?.publishStatus).toBe('published')
  })

  it('blocks referenced deletion and allows ordinary content mutations', async () => {
    const { service } = createService()
    const snapshot = await service.load()
    const referenced = snapshot.contents.find((item) => item.code === 'CT-002')!
    const editable = snapshot.contents.find((item) => item.code === 'CT-003')!

    await expect(service.removeContent(referenced.id)).rejects.toMatchObject({ code: 'referenced' })
    expect((await service.updateContent(editable.id, newsInput())).title).toBe('新的场馆资讯')
    expect((await service.setContentPinned(editable.id, true)).pinned).toBe(true)
    expect((await service.setContentEnabled(editable.id, true)).enabled).toBe(true)
    await service.removeContent(editable.id)
  })

  it('supports publishing, pinning, enabling and deleting an unreferenced manual draft', async () => {
    const { service } = createService()
    const draft = (await service.load()).contents.find((item) => item.code === 'CT-006')!

    expect((await service.publishContent(draft.id)).publishStatus).toBe('published')
    expect((await service.setContentPinned(draft.id, true)).pinned).toBe(true)
    expect((await service.setContentEnabled(draft.id, false)).enabled).toBe(false)
    await service.removeContent(draft.id)
    expect((await service.load()).contents.some((item) => item.id === draft.id)).toBe(false)
  })

  it('validates activity fields, priorities, validity periods and references', async () => {
    const { service } = createService()
    const snapshot = await service.load()
    const activityIssues = validateContentInput(newsInput({
      type: 'activity',
      title: 'A',
      priority: 10_000,
      activityStartAt: '2026-08-17T20:00',
      activityEndAt: '2026-08-17T19:00',
      navigationLocation: '300, 120',
    }))
    expect(activityIssues.map((issue) => issue.field)).toEqual(expect.arrayContaining(['title', 'priority', 'cover', 'activityEndAt', 'activityLocation', 'navigationLocation']))

    const banner: BannerWriteInput = { title: '有效 Banner', image: image(), jumpType: 'activity', targetId: 'missing', priority: 50, displayEnabled: true, validFrom: '2026-08-18', validTo: null }
    expect(validateBannerInput(banner, snapshot).map((issue) => issue.field)).toEqual(expect.arrayContaining(['targetId', 'validTo']))

    const oversizedBanner = { ...banner, targetId: 'content-001', validFrom: null, image: { ...image(), size: 3 * 1024 * 1024 } }
    expect(validateBannerInput(oversizedBanner, snapshot).some((issue) => issue.field === 'image')).toBe(true)

    const hint: PriorityHintWriteInput = { title: '有效提示', referenceType: 'news', targetId: 'content-003', priority: 50, displayEnabled: true, validFrom: null, validTo: null }
    expect(validatePriorityHintInput(hint, snapshot).some((issue) => issue.field === 'targetId')).toBe(true)
  })

  it('derives activity and effective-period state and exposes only valid references', async () => {
    const snapshot = await createService().service.load()
    const activity = snapshot.contents.find((item) => item.code === 'CT-005')!
    expect(getActivityStatus(activity, new Date('2026-08-17T00:00:00.000Z'))).toBe('not-started')
    expect(isWithinValidity('2026-08-10', '2026-08-18', new Date('2026-08-17T04:00:00.000Z'))).toBe(true)
    expect(buildSelectableReferences(snapshot).find((item) => item.id === 'content-003')?.valid).toBe(false)
  })

  it('sorts content by pinned, priority and publish time', async () => {
    const { service } = createService()
    const snapshot = await service.load()
    const sorted = sortContents(snapshot.contents)
    expect(sorted[0]?.pinned).toBe(true)
  })

  it('reports corrupted storage without silently replacing user data', async () => {
    const { service, storage } = createService()
    storage.setItem(CONTENT_MANAGEMENT_STORAGE_KEY, '{invalid')
    await expect(service.load()).rejects.toBeInstanceOf(ContentManagementServiceError)
    expect(storage.getItem(CONTENT_MANAGEMENT_STORAGE_KEY)).toBe('{invalid')
  })
})
