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

export interface ContactNumber {
  id: string
  name: string
  phone: string
  sort: number
  displayEnabled: boolean
  createdAt: string
  updatedAt: string
}

export interface UserServiceActor {
  id: string
  name: string
}

export interface FeedbackHandleInput {
  remark: string
  markProcessed: boolean
  actor: UserServiceActor
}

export type FeedbackHandleDraft = Omit<FeedbackHandleInput, 'actor'>

export interface ContactNumberWriteInput {
  name: string
  phone: string
  sort: number
  displayEnabled: boolean
}

export type UserServiceAuditAction =
  | 'handle-feedback'
  | 'update-feedback-remark'
  | 'create-contact'
  | 'update-contact'
  | 'delete-contact'

export interface UserServiceAuditLog {
  id: string
  action: UserServiceAuditAction
  entityType: 'feedback' | 'contact'
  entityId: string
  entityLabel: string
  operatorId: string
  operatorName: string
  summary: string
  createdAt: string
}

export interface UserServiceSnapshot {
  feedbacks: UserFeedback[]
  contacts: ContactNumber[]
  auditLogs: UserServiceAuditLog[]
}

export interface UserServiceService {
  load(): Promise<UserServiceSnapshot>
  handleFeedback(id: string, input: FeedbackHandleInput): Promise<UserFeedback>
  createContact(input: ContactNumberWriteInput, actor: UserServiceActor): Promise<ContactNumber>
  updateContact(id: string, input: ContactNumberWriteInput, actor: UserServiceActor): Promise<ContactNumber>
  removeContact(id: string, actor: UserServiceActor): Promise<void>
  listAuditLogs(): Promise<UserServiceAuditLog[]>
}

export interface FeedbackQuery {
  type: 'all' | FeedbackType
  status: 'all' | FeedbackStatus
  startDate: string
  endDate: string
}

export type FeedbackHandleValidationField = 'remark'

export type ContactNumberValidationField = 'name' | 'phone' | 'sort'

export interface ValidationIssue<TField extends string> {
  field: TField
  code: 'required' | 'invalid' | 'positive_integer'
  message: string
}
