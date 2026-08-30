import type { AxiosResponse } from 'axios'
import type { SignedRequestConfig } from '@/lib/http'
import type {
  ActivityStatus,
  BannerJumpType,
  BannerPage,
  BannerRecord,
  BannerServerQuery,
  BannerValidationField,
  BannerWriteInput,
  ContentDataSource,
  ContentExportFile,
  ContentManagementService,
  ContentPage,
  ContentRecord,
  ContentServerQuery,
  ContentType,
  ContentValidationField,
  ContentWriteInput,
  PriorityHintPage,
  PriorityHintRecord,
  PriorityHintServerQuery,
  PriorityHintValidationField,
  PriorityHintWriteInput,
  ReferenceType,
  RemoteFileAsset,
  SelectableReference,
  ValidationIssue,
} from '../types'
import { ApiError, rawHttpClient, requestData } from '@/lib/http'

type ApiReferenceType = ContentType | 'control'
type ApiBannerJumpType = ApiReferenceType | 'none'

export interface ApiAttachmentVO {
  id?: number | string
  file_name?: string
  file_url?: string
  file_type?: string | null
  file_size?: number | string | null
  sort_order?: number | string | null
}

export interface ApiContentVO {
  id: number | string
  create_at: string
  update_at: string
  code: string
  title: string
  content_type: string
  body: string | null
  cover_url: string | null
  activity_start_at: string | null
  activity_end_at: string | null
  location: string | null
  nav_address: string | null
  nav_lng: number | string | null
  nav_lat: number | string | null
  publish_status: string
  publish_at: string | null
  is_pinned: number | boolean
  priority: number | string
  valid_start_at: string | null
  valid_end_at: string | null
  data_source: string
  sync_status: string | null
  last_sync_at: string | null
  external_id: string | null
  click_pv: number | string
  click_uv: number | string
  view_pv: number | string
  view_uv: number | string
  status: number | boolean
  attachments?: ApiAttachmentVO[] | null
}

export interface ApiBannerVO {
  id: number | string
  create_at: string
  update_at: string
  code: string
  title: string
  image_url: string
  jump_type: string
  jump_target_id: number | string | null
  priority: number | string
  valid_start_at: string | null
  valid_end_at: string | null
  click_pv: number | string
  click_uv: number | string
  status: number | boolean
  jump_title: string | null
}

export interface ApiHighlightVO {
  id: number | string
  create_at: string
  update_at: string
  code: string
  title: string
  ref_type: string
  ref_id: number | string
  priority: number | string
  valid_start_at: string | null
  valid_end_at: string | null
  click_pv: number | string
  click_uv: number | string
  status: number | boolean
  ref_title: string
}

export interface ApiRefOption {
  id: number | string
  name: string
}

interface ApiPage<T> {
  list: T[]
  total: number | string
  page: number | string
  page_size: number | string
}

interface ApiAttachmentRequest {
  file_name: string
  file_url: string
  file_type: string
  file_size: number
  sort_order: number
}

interface ApiContentWriteRequest {
  title: string
  content_type: ContentType
  body: string
  cover_url: string | null
  activity_start_at?: string
  activity_end_at?: string
  location?: string
  nav_address?: string | null
  nav_lng?: number | null
  nav_lat?: number | null
  is_pinned: 0 | 1
  priority: number
  valid_start_at: string | null
  valid_end_at: string | null
  status: 0 | 1
  attachments: ApiAttachmentRequest[]
}

interface ApiBannerWriteRequest {
  title: string
  image_url: string
  jump_type: ApiBannerJumpType
  jump_target_id: number | string | null
  priority: number
  valid_start_at: string | null
  valid_end_at: string | null
  status: 0 | 1
}

interface ApiHighlightWriteRequest {
  title: string
  ref_type: ApiReferenceType
  ref_id: number | string
  priority: number
  valid_start_at: string | null
  valid_end_at: string | null
  status: 0 | 1
}

export interface ContentManagementDataRequester {
  <T, D = unknown>(config: SignedRequestConfig<D>): Promise<T>
}

export interface ContentManagementFileRequester {
  (config: SignedRequestConfig): Promise<AxiosResponse<Blob>>
}

export class ContentManagementServiceError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ContentManagementServiceError'
  }
}

export const MAX_BANNERS = 8
export const MAX_PRIORITY_HINTS = 3
export const DEFAULT_PRIORITY = 50
const MAX_PAGE_SIZE = 100

function responseError(message: string): ApiError {
  return new ApiError(message, { kind: 'response' })
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw responseError(`服务器返回的${field}不完整`)
  return value
}

