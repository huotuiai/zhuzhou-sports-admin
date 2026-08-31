<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { useEventListener, useIntervalFn } from '@vueuse/core'
import {
  AlertTriangle,
  BellRing,
  CalendarClock,
  CircleEllipsis,
  Download,
  Image as ImageIcon,
  LoaderCircle,
  Megaphone,
  Newspaper,
  PencilLine,
  Pin,
  Plus,
  RefreshCw,
  Trash2,
} from '@lucide/vue'
import { toast } from 'vue-sonner'
import type { DataTableColumn } from '@/components/common'
import type {
  ActivityQuery,
  BannerQuery,
  BannerRecord,
  BannerValidationField,
  BannerWriteInput,
  ContentManagementTab,
  ContentRecord,
  ContentValidationField,
  ContentWriteInput,
  NewsQuery,
  PriorityHintQuery,
  PriorityHintRecord,
  PriorityHintValidationField,
  PriorityHintWriteInput,
  ReferenceType,
  ValidationIssue,
} from '@/modules/content-management/types'
import type { CrudDialogCloseRequest, CrudDialogMode } from '@/components/common'
import type { ContentFormHandle } from '@/modules/content-management/components/ContentForm.vue'
import type { BannerFormHandle } from '@/modules/content-management/components/BannerForm.vue'
import type { PriorityHintFormHandle } from '@/modules/content-management/components/PriorityHintForm.vue'
import ContentForm from '@/modules/content-management/components/ContentForm.vue'
import BannerForm from '@/modules/content-management/components/BannerForm.vue'
import PriorityHintForm from '@/modules/content-management/components/PriorityHintForm.vue'
import {
  DEFAULT_PRIORITY,
  MAX_BANNERS,
  MAX_PRIORITY_HINTS,
  getActivityStatus,
  validateBannerInput,
  validateContentInput,
  validatePriorityHintInput,
} from '@/modules/content-management/services/content-management-service'
import {
  DEFAULT_ACTIVITY_QUERY,
  DEFAULT_BANNER_QUERY,
  DEFAULT_HINT_QUERY,
  DEFAULT_NEWS_QUERY,
  useContentManagementStore,
} from '@/modules/content-management/stores/content-management-store'
import { useTodoStore } from '@/modules/todo/stores/todo-store'
import { useAuthStore } from '@/stores/auth'
import { CrudSheet, DataTable, PaginationBar, QueryPanel } from '@/components/common'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

type SheetKind = 'content' | 'banner' | 'hint'
type DeleteTarget =
  | { kind: 'content'; record: ContentRecord }
  | { kind: 'banner'; record: BannerRecord }
  | { kind: 'hint'; record: PriorityHintRecord }

const validTabs: readonly ContentManagementTab[] = ['activity', 'news', 'banner', 'hint']
const tabLabels: Record<ContentManagementTab, string> = {
  activity: '活动管理',
  news: '资讯通知管理',
  banner: 'Banner 图窗',
  hint: '高优提示',
}

const activityColumns: readonly DataTableColumn<ContentRecord>[] = [
  { key: 'code', label: '内容编号', minWidth: '105px' },
  { key: 'title', label: '标题', minWidth: '240px' },
  { key: 'publishStatus', label: '发布状态', minWidth: '96px', align: 'center' },
  { key: 'activityStatus', label: '活动状态', minWidth: '96px', align: 'center' },
  { key: 'enabled', label: '状态', minWidth: '84px', align: 'center' },
  { key: 'pinned', label: '置顶', minWidth: '78px', align: 'center' },
  { key: 'priority', label: '优先级', minWidth: '84px', align: 'right' },
  { key: 'publishAt', label: '发布时间', minWidth: '160px' },
  { key: 'clickMetrics', label: '点击 PV/UV', minWidth: '130px', align: 'right' },
  { key: 'viewMetrics', label: '浏览 PV/UV', minWidth: '130px', align: 'right' },
  { key: 'actions', label: '操作', minWidth: '150px', align: 'right' },
]

const newsColumns: readonly DataTableColumn<ContentRecord>[] = [
  { key: 'code', label: '内容编号', minWidth: '105px' },
  { key: 'title', label: '标题', minWidth: '240px' },
  { key: 'publishStatus', label: '发布状态', minWidth: '96px', align: 'center' },
  { key: 'type', label: '类型', minWidth: '96px', align: 'center' },
  { key: 'enabled', label: '状态', minWidth: '84px', align: 'center' },
  { key: 'pinned', label: '置顶', minWidth: '78px', align: 'center' },
  { key: 'priority', label: '优先级', minWidth: '84px', align: 'right' },
  { key: 'publishAt', label: '发布时间', minWidth: '160px' },
  { key: 'clickMetrics', label: '点击 PV/UV', minWidth: '130px', align: 'right' },
  { key: 'viewMetrics', label: '浏览 PV/UV', minWidth: '130px', align: 'right' },
  { key: 'actions', label: '操作', minWidth: '150px', align: 'right' },
]

const bannerColumns: readonly DataTableColumn<BannerRecord>[] = [
  { key: 'code', label: '图窗编号', minWidth: '100px' },
  { key: 'title', label: '标题', minWidth: '220px' },
  { key: 'image', label: '图片', minWidth: '110px' },
  { key: 'jumpType', label: '跳转类型', minWidth: '100px', align: 'center' },
  { key: 'targetId', label: '跳转目标', minWidth: '220px' },
  { key: 'priority', label: '优先级', minWidth: '84px', align: 'right' },
  { key: 'displayEnabled', label: '展示状态', minWidth: '100px', align: 'center' },
  { key: 'validity', label: '有效期', minWidth: '190px' },
  { key: 'clickMetrics', label: '点击 PV/UV', minWidth: '130px', align: 'right' },
  { key: 'actions', label: '操作', minWidth: '150px', align: 'right' },
]

