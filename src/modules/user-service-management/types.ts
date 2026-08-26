export type FeedbackType = 'error' | 'suggestion' | 'complaint' | 'other'

export type FeedbackStatus = 'pending' | 'processed'

export interface UserFeedback {
  id: string
  code: string
  type: FeedbackType
  content: string
  contact: string | null
  submittedAt: string
  status: FeedbackStatus
  handlerId: string | null
  handlerName: string | null
  handledAt: string | null
  handlingRemark: string
}

export interface FeedbackPage {
  feedbacks: UserFeedback[]
  total: number
  page: number
  pageSize: number
}

export interface FeedbackExportFile {
  content: Blob
  filename: string
}

export interface ContactNumber {
  id: string
  name: string
  phone: string
  sort: number
  displayEnabled: boolean
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface FeedbackHandleInput {
  remark: string
}

export type FeedbackHandleDraft = FeedbackHandleInput

export interface ContactNumberWriteInput {
  name: string
  phone: string
  sort: number
  displayEnabled: boolean
}

export interface FeedbackQuery {
  type: 'all' | FeedbackType
  status: 'all' | FeedbackStatus
  startDate: string
  endDate: string
}

export interface UserServiceService {
  listFeedbacks(query: FeedbackQuery, page: number, pageSize: number): Promise<FeedbackPage>
  getFeedback(id: string): Promise<UserFeedback>
  handleFeedback(id: string, input: FeedbackHandleInput): Promise<UserFeedback>
  exportFeedbacks(query: FeedbackQuery): Promise<FeedbackExportFile>
  listContacts(): Promise<ContactNumber[]>
  createContact(input: ContactNumberWriteInput): Promise<ContactNumber>
  updateContact(id: string, input: ContactNumberWriteInput): Promise<ContactNumber>
  deleteContact(id: string): Promise<void>
}

export type FeedbackHandleValidationField = 'remark'

export type ContactNumberValidationField = 'name' | 'phone' | 'sort'

export interface ValidationIssue<TField extends string> {
  field: TField
  code: 'required' | 'invalid' | 'positive_integer'
  message: string
}
