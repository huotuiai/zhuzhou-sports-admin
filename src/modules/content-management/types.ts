export type ContentManagementTab = 'activity' | 'news' | 'banner' | 'hint'

export type ContentType = 'activity' | 'news' | 'notice'
export type PublishStatus = 'draft' | 'published'
export type ActivityStatus = 'not-started' | 'ongoing' | 'ended'
export type ReferenceType = ContentType | 'traffic-control'
export type BannerJumpType = ReferenceType | 'none'
export type ContentDataSource = 'manual' | 'sync'

export interface RemoteFileAsset {
  id: string
  name: string
  url: string
  mimeType: string
  size: number
  sortOrder: number
}

export interface MetricSnapshot {
  clickPv: number
  clickUv: number
  viewPv: number
  viewUv: number
}

export interface ContentRecord {
  id: string
  code: string
  type: ContentType
  title: string
  bodyHtml: string
  cover: RemoteFileAsset | null
  attachments: RemoteFileAsset[]
  publishStatus: PublishStatus
  publishAt: string | null
  pinned: boolean
  priority: number
  enabled: boolean
  validStartAt: string | null
  validEndAt: string | null
  activityStartAt: string | null
  activityEndAt: string | null
  activityLocation: string
  navAddress: string
  navLng: number | null
  navLat: number | null
  metrics: MetricSnapshot
  dataSource: ContentDataSource
  syncStatus: string | null
  lastSyncAt: string | null
  externalId: string | null
  createdAt: string
  updatedAt: string
}

export interface ContentWriteInput {
  type: ContentType
  title: string
  bodyHtml: string
  cover: RemoteFileAsset | null
  attachments: RemoteFileAsset[]
  publishAt: string | null
  pinned: boolean
  priority: number
  activityStartAt: string | null
  activityEndAt: string | null
  activityLocation: string
  navigationLocation: string
}

export interface BannerRecord {
  id: string
  code: string
  title: string
  image: RemoteFileAsset
  jumpType: BannerJumpType
  targetId: string | null
  targetTitle: string | null
  priority: number
  displayEnabled: boolean
  validFrom: string | null
  validTo: string | null
  metrics: Pick<MetricSnapshot, 'clickPv' | 'clickUv'>
  createdAt: string
  updatedAt: string
}

export interface BannerWriteInput {
  title: string
  image: RemoteFileAsset | null
  jumpType: BannerJumpType
  targetId: string | null
  priority: number
  displayEnabled: boolean
  validFrom: string | null
  validTo: string | null
}

export interface PriorityHintRecord {
  id: string
  code: string
  title: string
  referenceType: ReferenceType
  targetId: string
  targetTitle: string
  priority: number
  displayEnabled: boolean
  validFrom: string | null
  validTo: string | null
  metrics: Pick<MetricSnapshot, 'clickPv' | 'clickUv'>
  createdAt: string
  updatedAt: string
}

export interface PriorityHintWriteInput {
  title: string
  referenceType: ReferenceType
  targetId: string
  priority: number
  displayEnabled: boolean
  validFrom: string | null
  validTo: string | null
}

export interface ContentManagementSnapshot {
  contents: ContentRecord[]
  banners: BannerRecord[]
  priorityHints: PriorityHintRecord[]
}

export interface SelectableReference {
  id: string
  code: string
  type: ReferenceType
  title: string
  valid: boolean
  description: string
}

export interface ContentPage {
  records: ContentRecord[]
  total: number
  page: number
  pageSize: number
}

export interface BannerPage {
  records: BannerRecord[]
  total: number
  page: number
  pageSize: number
}

export interface PriorityHintPage {
  records: PriorityHintRecord[]
  total: number
  page: number
  pageSize: number
}

export interface ContentExportFile {
  content: Blob
  filename: string
}

export interface ContentServerQuery {
  keyword: string
  contentType: ContentType
  publishStatus: PublishStatus | 'all'
}

export interface BannerServerQuery {
  keyword: string
  jumpType: BannerJumpType | 'all'
}

export interface PriorityHintServerQuery {
  keyword: string
  referenceType: ReferenceType | 'all'
}

export type ContentValidationField = keyof ContentWriteInput
export type BannerValidationField = keyof BannerWriteInput
export type PriorityHintValidationField = keyof PriorityHintWriteInput

export interface ValidationIssue<TField extends string = string> {
  field: TField
  code: 'required' | 'invalid' | 'too_short' | 'too_long' | 'not_found' | 'limit'
  message: string
}

export interface ActivityQuery {
  publishStatus: PublishStatus | 'all'
  activityStatus: ActivityStatus | 'all'
  pinned: 'all' | 'pinned' | 'not-pinned'
  enabled: 'all' | 'enabled' | 'disabled'
  title: string
}

export interface NewsQuery {
  type: Exclude<ContentType, 'activity'> | 'all'
  publishStatus: PublishStatus | 'all'
  pinned: 'all' | 'pinned' | 'not-pinned'
  enabled: 'all' | 'enabled' | 'disabled'
  title: string
}

export interface BannerQuery {
  jumpType: BannerJumpType | 'all'
  enabled: 'all' | 'enabled' | 'disabled'
  title: string
}

export interface PriorityHintQuery {
  referenceType: ReferenceType | 'all'
  enabled: 'all' | 'enabled' | 'disabled'
  title: string
}

export interface ContentManagementService {
  listContents(query: ContentServerQuery): Promise<ContentRecord[]>
  listContentPage(page: number, pageSize: number, query: ContentServerQuery): Promise<ContentPage>
  getContent(id: string): Promise<ContentRecord>
  createContent(input: ContentWriteInput): Promise<ContentRecord>
  updateContent(id: string, input: ContentWriteInput): Promise<ContentRecord>
  publishContent(id: string, publishAt?: string | null): Promise<ContentRecord>
  unpublishContent(id: string): Promise<ContentRecord>
  setContentPinned(id: string, pinned: boolean): Promise<ContentRecord>
  setContentEnabled(id: string, enabled: boolean): Promise<ContentRecord>
  replaceAttachments(id: string, attachments: readonly RemoteFileAsset[]): Promise<ContentRecord>
  removeContent(id: string): Promise<void>
  listBanners(query: BannerServerQuery): Promise<BannerRecord[]>
  listBannerPage(page: number, pageSize: number, query: BannerServerQuery): Promise<BannerPage>
  getBanner(id: string): Promise<BannerRecord>
  createBanner(input: BannerWriteInput): Promise<BannerRecord>
  updateBanner(id: string, input: BannerWriteInput): Promise<BannerRecord>
  setBannerEnabled(id: string, enabled: boolean): Promise<BannerRecord>
  removeBanner(id: string): Promise<void>
  listPriorityHints(query: PriorityHintServerQuery): Promise<PriorityHintRecord[]>
  listPriorityHintPage(page: number, pageSize: number, query: PriorityHintServerQuery): Promise<PriorityHintPage>
  getPriorityHint(id: string): Promise<PriorityHintRecord>
  createPriorityHint(input: PriorityHintWriteInput): Promise<PriorityHintRecord>
  updatePriorityHint(id: string, input: PriorityHintWriteInput): Promise<PriorityHintRecord>
  setPriorityHintEnabled(id: string, enabled: boolean): Promise<PriorityHintRecord>
  removePriorityHint(id: string): Promise<void>
  listReferenceOptions(type: ReferenceType): Promise<SelectableReference[]>
  exportContents(): Promise<ContentExportFile>
}