const hintColumns: readonly DataTableColumn<PriorityHintRecord>[] = [
  { key: 'code', label: '提示编号', minWidth: '100px' },
  { key: 'title', label: '提示标题', minWidth: '220px' },
  { key: 'referenceType', label: '引用类型', minWidth: '110px', align: 'center' },
  { key: 'targetId', label: '引用目标', minWidth: '240px' },
  { key: 'priority', label: '优先级', minWidth: '84px', align: 'right' },
  { key: 'displayEnabled', label: '展示状态', minWidth: '100px', align: 'center' },
  { key: 'validity', label: '有效期', minWidth: '190px' },
  { key: 'clickMetrics', label: '点击 PV/UV', minWidth: '130px', align: 'right' },
  { key: 'actions', label: '操作', minWidth: '150px', align: 'right' },
]

const route = useRoute()
const router = useRouter()
const store = useContentManagementStore()
const todoStore = useTodoStore()
const authStore = useAuthStore()
const canOperate = computed(() => authStore.hasPermission('content:operate'))
const canExport = computed(() => authStore.hasPermission('content:export'))
const permittedColumns = <TRow,>(columns: readonly DataTableColumn<TRow>[]) => canOperate.value ? columns : columns.filter(column => column.key !== 'actions')
const activeTab = computed<ContentManagementTab>(() => {
  const value = String(route.query.tab ?? 'activity') as ContentManagementTab
  return validTabs.includes(value) ? value : 'activity'
})

const activityQueryDraft = ref<ActivityQuery>({ ...DEFAULT_ACTIVITY_QUERY })
const newsQueryDraft = ref<NewsQuery>({ ...DEFAULT_NEWS_QUERY })
const bannerQueryDraft = ref<BannerQuery>({ ...DEFAULT_BANNER_QUERY })
const hintQueryDraft = ref<PriorityHintQuery>({ ...DEFAULT_HINT_QUERY })
const sheetKind = ref<SheetKind | null>(null)
const sheetMode = ref<CrudDialogMode>('create')
const editingId = ref<string | null>(null)
const contentForm = ref<ContentWriteInput>(emptyContentForm('activity'))
const bannerForm = ref<BannerWriteInput>(emptyBannerForm())
const hintForm = ref<PriorityHintWriteInput>(emptyHintForm())
const initialFormJson = ref('')
const contentIssues = ref<readonly ValidationIssue<ContentValidationField>[]>([])
const bannerIssues = ref<readonly ValidationIssue<BannerValidationField>[]>([])
const hintIssues = ref<readonly ValidationIssue<PriorityHintValidationField>[]>([])
const contentFormRef = ref<ContentFormHandle | null>(null)
const bannerFormRef = ref<BannerFormHandle | null>(null)
const hintFormRef = ref<PriorityHintFormHandle | null>(null)
const discardConfirmOpen = ref(false)
const deleteTarget = ref<DeleteTarget | null>(null)
const loadError = ref('')
const pageReady = ref(false)
const formUploading = ref(false)

const sheetOpen = computed(() => sheetKind.value !== null)
const sheetSaving = computed(() => store.isSaving || formUploading.value)
const sheetDirty = computed(() => {
  if (!sheetKind.value) return false
  return JSON.stringify(currentFormValue()) !== initialFormJson.value
})

