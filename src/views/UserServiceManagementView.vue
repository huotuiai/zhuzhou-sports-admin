<script setup lang="ts">
import type { CrudDialogCloseRequest, DataTableColumn } from '@/components/common'
import type {
  ContactNumber,
  ContactNumberValidationField,
  ContactNumberWriteInput,
  FeedbackHandleDraft,
  FeedbackHandleValidationField,
  FeedbackQuery,
  FeedbackType,
  UserFeedback,
  ValidationIssue,
} from '@/modules/user-service-management/types'
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  EyeOff,
  Info,
  MessageSquareText,
  PencilLine,
  PhoneCall,
  Plus,
  RotateCcw,
  ShieldCheck,
  Trash2,
  UserRoundCheck,
  X,
} from '@lucide/vue'
import { useEventListener } from '@vueuse/core'
import { computed, nextTick, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { CrudSheet, DataTable, PaginationBar, QueryPanel } from '@/components/common'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import ContactNumberForm from '@/modules/user-service-management/components/ContactNumberForm.vue'
import FeedbackHandleForm from '@/modules/user-service-management/components/FeedbackHandleForm.vue'
import { DEFAULT_FEEDBACK_QUERY, useUserServiceStore } from '@/modules/user-service-management/stores/user-service-store'
import { useTodoStore } from '@/modules/todo/stores/todo-store'

type ServiceTab = 'feedback' | 'contact'
type FormKind = 'feedback' | 'contact'

const feedbackColumns: readonly DataTableColumn<UserFeedback>[] = [
  { key: 'code', label: '反馈编号', width: '116px' },
  { key: 'type', label: '类型', width: '112px' },
  { key: 'content', label: '内容摘要', minWidth: '320px' },
  { key: 'contact', label: '联系方式', minWidth: '150px' },
  { key: 'submittedAt', label: '提交时间', minWidth: '170px' },
  { key: 'status', label: '处理状态', width: '112px' },
  { key: 'actions', label: '操作', width: '190px', align: 'right' },
]

const contactColumns: readonly DataTableColumn<ContactNumber>[] = [
  { key: 'sort', label: '排序', width: '100px', align: 'center' },
  { key: 'name', label: '号码名称', minWidth: '220px' },
  { key: 'phone', label: '联系电话', minWidth: '220px' },
  { key: 'displayEnabled', label: 'H5 展示', width: '130px', align: 'center' },
  { key: 'updatedAt', label: '更新时间', minWidth: '190px' },
  { key: 'actions', label: '操作', width: '180px', align: 'right' },
]

const feedbackTypeLabels: Record<FeedbackType, string> = {
  error: '问题报错',
  suggestion: '建议',
  complaint: '投诉',
  other: '其他',
}

const store = useUserServiceStore()
const todoStore = useTodoStore()
const route = useRoute()
const router = useRouter()
const activeTab = ref<ServiceTab>('feedback')
const queryDraft = ref<FeedbackQuery>({ ...store.query })
const loadError = ref('')
const detailTarget = ref<UserFeedback | null>(null)
const handleTarget = ref<UserFeedback | null>(null)
const handleValue = ref<FeedbackHandleDraft>({ remark: '' })
const handleInitial = ref<FeedbackHandleDraft>({ remark: '' })
const handleIssues = ref<readonly ValidationIssue<FeedbackHandleValidationField>[]>([])
const handleFormRef = ref<{ validateAndFocus(): boolean } | null>(null)
const contactOpen = ref(false)
const contactMode = ref<'create' | 'edit'>('create')
const editingContactId = ref<string | null>(null)
const contactValue = ref<ContactNumberWriteInput>(emptyContact())
const contactInitial = ref<ContactNumberWriteInput>(emptyContact())
const contactIssues = ref<readonly ValidationIssue<ContactNumberValidationField>[]>([])
const contactFormRef = ref<{ validateAndFocus(): boolean } | null>(null)
const discardKind = ref<FormKind | null>(null)
const deleteTarget = ref<ContactNumber | null>(null)

const handleDirty = computed(() => JSON.stringify(handleValue.value) !== JSON.stringify(handleInitial.value))
const contactDirty = computed(() => JSON.stringify(contactValue.value) !== JSON.stringify(contactInitial.value))
const hasFeedbackQuery = computed(() => store.query.type !== 'all' || store.query.status !== 'all' || Boolean(store.query.startDate || store.query.endDate))

function emptyContact(): ContactNumberWriteInput {
  return { name: '', phone: '', sort: 1, displayEnabled: true }
}

function cloneContactInput(value: ContactNumberWriteInput): ContactNumberWriteInput {
  return { ...value }
}

function formatDateTime(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function feedbackTypeClass(type: FeedbackType): string {
  if (type === 'error') return 'border-destructive/30 bg-destructive/10 text-destructive'
  if (type === 'complaint') return 'border-warning/35 bg-warning/10 text-warning'
  if (type === 'suggestion') return 'border-primary/30 bg-primary/10 text-primary'
  return 'border-border bg-muted/55 text-muted-foreground'
}

async function changePage(page: number): Promise<void> {
  if (!await store.changePage(page)) toast.error(store.error ?? '反馈分页加载失败')
}

async function changePageSize(pageSize: number): Promise<void> {
  if (!await store.changePageSize(pageSize)) toast.error(store.error ?? '反馈分页加载失败')
}

async function applyQuery(): Promise<void> {
  if (!await store.queryFeedbacks({ ...queryDraft.value })) {
    toast.error(store.queryError ?? '筛选条件有误')
    return
  }
  await syncRouteQuery(store.query)
}

async function resetQuery(): Promise<void> {
  if (await store.resetQuery()) {
    queryDraft.value = { ...store.query }
    await syncRouteQuery(store.query)
  }
  else toast.error(store.error ?? store.queryError ?? '重置筛选失败')
}

async function openDetail(feedback: UserFeedback): Promise<void> {
  const detail = await store.getFeedback(feedback.id)
  if (detail) detailTarget.value = detail
  else toast.error(store.error ?? '反馈详情加载失败')
}

async function openHandle(feedback: UserFeedback): Promise<void> {
  const detail = await store.getFeedback(feedback.id)
  if (!detail) {
    toast.error(store.error ?? '反馈详情加载失败')
    return
  }
  const value = {
    remark: detail.handlingRemark,
  }
  handleTarget.value = detail
  handleValue.value = { ...value }
  handleInitial.value = { ...value }
  handleIssues.value = []
  store.resetError()
}

function closeHandle(): void {
  handleTarget.value = null
  handleIssues.value = []
  discardKind.value = null
}

async function saveHandle(): Promise<void> {
  if (!handleTarget.value) return
  const input = { ...handleValue.value }
  handleIssues.value = store.validateHandle(input)
  await nextTick()
  if (!handleFormRef.value?.validateAndFocus() || handleIssues.value.length) return
  const saved = await store.handleFeedback(handleTarget.value.id, input)
  if (!saved) {
    toast.error(store.error ?? '反馈保存失败')
    return
  }
  detailTarget.value = detailTarget.value?.id === saved.id ? saved : detailTarget.value
  await todoStore.refresh()
  closeHandle()
  toast.success('反馈处理结果已保存。')
}

function openCreateContact(): void {
  const nextSort = store.contacts.reduce((maximum, item) => Math.max(maximum, item.sort), 0) + 1
  const value = { ...emptyContact(), sort: nextSort }
  contactMode.value = 'create'
  editingContactId.value = null
  contactValue.value = cloneContactInput(value)
  contactInitial.value = cloneContactInput(value)
  contactIssues.value = []
  store.resetError()
  contactOpen.value = true
}

function openEditContact(contact: ContactNumber): void {
  const value: ContactNumberWriteInput = {
    name: contact.name,
    phone: contact.phone,
    sort: contact.sort,
    displayEnabled: contact.displayEnabled,
  }
  contactMode.value = 'edit'
  editingContactId.value = contact.id
  contactValue.value = cloneContactInput(value)
  contactInitial.value = cloneContactInput(value)
  contactIssues.value = []
  store.resetError()
  contactOpen.value = true
}

function closeContact(): void {
  contactOpen.value = false
  editingContactId.value = null
  contactIssues.value = []
  discardKind.value = null
}

async function saveContact(): Promise<void> {
  contactIssues.value = store.validateContact(contactValue.value)
  await nextTick()
  if (!contactFormRef.value?.validateAndFocus() || contactIssues.value.length) return
  const created = contactMode.value === 'create'
  const saved = created
    ? await store.createContact(contactValue.value)
    : editingContactId.value
      ? await store.updateContact(editingContactId.value, contactValue.value)
      : null
  if (!saved) {
    toast.error(store.error ?? '联系电话保存失败')
    return
  }
  closeContact()
  toast.success(created ? '联系电话已新增。' : '联系电话配置已更新。')
}

function requestClose(kind: FormKind, request: CrudDialogCloseRequest): void {
  const dirty = kind === 'feedback' ? handleDirty.value : contactDirty.value
  if (request.dirty || dirty) discardKind.value = kind
  else if (kind === 'feedback') closeHandle()
  else closeContact()
}

function confirmDiscard(): void {
  const kind = discardKind.value
  if (kind === 'feedback') closeHandle()
  if (kind === 'contact') closeContact()
}

async function removeContact(): Promise<void> {
  if (!deleteTarget.value) return
  const name = deleteTarget.value.name
  if (await store.deleteContact(deleteTarget.value.id)) {
    deleteTarget.value = null
    toast.success(`“${name}”已删除。`)
  } else {
    toast.error(store.error ?? '联系电话删除失败')
  }
}

async function exportFeedbacks(): Promise<void> {
  const file = await store.exportFeedbacks()
  if (!file) {
    toast.error(store.error ?? '反馈导出失败')
    return
  }
  const url = URL.createObjectURL(file.content)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = file.filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
  toast.success('意见反馈导出已开始。')
}

function confirmLeave(): boolean {
  if (handleTarget.value && handleDirty.value) return window.confirm('当前反馈处理备注尚未保存，确定放弃吗？')
  if (contactOpen.value && contactDirty.value) return window.confirm('当前联系电话配置尚未保存，确定放弃吗？')
  return true
}

function beforeUnload(event: BeforeUnloadEvent): void {
  if (!(handleTarget.value && handleDirty.value) && !(contactOpen.value && contactDirty.value)) return
  event.preventDefault()
  event.returnValue = ''
}

function routeFeedbackQuery(): FeedbackQuery {
  const typeValue = String(route.query.type ?? route.query.feedback_type ?? '')
  const statusValue = String(route.query.status ?? '')
  const handleStatusValue = String(route.query.handle_status ?? '')
  const type = typeValue === 'error' || typeValue === 'bug'
    ? 'error'
    : typeValue === 'suggestion' || typeValue === 'suggest'
      ? 'suggestion'
      : typeValue === 'complaint' || typeValue === 'complain'
        ? 'complaint'
        : typeValue === 'other'
          ? 'other'
          : 'all'
  const status = statusValue === 'pending' || handleStatusValue === '0'
    ? 'pending'
    : statusValue === 'processed' || handleStatusValue === '1'
      ? 'processed'
      : 'all'
  return {
    ...DEFAULT_FEEDBACK_QUERY,
    type,
    status,
    startDate: String(route.query.from ?? ''),
    endDate: String(route.query.to ?? ''),
  }
}

function hasRouteFeedbackQuery(): boolean {
  return ['type', 'feedback_type', 'status', 'handle_status', 'from', 'to']
    .some(key => route.query[key] !== undefined)
}

async function syncRouteQuery(nextQuery: FeedbackQuery): Promise<void> {
  const queryParams = { ...route.query }
  delete queryParams.feedback_type
  delete queryParams.handle_status
  if (nextQuery.type === 'all') delete queryParams.type
  else queryParams.type = nextQuery.type
  if (nextQuery.status === 'all') delete queryParams.status
  else queryParams.status = nextQuery.status
  if (nextQuery.startDate) queryParams.from = nextQuery.startDate
  else delete queryParams.from
  if (nextQuery.endDate) queryParams.to = nextQuery.endDate
  else delete queryParams.to
  await router.replace({ query: queryParams })
}

function selectTab(tab: ServiceTab): void {
  void router.replace({ query: { ...route.query, tab } })
}

async function load(nextQuery: FeedbackQuery = queryDraft.value): Promise<void> {
  loadError.value = ''
  if (!await store.refresh({ ...nextQuery })) {
    loadError.value = store.error ?? '用户服务数据加载失败'
    toast.error(loadError.value)
  }
  queryDraft.value = { ...store.query }
}

let initialRouteLoaded = false
watch(
  () => [
    route.query.tab,
    route.query.type,
    route.query.feedback_type,
    route.query.status,
    route.query.handle_status,
    route.query.from,
    route.query.to,
  ] as const,
  async () => {
    activeTab.value = route.query.tab === 'contact' ? 'contact' : 'feedback'
    const routeHasQuery = hasRouteFeedbackQuery()
    const nextQuery = !initialRouteLoaded && !routeHasQuery
      ? { ...store.query }
      : routeFeedbackQuery()
    queryDraft.value = nextQuery
    if (!initialRouteLoaded) {
      initialRouteLoaded = true
      await load(nextQuery)
      if (!routeHasQuery && JSON.stringify(store.query) !== JSON.stringify(DEFAULT_FEEDBACK_QUERY)) {
        await syncRouteQuery(store.query)
      }
      return
    }
    if (store.initialized && JSON.stringify(nextQuery) !== JSON.stringify(store.query)) {
      if (!await store.queryFeedbacks(nextQuery)) toast.error(store.error ?? store.queryError ?? '反馈筛选失败')
    }
  },
  { immediate: true },
)

onBeforeRouteLeave(() => confirmLeave())
useEventListener(window, 'beforeunload', beforeUnload)
</script>

<template>
  <section class="tech-grid min-h-[calc(100svh-4rem)] min-w-0 overflow-x-hidden p-4 lg:p-6" aria-labelledby="user-service-title">
    <div class="mx-auto flex w-full max-w-[1680px] flex-col gap-4">
      <header class="flex items-center justify-between gap-4">
        <div class="flex min-w-0 items-center gap-3">
          <span class="grid size-11 shrink-0 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
            <MessageSquareText class="size-5" aria-hidden="true" />
          </span>
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <h1 id="user-service-title" class="text-2xl font-semibold tracking-tight">用户服务管理</h1>
              <Badge v-if="store.pendingCount" variant="destructive">{{ store.pendingCount }} 条待处理</Badge>
            </div>
            <p class="mt-1 text-sm text-muted-foreground">集中处理用户意见反馈，维护联系我们号码配置</p>
          </div>
        </div>
        <div class="hidden items-center gap-3 xl:flex" aria-label="用户服务数据概览">
          <div class="rounded-xl border bg-card/70 px-4 py-2.5 text-sm shadow-sm">
            <span class="text-muted-foreground">未处理</span><strong class="ml-2 tabular-nums text-destructive">{{ store.pendingCount }}</strong>
          </div>
          <div class="rounded-xl border bg-card/70 px-4 py-2.5 text-sm shadow-sm">
            <span class="text-muted-foreground">已处理</span><strong class="ml-2 tabular-nums text-success">{{ store.processedCount }}</strong>
          </div>
          <div class="rounded-xl border bg-card/70 px-4 py-2.5 text-sm shadow-sm">
            <span class="text-muted-foreground">联系电话</span><strong class="ml-2 tabular-nums text-primary">{{ store.contacts.length }}</strong>
          </div>
        </div>
      </header>

      <div class="flex w-fit gap-1 rounded-xl border bg-muted/55 p-1" role="tablist" aria-label="用户服务管理分类">
        <button
          type="button"
          role="tab"
          class="min-h-11 rounded-lg px-5 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none"
          :class="activeTab === 'feedback' ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'"
          :aria-selected="activeTab === 'feedback'"
          @click="selectTab('feedback')"
        >
          意见反馈
          <span class="ml-1 tabular-nums">{{ store.overallTotal }}</span>
        </button>
        <button
          type="button"
          role="tab"
          class="min-h-11 rounded-lg px-5 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none"
          :class="activeTab === 'contact' ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'"
          :aria-selected="activeTab === 'contact'"
          @click="selectTab('contact')"
        >
          联系我们
          <span class="ml-1 tabular-nums">{{ store.contacts.length }}</span>
        </button>
      </div>

      <div v-if="loadError && !store.isLoading" class="flex items-center gap-3 rounded-xl border border-destructive/35 bg-destructive/8 p-4" role="alert">
        <AlertTriangle class="size-5 shrink-0 text-destructive" aria-hidden="true" />
        <p class="flex-1 text-sm text-destructive">{{ loadError }}</p>
        <Button variant="outline" class="h-11" @click="load()"><RotateCcw aria-hidden="true" />重新加载</Button>
      </div>

      <template v-if="activeTab === 'feedback'">
        <QueryPanel @query="applyQuery" @reset="resetQuery">
          <div class="space-y-2">
            <Label for="feedback-query-type">反馈类型</Label>
            <Select v-model="queryDraft.type">
              <SelectTrigger id="feedback-query-type" class="h-11 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                <SelectItem value="error">问题报错</SelectItem>
                <SelectItem value="suggestion">建议</SelectItem>
                <SelectItem value="complaint">投诉</SelectItem>
                <SelectItem value="other">其他</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="space-y-2">
            <Label for="feedback-query-status">处理状态</Label>
            <Select v-model="queryDraft.status">
              <SelectTrigger id="feedback-query-status" class="h-11 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="pending">未处理</SelectItem>
                <SelectItem value="processed">已处理</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="space-y-2">
            <Label for="feedback-query-start">开始日期</Label>
            <Input id="feedback-query-start" v-model="queryDraft.startDate" type="date" class="h-11" :max="queryDraft.endDate || undefined" />
          </div>
          <div class="space-y-2">
            <Label for="feedback-query-end">结束日期</Label>
            <Input id="feedback-query-end" v-model="queryDraft.endDate" type="date" class="h-11" :min="queryDraft.startDate || undefined" />
          </div>
          <template #actions-after>
            <Button type="button" variant="outline" size="lg" class="h-11 min-w-24" :disabled="store.isFeedbackLoading || store.isExporting" @click="exportFeedbacks">
              <Download aria-hidden="true" />{{ store.isExporting ? '导出中' : '导出' }}
            </Button>
          </template>
        </QueryPanel>

        <p v-if="store.queryError" class="flex items-center gap-1.5 text-xs text-destructive" role="alert">
          <AlertTriangle class="size-3.5" aria-hidden="true" />{{ store.queryError }}
        </p>

        <DataTable
          :columns="feedbackColumns"
          :rows="store.feedbacks"
          row-key="id"
          :loading="store.isFeedbackLoading"
          :empty-text="hasFeedbackQuery ? '当前筛选条件下暂无反馈' : '暂无用户反馈'"
          caption="用户意见反馈列表"
        >
          <template #cell-code="{ row }"><span class="font-mono text-xs font-semibold text-primary">{{ row.code }}</span></template>
          <template #cell-type="{ row }"><Badge variant="outline" :class="feedbackTypeClass(row.type)">{{ feedbackTypeLabels[row.type] }}</Badge></template>
          <template #cell-content="{ row }"><p class="max-w-[34rem] truncate" :title="row.content">{{ row.content }}</p></template>
          <template #cell-contact="{ row }"><span class="font-mono text-xs tabular-nums text-muted-foreground">{{ row.contact ?? '—' }}</span></template>
          <template #cell-submittedAt="{ row }"><time class="whitespace-nowrap text-xs tabular-nums text-muted-foreground">{{ formatDateTime(row.submittedAt) }}</time></template>
          <template #cell-status="{ row }">
            <Badge v-if="row.status === 'processed'" variant="outline" class="border-success/30 bg-success/10 text-success"><CheckCircle2 aria-hidden="true" />已处理</Badge>
            <Badge v-else variant="outline" class="border-destructive/30 bg-destructive/10 text-destructive"><Clock3 aria-hidden="true" />未处理</Badge>
          </template>
          <template #cell-actions="{ row }">
            <div class="flex justify-end gap-1">
              <Button variant="ghost" class="h-11 px-3" :disabled="store.detailLoadingId === row.id" @click="openDetail(row)"><Info aria-hidden="true" />详情</Button>
              <Button variant="ghost" class="h-11 px-3 text-primary hover:text-primary" :disabled="store.detailLoadingId === row.id" @click="openHandle(row)"><PencilLine aria-hidden="true" />{{ row.status === 'processed' ? '修改备注' : '处理' }}</Button>
            </div>
          </template>
        </DataTable>
        <PaginationBar
          :page="store.currentPage"
          :page-size="store.pageSize"
          :page-sizes="[20, 50, 100]"
          :total="store.total"
          :disabled="store.isFeedbackLoading"
          @update:page="changePage"
          @update:page-size="changePageSize"
        />
      </template>

      <template v-else>
        <Card class="border-primary/20 bg-primary/6 shadow-none">
          <CardContent class="flex min-h-16 items-center gap-3">
            <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><PhoneCall class="size-5" aria-hidden="true" /></span>
            <div class="min-w-0 flex-1">
              <p class="font-medium">联系我们号码配置</p>
              <p class="mt-1 text-xs leading-5 text-muted-foreground">这里维护后台侧的数据源；本次不修改 H5 工程，仅标记哪些号码允许后续提供给 H5 展示。</p>
            </div>
            <Button size="lg" class="h-11" @click="openCreateContact"><Plus aria-hidden="true" />新增号码</Button>
          </CardContent>
        </Card>

        <DataTable :columns="contactColumns" :rows="store.contacts" row-key="id" :loading="store.isContactsLoading" empty-text="暂无联系方式" caption="联系我们号码列表">
          <template #empty>
            <div class="flex flex-col items-center text-muted-foreground" role="status">
              <span class="grid size-11 place-items-center rounded-xl border bg-muted/40"><PhoneCall class="size-5" aria-hidden="true" /></span>
              <span class="mt-3 text-sm">暂无联系方式</span>
              <span class="mt-1 text-xs">后续 H5 联系我们弹窗应降级提示“暂无联系方式”</span>
              <Button variant="outline" class="mt-4 h-11" @click="openCreateContact"><Plus aria-hidden="true" />新增号码</Button>
            </div>
          </template>
          <template #cell-sort="{ row }"><span class="inline-grid size-7 place-items-center rounded-full bg-primary/10 font-semibold tabular-nums text-primary">{{ row.sort }}</span></template>
          <template #cell-name="{ row }"><span class="font-medium">{{ row.name }}</span></template>
          <template #cell-phone="{ row }"><span class="font-mono font-semibold tabular-nums">{{ row.phone }}</span></template>
          <template #cell-displayEnabled="{ row }">
            <Badge v-if="row.displayEnabled" variant="outline" class="border-success/30 bg-success/10 text-success"><Eye aria-hidden="true" />展示</Badge>
            <Badge v-else variant="outline" class="border-border bg-muted/60 text-muted-foreground"><EyeOff aria-hidden="true" />隐藏</Badge>
          </template>
          <template #cell-updatedAt="{ row }"><time class="whitespace-nowrap text-xs tabular-nums text-muted-foreground">{{ formatDateTime(row.updatedAt) }}</time></template>
          <template #cell-actions="{ row }">
            <div class="flex justify-end gap-1">
              <Button variant="ghost" class="h-11 px-3" @click="openEditContact(row)"><PencilLine aria-hidden="true" />编辑</Button>
              <Button variant="ghost" size="icon-lg" class="h-11 w-11 text-destructive hover:text-destructive" :aria-label="`删除${row.name}`" @click="deleteTarget = row"><Trash2 aria-hidden="true" /></Button>
            </div>
          </template>
        </DataTable>
        <div class="flex items-center gap-2 rounded-xl border bg-card/65 px-4 py-3 text-xs text-muted-foreground">
          <ShieldCheck class="size-4 shrink-0 text-primary" aria-hidden="true" />
          新增、编辑和删除由服务端写入操作日志；列表默认按排序值升序。
        </div>
      </template>
    </div>

    <Sheet :open="Boolean(detailTarget)" @update:open="!$event && (detailTarget = null)">
      <SheetContent side="right" :show-close-button="false" class="!w-[min(600px,calc(100vw-2rem))] !max-w-none gap-0 p-0 sm:!max-w-[600px]">
        <div v-if="detailTarget" class="flex h-full min-h-0 flex-col">
          <SheetHeader class="relative shrink-0 border-b px-5 py-4 pr-16 text-left">
            <SheetTitle class="flex items-center gap-2 text-lg"><MessageSquareText class="size-5 text-primary" aria-hidden="true" />反馈详情 · {{ detailTarget.code }}</SheetTitle>
            <SheetDescription class="mt-1.5">完整反馈内容与处理记录，仅供查看。</SheetDescription>
            <Button variant="ghost" size="icon-lg" class="absolute right-3 top-3 h-11 w-11" aria-label="关闭反馈详情" @click="detailTarget = null"><X aria-hidden="true" /></Button>
          </SheetHeader>
          <div class="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
            <div class="grid grid-cols-2 gap-3 rounded-xl border bg-muted/25 p-4">
              <div><p class="text-xs text-muted-foreground">反馈类型</p><Badge variant="outline" class="mt-1.5" :class="feedbackTypeClass(detailTarget.type)">{{ feedbackTypeLabels[detailTarget.type] }}</Badge></div>
              <div><p class="text-xs text-muted-foreground">处理状态</p><p class="mt-1.5 font-medium" :class="detailTarget.status === 'processed' ? 'text-success' : 'text-destructive'">{{ detailTarget.status === 'processed' ? '已处理' : '未处理' }}</p></div>
              <div><p class="text-xs text-muted-foreground">联系方式</p><p class="mt-1.5 font-mono text-sm tabular-nums">{{ detailTarget.contact ?? '—' }}</p></div>
              <div><p class="text-xs text-muted-foreground">提交时间</p><p class="mt-1.5 text-sm tabular-nums">{{ formatDateTime(detailTarget.submittedAt) }}</p></div>
            </div>
            <div>
              <h3 class="text-sm font-semibold">反馈内容全文</h3>
              <p class="mt-2 rounded-xl border bg-card/70 p-4 text-sm leading-7">{{ detailTarget.content }}</p>
            </div>
            <div>
              <h3 class="text-sm font-semibold">处理备注</h3>
              <p class="mt-2 min-h-20 rounded-xl border bg-muted/25 p-4 text-sm leading-7 text-muted-foreground">{{ detailTarget.handlingRemark || '—' }}</p>
            </div>
            <div v-if="detailTarget.status === 'processed'" class="grid grid-cols-2 gap-3 rounded-xl border border-success/25 bg-success/8 p-4">
              <div><p class="text-xs text-success/80">处理人</p><p class="mt-1.5 inline-flex items-center gap-1.5 text-sm font-medium text-success"><UserRoundCheck class="size-4" aria-hidden="true" />{{ detailTarget.handlerName ?? '—' }}</p></div>
              <div><p class="text-xs text-success/80">处理时间</p><p class="mt-1.5 text-sm font-medium tabular-nums text-success">{{ formatDateTime(detailTarget.handledAt) }}</p></div>
            </div>
          </div>
          <SheetFooter class="shrink-0 flex-row justify-end border-t bg-card/90 px-5 py-4">
            <Button variant="outline" size="lg" class="h-11 min-w-24" @click="detailTarget = null">关闭</Button>
            <Button size="lg" class="h-11" @click="openHandle(detailTarget); detailTarget = null"><PencilLine aria-hidden="true" />{{ detailTarget.status === 'processed' ? '修改备注' : '处理反馈' }}</Button>
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>

    <CrudSheet
      :open="Boolean(handleTarget)"
      mode="edit"
      size="default"
      :title="`处理反馈 · ${handleTarget?.code ?? ''}`"
      description="填写处理方式或回访结果；未处理反馈保存后将标记为已处理。"
      submit-label="保存处理结果"
      :saving="store.isSaving"
      :dirty="handleDirty"
      @submit="saveHandle"
      @request-close="requestClose('feedback', $event)"
    >
      <FeedbackHandleForm
        v-if="handleTarget"
        ref="handleFormRef"
        :key="handleTarget.id"
        :feedback="handleTarget"
        :value="handleValue"
        :issues="handleIssues"
        :saving="store.isSaving"
        @update:value="handleValue = $event; handleIssues = []; store.resetError()"
      />
    </CrudSheet>

    <CrudSheet
      :open="contactOpen"
      :mode="contactMode"
      size="default"
      :title="contactMode === 'create' ? '新增联系电话' : '编辑联系电话'"
      description="号码将作为联系我们配置数据；仅开启展示的号码可供后续 H5 接入。"
      :saving="store.isSaving"
      :dirty="contactDirty"
      @submit="saveContact"
      @request-close="requestClose('contact', $event)"
    >
      <ContactNumberForm
        :key="`${contactMode}-${editingContactId ?? 'new'}`"
        ref="contactFormRef"
        :mode="contactMode"
        :value="contactValue"
        :issues="contactIssues"
        :saving="store.isSaving"
        @update:value="contactValue = $event; contactIssues = []; store.resetError()"
      />
    </CrudSheet>

    <AlertDialog :open="Boolean(discardKind)" @update:open="!$event && (discardKind = null)">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>放弃未保存的修改？</AlertDialogTitle>
          <AlertDialogDescription>{{ discardKind === 'feedback' ? '当前反馈处理备注尚未保存。' : '当前联系电话配置尚未保存。' }}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel class="h-11">继续编辑</AlertDialogCancel>
          <Button variant="destructive" class="h-11" @click="confirmDiscard">放弃修改</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog :open="Boolean(deleteTarget)" @update:open="!$event && (deleteTarget = null)">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认删除“{{ deleteTarget?.name }}”？</AlertDialogTitle>
          <AlertDialogDescription>删除后该号码不再出现在联系我们数据源中；操作记录会保留。</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel class="h-11">取消</AlertDialogCancel>
          <Button variant="destructive" class="h-11" :disabled="Boolean(store.deletingId)" @click="removeContact">
            <Trash2 aria-hidden="true" />{{ store.deletingId ? '删除中' : '确认删除' }}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>
</template>
