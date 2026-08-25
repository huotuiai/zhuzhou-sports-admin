export type ContentManagementTab = 'activity' | 'news' | 'banner' | 'hint'

export type ContentType = 'activity' | 'news' | 'notice'
export type PublishStatus = 'draft' | 'published'
export type ActivityStatus = 'not-started' | 'ongoing' | 'ended'
export type ReferenceType = ContentType | 'traffic-control'
export type BannerJumpType = ReferenceType | 'none'

export interface FileAssetMetadata {
  id: string
  name: string
  mimeType: string
  size: number
  lastModified: number
  /** Object URLs are session-only and are stripped before localStorage persistence. */
  previewUrl?: string
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
  cover: FileAssetMetadata | null
  attachments: FileAssetMetadata[]
  publishStatus: PublishStatus
  publishAt: string | null
  pinned: boolean
  priority: number
  enabled: boolean
  activityStartAt: string | null
  activityEndAt: string | null
  activityLocation: string
  navigationLocation: string
  metrics: MetricSnapshot
  createdAt: string
  updatedAt: string
}

export interface ContentWriteInput {
  type: ContentType
  title: string
  bodyHtml: string
  cover: FileAssetMetadata | null
  attachments: FileAssetMetadata[]
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
  image: FileAssetMetadata
  jumpType: BannerJumpType
  targetId: string | null
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
  image: FileAssetMetadata | null
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

export interface ExternalContentReference {
  id: string
  code: string
  type: 'traffic-control'
  title: string
  enabled: boolean
  published: boolean
}

export interface SelectableReference {
  id: string
  code: string
  type: ReferenceType
  title: string
  valid: boolean
  description: string
}

export interface ExternalContentReferenceService {
  listTrafficControls(): Promise<ExternalContentReference[]>
}

export type ContentValidationField = keyof ContentWriteInput
export type BannerValidationField = keyof BannerWriteInput
export type PriorityHintValidationField = keyof PriorityHintWriteInput

export interface ValidationIssue<TField extends string = string> {
  field: TField
  code: 'required' | 'invalid' | 'too_short' | 'too_long' | 'not_found' | 'limit'
  message: string
}

export interface DeleteReferenceBlock {
  bannerCodes: string[]
  priorityHintCodes: string[]
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
  load(): Promise<ContentManagementSnapshot>
  createContent(input: ContentWriteInput): Promise<ContentRecord>
  updateContent(id: string, input: ContentWriteInput): Promise<ContentRecord>
  publishContent(id: string): Promise<ContentRecord>
  setContentPinned(id: string, pinned: boolean): Promise<ContentRecord>
  setContentEnabled(id: string, enabled: boolean): Promise<ContentRecord>
  removeContent(id: string): Promise<void>
  getDeleteReferenceBlock(id: string): Promise<DeleteReferenceBlock>
  createBanner(input: BannerWriteInput): Promise<BannerRecord>
  updateBanner(id: string, input: BannerWriteInput): Promise<BannerRecord>
  setBannerEnabled(id: string, enabled: boolean): Promise<BannerRecord>
  removeBanner(id: string): Promise<void>
  createPriorityHint(input: PriorityHintWriteInput): Promise<PriorityHintRecord>
  updatePriorityHint(id: string, input: PriorityHintWriteInput): Promise<PriorityHintRecord>
  setPriorityHintEnabled(id: string, enabled: boolean): Promise<PriorityHintRecord>
  removePriorityHint(id: string): Promise<void>
}