function localDateTime(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function emptyContentForm(type: ContentWriteInput['type']): ContentWriteInput {
  return {
    type,
    title: '',
    bodyHtml: '<p></p>',
    cover: null,
    attachments: [],
    publishAt: null,
    pinned: false,
    priority: DEFAULT_PRIORITY,
    enabled: true,
    validStartAt: null,
    validEndAt: null,
    activityStartAt: null,
    activityEndAt: null,
    activityLocation: '',
    navigationLocation: '',
  }
}

function emptyBannerForm(): BannerWriteInput {
  return { title: '', image: null, jumpType: 'activity', targetId: null, priority: DEFAULT_PRIORITY, displayEnabled: true, validFrom: null, validTo: null }
}

function emptyHintForm(): PriorityHintWriteInput {
  return { title: '', referenceType: 'traffic-control', targetId: '', priority: DEFAULT_PRIORITY, displayEnabled: true, validFrom: null, validTo: null }
}

function contentToForm(record: ContentRecord): ContentWriteInput {
  return {
    type: record.type,
    title: record.title,
    bodyHtml: record.bodyHtml,
    cover: record.cover ? { ...record.cover } : null,
    attachments: record.attachments.map((file) => ({ ...file })),
    publishAt: localDateTime(record.publishAt),
    pinned: record.pinned,
    priority: record.priority,
    enabled: record.enabled,
    validStartAt: localDateTime(record.validStartAt),
    validEndAt: localDateTime(record.validEndAt),
    activityStartAt: localDateTime(record.activityStartAt),
    activityEndAt: localDateTime(record.activityEndAt),
    activityLocation: record.activityLocation,
    navigationLocation: record.navLng !== null && record.navLat !== null
      ? `${record.navLng}, ${record.navLat}`
      : record.navAddress,
  }
}

function bannerToForm(record: BannerRecord): BannerWriteInput {
  return { title: record.title, image: { ...record.image }, jumpType: record.jumpType, targetId: record.targetId, priority: record.priority, displayEnabled: record.displayEnabled, validFrom: record.validFrom, validTo: record.validTo }
}

function hintToForm(record: PriorityHintRecord): PriorityHintWriteInput {
  return { title: record.title, referenceType: record.referenceType, targetId: record.targetId, priority: record.priority, displayEnabled: record.displayEnabled, validFrom: record.validFrom, validTo: record.validTo }
}

function currentFormValue(): ContentWriteInput | BannerWriteInput | PriorityHintWriteInput | null {
  if (sheetKind.value === 'content') return contentForm.value
  if (sheetKind.value === 'banner') return bannerForm.value
  if (sheetKind.value === 'hint') return hintForm.value
  return null
}

function openSheet(kind: SheetKind, mode: CrudDialogMode, id: string | null, value: ContentWriteInput | BannerWriteInput | PriorityHintWriteInput): void {
  if (!canOperate.value) return
  formUploading.value = false
  sheetKind.value = kind
  sheetMode.value = mode
  editingId.value = id
  if (kind === 'content') contentForm.value = value as ContentWriteInput
  if (kind === 'banner') bannerForm.value = value as BannerWriteInput
  if (kind === 'hint') hintForm.value = value as PriorityHintWriteInput
  contentIssues.value = []
  bannerIssues.value = []
  hintIssues.value = []
  nextTick(() => { initialFormJson.value = JSON.stringify(currentFormValue()) })
}

function openCreate(): void {
  if (activeTab.value === 'activity') openSheet('content', 'create', null, emptyContentForm('activity'))
  if (activeTab.value === 'news') openSheet('content', 'create', null, emptyContentForm('news'))
  if (activeTab.value === 'banner') openSheet('banner', 'create', null, emptyBannerForm())
  if (activeTab.value === 'hint') openSheet('hint', 'create', null, emptyHintForm())
}

async function openContentEdit(record: ContentRecord): Promise<void> {
  if (!canOperate.value) return
  const detail = await store.getContent(record.id)
  if (!detail) return showStoreError('内容详情加载失败')
  openSheet('content', 'edit', detail.id, contentToForm(detail))
}

async function openBannerEdit(record: BannerRecord): Promise<void> {
  if (!canOperate.value) return
  const detail = await store.getBanner(record.id)
  if (!detail) return showStoreError('Banner 详情加载失败')
  openSheet('banner', 'edit', detail.id, bannerToForm(detail))
}

async function openHintEdit(record: PriorityHintRecord): Promise<void> {
  if (!canOperate.value) return
  const detail = await store.getPriorityHint(record.id)
  if (!detail) return showStoreError('高优提示详情加载失败')
  openSheet('hint', 'edit', detail.id, hintToForm(detail))
}

function closeSheet(): void {
  formUploading.value = false
  sheetKind.value = null
  editingId.value = null
  initialFormJson.value = ''
  discardConfirmOpen.value = false
}

function requestSheetClose(request: CrudDialogCloseRequest): void {
  if (request.dirty) discardConfirmOpen.value = true
  else closeSheet()
}

async function saveSheet(): Promise<void> {
  if (!canOperate.value || sheetSaving.value) return
  if (sheetKind.value === 'content') {
    contentIssues.value = validateContentInput(contentForm.value)
    await nextTick()
    if (!contentFormRef.value?.validateAndFocus() || contentIssues.value.length) return
    const success = sheetMode.value === 'create'
      ? await store.createContent(contentForm.value)
      : editingId.value ? await store.updateContent(editingId.value, contentForm.value) : false
    if (!success) return showStoreError('内容保存失败')
    closeSheet()
    await todoStore.refresh()
    toast.success(sheetMode.value === 'create' ? '内容已新增。' : '内容已更新。')
    return
  }
  if (sheetKind.value === 'banner') {
    bannerIssues.value = validateBannerInput(bannerForm.value)
    await nextTick()
    if (!bannerFormRef.value?.validateAndFocus() || bannerIssues.value.length) return
    const success = sheetMode.value === 'create'
      ? await store.createBanner(bannerForm.value)
      : editingId.value ? await store.updateBanner(editingId.value, bannerForm.value) : false
    if (!success) return showStoreError('Banner 保存失败')
    closeSheet()
    toast.success(sheetMode.value === 'create' ? 'Banner 已新增。' : 'Banner 已更新。')
    return
  }
  if (sheetKind.value === 'hint') {
    hintIssues.value = validatePriorityHintInput(hintForm.value)
    await nextTick()
    if (!hintFormRef.value?.validateAndFocus() || hintIssues.value.length) return
    const success = sheetMode.value === 'create'
      ? await store.createPriorityHint(hintForm.value)
      : editingId.value ? await store.updatePriorityHint(editingId.value, hintForm.value) : false
    if (!success) return showStoreError('高优提示保存失败')
    closeSheet()
    toast.success(sheetMode.value === 'create' ? '高优提示已新增。' : '高优提示已更新。')
  }
}

function showStoreError(fallback: string): void {
  toast.error(store.error ?? fallback)
  store.resetError()
}

async function runAction(operation: () => Promise<boolean>, successMessage: string, refreshTodos = false): Promise<void> {
  if (!canOperate.value) return
  if (!await operation()) return showStoreError('操作失败')
  if (refreshTodos) await todoStore.refresh()
  toast.success(successMessage)
}

function requestContentDelete(record: ContentRecord): void {
  if (!canOperate.value) return
  deleteTarget.value = { kind: 'content', record }
}

async function confirmDelete(): Promise<void> {
  if (!canOperate.value) return
  const target = deleteTarget.value
  if (!target) return
  const success = target.kind === 'content'
    ? await store.removeContent(target.record.id, target.record.type)
    : target.kind === 'banner'
      ? await store.removeBanner(target.record.id)
      : await store.removePriorityHint(target.record.id)
  if (!success) return showStoreError('删除失败')
  deleteTarget.value = null
  if (target.kind === 'content') await todoStore.refresh()
  toast.success('记录已删除。')
}

function selectTab(tab: ContentManagementTab): void {
  void router.replace({ query: { ...route.query, tab } })
}

async function applyQuery(): Promise<void> {
  const success = activeTab.value === 'activity'
    ? await store.setActivityQuery({ ...activityQueryDraft.value })
    : activeTab.value === 'news'
      ? await store.setNewsQuery({ ...newsQueryDraft.value })
      : activeTab.value === 'banner'
        ? await store.setBannerQuery({ ...bannerQueryDraft.value })
        : await store.setHintQuery({ ...hintQueryDraft.value })
  if (!success) showStoreError('查询失败')
}

async function resetQuery(): Promise<void> {
  if (activeTab.value === 'activity') activityQueryDraft.value = { ...DEFAULT_ACTIVITY_QUERY }
  if (activeTab.value === 'news') newsQueryDraft.value = { ...DEFAULT_NEWS_QUERY }
  if (activeTab.value === 'banner') bannerQueryDraft.value = { ...DEFAULT_BANNER_QUERY }
  if (activeTab.value === 'hint') hintQueryDraft.value = { ...DEFAULT_HINT_QUERY }
  if (!await store.resetQuery(activeTab.value)) showStoreError('重置筛选失败')
}

function formatDateTime(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(date)
}

function formatValidity(from: string | null, to: string | null): string {
  return from && to ? `${from} 至 ${to}` : '长期有效'
}

function contentTypeLabel(type: ContentRecord['type'] | ReferenceType): string {
  return ({ activity: '活动', news: '资讯', notice: '公告通知', 'traffic-control': '交通管制' } as const)[type]
}

function jumpTypeLabel(type: BannerRecord['jumpType']): string {
  return type === 'none' ? '无跳转' : contentTypeLabel(type)
}

function targetLabel(targetId: string | null, targetTitle?: string | null): string {
  if (!targetId) return '—'
  const reference = store.selectableReferences.find((item) => item.id === targetId)
  if (!reference) return targetTitle || '引用目标已失效'
  return reference.code.trim() ? `${reference.code} · ${reference.title}` : reference.title
}

function statusLabel(record: ContentRecord): string {
  return record.publishStatus === 'published' ? (record.enabled ? '启用' : '停用') : '—'
}

function activityStatusLabel(record: ContentRecord): string {
  const status = getActivityStatus(record, new Date(store.now))
  return ({ 'not-started': '未开始', ongoing: '进行中', ended: '已结束' } as const)[status]
}

function metrics(pv: number, uv: number): string {
  if (pv === 0 && uv === 0) return '—'
  return `${pv.toLocaleString('zh-CN')} / ${uv.toLocaleString('zh-CN')}`
}

function downloadFile(filename: string, content: Blob): void {
  const url = URL.createObjectURL(content)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

async function exportCurrent(): Promise<void> {
  if (!canExport.value) return
  const file = await store.exportContents()
  if (!file) return showStoreError('内容导出失败')
  downloadFile(file.filename, file.content)
  toast.success('内容 CSV 已导出。')
}

function confirmLeave(): boolean {
  return !sheetOpen.value || !sheetDirty.value || window.confirm('当前有未保存的内容管理信息，确定放弃吗？')
}

function handleBeforeUnload(event: BeforeUnloadEvent): void {
  if (!sheetOpen.value || !sheetDirty.value) return
  event.preventDefault()
  event.returnValue = ''
}

async function load(): Promise<void> {
  loadError.value = ''
  if (String(route.query.status ?? '') === 'draft') {
    activityQueryDraft.value.publishStatus = 'draft'
    newsQueryDraft.value.publishStatus = 'draft'
    Object.assign(store.activityQuery, activityQueryDraft.value)
    Object.assign(store.newsQuery, newsQueryDraft.value)
  }
  if (!await store.load(activeTab.value)) {
    loadError.value = store.error ?? '内容管理数据加载失败'
    showStoreError(loadError.value)
  }
  pageReady.value = true
}

watch(() => route.query.tab, (value) => {
  if (!validTabs.includes(String(value ?? '') as ContentManagementTab)) {
    void router.replace({ query: { ...route.query, tab: 'activity' } })
  }
}, { immediate: true })

watch(activeTab, async (tab, previous) => {
  if (!pageReady.value || tab === previous) return
  if (!await store.loadTab(tab)) showStoreError('当前页签加载失败')
})

watch(() => route.query.status, async (status) => {
  if (!pageReady.value || status !== 'draft') return
  activityQueryDraft.value.publishStatus = 'draft'
  newsQueryDraft.value.publishStatus = 'draft'
  Object.assign(store.activityQuery, activityQueryDraft.value)
  Object.assign(store.newsQuery, newsQueryDraft.value)
  if (!await store.loadTab(activeTab.value === 'news' ? 'news' : 'activity')) showStoreError('草稿数据加载失败')
})

onMounted(load)
useIntervalFn(store.refreshTemporalState, 60_000)
useEventListener(window, 'beforeunload', handleBeforeUnload)
onBeforeRouteLeave(() => confirmLeave())
</script>

<template>
  <section class="tech-grid min-h-[calc(100svh-4rem)] min-w-0 overflow-x-hidden p-4 lg:p-6" aria-labelledby="content-management-title">
    <div class="mx-auto flex w-full max-w-[1680px] flex-col gap-4">
      <header class="flex flex-col items-stretch gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div class="flex min-w-0 items-center gap-3">
          <span class="grid size-11 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
            <Newspaper class="size-5" aria-hidden="true" />
          </span>
          <div>
            <h1 id="content-management-title" class="text-2xl font-semibold tracking-tight">内容管理</h1>
            <p class="mt-1 text-sm text-muted-foreground">活动 / 资讯通知 / Banner / 高优提示</p>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <Button v-if="canOperate" size="lg" class="h-11 px-4" :disabled="activeTab === 'banner' && store.bannerTotal >= MAX_BANNERS || activeTab === 'hint' && store.priorityHintTotal >= MAX_PRIORITY_HINTS" @click="openCreate">
            <Plus aria-hidden="true" />
            {{ activeTab === 'activity' ? '新增活动' : activeTab === 'news' ? '新增内容' : activeTab === 'banner' ? '新增 Banner' : '新增高优提示' }}
          </Button>
          <Button v-if="canExport && (activeTab === 'activity' || activeTab === 'news')" variant="outline" size="lg" class="h-11" :disabled="store.isExporting" @click="exportCurrent">
            <LoaderCircle v-if="store.isExporting" class="animate-spin motion-reduce:animate-none" aria-hidden="true" />
            <Download v-else aria-hidden="true" />{{ store.isExporting ? '导出中' : '导出' }}
          </Button>
        </div>
      </header>

      <div class="flex flex-wrap gap-2" role="tablist" aria-label="内容管理分类">
        <Button
          v-for="tab in validTabs"
          :key="tab"
          type="button"
          size="lg"
          :variant="activeTab === tab ? 'default' : 'outline'"
          class="h-10 rounded-full px-5"
          role="tab"
          :aria-selected="activeTab === tab"
          @click="selectTab(tab)"
        >
          <CalendarClock v-if="tab === 'activity'" aria-hidden="true" />
          <Newspaper v-else-if="tab === 'news'" aria-hidden="true" />
          <ImageIcon v-else-if="tab === 'banner'" aria-hidden="true" />
          <BellRing v-else aria-hidden="true" />
          {{ tabLabels[tab] }}
        </Button>
      </div>

      <div v-if="activeTab === 'banner' || activeTab === 'hint'" class="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/6 px-4 py-3 text-sm">
        <Megaphone class="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <p class="text-muted-foreground">
          <template v-if="activeTab === 'banner'">按优先级升序展示，上限 {{ MAX_BANNERS }} 张</template>
          <template v-else>按优先级升序取前 2 条展示；最多 {{ MAX_PRIORITY_HINTS }} 条</template>
        </p>
      </div>

      <QueryPanel :loading="store.isLoading" @query="applyQuery" @reset="resetQuery">
        <template v-if="activeTab === 'activity'">
          <div class="space-y-2"><Label for="activity-publish-status">发布状态</Label><Select v-model="activityQueryDraft.publishStatus"><SelectTrigger id="activity-publish-status" class="h-11 w-full bg-background"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部状态</SelectItem><SelectItem value="draft">草稿</SelectItem><SelectItem value="published">已发布</SelectItem></SelectContent></Select></div>
          <div class="space-y-2"><Label for="activity-status">活动状态</Label><Select v-model="activityQueryDraft.activityStatus"><SelectTrigger id="activity-status" class="h-11 w-full bg-background"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部状态</SelectItem><SelectItem value="not-started">未开始</SelectItem><SelectItem value="ongoing">进行中</SelectItem><SelectItem value="ended">已结束</SelectItem></SelectContent></Select></div>
          <div class="space-y-2"><Label for="activity-pinned">置顶状态</Label><Select v-model="activityQueryDraft.pinned"><SelectTrigger id="activity-pinned" class="h-11 w-full bg-background"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部</SelectItem><SelectItem value="pinned">仅置顶</SelectItem><SelectItem value="not-pinned">非置顶</SelectItem></SelectContent></Select></div>
          <div class="space-y-2"><Label for="activity-enabled">启用状态</Label><Select v-model="activityQueryDraft.enabled"><SelectTrigger id="activity-enabled" class="h-11 w-full bg-background"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部状态</SelectItem><SelectItem value="enabled">启用</SelectItem><SelectItem value="disabled">停用</SelectItem></SelectContent></Select></div>
          <div class="space-y-2"><Label for="activity-title-query">标题</Label><Input id="activity-title-query" v-model="activityQueryDraft.title" class="h-11" placeholder="输入标题关键字" @keydown.enter.prevent="applyQuery" /></div>
        </template>
        <template v-else-if="activeTab === 'news'">
          <div class="space-y-2"><Label for="news-type">内容类型</Label><Select v-model="newsQueryDraft.type"><SelectTrigger id="news-type" class="h-11 w-full bg-background"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部类型</SelectItem><SelectItem value="news">资讯</SelectItem><SelectItem value="notice">公告通知</SelectItem></SelectContent></Select></div>
          <div class="space-y-2"><Label for="news-publish-status">发布状态</Label><Select v-model="newsQueryDraft.publishStatus"><SelectTrigger id="news-publish-status" class="h-11 w-full bg-background"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部状态</SelectItem><SelectItem value="draft">草稿</SelectItem><SelectItem value="published">已发布</SelectItem></SelectContent></Select></div>
          <div class="space-y-2"><Label for="news-pinned">置顶状态</Label><Select v-model="newsQueryDraft.pinned"><SelectTrigger id="news-pinned" class="h-11 w-full bg-background"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部</SelectItem><SelectItem value="pinned">仅置顶</SelectItem><SelectItem value="not-pinned">非置顶</SelectItem></SelectContent></Select></div>
          <div class="space-y-2"><Label for="news-enabled">启用状态</Label><Select v-model="newsQueryDraft.enabled"><SelectTrigger id="news-enabled" class="h-11 w-full bg-background"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部状态</SelectItem><SelectItem value="enabled">启用</SelectItem><SelectItem value="disabled">停用</SelectItem></SelectContent></Select></div>
          <div class="space-y-2"><Label for="news-title-query">标题</Label><Input id="news-title-query" v-model="newsQueryDraft.title" class="h-11" placeholder="输入标题关键字" @keydown.enter.prevent="applyQuery" /></div>
        </template>
        <template v-else-if="activeTab === 'banner'">
          <div class="space-y-2"><Label for="banner-jump-type">跳转类型</Label><Select v-model="bannerQueryDraft.jumpType"><SelectTrigger id="banner-jump-type" class="h-11 w-full bg-background"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部类型</SelectItem><SelectItem value="activity">活动</SelectItem><SelectItem value="news">资讯</SelectItem><SelectItem value="notice">公告通知</SelectItem><SelectItem value="traffic-control">交通管制</SelectItem><SelectItem value="none">无跳转</SelectItem></SelectContent></Select></div>
          <div class="space-y-2"><Label for="banner-enabled">展示状态</Label><Select v-model="bannerQueryDraft.enabled"><SelectTrigger id="banner-enabled" class="h-11 w-full bg-background"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部状态</SelectItem><SelectItem value="enabled">启用</SelectItem><SelectItem value="disabled">停用</SelectItem></SelectContent></Select></div>
          <div class="space-y-2"><Label for="banner-title-query">标题</Label><Input id="banner-title-query" v-model="bannerQueryDraft.title" class="h-11" placeholder="输入标题关键字" @keydown.enter.prevent="applyQuery" /></div>
        </template>
        <template v-else>
          <div class="space-y-2"><Label for="hint-reference-type">引用类型</Label><Select v-model="hintQueryDraft.referenceType"><SelectTrigger id="hint-reference-type" class="h-11 w-full bg-background"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部类型</SelectItem><SelectItem value="activity">活动</SelectItem><SelectItem value="news">资讯</SelectItem><SelectItem value="notice">公告通知</SelectItem><SelectItem value="traffic-control">交通管制</SelectItem></SelectContent></Select></div>
          <div class="space-y-2"><Label for="hint-enabled">展示状态</Label><Select v-model="hintQueryDraft.enabled"><SelectTrigger id="hint-enabled" class="h-11 w-full bg-background"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部状态</SelectItem><SelectItem value="enabled">启用</SelectItem><SelectItem value="disabled">停用</SelectItem></SelectContent></Select></div>
          <div class="space-y-2"><Label for="hint-title-query">标题</Label><Input id="hint-title-query" v-model="hintQueryDraft.title" class="h-11" placeholder="输入标题关键字" @keydown.enter.prevent="applyQuery" /></div>
        </template>
      </QueryPanel>

      <div v-if="loadError && !store.isLoading" class="flex items-center gap-3 rounded-xl border border-destructive/35 bg-destructive/8 p-4" role="alert">
        <AlertTriangle class="size-5 shrink-0 text-destructive" aria-hidden="true" /><p class="flex-1 text-sm text-destructive">{{ loadError }}</p><Button variant="outline" size="lg" class="h-11" @click="load"><RefreshCw aria-hidden="true" />重新加载</Button>
      </div>

      <template v-if="activeTab === 'activity' || activeTab === 'news'">
        <DataTable :columns="permittedColumns(activeTab === 'activity' ? activityColumns : newsColumns)" :rows="activeTab === 'activity' ? store.paginatedActivities : store.paginatedNews" row-key="id" :loading="store.isLoading" :empty-text="activeTab === 'activity' ? '暂无活动内容' : '暂无资讯通知'" :caption="`${tabLabels[activeTab]}列表`">
          <template #cell-code="{ row }"><span class="rounded-md border bg-muted/35 px-2 py-1 font-mono text-xs">{{ row.code }}</span></template>
          <template #cell-title="{ row }"><p class="max-w-72 truncate font-medium" :title="row.title">{{ row.title }}</p></template>
          <template #cell-publishStatus="{ row }"><Badge :variant="row.publishStatus === 'published' ? 'outline' : 'secondary'" :class="row.publishStatus === 'published' ? 'border-success/30 bg-success/10 text-success' : 'border-warning/30 bg-warning/10 text-warning'">{{ row.publishStatus === 'published' ? '已发布' : '草稿' }}</Badge></template>
          <template #cell-type="{ row }"><Badge variant="outline">{{ contentTypeLabel(row.type) }}</Badge></template>
          <template #cell-activityStatus="{ row }"><span v-if="row.publishStatus === 'draft'" class="text-muted-foreground">—</span><Badge v-else variant="outline">{{ activityStatusLabel(row) }}</Badge></template>
          <template #cell-enabled="{ row }"><span v-if="row.publishStatus === 'draft'" class="text-muted-foreground">—</span><Badge v-else :variant="row.enabled ? 'outline' : 'secondary'" :class="row.enabled ? 'border-success/30 bg-success/10 text-success' : 'text-muted-foreground'">{{ statusLabel(row) }}</Badge></template>
          <template #cell-pinned="{ row }"><Badge v-if="row.pinned" variant="outline" class="border-warning/30 bg-warning/10 text-warning"><Pin aria-hidden="true" />置顶</Badge><span v-else class="text-muted-foreground">—</span></template>
          <template #cell-priority="{ row }"><span class="font-semibold tabular-nums">{{ row.priority }}</span></template>
          <template #cell-publishAt="{ row }"><time class="whitespace-nowrap text-xs tabular-nums text-muted-foreground" :datetime="row.publishAt ?? undefined">{{ formatDateTime(row.publishAt) }}</time></template>
          <template #cell-clickMetrics="{ row }"><span class="whitespace-nowrap tabular-nums">{{ metrics(row.metrics.clickPv, row.metrics.clickUv) }}</span></template>
          <template #cell-viewMetrics="{ row }"><span class="whitespace-nowrap tabular-nums">{{ metrics(row.metrics.viewPv, row.metrics.viewUv) }}</span></template>
          <template #cell-actions="{ row }">
            <div class="flex justify-end gap-1">
              <Button variant="ghost" size="lg" class="h-10 px-3" @click="openContentEdit(row)"><PencilLine aria-hidden="true" />编辑</Button>
              <DropdownMenu><DropdownMenuTrigger as-child><Button variant="ghost" size="icon-lg" class="h-10 w-10" :aria-label="`${row.title}更多操作`"><CircleEllipsis aria-hidden="true" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" class="w-44"><DropdownMenuLabel>{{ row.code }}</DropdownMenuLabel><DropdownMenuSeparator />
                <DropdownMenuItem v-if="row.publishStatus === 'draft'" @select="runAction(() => store.publishContent(row.id, row.type), '内容已发布。', true)">发布</DropdownMenuItem>
                <DropdownMenuItem v-else @select="runAction(() => store.unpublishContent(row.id, row.type), '内容已撤回为草稿。', true)">撤回为草稿</DropdownMenuItem>
                <DropdownMenuItem @select="runAction(() => store.setContentPinned(row.id, !row.pinned, row.type), row.pinned ? '已取消置顶。' : '内容已置顶。', true)">{{ row.pinned ? '取消置顶' : '置顶' }}</DropdownMenuItem>
                <DropdownMenuItem v-if="row.publishStatus === 'published'" @select="runAction(() => store.setContentEnabled(row.id, !row.enabled, row.type), row.enabled ? '内容已停用。' : '内容已启用。', true)">{{ row.enabled ? '停用' : '启用' }}</DropdownMenuItem>
                <DropdownMenuSeparator /><DropdownMenuItem variant="destructive" @select="requestContentDelete(row)"><Trash2 aria-hidden="true" />删除</DropdownMenuItem>
              </DropdownMenuContent></DropdownMenu>
            </div>
          </template>
        </DataTable>
        <PaginationBar :page="store.pages[activeTab]" :page-size="store.pageSize" :page-sizes="[20, 50, 100]" :total="activeTab === 'activity' ? store.activityRecords.length : store.newsRecords.length" :disabled="store.isLoading" @update:page="store.setPage(activeTab, $event)" @update:page-size="store.setPageSize" />
      </template>

      <template v-else-if="activeTab === 'banner'">
        <DataTable :columns="permittedColumns(bannerColumns)" :rows="store.paginatedBanners" row-key="id" :loading="store.isLoading" empty-text="暂无 Banner" caption="Banner 图窗列表">
          <template #cell-code="{ row }"><span class="rounded-md border bg-muted/35 px-2 py-1 font-mono text-xs">{{ row.code }}</span></template>
          <template #cell-title="{ row }"><p class="max-w-64 truncate font-medium" :title="row.title">{{ row.title }}</p></template>
          <template #cell-image="{ row }"><img v-if="row.image.url" :src="row.image.url" :alt="`${row.title}图片`" class="h-10 w-20 rounded-lg border object-cover"><span v-else class="inline-flex h-10 w-20 items-center justify-center rounded-lg border bg-muted/45 text-xs text-muted-foreground" :title="row.image.name"><ImageIcon class="mr-1 size-4" aria-hidden="true" />图片</span></template>
          <template #cell-jumpType="{ row }"><Badge variant="outline">{{ jumpTypeLabel(row.jumpType) }}</Badge></template>
          <template #cell-targetId="{ row }"><div class="max-w-72"><span class="block truncate text-xs text-muted-foreground" :title="targetLabel(row.targetId, row.targetTitle)">{{ targetLabel(row.targetId, row.targetTitle) }}</span><span v-if="row.targetId && !store.targetIsValid(row.targetId)" class="mt-1 block text-[10px] text-destructive">引用目标已失效</span></div></template>
          <template #cell-priority="{ row }"><span class="font-semibold tabular-nums">{{ row.priority }}</span></template>
          <template #cell-displayEnabled="{ row }"><div class="flex flex-col items-center gap-1"><Badge :variant="row.displayEnabled ? 'outline' : 'secondary'" :class="row.displayEnabled ? 'border-success/30 bg-success/10 text-success' : 'text-muted-foreground'">{{ row.displayEnabled ? '启用' : '停用' }}</Badge><span v-if="row.displayEnabled && !store.isBannerEffective(row)" class="text-[10px] text-warning">当前不可展示</span></div></template>
          <template #cell-validity="{ row }"><span class="whitespace-nowrap text-xs text-muted-foreground">{{ formatValidity(row.validFrom, row.validTo) }}</span></template>
          <template #cell-clickMetrics="{ row }"><span class="whitespace-nowrap tabular-nums">{{ metrics(row.metrics.clickPv, row.metrics.clickUv) }}</span></template>
          <template #cell-actions="{ row }"><div class="flex justify-end gap-1"><Button variant="ghost" size="sm" class="h-9 px-2" @click="openBannerEdit(row)">编辑</Button><Button variant="ghost" size="sm" class="h-9 px-2" @click="runAction(() => store.setBannerEnabled(row.id, !row.displayEnabled), row.displayEnabled ? 'Banner 已停用。' : 'Banner 已启用。')">{{ row.displayEnabled ? '停用' : '启用' }}</Button><Button variant="ghost" size="sm" class="h-9 px-2 text-destructive hover:text-destructive" @click="deleteTarget = { kind: 'banner', record: row }">删除</Button></div></template>
        </DataTable>
        <PaginationBar :page="store.pages.banner" :page-size="store.pageSize" :page-sizes="[20, 50, 100]" :total="store.bannerRecords.length" :disabled="store.isLoading" @update:page="store.setPage('banner', $event)" @update:page-size="store.setPageSize" />
      </template>

      <template v-else>
        <DataTable :columns="permittedColumns(hintColumns)" :rows="store.paginatedPriorityHints" row-key="id" :loading="store.isLoading" empty-text="暂无高优提示" caption="高优提示列表">
          <template #cell-code="{ row }"><span class="rounded-md border bg-muted/35 px-2 py-1 font-mono text-xs">{{ row.code }}</span></template>
          <template #cell-title="{ row }"><div class="max-w-64"><p class="truncate font-medium" :title="row.title">{{ row.title }}</p><p v-if="store.activePriorityHintIds.includes(row.id)" class="mt-1 text-[11px] font-medium text-primary">当前展示位</p></div></template>
          <template #cell-referenceType="{ row }"><Badge variant="outline">{{ contentTypeLabel(row.referenceType) }}</Badge></template>
          <template #cell-targetId="{ row }"><div class="max-w-72"><span class="block truncate text-xs text-muted-foreground" :title="targetLabel(row.targetId, row.targetTitle)">{{ targetLabel(row.targetId, row.targetTitle) }}</span><span v-if="!store.targetIsValid(row.targetId)" class="mt-1 block text-[10px] text-destructive">引用目标已失效</span></div></template>
          <template #cell-priority="{ row }"><span class="font-semibold tabular-nums">{{ row.priority }}</span></template>
          <template #cell-displayEnabled="{ row }"><div class="flex flex-col items-center gap-1"><Badge :variant="row.displayEnabled ? 'outline' : 'secondary'" :class="row.displayEnabled ? 'border-success/30 bg-success/10 text-success' : 'text-muted-foreground'">{{ row.displayEnabled ? '启用' : '停用' }}</Badge><span v-if="row.displayEnabled && !store.isPriorityHintEffective(row)" class="text-[10px] text-warning">当前不可展示</span></div></template>
          <template #cell-validity="{ row }"><span class="whitespace-nowrap text-xs text-muted-foreground">{{ formatValidity(row.validFrom, row.validTo) }}</span></template>
          <template #cell-clickMetrics="{ row }"><span class="whitespace-nowrap tabular-nums">{{ metrics(row.metrics.clickPv, row.metrics.clickUv) }}</span></template>
          <template #cell-actions="{ row }"><div class="flex justify-end gap-1"><Button variant="ghost" size="sm" class="h-9 px-2" @click="openHintEdit(row)">编辑</Button><Button variant="ghost" size="sm" class="h-9 px-2" @click="runAction(() => store.setPriorityHintEnabled(row.id, !row.displayEnabled), row.displayEnabled ? '高优提示已停用。' : '高优提示已启用。')">{{ row.displayEnabled ? '停用' : '启用' }}</Button><Button variant="ghost" size="sm" class="h-9 px-2 text-destructive hover:text-destructive" @click="deleteTarget = { kind: 'hint', record: row }">删除</Button></div></template>
        </DataTable>
        <PaginationBar :page="store.pages.hint" :page-size="store.pageSize" :page-sizes="[20, 50, 100]" :total="store.priorityHintRecords.length" :disabled="store.isLoading" @update:page="store.setPage('hint', $event)" @update:page-size="store.setPageSize" />
      </template>
    </div>

    <CrudSheet :open="sheetOpen" :mode="sheetMode" :title="sheetKind === 'content' ? `${sheetMode === 'create' ? '新增' : '编辑'}${contentForm.type === 'activity' ? '活动' : '内容'}` : sheetKind === 'banner' ? `${sheetMode === 'create' ? '新增' : '编辑'} Banner` : `${sheetMode === 'create' ? '新增' : '编辑'}高优提示`" :description="sheetKind === 'content' ? '维护内容信息；发布时间由保存后的发布接口处理。' : sheetKind === 'banner' ? '配置首页轮播图及其跳转目标。' : '配置首页高优提示及引用目标。'" :saving="sheetSaving" :dirty="sheetDirty" size="wide" @submit="saveSheet" @request-close="requestSheetClose">
      <ContentForm v-if="sheetKind === 'content'" ref="contentFormRef" :value="contentForm" :issues="contentIssues" :saving="sheetSaving" @update:value="contentForm = $event" @update:uploading="formUploading = $event" />
      <BannerForm v-else-if="sheetKind === 'banner'" ref="bannerFormRef" :value="bannerForm" :references="store.selectableReferences" :issues="bannerIssues" :saving="sheetSaving" @update:value="bannerForm = $event" @update:uploading="formUploading = $event" />
      <PriorityHintForm v-else ref="hintFormRef" :value="hintForm" :references="store.selectableReferences" :issues="hintIssues" :saving="store.isSaving" @update:value="hintForm = $event" />
    </CrudSheet>

    <AlertDialog :open="discardConfirmOpen" @update:open="discardConfirmOpen = $event">
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>放弃未保存的修改？</AlertDialogTitle><AlertDialogDescription>当前抽屉中的修改尚未保存，关闭后无法恢复。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>继续编辑</AlertDialogCancel><Button variant="destructive" @click="closeSheet">放弃修改</Button></AlertDialogFooter></AlertDialogContent>
    </AlertDialog>

    <AlertDialog :open="Boolean(deleteTarget)" @update:open="!$event && (deleteTarget = null)">
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>确认删除{{ deleteTarget?.record.code }}？</AlertDialogTitle><AlertDialogDescription>删除后不可恢复，历史操作日志保留。若记录仍被引用，将直接展示后端返回的失败原因。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><Button variant="destructive" :disabled="store.isSaving" @click="confirmDelete"><LoaderCircle v-if="store.isSaving" class="animate-spin motion-reduce:animate-none" aria-hidden="true" /><Trash2 v-else aria-hidden="true" />{{ store.isSaving ? '删除中' : '确认删除' }}</Button></AlertDialogFooter></AlertDialogContent>
    </AlertDialog>

  </section>
</template>
