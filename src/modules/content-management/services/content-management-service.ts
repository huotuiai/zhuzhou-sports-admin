import type {
  ActivityStatus,
  BannerRecord,
  BannerValidationField,
  BannerWriteInput,
  ContentManagementService,
  ContentManagementSnapshot,
  ContentRecord,
  ContentValidationField,
  ContentWriteInput,
  DeleteReferenceBlock,
  ExternalContentReference,
  ExternalContentReferenceService,
  FileAssetMetadata,
  OrganizerSyncState,
  PriorityHintRecord,
  PriorityHintValidationField,
  PriorityHintWriteInput,
  ReferenceType,
  SelectableReference,
  ValidationIssue,
} from '../types'
import { createClientId } from '@/lib/id'

export const CONTENT_MANAGEMENT_STORAGE_KEY = 'zz-sports-content-management:v1'
export const CONTENT_MANAGEMENT_SCHEMA_VERSION = 1
export const MAX_BANNERS = 8
export const MAX_PRIORITY_HINTS = 3
export const DEFAULT_PRIORITY = 50
export const MAX_IMAGE_FILE_SIZE = 2 * 1024 * 1024
export const MAX_ATTACHMENT_FILE_SIZE = 10 * 1024 * 1024

interface StoredContentManagement {
  schemaVersion: typeof CONTENT_MANAGEMENT_SCHEMA_VERSION
  snapshot: ContentManagementSnapshot
}

export type ContentManagementServiceErrorCode =
  | 'validation_failed'
  | 'not_found'
  | 'read_only'
  | 'referenced'
  | 'limit_reached'
  | 'storage_unavailable'
  | 'storage_corrupted'

export class ContentManagementServiceError extends Error {
  readonly code: ContentManagementServiceErrorCode
  readonly details?: unknown

  constructor(code: ContentManagementServiceErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'ContentManagementServiceError'
    this.code = code
    this.details = details
  }
}

export interface LocalContentManagementServiceOptions {
  storage?: Storage
  now?: () => Date
  createId?: () => string
}

const EMPTY_METRICS = Object.freeze({ clickPv: 0, clickUv: 0, viewPv: 0, viewUv: 0 })

export const TRAFFIC_REFERENCE_SEED: readonly ExternalContentReference[] = [
  {
    id: 'traffic-gz-001',
    code: 'GZ-001',
    type: 'traffic-control',
    title: '体育中心周边道路临时交通管制',
    enabled: true,
    published: true,
  },
  {
    id: 'traffic-gz-002',
    code: 'GZ-002',
    type: 'traffic-control',
    title: '演出散场期间临时交通疏导',
    enabled: true,
    published: true,
  },
] as const