function nullableText(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function integer(value: unknown, fallback = 0): number {
  const result = Number(value)
  return Number.isInteger(result) ? result : fallback
}

function nonNegativeInteger(value: unknown): number {
  return Math.max(0, integer(value))
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const result = Number(value)
  return Number.isFinite(result) ? result : null
}

function flag(value: unknown): boolean {
  return value === true || value === 1
}

function endpoint(path: string, id: string, suffix = ''): string {
  return `${path}/${encodeURIComponent(id)}${suffix}`
}

function normalizeText(value: string): string {
  return value.trim().normalize('NFKC')
}

function mapContentType(value: unknown): ContentType {
  if (value === 'activity' || value === 'news' || value === 'notice') return value
  throw responseError('服务器返回的内容类型无效')
}

function mapPublishStatus(value: unknown): ContentRecord['publishStatus'] {
  if (value === 'draft' || value === 'published') return value
  throw responseError('服务器返回的内容发布状态无效')
}

function mapDataSource(value: unknown): ContentDataSource {
  if (value === 'manual' || value === 'sync') return value
  throw responseError('服务器返回的内容数据来源无效')
}

function mapReferenceType(value: unknown): ReferenceType {
  if (value === 'control') return 'traffic-control'
  return mapContentType(value)
}

function apiReferenceType(value: ReferenceType): ApiReferenceType {
  return value === 'traffic-control' ? 'control' : value
}

function mapBannerJumpType(value: unknown): BannerJumpType {
  if (value === 'none') return 'none'
  return mapReferenceType(value)
}

function apiBannerJumpType(value: BannerJumpType): ApiBannerJumpType {
  return value === 'none' ? 'none' : apiReferenceType(value)
}

function filenameFromUrl(url: string): string {
  const clean = url.split(/[?#]/)[0] ?? ''
  const fallback = '远程文件'
  try {
    return decodeURIComponent(clean.split('/').filter(Boolean).pop() ?? fallback) || fallback
  }
  catch {
    return clean.split('/').filter(Boolean).pop() || fallback
  }
}

function mimeTypeFromName(name: string): string {
  const extension = name.split('.').pop()?.toLocaleLowerCase('en-US')
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg'
  if (extension === 'png') return 'image/png'
  if (extension === 'gif') return 'image/gif'
  if (extension === 'webp') return 'image/webp'
  if (extension === 'pdf') return 'application/pdf'
  if (extension === 'doc') return 'application/msword'
  if (extension === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  return 'application/octet-stream'
}

function remoteAsset(id: string, url: string, patch: Partial<RemoteFileAsset> = {}): RemoteFileAsset {
  const name = patch.name || filenameFromUrl(url)
  return {
    id,
    name,
    url,
    mimeType: patch.mimeType || mimeTypeFromName(name),
    size: Math.max(0, patch.size ?? 0),
    sortOrder: Math.max(0, patch.sortOrder ?? 0),
  }
}

function mapAttachment(value: ApiAttachmentVO, index: number, contentId: string): RemoteFileAsset {
  const url = requiredText(value.file_url, '附件 URL')
  const name = requiredText(value.file_name, '附件名称')
  return remoteAsset(String(value.id ?? `${contentId}-attachment-${index}`), url, {
    name,
    mimeType: nullableText(value.file_type) || mimeTypeFromName(name),
    size: nonNegativeInteger(value.file_size),
    sortOrder: nonNegativeInteger(value.sort_order ?? index),
  })
}

export function mapApiContent(value: ApiContentVO): ContentRecord {
  if (value.id === undefined || value.id === null) throw responseError('服务器返回的内容 ID 不完整')
  const id = String(value.id)
  const coverUrl = nullableText(value.cover_url)?.trim() || null
  return {
    id,
    code: requiredText(value.code, '内容编号'),
    type: mapContentType(value.content_type),
    title: requiredText(value.title, '内容标题'),
    bodyHtml: nullableText(value.body) ?? '',
    cover: coverUrl ? remoteAsset(`${id}-cover`, coverUrl, { mimeType: 'image/*' }) : null,
    attachments: Array.isArray(value.attachments)
      ? value.attachments.map((item, index) => mapAttachment(item, index, id)).sort((a, b) => a.sortOrder - b.sortOrder)
      : [],
    publishStatus: mapPublishStatus(value.publish_status),
    publishAt: nullableText(value.publish_at),
    pinned: flag(value.is_pinned),
    priority: integer(value.priority, DEFAULT_PRIORITY),
    enabled: flag(value.status),
    validStartAt: nullableText(value.valid_start_at),
    validEndAt: nullableText(value.valid_end_at),
    activityStartAt: nullableText(value.activity_start_at),
    activityEndAt: nullableText(value.activity_end_at),
    activityLocation: nullableText(value.location) ?? '',
    navAddress: nullableText(value.nav_address) ?? '',
    navLng: nullableNumber(value.nav_lng),
    navLat: nullableNumber(value.nav_lat),
    metrics: {
      clickPv: nonNegativeInteger(value.click_pv),
      clickUv: nonNegativeInteger(value.click_uv),
      viewPv: nonNegativeInteger(value.view_pv),
      viewUv: nonNegativeInteger(value.view_uv),
    },
    dataSource: mapDataSource(value.data_source),
    syncStatus: nullableText(value.sync_status),
    lastSyncAt: nullableText(value.last_sync_at),
    externalId: nullableText(value.external_id),
    createdAt: requiredText(value.create_at, '内容创建时间'),
    updatedAt: requiredText(value.update_at, '内容更新时间'),
  }
}

export function mapApiBanner(value: ApiBannerVO): BannerRecord {
  if (value.id === undefined || value.id === null) throw responseError('服务器返回的 Banner ID 不完整')
  const id = String(value.id)
  const imageUrl = requiredText(value.image_url, 'Banner 图片 URL')
  return {
    id,
    code: requiredText(value.code, 'Banner 编号'),
    title: requiredText(value.title, 'Banner 标题'),
    image: remoteAsset(`${id}-image`, imageUrl, { mimeType: 'image/*' }),
    jumpType: mapBannerJumpType(value.jump_type),
    targetId: value.jump_target_id === null || value.jump_target_id === undefined ? null : String(value.jump_target_id),
    targetTitle: nullableText(value.jump_title),
    priority: integer(value.priority, DEFAULT_PRIORITY),
    displayEnabled: flag(value.status),
    validFrom: dateOnly(value.valid_start_at),
    validTo: dateOnly(value.valid_end_at),
    metrics: { clickPv: nonNegativeInteger(value.click_pv), clickUv: nonNegativeInteger(value.click_uv) },
    createdAt: requiredText(value.create_at, 'Banner 创建时间'),
    updatedAt: requiredText(value.update_at, 'Banner 更新时间'),
  }
}

export function mapApiPriorityHint(value: ApiHighlightVO): PriorityHintRecord {
  if (value.id === undefined || value.id === null) throw responseError('服务器返回的高优提示 ID 不完整')
  if (value.ref_id === undefined || value.ref_id === null) throw responseError('服务器返回的高优提示引用 ID 不完整')
  return {
    id: String(value.id),
    code: requiredText(value.code, '高优提示编号'),
    title: requiredText(value.title, '高优提示标题'),
    referenceType: mapReferenceType(value.ref_type),
    targetId: String(value.ref_id),
    targetTitle: requiredText(value.ref_title, '高优提示引用标题'),
    priority: integer(value.priority, DEFAULT_PRIORITY),
    displayEnabled: flag(value.status),
    validFrom: dateOnly(value.valid_start_at),
    validTo: dateOnly(value.valid_end_at),
    metrics: { clickPv: nonNegativeInteger(value.click_pv), clickUv: nonNegativeInteger(value.click_uv) },
    createdAt: requiredText(value.create_at, '高优提示创建时间'),
    updatedAt: requiredText(value.update_at, '高优提示更新时间'),
  }
}

function mapPage<TApi, TRecord>(value: ApiPage<TApi>, mapper: (item: TApi) => TRecord) {
  return {
    records: Array.isArray(value.list) ? value.list.map(mapper) : [],
    total: nonNegativeInteger(value.total),
    page: Math.max(1, integer(value.page, 1)),
    pageSize: Math.max(1, integer(value.page_size, 20)),
  }
}

export function mapApiContentPage(value: ApiPage<ApiContentVO>): ContentPage {
  return mapPage(value, mapApiContent)
}

export function mapApiBannerPage(value: ApiPage<ApiBannerVO>): BannerPage {
  return mapPage(value, mapApiBanner)
}

export function mapApiPriorityHintPage(value: ApiPage<ApiHighlightVO>): PriorityHintPage {
  return mapPage(value, mapApiPriorityHint)
}

function cloneAsset(asset: RemoteFileAsset): RemoteFileAsset {
  return { ...asset }
}

function cloneContent(record: ContentRecord): ContentRecord {
  return { ...record, cover: record.cover ? cloneAsset(record.cover) : null, attachments: record.attachments.map(cloneAsset), metrics: { ...record.metrics } }
}

function cloneBanner(record: BannerRecord): BannerRecord {
  return { ...record, image: cloneAsset(record.image), metrics: { ...record.metrics } }
}

function cloneHint(record: PriorityHintRecord): PriorityHintRecord {
  return { ...record, metrics: { ...record.metrics } }
}

export function sortContents(records: readonly ContentRecord[]): ContentRecord[] {
  return [...records]
    .sort((first, second) => Number(second.pinned) - Number(first.pinned)
      || second.priority - first.priority
      || (second.publishAt ?? second.updatedAt).localeCompare(first.publishAt ?? first.updatedAt))
    .map(cloneContent)
}

export function sortBanners(records: readonly BannerRecord[]): BannerRecord[] {
  return [...records].sort((first, second) => first.priority - second.priority || second.updatedAt.localeCompare(first.updatedAt)).map(cloneBanner)
}

export function sortPriorityHints(records: readonly PriorityHintRecord[]): PriorityHintRecord[] {
  return [...records].sort((first, second) => first.priority - second.priority || second.updatedAt.localeCompare(first.updatedAt)).map(cloneHint)
}

function dateValue(value: string | null): number | null {
  if (!value) return null
  const result = Date.parse(value)
  return Number.isFinite(result) ? result : null
}

function dateOnlyValue(value: string | null, endOfDay = false): number | null {
  if (!value) return null
  const result = Date.parse(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00'}`)
  return Number.isFinite(result) ? result : null
}

function dateOnly(value: string | null | undefined): string | null {
  if (!value) return null
  const direct = value.match(/^(\d{4}-\d{2}-\d{2})/)
  if (direct) return direct[1]!
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  const year = parsed.getFullYear()
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const day = String(parsed.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getActivityStatus(record: ContentRecord, now = new Date()): ActivityStatus {
  const start = dateValue(record.activityStartAt)
  const end = dateValue(record.activityEndAt)
  if (start !== null && now.getTime() < start) return 'not-started'
  if (end !== null && now.getTime() > end) return 'ended'
  return 'ongoing'
}

export function isWithinValidity(validFrom: string | null, validTo: string | null, now = new Date()): boolean {
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

function validateTitle<TField extends string>(field: TField, title: string, label: string): ValidationIssue<TField>[] {
  const value = normalizeText(title)
  if (!value) return [{ field, code: 'required', message: `请输入${label}` }]
  if (Array.from(value).length < 2) return [{ field, code: 'too_short', message: `${label}不能少于 2 个字符` }]
  if (Array.from(value).length > 50) return [{ field, code: 'too_long', message: `${label}不能超过 50 个字符` }]
  return []
}

function validatePriority<TField extends string>(field: TField, value: number): ValidationIssue<TField>[] {
  return Number.isInteger(value) && value >= 0 && value <= 9999
    ? []
    : [{ field, code: 'invalid', message: '优先级必须是 0–9999 的整数' }]
}

function validateValidity<TField extends 'validFrom' | 'validTo'>(from: string | null, to: string | null): ValidationIssue<TField>[] {
  if (Boolean(from) !== Boolean(to)) {
    return [{ field: (!from ? 'validFrom' : 'validTo') as TField, code: 'required', message: '有效期开始和结束日期必须同时填写' }]
  }
  if (from && to && from > to) return [{ field: 'validTo' as TField, code: 'invalid', message: '有效期结束日期不能早于开始日期' }]
  return []
}

export function sanitizeContentInput(input: ContentWriteInput): ContentWriteInput {
  return {
    ...input,
    title: normalizeText(input.title),
    bodyHtml: input.bodyHtml.trim(),
    cover: input.cover ? cloneAsset(input.cover) : null,
    attachments: input.attachments.map(cloneAsset),
    activityLocation: normalizeText(input.activityLocation),
    navigationLocation: normalizeText(input.navigationLocation),
  }
}

function coordinatePair(value: string): { lng: number, lat: number } | null {
  const match = value.match(/^\s*([-+]?\d+(?:\.\d+)?)\s*[,，]\s*([-+]?\d+(?:\.\d+)?)\s*$/)
  if (!match) return null
  const lng = Number(match[1])
  const lat = Number(match[2])
  return lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90 ? { lng, lat } : null
}

export function validateContentInput(input: ContentWriteInput): ValidationIssue<ContentValidationField>[] {
  const value = sanitizeContentInput(input)
  const issues: ValidationIssue<ContentValidationField>[] = [
    ...validateTitle('title', value.title, '标题'),
    ...validatePriority('priority', value.priority),
  ]
  if (value.type === 'activity') {
    if (!value.cover?.url) issues.push({ field: 'cover', code: 'required', message: '请上传活动封面' })
    if (!value.activityStartAt) issues.push({ field: 'activityStartAt', code: 'required', message: '请选择活动开始时间' })
    if (!value.activityEndAt) issues.push({ field: 'activityEndAt', code: 'required', message: '请选择活动结束时间' })
    const start = dateValue(value.activityStartAt)
    const end = dateValue(value.activityEndAt)
    if (start !== null && end !== null && start >= end) issues.push({ field: 'activityEndAt', code: 'invalid', message: '活动结束时间必须晚于开始时间' })
    if (!value.activityLocation) issues.push({ field: 'activityLocation', code: 'required', message: '请输入活动地点' })
    if (/[，,]/.test(value.navigationLocation) && !coordinatePair(value.navigationLocation)) {
      issues.push({ field: 'navigationLocation', code: 'invalid', message: '经纬度格式应为“经度, 纬度”，且数值需在有效范围内' })
    }
  }
  const validStart = dateValue(value.validStartAt)
  const validEnd = dateValue(value.validEndAt)
  if (validStart !== null && validEnd !== null && validStart >= validEnd) {
    issues.push({ field: 'validEndAt', code: 'invalid', message: 'H5 展示结束时间必须晚于开始时间' })
  }
  if (value.cover?.url.startsWith('blob:') || value.attachments.some(item => item.url.startsWith('blob:'))) {
    issues.push({ field: 'cover', code: 'invalid', message: '不能提交浏览器临时文件地址，请重新上传' })
  }
  return issues
}

export function validateBannerInput(input: BannerWriteInput): ValidationIssue<BannerValidationField>[] {
  const issues: ValidationIssue<BannerValidationField>[] = [
    ...validateTitle('title', input.title, 'Banner 标题'),
    ...validatePriority('priority', input.priority),
    ...validateValidity(input.validFrom, input.validTo),
  ]
  if (!input.image?.url) issues.push({ field: 'image', code: 'required', message: '请上传 Banner 图片' })
  else if (input.image.url.startsWith('blob:')) issues.push({ field: 'image', code: 'invalid', message: '不能提交浏览器临时图片地址' })
  if (input.jumpType !== 'none' && !input.targetId) issues.push({ field: 'targetId', code: 'not_found', message: '请选择有效的跳转目标' })
  return issues
}

export function validatePriorityHintInput(input: PriorityHintWriteInput): ValidationIssue<PriorityHintValidationField>[] {
  const issues: ValidationIssue<PriorityHintValidationField>[] = [
    ...validateTitle('title', input.title, '提示标题'),
    ...validatePriority('priority', input.priority),
    ...validateValidity(input.validFrom, input.validTo),
  ]
  if (!input.targetId) issues.push({ field: 'targetId', code: 'not_found', message: '请选择有效的引用目标' })
  return issues
}

export function formatContentRequestDateTime(value: string): string {
  const source = value.trim()
  const local = source.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?$/)
  return local ? `${local[1]} ${local[2]}:${local[3] ?? '00'}` : source
}

function formatDateBoundary(value: string | null, endOfDay: boolean): string | null {
  if (!value) return null
  return `${value} ${endOfDay ? '23:59:59' : '00:00:00'}`
}

function attachmentBody(assets: readonly RemoteFileAsset[]): ApiAttachmentRequest[] {
  return assets.map((asset, index) => ({
    file_name: asset.name,
    file_url: asset.url,
    file_type: asset.mimeType,
    file_size: Math.max(0, Math.trunc(asset.size)),
    sort_order: Number.isInteger(asset.sortOrder) ? asset.sortOrder : index,
  }))
}

function contentBody(input: ContentWriteInput): ApiContentWriteRequest {
  const value = sanitizeContentInput(input)
  const data: ApiContentWriteRequest = {
    title: value.title,
    content_type: value.type,
    body: value.bodyHtml,
    cover_url: value.cover?.url ?? null,
    is_pinned: value.pinned ? 1 : 0,
    priority: value.priority,
    valid_start_at: value.validStartAt ? formatContentRequestDateTime(value.validStartAt) : null,
    valid_end_at: value.validEndAt ? formatContentRequestDateTime(value.validEndAt) : null,
    status: value.enabled ? 1 : 0,
    attachments: attachmentBody(value.attachments),
  }
  if (value.type === 'activity') {
    if (value.activityStartAt) data.activity_start_at = formatContentRequestDateTime(value.activityStartAt)
    if (value.activityEndAt) data.activity_end_at = formatContentRequestDateTime(value.activityEndAt)
    if (value.activityLocation) data.location = value.activityLocation
    const point = coordinatePair(value.navigationLocation)
    if (point) {
      data.nav_address = null
      data.nav_lng = point.lng
      data.nav_lat = point.lat
    }
    else if (value.navigationLocation) {
      data.nav_address = value.navigationLocation
      data.nav_lng = null
      data.nav_lat = null
    }
    else {
      data.nav_address = null
      data.nav_lng = null
      data.nav_lat = null
    }
  }
  return data
}

function requestId(value: string, field: string): number | string {
  const normalized = value.trim()
  if (!/^\d+$/.test(normalized) || BigInt(normalized) <= 0n) {
    throw new ContentManagementServiceError(`${field}不是有效的 int64 ID`)
  }
  const result = Number(normalized)
  return Number.isSafeInteger(result) ? result : normalized
}

function bannerBody(input: BannerWriteInput): ApiBannerWriteRequest {
  if (!input.image?.url) throw new ContentManagementServiceError('请上传 Banner 图片')
  return {
    title: normalizeText(input.title),
    image_url: input.image.url,
    jump_type: apiBannerJumpType(input.jumpType),
    jump_target_id: input.jumpType === 'none' || !input.targetId ? null : requestId(input.targetId, 'Banner 跳转目标'),
    priority: input.priority,
    valid_start_at: formatDateBoundary(input.validFrom, false),
    valid_end_at: formatDateBoundary(input.validTo, true),
    status: input.displayEnabled ? 1 : 0,
  }
}

function hintBody(input: PriorityHintWriteInput): ApiHighlightWriteRequest {
  return {
    title: normalizeText(input.title),
    ref_type: apiReferenceType(input.referenceType),
    ref_id: requestId(input.targetId, '高优提示引用目标'),
    priority: input.priority,
    valid_start_at: formatDateBoundary(input.validFrom, false),
    valid_end_at: formatDateBoundary(input.validTo, true),
    status: input.displayEnabled ? 1 : 0,
  }
}

function contentQuery(page: number, pageSize: number, query: ContentServerQuery): Record<string, string | number> {
  const params: Record<string, string | number> = { page, page_size: pageSize, content_type: query.contentType }
  const keyword = normalizeText(query.keyword)
  if (keyword) params.keyword = keyword
  if (query.publishStatus !== 'all') params.publish_status = query.publishStatus
  return params
}

function bannerQuery(page: number, pageSize: number, query: BannerServerQuery): Record<string, string | number> {
  const params: Record<string, string | number> = { page, page_size: pageSize }
  const keyword = normalizeText(query.keyword)
  if (keyword) params.keyword = keyword
  if (query.jumpType !== 'all') params.jump_type = apiBannerJumpType(query.jumpType)
  return params
}

function hintQuery(page: number, pageSize: number, query: PriorityHintServerQuery): Record<string, string | number> {
  const params: Record<string, string | number> = { page, page_size: pageSize }
  const keyword = normalizeText(query.keyword)
  if (keyword) params.keyword = keyword
  if (query.referenceType !== 'all') params.ref_type = apiReferenceType(query.referenceType)
  return params
}

function sameDateTime(first: string | null, second: string | null): boolean {
  if (!first || !second) return first === second
  const firstTime = Date.parse(first)
  const secondTime = Date.parse(second)
  if (Number.isFinite(firstTime) && Number.isFinite(secondTime)) return firstTime === secondTime
  return formatContentRequestDateTime(first) === formatContentRequestDateTime(second)
}

function headerValue(response: AxiosResponse, name: string): string | null {
  const direct = response.headers?.[name]
  if (typeof direct === 'string') return direct
  const headers = response.headers as { get?: (headerName: string) => unknown }
  const getter = typeof headers.get === 'function' ? headers.get(name) : null
  return typeof getter === 'string' ? getter : null
}

function safeFilename(value: string): string {
  const sanitized = Array.from(value, character => character.charCodeAt(0) <= 31 || character.charCodeAt(0) === 127 ? '_' : character).join('')
  return sanitized.replace(/[\\/]/g, '_').trim() || 'contents.csv'
}

export function contentExportFilename(contentDisposition: string | null): string {
  if (!contentDisposition) return 'contents.csv'
  const encoded = contentDisposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i)?.[1]
  if (encoded) {
    try {
      return safeFilename(decodeURIComponent(encoded.replace(/^"|"$/g, '')))
    }
    catch {
      // Fall back to the plain filename.
    }
  }
  const plain = contentDisposition.match(/filename\s*=\s*(?:"([^"]+)"|([^;]+))/i)
  return safeFilename((plain?.[1] ?? plain?.[2] ?? 'contents.csv').trim())
}

function mapReferenceOption(value: ApiRefOption, requestedType: ReferenceType): SelectableReference {
  if (value.id === undefined || value.id === null) throw responseError('服务器返回的引用选项 ID 不完整')
  return {
    id: String(value.id),
    code: '',
    title: requiredText(value.name, '引用选项名称'),
    type: requestedType,
    valid: true,
    description: '可引用',
  }
}

function mapApiRefOptionPage(value: ApiPage<ApiRefOption>, requestedType: ReferenceType) {
  return mapPage(value, item => mapReferenceOption(item, requestedType))
}

const defaultFileRequester: ContentManagementFileRequester = config => rawHttpClient.request<Blob>(config)

export function createContentManagementService(
  request: ContentManagementDataRequester = requestData,
  requestFile: ContentManagementFileRequester = defaultFileRequester,
): ContentManagementService {
  const service: ContentManagementService = {
    async listContentPage(page, pageSize, query) {
      return mapApiContentPage(await request<ApiPage<ApiContentVO>>({
        method: 'GET', url: 'api/v1/admin/contents', params: contentQuery(page, pageSize, query),
      }))
    },

    async listContents(query) {
      const first = await service.listContentPage(1, MAX_PAGE_SIZE, query)
      const records = [...first.records]
      for (let page = 2; page <= Math.ceil(first.total / Math.max(1, first.pageSize)); page += 1) {
        records.push(...(await service.listContentPage(page, MAX_PAGE_SIZE, query)).records)
      }
      return sortContents([...new Map(records.map(record => [record.id, record])).values()])
    },

    async getContent(id) {
      return mapApiContent(await request<ApiContentVO>({ method: 'GET', url: endpoint('api/v1/admin/contents', id) }))
    },

    async createContent(input) {
      const issues = validateContentInput(input)
      if (issues.length) throw new ContentManagementServiceError(issues[0]!.message)
      const created = mapApiContent(await request<ApiContentVO, ApiContentWriteRequest>({
        method: 'POST', url: 'api/v1/admin/contents', data: contentBody(input),
      }))
      return input.publishAt ? service.publishContent(created.id, input.publishAt) : created
    },

    async updateContent(id, input) {
      const issues = validateContentInput(input)
      if (issues.length) throw new ContentManagementServiceError(issues[0]!.message)
      const updated = mapApiContent(await request<ApiContentVO, ApiContentWriteRequest>({
        method: 'PATCH', url: endpoint('api/v1/admin/contents', id), data: contentBody(input),
      }))
      if (input.publishAt) return sameDateTime(input.publishAt, updated.publishAt) ? updated : service.publishContent(id, input.publishAt)
      return updated.publishStatus === 'published' || updated.publishAt ? service.unpublishContent(id) : updated
    },

    async publishContent(id, publishAt = null) {
      const data = publishAt ? { publish_at: formatContentRequestDateTime(publishAt) } : {}
      return mapApiContent(await request<ApiContentVO, { publish_at?: string }>({
        method: 'POST', url: endpoint('api/v1/admin/contents', id, '/publish'), data,
      }))
    },

    async unpublishContent(id) {
      return mapApiContent(await request<ApiContentVO>({
        method: 'POST', url: endpoint('api/v1/admin/contents', id, '/unpublish'), data: {},
      }))
    },

    async setContentPinned(id, pinned) {
      const latest = await service.getContent(id)
      return mapApiContent(await request<ApiContentVO>({
        method: 'PATCH', url: endpoint('api/v1/admin/contents', id),
        data: { title: latest.title, content_type: latest.type, is_pinned: pinned ? 1 : 0 },
      }))
    },

    async setContentEnabled(id, enabled) {
      const latest = await service.getContent(id)
      return mapApiContent(await request<ApiContentVO>({
        method: 'PATCH', url: endpoint('api/v1/admin/contents', id),
        data: { title: latest.title, content_type: latest.type, status: enabled ? 1 : 0 },
      }))
    },

    async replaceAttachments(id, attachments) {
      return mapApiContent(await request<ApiContentVO>({
        method: 'PUT', url: endpoint('api/v1/admin/contents', id, '/attachments'),
        data: { attachments: attachmentBody(attachments) },
      }))
    },

    async removeContent(id) {
      await request<{ deleted: boolean }>({ method: 'DELETE', url: endpoint('api/v1/admin/contents', id) })
    },

    async listBannerPage(page, pageSize, query) {
      return mapApiBannerPage(await request<ApiPage<ApiBannerVO>>({
        method: 'GET', url: 'api/v1/admin/banners', params: bannerQuery(page, pageSize, query),
      }))
    },

    async listBanners(query) {
      const first = await service.listBannerPage(1, MAX_PAGE_SIZE, query)
      const records = [...first.records]
      for (let page = 2; page <= Math.ceil(first.total / Math.max(1, first.pageSize)); page += 1) {
        records.push(...(await service.listBannerPage(page, MAX_PAGE_SIZE, query)).records)
      }
      return sortBanners([...new Map(records.map(record => [record.id, record])).values()])
    },

    async getBanner(id) {
      return mapApiBanner(await request<ApiBannerVO>({ method: 'GET', url: endpoint('api/v1/admin/banners', id) }))
    },

    async createBanner(input) {
      const issues = validateBannerInput(input)
      if (issues.length) throw new ContentManagementServiceError(issues[0]!.message)
      return mapApiBanner(await request<ApiBannerVO, ApiBannerWriteRequest>({
        method: 'POST', url: 'api/v1/admin/banners', data: bannerBody(input),
      }))
    },

    async updateBanner(id, input) {
      const issues = validateBannerInput(input)
      if (issues.length) throw new ContentManagementServiceError(issues[0]!.message)
      return mapApiBanner(await request<ApiBannerVO, ApiBannerWriteRequest>({
        method: 'PATCH', url: endpoint('api/v1/admin/banners', id), data: bannerBody(input),
      }))
    },

    async setBannerEnabled(id, enabled) {
      const latest = await service.getBanner(id)
      return mapApiBanner(await request<ApiBannerVO>({
        method: 'PATCH', url: endpoint('api/v1/admin/banners', id),
        data: { title: latest.title, image_url: latest.image.url, status: enabled ? 1 : 0 },
      }))
    },

    async removeBanner(id) {
      await request<{ deleted: boolean }>({ method: 'DELETE', url: endpoint('api/v1/admin/banners', id) })
    },

    async listPriorityHintPage(page, pageSize, query) {
      return mapApiPriorityHintPage(await request<ApiPage<ApiHighlightVO>>({
        method: 'GET', url: 'api/v1/admin/highlights', params: hintQuery(page, pageSize, query),
      }))
    },

    async listPriorityHints(query) {
      const first = await service.listPriorityHintPage(1, MAX_PAGE_SIZE, query)
      const records = [...first.records]
      for (let page = 2; page <= Math.ceil(first.total / Math.max(1, first.pageSize)); page += 1) {
        records.push(...(await service.listPriorityHintPage(page, MAX_PAGE_SIZE, query)).records)
      }
      return sortPriorityHints([...new Map(records.map(record => [record.id, record])).values()])
    },

    async getPriorityHint(id) {
      return mapApiPriorityHint(await request<ApiHighlightVO>({ method: 'GET', url: endpoint('api/v1/admin/highlights', id) }))
    },

    async createPriorityHint(input) {
      const issues = validatePriorityHintInput(input)
      if (issues.length) throw new ContentManagementServiceError(issues[0]!.message)
      return mapApiPriorityHint(await request<ApiHighlightVO, ApiHighlightWriteRequest>({
        method: 'POST', url: 'api/v1/admin/highlights', data: hintBody(input),
      }))
    },

    async updatePriorityHint(id, input) {
      const issues = validatePriorityHintInput(input)
      if (issues.length) throw new ContentManagementServiceError(issues[0]!.message)
      return mapApiPriorityHint(await request<ApiHighlightVO, ApiHighlightWriteRequest>({
        method: 'PATCH', url: endpoint('api/v1/admin/highlights', id), data: hintBody(input),
      }))
    },

    async setPriorityHintEnabled(id, enabled) {
      const latest = await service.getPriorityHint(id)
      return mapApiPriorityHint(await request<ApiHighlightVO>({
        method: 'PATCH', url: endpoint('api/v1/admin/highlights', id),
        data: {
          title: latest.title,
          ref_type: apiReferenceType(latest.referenceType),
          ref_id: requestId(latest.targetId, '高优提示引用目标'),
          status: enabled ? 1 : 0,
        },
      }))
    },

    async removePriorityHint(id) {
      await request<{ deleted: boolean }>({ method: 'DELETE', url: endpoint('api/v1/admin/highlights', id) })
    },

    async listReferenceOptions(type) {
      const params = { page: 1, page_size: MAX_PAGE_SIZE, ref_type: apiReferenceType(type) }
      const first = mapApiRefOptionPage(await request<ApiPage<ApiRefOption>>({
        method: 'GET', url: 'api/v1/admin/contents/ref-options', params,
      }), type)
      const records = [...first.records]
      for (let page = 2; page <= Math.ceil(first.total / Math.max(1, first.pageSize)); page += 1) {
        records.push(...mapApiRefOptionPage(await request<ApiPage<ApiRefOption>>({
          method: 'GET', url: 'api/v1/admin/contents/ref-options', params: { ...params, page },
        }), type).records)
      }
      return [...new Map(records.map(record => [record.id, record])).values()]
    },

    async exportContents(): Promise<ContentExportFile> {
      const response = await requestFile({
        method: 'GET', url: 'api/v1/admin/contents/export', responseType: 'blob', headers: { Accept: 'text/csv' },
      })
      return { content: response.data, filename: contentExportFilename(headerValue(response, 'content-disposition')) }
    },
  }

  return service
}

export const contentManagementService = createContentManagementService()