function resolveBrowserStorage(): Storage {
  if (typeof globalThis.localStorage === 'undefined') {
    throw new ContentManagementServiceError('storage_unavailable', '当前环境不支持本地存储')
  }
  return globalThis.localStorage
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function normalizeText(value: string): string {
  return value.trim().normalize('NFKC')
}

function textLength(value: string): number {
  return Array.from(value).length
}

function dateValue(value: string | null): number | null {
  if (!value) return null
  const timestamp = new Date(value).getTime()
  return Number.isNaN(timestamp) ? null : timestamp
}

function dateOnlyValue(value: string | null, endOfDay = false): number | null {
  if (!value) return null
  const suffix = endOfDay ? 'T23:59:59.999' : 'T00:00:00.000'
  const timestamp = new Date(`${value}${suffix}`).getTime()
  return Number.isNaN(timestamp) ? null : timestamp
}

function stripPreview(asset: FileAssetMetadata | null): FileAssetMetadata | null {
  if (!asset) return null
  const stored = { ...asset }
  delete stored.previewUrl
  return stored
}

function stripSnapshotPreviews(snapshot: ContentManagementSnapshot): ContentManagementSnapshot {
  const next = clone(snapshot)
  next.contents.forEach((record) => {
    record.cover = stripPreview(record.cover)
    record.attachments = record.attachments.map((asset) => stripPreview(asset)!)
  })
  next.banners.forEach((record) => {
    record.image = stripPreview(record.image)!
  })
  return next
}

function assetsInSnapshot(snapshot: ContentManagementSnapshot): FileAssetMetadata[] {
  return [
    ...snapshot.contents.flatMap((record) => [record.cover, ...record.attachments]),
    ...snapshot.banners.map((record) => record.image),
  ].filter((asset): asset is FileAssetMetadata => Boolean(asset))
}

function hydrateSessionPreviews(
  snapshot: ContentManagementSnapshot,
  previews: ReadonlyMap<string, string>,
): ContentManagementSnapshot {
  const hydrated = clone(snapshot)
  for (const asset of assetsInSnapshot(hydrated)) {
    const previewUrl = previews.get(asset.id)
    if (previewUrl) asset.previewUrl = previewUrl
  }
  return hydrated
}

function sampleAsset(id: string, name: string): FileAssetMetadata {
  return {
    id,
    name,
    mimeType: 'image/jpeg',
    size: 386_240,
    lastModified: new Date('2026-08-10T08:00:00+08:00').getTime(),
  }
}

function sampleContent(
  patch: Partial<ContentRecord> & Pick<ContentRecord, 'id' | 'code' | 'type' | 'title'>,
): ContentRecord {
  const timestamp = patch.updatedAt ?? '2026-08-13T02:00:00.000Z'
  return {
    id: patch.id,
    code: patch.code,
    type: patch.type,
    title: patch.title,
    bodyHtml: patch.bodyHtml ?? '<p>这里是内容正文，可在编辑抽屉中继续完善。</p>',
    cover: patch.cover ?? null,
    attachments: patch.attachments ?? [],
    source: patch.source ?? 'manual',
    sourceSystemId: patch.sourceSystemId ?? null,
    syncStatus: patch.syncStatus ?? 'not-applicable',
    publishStatus: patch.publishStatus ?? 'published',
    publishAt: patch.publishAt ?? '2026-08-10T01:30:00.000Z',
    pinned: patch.pinned ?? false,
    priority: patch.priority ?? DEFAULT_PRIORITY,
    enabled: patch.enabled ?? true,
    activityStartAt: patch.activityStartAt ?? null,
    activityEndAt: patch.activityEndAt ?? null,
    activityLocation: patch.activityLocation ?? '',
    navigationLocation: patch.navigationLocation ?? '',
    metrics: patch.metrics ?? { ...EMPTY_METRICS },
    createdAt: patch.createdAt ?? timestamp,
    updatedAt: timestamp,
  }
}

export function createDefaultContentManagementSnapshot(): ContentManagementSnapshot {
  const contents: ContentRecord[] = [
    sampleContent({
      id: 'content-001', code: 'CT-001', type: 'activity',
      title: '8.15 群星演唱会 · 出行指南', pinned: true, priority: 10,
      cover: sampleAsset('asset-ct-001', '8.15-演唱会封面.jpg'),
      activityStartAt: '2026-08-15T11:30:00.000Z', activityEndAt: '2026-08-15T14:30:00.000Z',
      activityLocation: '株洲体育中心体育场', navigationLocation: '113.1462, 27.8165',
      metrics: { clickPv: 5240, clickUv: 4120, viewPv: 8860, viewUv: 6340 },
    }),
    sampleContent({
      id: 'content-002', code: 'CT-002', type: 'notice',
      title: '演唱会当日免费接驳专线公告', priority: 30,
      cover: sampleAsset('asset-ct-002', '接驳专线公告.jpg'),
      publishAt: '2026-08-11T06:00:00.000Z',
      metrics: { clickPv: 3180, clickUv: 2650, viewPv: 5420, viewUv: 4010 },
    }),
    sampleContent({
      id: 'content-003', code: 'CT-003', type: 'news',
      title: '体育中心周边停车指引', priority: 50, enabled: false,
      source: 'organizer', sourceSystemId: 'ORG-CONTENT-20260811-03', syncStatus: 'success',
      publishAt: '2026-08-11T02:20:00.000Z',
      metrics: { clickPv: 2860, clickUv: 2140, viewPv: 4930, viewUv: 3720 },
    }),
    sampleContent({
      id: 'content-004', code: 'CT-004', type: 'activity',
      title: '8.22 足球赛 · 活动信息（草稿）', publishStatus: 'draft', priority: 70,
      publishAt: '2026-08-21T01:00:00.000Z', enabled: true,
      cover: sampleAsset('asset-ct-004', '8.22-足球赛封面.jpg'),
      activityStartAt: '2026-08-22T11:30:00.000Z', activityEndAt: '2026-08-22T14:30:00.000Z',
      activityLocation: '株洲体育中心体育场',
    }),
    sampleContent({
      id: 'content-005', code: 'CT-005', type: 'activity',
      title: '8.30 音乐节 · 主办方同步活动', priority: 20,
      source: 'organizer', sourceSystemId: 'ORG-ACT-20260830', syncStatus: 'success',
      cover: sampleAsset('asset-ct-005', '8.30-音乐节封面.jpg'),
      publishAt: '2026-08-12T07:00:00.000Z',
      activityStartAt: '2026-08-30T10:00:00.000Z', activityEndAt: '2026-08-30T14:00:00.000Z',
      activityLocation: '株洲体育中心体育场',
      metrics: { clickPv: 2150, clickUv: 1780, viewPv: 3420, viewUv: 2650 },
    }),
    sampleContent({
      id: 'content-006', code: 'CT-006', type: 'news',
      title: '活动入场须知（草稿）', publishStatus: 'draft', publishAt: null,
      priority: 60, enabled: true,
    }),
  ]

  return {
    contents,
    banners: [
      {
        id: 'banner-001', code: 'BN-01', title: '8.15 演唱会 Banner',
        image: sampleAsset('asset-bn-001', '8.15-演唱会-Banner.jpg'),
        jumpType: 'activity', targetId: 'content-001', priority: 1, displayEnabled: true,
        validFrom: '2026-08-10', validTo: '2026-08-16',
        metrics: { clickPv: 4860, clickUv: 3920 },
        createdAt: '2026-08-10T01:00:00.000Z', updatedAt: '2026-08-10T01:00:00.000Z',
      },
      {
        id: 'banner-002', code: 'BN-02', title: '接驳专线公告 Banner',
        image: sampleAsset('asset-bn-002', '接驳专线公告-Banner.jpg'),
        jumpType: 'notice', targetId: 'content-002', priority: 2, displayEnabled: true,
        validFrom: '2026-08-11', validTo: '2026-08-18',
        metrics: { clickPv: 3020, clickUv: 2540 },
        createdAt: '2026-08-11T01:00:00.000Z', updatedAt: '2026-08-11T01:00:00.000Z',
      },
    ],
    priorityHints: [
      {
        id: 'hint-001', code: 'HP-01', title: '重要：活动日交通管制',
        referenceType: 'traffic-control', targetId: 'traffic-gz-001', priority: 1,
        displayEnabled: true, validFrom: '2026-08-13', validTo: '2026-08-18',
        metrics: { clickPv: 1860, clickUv: 1520 },
        createdAt: '2026-08-13T01:00:00.000Z', updatedAt: '2026-08-13T01:00:00.000Z',
      },
      {
        id: 'hint-002', code: 'HP-02', title: '免费接驳专线已开通',
        referenceType: 'notice', targetId: 'content-002', priority: 2,
        displayEnabled: true, validFrom: '2026-08-11', validTo: '2026-08-18',
        metrics: { clickPv: 1240, clickUv: 1010 },
        createdAt: '2026-08-11T01:00:00.000Z', updatedAt: '2026-08-11T01:00:00.000Z',
      },
    ],
    organizerSync: {
      sourceId: 'SRC-01',
      sourceName: '主办方系统',
      status: 'success',
      lastSyncedAt: '2026-08-13T02:00:00.000Z',
      summary: { created: 0, updated: 3, offline: 0 },
    },
  }
}

export function getActivityStatus(record: ContentRecord, now = new Date()): ActivityStatus {
  const start = dateValue(record.activityStartAt)
  const end = dateValue(record.activityEndAt)
  if (start !== null && now.getTime() < start) return 'not-started'
  if (end !== null && now.getTime() > end) return 'ended'
  return 'ongoing'
}

export function isWithinValidity(
  validFrom: string | null,
  validTo: string | null,
  now = new Date(),
): boolean {
  const start = dateOnlyValue(validFrom)
  const end = dateOnlyValue(validTo, true)
  if (start !== null && now.getTime() < start) return false
  if (end !== null && now.getTime() > end) return false
  return true
}

export function isBannerEffective(record: BannerRecord, now = new Date()): boolean {
  return record.displayEnabled && isWithinValidity(record.validFrom, record.validTo, now)
}

export function isPriorityHintEffective(record: PriorityHintRecord, now = new Date()): boolean {
  return record.displayEnabled && isWithinValidity(record.validFrom, record.validTo, now)
}

export function reconcileScheduledContent(
  snapshot: ContentManagementSnapshot,
  now = new Date(),
): ContentManagementSnapshot {
  const next = clone(snapshot)
  for (const record of next.contents) {
    if (record.source === 'organizer') continue
    const publishAt = dateValue(record.publishAt)
    if (publishAt === null) continue
    record.publishStatus = publishAt <= now.getTime() ? 'published' : 'draft'
  }
  return next
}

export function sortContents(records: readonly ContentRecord[]): ContentRecord[] {
  return [...records].sort((first, second) => {
    if (first.pinned !== second.pinned) return first.pinned ? -1 : 1
    if (first.priority !== second.priority) return first.priority - second.priority
    return (second.publishAt ?? second.updatedAt).localeCompare(first.publishAt ?? first.updatedAt)
  })
}

export function sortBanners(records: readonly BannerRecord[]): BannerRecord[] {
  return [...records].sort((first, second) =>
    first.priority - second.priority || second.updatedAt.localeCompare(first.updatedAt),
  )
}

export function sortPriorityHints(records: readonly PriorityHintRecord[]): PriorityHintRecord[] {
  return [...records].sort((first, second) =>
    first.priority - second.priority || second.updatedAt.localeCompare(first.updatedAt),
  )
}

function validateTitle<TField extends string>(
  field: TField,
  title: string,
  label: string,
): ValidationIssue<TField>[] {
  const normalized = normalizeText(title)
  if (!normalized) return [{ field, code: 'required', message: `请输入${label}` }]
  if (textLength(normalized) < 2) return [{ field, code: 'too_short', message: `${label}不能少于 2 个字符` }]
  if (textLength(normalized) > 50) return [{ field, code: 'too_long', message: `${label}不能超过 50 个字符` }]
  return []
}

function validatePriority<TField extends string>(field: TField, value: number): ValidationIssue<TField>[] {
  if (!Number.isInteger(value) || value < 0 || value > 9999) {
    return [{ field, code: 'invalid', message: '优先级必须是 0–9999 的整数' }]
  }
  return []
}

function validateValidity<TField extends 'validFrom' | 'validTo'>(
  validFrom: string | null,
  validTo: string | null,
): ValidationIssue<TField>[] {
  if (Boolean(validFrom) !== Boolean(validTo)) {
    return [{ field: (!validFrom ? 'validFrom' : 'validTo') as TField, code: 'required', message: '有效期开始和结束日期必须同时填写' }]
  }
  if (validFrom && validTo && validFrom > validTo) {
    return [{ field: 'validTo' as TField, code: 'invalid', message: '有效期结束日期不能早于开始日期' }]
  }
  return []
}

function looksLikeCoordinate(value: string): boolean {
  return /[，,]/.test(value) || /^[-+]?\d+(?:\.\d+)?\s+[-+]?\d+(?:\.\d+)?$/.test(value)
}

function validCoordinate(value: string): boolean {
  const match = value.match(/^\s*([-+]?\d+(?:\.\d+)?)\s*[,，]\s*([-+]?\d+(?:\.\d+)?)\s*$/)
  if (!match) return false
  const longitude = Number(match[1])
  const latitude = Number(match[2])
  return longitude >= -180 && longitude <= 180 && latitude >= -90 && latitude <= 90
}

function fileExtension(name: string): string {
  return name.includes('.') ? `.${name.split('.').pop()!.toLocaleLowerCase()}` : ''
}

function isImageAsset(asset: FileAssetMetadata): boolean {
  return asset.mimeType.startsWith('image/') || ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(fileExtension(asset.name))
}

function isSupportedAttachment(asset: FileAssetMetadata): boolean {
  return isImageAsset(asset) || ['.pdf', '.doc', '.docx'].includes(fileExtension(asset.name))
}

export function sanitizeContentInput(input: ContentWriteInput): ContentWriteInput {
  return {
    ...clone(input),
    title: normalizeText(input.title),
    bodyHtml: input.bodyHtml.trim(),
    cover: input.cover ? clone(input.cover) : null,
    attachments: input.attachments.map(clone),
    activityLocation: normalizeText(input.activityLocation),
    navigationLocation: normalizeText(input.navigationLocation),
  }
}

export function validateContentInput(
  input: ContentWriteInput,
): ValidationIssue<ContentValidationField>[] {
  const value = sanitizeContentInput(input)
  const issues: ValidationIssue<ContentValidationField>[] = [
    ...validateTitle('title', value.title, '标题'),
    ...validatePriority('priority', value.priority),
  ]
  if (value.type === 'activity') {
    if (!value.cover) issues.push({ field: 'cover', code: 'required', message: '请上传活动封面图' })
    if (!value.activityStartAt) issues.push({ field: 'activityStartAt', code: 'required', message: '请选择活动开始时间' })
    if (!value.activityEndAt) issues.push({ field: 'activityEndAt', code: 'required', message: '请选择活动结束时间' })
    const start = dateValue(value.activityStartAt)
    const end = dateValue(value.activityEndAt)
    if (start !== null && end !== null && start >= end) {
      issues.push({ field: 'activityEndAt', code: 'invalid', message: '活动结束时间必须晚于开始时间' })
    }
    if (!value.activityLocation) issues.push({ field: 'activityLocation', code: 'required', message: '请输入活动地点' })
    if (value.navigationLocation && looksLikeCoordinate(value.navigationLocation) && !validCoordinate(value.navigationLocation)) {
      issues.push({ field: 'navigationLocation', code: 'invalid', message: '经纬度格式应为“经度, 纬度”，且数值需在有效范围内' })
    }
  }
  if (value.cover && (!isImageAsset(value.cover) || value.cover.size > MAX_IMAGE_FILE_SIZE)) {
    issues.push({ field: 'cover', code: 'invalid', message: '封面必须是大小不超过 2MB 的图片文件' })
  }
  if (value.type !== 'notice' && value.attachments.length > 0) {
    issues.push({ field: 'attachments', code: 'invalid', message: '只有公告通知可以添加附件' })
  }
  if (value.type === 'notice' && value.attachments.some((asset) => !isSupportedAttachment(asset) || asset.size > MAX_ATTACHMENT_FILE_SIZE)) {
    issues.push({ field: 'attachments', code: 'invalid', message: '公告附件仅支持图片、PDF、DOC、DOCX，且单文件不能超过 10MB' })
  }
  return issues
}

export function buildSelectableReferences(
  snapshot: ContentManagementSnapshot,
  trafficReferences: readonly ExternalContentReference[] = TRAFFIC_REFERENCE_SEED,
): SelectableReference[] {
  const contents: SelectableReference[] = snapshot.contents.map((record) => ({
    id: record.id,
    code: record.code,
    type: record.type,
    title: record.title,
    valid: record.publishStatus === 'published' && record.enabled,
    description: record.publishStatus !== 'published' ? '尚未发布' : record.enabled ? '可引用' : '已停用',
  }))
  const traffic: SelectableReference[] = trafficReferences.map((record) => ({
    id: record.id,
    code: record.code,
    type: record.type,
    title: record.title,
    valid: record.enabled && record.published,
    description: record.enabled && record.published ? '可引用' : '不可引用',
  }))
  return [...contents, ...traffic]
}

function referenceIsValid(
  type: ReferenceType,
  targetId: string | null,
  snapshot: ContentManagementSnapshot,
): boolean {
  if (!targetId) return false
  return buildSelectableReferences(snapshot).some((item) => item.id === targetId && item.type === type && item.valid)
}

export function validateBannerInput(
  input: BannerWriteInput,
  snapshot: ContentManagementSnapshot,
): ValidationIssue<BannerValidationField>[] {
  const issues: ValidationIssue<BannerValidationField>[] = [
    ...validateTitle('title', input.title, 'Banner 标题'),
    ...validatePriority('priority', input.priority),
    ...validateValidity(input.validFrom, input.validTo),
  ]
  if (!input.image) issues.push({ field: 'image', code: 'required', message: '请上传 Banner 图片' })
  else if (!isImageAsset(input.image) || input.image.size > MAX_IMAGE_FILE_SIZE) {
    issues.push({ field: 'image', code: 'invalid', message: 'Banner 必须是大小不超过 2MB 的图片文件' })
  }
  if (input.jumpType !== 'none' && !referenceIsValid(input.jumpType, input.targetId, snapshot)) {
    issues.push({ field: 'targetId', code: 'not_found', message: '请选择当前有效且已启用的跳转目标' })
  }
  return issues
}

export function validatePriorityHintInput(
  input: PriorityHintWriteInput,
  snapshot: ContentManagementSnapshot,
): ValidationIssue<PriorityHintValidationField>[] {
  const issues: ValidationIssue<PriorityHintValidationField>[] = [
    ...validateTitle('title', input.title, '提示标题'),
    ...validatePriority('priority', input.priority),
    ...validateValidity(input.validFrom, input.validTo),
  ]
  if (!referenceIsValid(input.referenceType, input.targetId, snapshot)) {
    issues.push({ field: 'targetId', code: 'not_found', message: '请选择当前有效且已启用的引用目标' })
  }
  return issues
}

function throwFirstIssue(issues: readonly ValidationIssue[]): void {
  if (issues.length > 0) {
    throw new ContentManagementServiceError('validation_failed', issues[0]!.message, issues)
  }
}

function nextCode(prefix: string, codes: readonly string[]): string {
  const max = codes.reduce((value, code) => {
    const match = code.match(new RegExp(`^${prefix}-(\\d+)$`))
    return match ? Math.max(value, Number(match[1])) : value
  }, 0)
  return `${prefix}-${String(max + 1).padStart(prefix === 'CT' ? 3 : 2, '0')}`
}

function isSnapshot(value: unknown): value is ContentManagementSnapshot {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return Array.isArray(item.contents) && Array.isArray(item.banners) &&
    Array.isArray(item.priorityHints) && Boolean(item.organizerSync && typeof item.organizerSync === 'object')
}

export class LocalContentManagementService implements ContentManagementService {
  private readonly injectedStorage: Storage | undefined
  private readonly now: () => Date
  private readonly createId: () => string
  private readonly sessionPreviewUrls = new Map<string, string>()

  constructor(options: LocalContentManagementServiceOptions = {}) {
    this.injectedStorage = options.storage
    this.now = options.now ?? (() => new Date())
    this.createId = options.createId ?? createClientId
  }

  private get storage(): Storage {
    return this.injectedStorage ?? resolveBrowserStorage()
  }

  private read(): ContentManagementSnapshot {
    const raw = this.storage.getItem(CONTENT_MANAGEMENT_STORAGE_KEY)
    if (!raw) {
      const initial = reconcileScheduledContent(createDefaultContentManagementSnapshot(), this.now())
      this.write(initial)
      return clone(initial)
    }
    try {
      const parsed = JSON.parse(raw) as Partial<StoredContentManagement>
      if (parsed.schemaVersion !== CONTENT_MANAGEMENT_SCHEMA_VERSION || !isSnapshot(parsed.snapshot)) {
        throw new Error('Unsupported content management schema')
      }
      const reconciled = reconcileScheduledContent(parsed.snapshot, this.now())
      if (JSON.stringify(parsed.snapshot) !== JSON.stringify(reconciled)) this.write(reconciled)
      return hydrateSessionPreviews(reconciled, this.sessionPreviewUrls)
    } catch (error) {
      throw new ContentManagementServiceError('storage_corrupted', '本地内容管理数据无法解析', error)
    }
  }

  private write(snapshot: ContentManagementSnapshot): void {
    for (const asset of assetsInSnapshot(snapshot)) {
      if (asset.previewUrl) this.sessionPreviewUrls.set(asset.id, asset.previewUrl)
    }
    const envelope: StoredContentManagement = {
      schemaVersion: CONTENT_MANAGEMENT_SCHEMA_VERSION,
      snapshot: stripSnapshotPreviews(snapshot),
    }
    this.storage.setItem(CONTENT_MANAGEMENT_STORAGE_KEY, JSON.stringify(envelope))
  }

  private updateContentRecord(id: string, updater: (record: ContentRecord) => void): ContentRecord {
    const snapshot = this.read()
    const record = snapshot.contents.find((item) => item.id === id)
    if (!record) throw new ContentManagementServiceError('not_found', '未找到指定内容')
    updater(record)
    record.updatedAt = this.now().toISOString()
    this.write(snapshot)
    return clone(record)
  }

  async load(): Promise<ContentManagementSnapshot> {
    return this.read()
  }

  async createContent(input: ContentWriteInput): Promise<ContentRecord> {
    const snapshot = this.read()
    const value = sanitizeContentInput(input)
    throwFirstIssue(validateContentInput(value))
    const timestamp = this.now().toISOString()
    const publishAt = dateValue(value.publishAt)
    const record: ContentRecord = {
      ...value,
      id: this.createId(),
      code: nextCode('CT', snapshot.contents.map((item) => item.code)),
      source: 'manual',
      sourceSystemId: null,
      syncStatus: 'not-applicable',
      publishStatus: publishAt !== null && publishAt <= this.now().getTime() ? 'published' : 'draft',
      enabled: true,
      metrics: { ...EMPTY_METRICS },
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    snapshot.contents.push(record)
    this.write(snapshot)
    return clone(record)
  }

  async updateContent(id: string, input: ContentWriteInput): Promise<ContentRecord> {
    const snapshot = this.read()
    const index = snapshot.contents.findIndex((item) => item.id === id)
    if (index < 0) throw new ContentManagementServiceError('not_found', '未找到指定内容')
    const previous = snapshot.contents[index]!
    if (previous.source === 'organizer') throw new ContentManagementServiceError('read_only', '主办方对接内容为只读数据')
    const value = sanitizeContentInput(input)
    throwFirstIssue(validateContentInput(value))
    const publishAt = dateValue(value.publishAt)
    const record: ContentRecord = {
      ...previous,
      ...value,
      publishStatus: publishAt !== null && publishAt <= this.now().getTime() ? 'published' : 'draft',
      updatedAt: this.now().toISOString(),
    }
    snapshot.contents[index] = record
    this.write(snapshot)
    return clone(record)
  }

  async publishContent(id: string): Promise<ContentRecord> {
    return this.updateContentRecord(id, (record) => {
      if (record.source === 'organizer') throw new ContentManagementServiceError('read_only', '主办方对接内容由同步任务发布')
      record.publishStatus = 'published'
      record.publishAt = this.now().toISOString()
    })
  }

  async setContentPinned(id: string, pinned: boolean): Promise<ContentRecord> {
    return this.updateContentRecord(id, (record) => {
      if (record.source === 'organizer') throw new ContentManagementServiceError('read_only', '主办方对接内容不能手动调整置顶状态')
      record.pinned = pinned
    })
  }

  async setContentEnabled(id: string, enabled: boolean): Promise<ContentRecord> {
    return this.updateContentRecord(id, (record) => {
      if (record.source === 'organizer') throw new ContentManagementServiceError('read_only', '主办方对接内容不能手动调整启停状态')
      record.enabled = enabled
    })
  }

  async getDeleteReferenceBlock(id: string): Promise<DeleteReferenceBlock> {
    const snapshot = this.read()
    return {
      bannerCodes: snapshot.banners.filter((item) => item.targetId === id).map((item) => item.code),
      priorityHintCodes: snapshot.priorityHints.filter((item) => item.targetId === id).map((item) => item.code),
    }
  }

  async removeContent(id: string): Promise<void> {
    const snapshot = this.read()
    const record = snapshot.contents.find((item) => item.id === id)
    if (!record) throw new ContentManagementServiceError('not_found', '未找到指定内容')
    if (record.source === 'organizer') throw new ContentManagementServiceError('read_only', '主办方对接内容不能手动删除')
    const block = await this.getDeleteReferenceBlock(id)
    if (block.bannerCodes.length || block.priorityHintCodes.length) {
      throw new ContentManagementServiceError('referenced', '该内容仍被 Banner 或高优提示引用，请先解除关联', block)
    }
    snapshot.contents = snapshot.contents.filter((item) => item.id !== id)
    this.write(snapshot)
  }

  async createBanner(input: BannerWriteInput): Promise<BannerRecord> {
    const snapshot = this.read()
    if (snapshot.banners.length >= MAX_BANNERS) throw new ContentManagementServiceError('limit_reached', `Banner 最多配置 ${MAX_BANNERS} 条`)
    throwFirstIssue(validateBannerInput(input, snapshot))
    const timestamp = this.now().toISOString()
    const record: BannerRecord = {
      id: this.createId(),
      code: nextCode('BN', snapshot.banners.map((item) => item.code)),
      title: normalizeText(input.title),
      image: clone(input.image!),
      jumpType: input.jumpType,
      targetId: input.jumpType === 'none' ? null : input.targetId,
      priority: input.priority,
      displayEnabled: input.displayEnabled,
      validFrom: input.validFrom,
      validTo: input.validTo,
      metrics: { clickPv: 0, clickUv: 0 },
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    snapshot.banners.push(record)
    this.write(snapshot)
    return clone(record)
  }

  async updateBanner(id: string, input: BannerWriteInput): Promise<BannerRecord> {
    const snapshot = this.read()
    const index = snapshot.banners.findIndex((item) => item.id === id)
    if (index < 0) throw new ContentManagementServiceError('not_found', '未找到指定 Banner')
    throwFirstIssue(validateBannerInput(input, snapshot))
    const record: BannerRecord = {
      ...snapshot.banners[index]!,
      ...clone(input),
      image: clone(input.image!),
      title: normalizeText(input.title),
      targetId: input.jumpType === 'none' ? null : input.targetId,
      updatedAt: this.now().toISOString(),
    }
    snapshot.banners[index] = record
    this.write(snapshot)
    return clone(record)
  }

  async setBannerEnabled(id: string, enabled: boolean): Promise<BannerRecord> {
    const snapshot = this.read()
    const record = snapshot.banners.find((item) => item.id === id)
    if (!record) throw new ContentManagementServiceError('not_found', '未找到指定 Banner')
    record.displayEnabled = enabled
    record.updatedAt = this.now().toISOString()
    this.write(snapshot)
    return clone(record)
  }

  async removeBanner(id: string): Promise<void> {
    const snapshot = this.read()
    if (!snapshot.banners.some((item) => item.id === id)) throw new ContentManagementServiceError('not_found', '未找到指定 Banner')
    snapshot.banners = snapshot.banners.filter((item) => item.id !== id)
    this.write(snapshot)
  }

  async createPriorityHint(input: PriorityHintWriteInput): Promise<PriorityHintRecord> {
    const snapshot = this.read()
    if (snapshot.priorityHints.length >= MAX_PRIORITY_HINTS) throw new ContentManagementServiceError('limit_reached', `高优提示最多配置 ${MAX_PRIORITY_HINTS} 条`)
    throwFirstIssue(validatePriorityHintInput(input, snapshot))
    const timestamp = this.now().toISOString()
    const record: PriorityHintRecord = {
      id: this.createId(),
      code: nextCode('HP', snapshot.priorityHints.map((item) => item.code)),
      title: normalizeText(input.title),
      referenceType: input.referenceType,
      targetId: input.targetId,
      priority: input.priority,
      displayEnabled: input.displayEnabled,
      validFrom: input.validFrom,
      validTo: input.validTo,
      metrics: { clickPv: 0, clickUv: 0 },
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    snapshot.priorityHints.push(record)
    this.write(snapshot)
    return clone(record)
  }

  async updatePriorityHint(id: string, input: PriorityHintWriteInput): Promise<PriorityHintRecord> {
    const snapshot = this.read()
    const index = snapshot.priorityHints.findIndex((item) => item.id === id)
    if (index < 0) throw new ContentManagementServiceError('not_found', '未找到指定高优提示')
    throwFirstIssue(validatePriorityHintInput(input, snapshot))
    const record: PriorityHintRecord = {
      ...snapshot.priorityHints[index]!,
      ...clone(input),
      title: normalizeText(input.title),
      updatedAt: this.now().toISOString(),
    }
    snapshot.priorityHints[index] = record
    this.write(snapshot)
    return clone(record)
  }

  async setPriorityHintEnabled(id: string, enabled: boolean): Promise<PriorityHintRecord> {
    const snapshot = this.read()
    const record = snapshot.priorityHints.find((item) => item.id === id)
    if (!record) throw new ContentManagementServiceError('not_found', '未找到指定高优提示')
    record.displayEnabled = enabled
    record.updatedAt = this.now().toISOString()
    this.write(snapshot)
    return clone(record)
  }

  async removePriorityHint(id: string): Promise<void> {
    const snapshot = this.read()
    if (!snapshot.priorityHints.some((item) => item.id === id)) throw new ContentManagementServiceError('not_found', '未找到指定高优提示')
    snapshot.priorityHints = snapshot.priorityHints.filter((item) => item.id !== id)
    this.write(snapshot)
  }

  async triggerOrganizerSync(): Promise<OrganizerSyncState> {
    const snapshot = this.read()
    const timestamp = this.now().toISOString()
    snapshot.organizerSync = {
      ...snapshot.organizerSync,
      status: 'success',
      lastSyncedAt: timestamp,
      summary: { created: 0, updated: snapshot.contents.filter((item) => item.source === 'organizer').length, offline: 0 },
    }
    snapshot.contents.forEach((record) => {
      if (record.source === 'organizer') {
        record.syncStatus = 'success'
        record.updatedAt = timestamp
      }
    })
    this.write(snapshot)
    return clone(snapshot.organizerSync)
  }
}

export class MockExternalContentReferenceService implements ExternalContentReferenceService {
  async listTrafficControls(): Promise<ExternalContentReference[]> {
    return TRAFFIC_REFERENCE_SEED.map((record) => ({ ...record }))
  }
}

export const externalContentReferenceService = new MockExternalContentReferenceService()
export const contentManagementService = new LocalContentManagementService()
