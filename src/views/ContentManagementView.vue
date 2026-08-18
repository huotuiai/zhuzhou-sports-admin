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
  DeleteReferenceBlock,
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
  CONTENT_MANAGEMENT_PAGE_SIZE,
  DEFAULT_ACTIVITY_QUERY,
  DEFAULT_BANNER_QUERY,
  DEFAULT_HINT_QUERY,
  DEFAULT_NEWS_QUERY,
  useContentManagementStore,
} from '@/modules/content-management/stores/content-management-store'
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

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
  { key: 'source', label: '来源', minWidth: '110px', align: 'center' },
  { key: 'syncStatus', label: '同步状态', minWidth: '96px', align: 'center' },
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
  { key: 'source', label: '来源', minWidth: '110px', align: 'center' },
  { key: 'syncStatus', label: '同步状态', minWidth: '96px', align: 'center' },
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
const deleteReferenceBlock = ref<DeleteReferenceBlock | null>(null)
const syncDialogOpen = ref(false)
const syncRecord = ref<ContentRecord | null>(null)
const loadError = ref('')

const sheetOpen = computed(() => sheetKind.value !== null)
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

function nowLocalDateTime(): string {
  return localDateTime(new Date().toISOString()) ?? ''
}

function emptyContentForm(type: ContentWriteInput['type']): ContentWriteInput {
  return {
    type,
    title: '',
    bodyHtml: '<p></p>',
    cover: null,
    attachments: [],
    publishAt: nowLocalDateTime(),
    pinned: false,
    priority: DEFAULT_PRIORITY,
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
    activityStartAt: localDateTime(record.activityStartAt),
    activityEndAt: localDateTime(record.activityEndAt),
    activityLocation: record.activityLocation,
    navigationLocation: record.navigationLocation,
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

function openContentEdit(record: ContentRecord): void {
  if (record.source === 'organizer') return
  openSheet('content', 'edit', record.id, contentToForm(record))
}

function openBannerEdit(record: BannerRecord): void {
  openSheet('banner', 'edit', record.id, bannerToForm(record))
}

function openHintEdit(record: PriorityHintRecord): void {
  openSheet('hint', 'edit', record.id, hintToForm(record))
}

function closeSheet(): void {
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
  if (sheetKind.value === 'content') {
    contentIssues.value = validateContentInput(contentForm.value)
    await nextTick()
    if (!contentFormRef.value?.validateAndFocus() || contentIssues.value.length) return
    const success = sheetMode.value === 'create'
      ? await store.createContent(contentForm.value)
      : editingId.value ? await store.updateContent(editingId.value, contentForm.value) : false
    if (!success) return showStoreError('内容保存失败')
    closeSheet()
    toast.success(sheetMode.value === 'create' ? '内容已新增。' : '内容已更新。')
    return
  }
  if (sheetKind.value === 'banner') {
    bannerIssues.value = validateBannerInput(bannerForm.value, store.snapshot)
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
    hintIssues.value = validatePriorityHintInput(hintForm.value, store.snapshot)
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

async function runAction(operation: Promise<boolean>, successMessage: string): Promise<void> {
  if (await operation) toast.success(successMessage)
  else showStoreError('操作失败')
}

async function requestContentDelete(record: ContentRecord): Promise<void> {
  const block = await store.getDeleteReferenceBlock(record.id)
  if (block.bannerCodes.length || block.priorityHintCodes.length) {
    deleteReferenceBlock.value = block
    return
  }
  deleteTarget.value = { kind: 'content', record }
}

async function confirmDelete(): Promise<void> {
  const target = deleteTarget.value
  if (!target) return
  const success = target.kind === 'content'
    ? await store.removeContent(target.record.id)
    : target.kind === 'banner'
      ? await store.removeBanner(target.record.id)
      : await store.removePriorityHint(target.record.id)
  if (!success) return showStoreError('删除失败')
  deleteTarget.value = null
  toast.success('记录已删除。')
}

function openSync(record: ContentRecord | null = null): void {
  syncRecord.value = record
  syncDialogOpen.value = true
}

async function triggerSync(): Promise<void> {
  if (await store.triggerOrganizerSync()) {
    toast.success('主办方同步已完成。')
    syncDialogOpen.value = false
  } else showStoreError('同步失败')
}

function selectTab(tab: ContentManagementTab): void {
  void router.replace({ query: { ...route.query, tab } })
}

function applyQuery(): void {
  if (activeTab.value === 'activity') store.setActivityQuery({ ...activityQueryDraft.value })
  if (activeTab.value === 'news') store.setNewsQuery({ ...newsQueryDraft.value })
  if (activeTab.value === 'banner') store.setBannerQuery({ ...bannerQueryDraft.value })
  if (activeTab.value === 'hint') store.setHintQuery({ ...hintQueryDraft.value })
}

function resetQuery(): void {
  store.resetQuery(activeTab.value)
  if (activeTab.value === 'activity') activityQueryDraft.value = { ...DEFAULT_ACTIVITY_QUERY }
  if (activeTab.value === 'news') newsQueryDraft.value = { ...DEFAULT_NEWS_QUERY }
  if (activeTab.value === 'banner') bannerQueryDraft.value = { ...DEFAULT_BANNER_QUERY }
  if (activeTab.value === 'hint') hintQueryDraft.value = { ...DEFAULT_HINT_QUERY }
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

function targetLabel(targetId: string | null): string {
  if (!targetId) return '—'
  const reference = store.selectableReferences.find((item) => item.id === targetId)
  return reference ? `${reference.code} · ${reference.title}` : '引用目标已失效'
}

function statusLabel(record: ContentRecord): string {
  return record.publishStatus === 'published' ? (record.enabled ? '启用' : '停用') : '—'
}

function activityStatusLabel(record: ContentRecord): string {
  const status = getActivityStatus(record, new Date(store.now))
  return ({ 'not-started': '未开始', ongoing: '进行中', ended: '已结束' } as const)[status]
}

function metrics(pv: number, uv: number): string {
  return `${pv.toLocaleString('zh-CN')} / ${uv.toLocaleString('zh-CN')}`
}

function syncStatusLabel(status: typeof store.snapshot.organizerSync.status): string {
  return ({ idle: '未同步', syncing: '同步中', success: '成功', failed: '失败' } as const)[status]
}

function syncStatusBadgeClass(status: typeof store.snapshot.organizerSync.status): string {
  if (status === 'success') return 'border-success/30 bg-success/10 text-success'
  if (status === 'failed') return 'border-destructive/30 bg-destructive/10 text-destructive'
  if (status === 'syncing') return 'border-primary/30 bg-primary/10 text-primary'
  return 'border-border bg-muted/50 text-muted-foreground'
}

function csvCell(value: unknown): string {
  return `"${String(value ?? '').replaceAll('"', '""')}"`
}

function downloadCsv(filename: string, headers: readonly string[], rows: readonly (readonly unknown[])[]): void {
  const csv = `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}`
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function exportCurrent(): void {
  const date = new Date().toISOString().slice(0, 10)
  if (activeTab.value === 'activity' || activeTab.value === 'news') {
    const records = activeTab.value === 'activity' ? store.activityRecords : store.newsRecords
    downloadCsv(`内容管理-${tabLabels[activeTab.value]}-${date}.csv`,
      ['内容编号', '标题', '类型', '发布状态', '来源', '同步状态', '状态', '置顶', '优先级', '发布时间', '点击PV', '点击UV', '浏览PV', '浏览UV'],
      records.map((record) => [record.code, record.title, contentTypeLabel(record.type), record.publishStatus === 'published' ? '已发布' : '草稿', record.source === 'manual' ? '手动' : '主办方对接', record.syncStatus, statusLabel(record), record.pinned ? '是' : '否', record.priority, formatDateTime(record.publishAt), record.metrics.clickPv, record.metrics.clickUv, record.metrics.viewPv, record.metrics.viewUv]))
  }
  if (activeTab.value === 'banner') {
    downloadCsv(`内容管理-Banner-${date}.csv`, ['图窗编号', '标题', '跳转类型', '跳转目标', '优先级', '展示状态', '有效期', '点击PV', '点击UV'],
      store.bannerRecords.map((record) => [record.code, record.title, jumpTypeLabel(record.jumpType), targetLabel(record.targetId), record.priority, record.displayEnabled ? '启用' : '停用', formatValidity(record.validFrom, record.validTo), record.metrics.clickPv, record.metrics.clickUv]))
  }
  if (activeTab.value === 'hint') {
    downloadCsv(`内容管理-高优提示-${date}.csv`, ['提示编号', '提示标题', '引用类型', '引用目标', '优先级', '展示状态', '有效期', '点击PV', '点击UV'],
      store.priorityHintRecords.map((record) => [record.code, record.title, contentTypeLabel(record.referenceType), targetLabel(record.targetId), record.priority, record.displayEnabled ? '启用' : '停用', formatValidity(record.validFrom, record.validTo), record.metrics.clickPv, record.metrics.clickUv]))
  }
  toast.success('已导出当前筛选结果。')
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
  if (!await store.load()) {
    loadError.value = store.error ?? '内容管理数据加载失败'
    showStoreError(loadError.value)
  }
}

watch(() => route.query.tab, (value) => {
  if (!validTabs.includes(String(value ?? '') as ContentManagementTab)) {
    void router.replace({ query: { ...route.query, tab: 'activity' } })
  }
}, { immediate: true })

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
            <p class="mt-1 text-sm text-muted-foreground">统一维护活动、资讯通知、Banner 图窗与首页高优提示</p>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <Button v-if="activeTab === 'activity' || activeTab === 'news'" variant="outline" size="lg" class="h-11" :disabled="store.isSyncing" @click="openSync()">
            <LoaderCircle v-if="store.isSyncing" class="animate-spin motion-reduce:animate-none" aria-hidden="true" />
            <RefreshCw v-else aria-hidden="true" />
            同步主办方
          </Button>
          <Button variant="outline" size="lg" class="h-11" @click="exportCurrent">
            <Download aria-hidden="true" />导出
          </Button>
          <Button size="lg" class="h-11 px-4" :disabled="activeTab === 'banner' && store.snapshot.banners.length >= MAX_BANNERS || activeTab === 'hint' && store.snapshot.priorityHints.length >= MAX_PRIORITY_HINTS" @click="openCreate">
            <Plus aria-hidden="true" />
            {{ activeTab === 'activity' ? '新增活动' : activeTab === 'news' ? '新增内容' : activeTab === 'banner' ? '新增 Banner' : '新增高优提示' }}
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
          <template v-if="activeTab === 'banner'">按优先级升序展示，最多配置 {{ MAX_BANNERS }} 条；当前共 {{ store.snapshot.banners.length }} 条。</template>
          <template v-else>最多配置 {{ MAX_PRIORITY_HINTS }} 条，按优先级升序取当前有效的前 2 条展示；当前共 {{ store.snapshot.priorityHints.length }} 条。</template>
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
        <DataTable :columns="activeTab === 'activity' ? activityColumns : newsColumns" :rows="activeTab === 'activity' ? store.paginatedActivities : store.paginatedNews" row-key="id" :loading="store.isLoading" :empty-text="activeTab === 'activity' ? '暂无活动内容' : '暂无资讯通知'" :caption="`${tabLabels[activeTab]}列表`">
          <template #cell-code="{ row }"><span class="rounded-md border bg-muted/35 px-2 py-1 font-mono text-xs">{{ row.code }}</span></template>
          <template #cell-title="{ row }"><div class="max-w-72"><p class="truncate font-medium" :title="row.title">{{ row.title }}</p><p v-if="row.sourceSystemId" class="mt-1 truncate font-mono text-[11px] text-muted-foreground">{{ row.sourceSystemId }}</p></div></template>
          <template #cell-publishStatus="{ row }"><Badge :variant="row.publishStatus === 'published' ? 'outline' : 'secondary'" :class="row.publishStatus === 'published' ? 'border-success/30 bg-success/10 text-success' : 'border-warning/30 bg-warning/10 text-warning'">{{ row.publishStatus === 'published' ? '已发布' : '草稿' }}</Badge></template>
          <template #cell-type="{ row }"><Badge variant="outline">{{ contentTypeLabel(row.type) }}</Badge></template>
          <template #cell-source="{ row }"><Badge :variant="row.source === 'manual' ? 'secondary' : 'outline'" :class="row.source === 'organizer' ? 'border-primary/30 bg-primary/8 text-primary' : ''">{{ row.source === 'manual' ? '手动' : '主办方对接' }}</Badge></template>
          <template #cell-syncStatus="{ row }"><span v-if="row.syncStatus === 'not-applicable'" class="text-muted-foreground">—</span><Badge v-else variant="outline" class="border-success/30 bg-success/10 text-success">{{ row.syncStatus === 'success' ? '成功' : row.syncStatus }}</Badge></template>
          <template #cell-activityStatus="{ row }"><Badge variant="outline">{{ activityStatusLabel(row) }}</Badge></template>
          <template #cell-enabled="{ row }"><span v-if="row.publishStatus === 'draft'" class="text-muted-foreground">—</span><Badge v-else :variant="row.enabled ? 'outline' : 'secondary'" :class="row.enabled ? 'border-success/30 bg-success/10 text-success' : 'text-muted-foreground'">{{ statusLabel(row) }}</Badge></template>
          <template #cell-pinned="{ row }"><Badge v-if="row.pinned" variant="outline" class="border-warning/30 bg-warning/10 text-warning"><Pin aria-hidden="true" />置顶</Badge><span v-else class="text-muted-foreground">—</span></template>
          <template #cell-priority="{ row }"><span class="font-semibold tabular-nums">{{ row.priority }}</span></template>
          <template #cell-publishAt="{ row }"><time class="whitespace-nowrap text-xs tabular-nums text-muted-foreground" :datetime="row.publishAt ?? undefined">{{ formatDateTime(row.publishAt) }}</time></template>
          <template #cell-clickMetrics="{ row }"><span class="whitespace-nowrap tabular-nums">{{ metrics(row.metrics.clickPv, row.metrics.clickUv) }}</span></template>
          <template #cell-viewMetrics="{ row }"><span class="whitespace-nowrap tabular-nums">{{ metrics(row.metrics.viewPv, row.metrics.viewUv) }}</span></template>
          <template #cell-actions="{ row }">
            <div class="flex justify-end gap-1">
              <Button variant="ghost" size="lg" class="h-10 px-3" :disabled="row.source === 'organizer'" :title="row.source === 'organizer' ? '主办方对接来源只读' : undefined" @click="openContentEdit(row)"><PencilLine aria-hidden="true" />编辑</Button>
              <DropdownMenu><DropdownMenuTrigger as-child><Button variant="ghost" size="icon-lg" class="h-10 w-10" :aria-label="`${row.title}更多操作`"><CircleEllipsis aria-hidden="true" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" class="w-44"><DropdownMenuLabel>{{ row.code }}</DropdownMenuLabel><DropdownMenuSeparator />
                <DropdownMenuItem v-if="row.publishStatus === 'draft' && row.source === 'manual'" @select="runAction(store.publishContent(row.id), '内容已发布。')">发布</DropdownMenuItem>
                <DropdownMenuItem v-if="row.source === 'manual'" @select="runAction(store.setContentPinned(row.id, !row.pinned), row.pinned ? '已取消置顶。' : '内容已置顶。')">{{ row.pinned ? '取消置顶' : '置顶' }}</DropdownMenuItem>
                <DropdownMenuItem v-if="row.source === 'organizer'" @select="openSync(row)">查看并同步</DropdownMenuItem>
                <DropdownMenuItem v-if="row.publishStatus === 'published' && row.source === 'manual'" @select="runAction(store.setContentEnabled(row.id, !row.enabled), row.enabled ? '内容已停用。' : '内容已启用。')">{{ row.enabled ? '停用' : '启用' }}</DropdownMenuItem>
                <DropdownMenuSeparator v-if="row.source === 'manual'" /><DropdownMenuItem v-if="row.source === 'manual'" variant="destructive" @select="requestContentDelete(row)"><Trash2 aria-hidden="true" />删除</DropdownMenuItem>
              </DropdownMenuContent></DropdownMenu>
            </div>
          </template>
        </DataTable>
        <PaginationBar :page="store.pages[activeTab]" :page-size="CONTENT_MANAGEMENT_PAGE_SIZE" :page-sizes="[20]" :total="activeTab === 'activity' ? store.activityRecords.length : store.newsRecords.length" :disabled="store.isLoading" @update:page="store.setPage(activeTab, $event)" />
      </template>

      <template v-else-if="activeTab === 'banner'">
        <DataTable :columns="bannerColumns" :rows="store.paginatedBanners" row-key="id" :loading="store.isLoading" empty-text="暂无 Banner" caption="Banner 图窗列表">
          <template #cell-code="{ row }"><span class="rounded-md border bg-muted/35 px-2 py-1 font-mono text-xs">{{ row.code }}</span></template>
          <template #cell-title="{ row }"><p class="max-w-64 truncate font-medium" :title="row.title">{{ row.title }}</p></template>
          <template #cell-image="{ row }"><img v-if="row.image.previewUrl" :src="row.image.previewUrl" :alt="`${row.title}图片`" class="h-10 w-20 rounded-lg border object-cover"><span v-else class="inline-flex h-10 w-20 items-center justify-center rounded-lg border bg-muted/45 text-xs text-muted-foreground" :title="row.image.name"><ImageIcon class="mr-1 size-4" aria-hidden="true" />图片</span></template>
          <template #cell-jumpType="{ row }"><Badge variant="outline">{{ jumpTypeLabel(row.jumpType) }}</Badge></template>
          <template #cell-targetId="{ row }"><div class="max-w-72"><span class="block truncate text-xs text-muted-foreground" :title="targetLabel(row.targetId)">{{ targetLabel(row.targetId) }}</span><span v-if="row.targetId && !store.targetIsValid(row.targetId)" class="mt-1 block text-[10px] text-destructive">引用目标已失效</span></div></template>
          <template #cell-priority="{ row }"><span class="font-semibold tabular-nums">{{ row.priority }}</span></template>
          <template #cell-displayEnabled="{ row }"><div class="flex flex-col items-center gap-1"><Badge :variant="row.displayEnabled ? 'outline' : 'secondary'" :class="row.displayEnabled ? 'border-success/30 bg-success/10 text-success' : 'text-muted-foreground'">{{ row.displayEnabled ? '启用' : '停用' }}</Badge><span v-if="row.displayEnabled && !store.isBannerEffective(row)" class="text-[10px] text-warning">当前不可展示</span></div></template>
          <template #cell-validity="{ row }"><span class="whitespace-nowrap text-xs text-muted-foreground">{{ formatValidity(row.validFrom, row.validTo) }}</span></template>
          <template #cell-clickMetrics="{ row }"><span class="whitespace-nowrap tabular-nums">{{ metrics(row.metrics.clickPv, row.metrics.clickUv) }}</span></template>
          <template #cell-actions="{ row }"><div class="flex justify-end gap-1"><Button variant="ghost" size="lg" class="h-10 px-3" @click="openBannerEdit(row)"><PencilLine aria-hidden="true" />编辑</Button><DropdownMenu><DropdownMenuTrigger as-child><Button variant="ghost" size="icon-lg" class="h-10 w-10" :aria-label="`${row.title}更多操作`"><CircleEllipsis aria-hidden="true" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem @select="runAction(store.setBannerEnabled(row.id, !row.displayEnabled), row.displayEnabled ? 'Banner 已停用。' : 'Banner 已启用。')">{{ row.displayEnabled ? '停用' : '启用' }}</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" @select="deleteTarget = { kind: 'banner', record: row }"><Trash2 aria-hidden="true" />删除</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div></template>
        </DataTable>
        <PaginationBar :page="store.pages.banner" :page-size="CONTENT_MANAGEMENT_PAGE_SIZE" :page-sizes="[20]" :total="store.bannerRecords.length" :disabled="store.isLoading" @update:page="store.setPage('banner', $event)" />
      </template>

      <template v-else>
        <DataTable :columns="hintColumns" :rows="store.paginatedPriorityHints" row-key="id" :loading="store.isLoading" empty-text="暂无高优提示" caption="高优提示列表">
          <template #cell-code="{ row }"><span class="rounded-md border bg-muted/35 px-2 py-1 font-mono text-xs">{{ row.code }}</span></template>
          <template #cell-title="{ row }"><div class="max-w-64"><p class="truncate font-medium" :title="row.title">{{ row.title }}</p><p v-if="store.activePriorityHintIds.includes(row.id)" class="mt-1 text-[11px] font-medium text-primary">当前展示位</p></div></template>
          <template #cell-referenceType="{ row }"><Badge variant="outline">{{ contentTypeLabel(row.referenceType) }}</Badge></template>
          <template #cell-targetId="{ row }"><div class="max-w-72"><span class="block truncate text-xs text-muted-foreground" :title="targetLabel(row.targetId)">{{ targetLabel(row.targetId) }}</span><span v-if="!store.targetIsValid(row.targetId)" class="mt-1 block text-[10px] text-destructive">引用目标已失效</span></div></template>
          <template #cell-priority="{ row }"><span class="font-semibold tabular-nums">{{ row.priority }}</span></template>
          <template #cell-displayEnabled="{ row }"><div class="flex flex-col items-center gap-1"><Badge :variant="row.displayEnabled ? 'outline' : 'secondary'" :class="row.displayEnabled ? 'border-success/30 bg-success/10 text-success' : 'text-muted-foreground'">{{ row.displayEnabled ? '启用' : '停用' }}</Badge><span v-if="row.displayEnabled && !store.isPriorityHintEffective(row)" class="text-[10px] text-warning">当前不可展示</span></div></template>
          <template #cell-validity="{ row }"><span class="whitespace-nowrap text-xs text-muted-foreground">{{ formatValidity(row.validFrom, row.validTo) }}</span></template>
          <template #cell-clickMetrics="{ row }"><span class="whitespace-nowrap tabular-nums">{{ metrics(row.metrics.clickPv, row.metrics.clickUv) }}</span></template>
          <template #cell-actions="{ row }"><div class="flex justify-end gap-1"><Button variant="ghost" size="lg" class="h-10 px-3" @click="openHintEdit(row)"><PencilLine aria-hidden="true" />编辑</Button><DropdownMenu><DropdownMenuTrigger as-child><Button variant="ghost" size="icon-lg" class="h-10 w-10" :aria-label="`${row.title}更多操作`"><CircleEllipsis aria-hidden="true" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem @select="runAction(store.setPriorityHintEnabled(row.id, !row.displayEnabled), row.displayEnabled ? '高优提示已停用。' : '高优提示已启用。')">{{ row.displayEnabled ? '停用' : '启用' }}</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" @select="deleteTarget = { kind: 'hint', record: row }"><Trash2 aria-hidden="true" />删除</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div></template>
        </DataTable>
        <PaginationBar :page="store.pages.hint" :page-size="CONTENT_MANAGEMENT_PAGE_SIZE" :page-sizes="[20]" :total="store.priorityHintRecords.length" :disabled="store.isLoading" @update:page="store.setPage('hint', $event)" />
      </template>
    </div>

    <CrudSheet :open="sheetOpen" :mode="sheetMode" :title="sheetKind === 'content' ? `${sheetMode === 'create' ? '新增' : '编辑'}${contentForm.type === 'activity' ? '活动' : '内容'}` : sheetKind === 'banner' ? `${sheetMode === 'create' ? '新增' : '编辑'} Banner` : `${sheetMode === 'create' ? '新增' : '编辑'}高优提示`" :description="sheetKind === 'content' ? '维护内容字段并按发布时间决定草稿或发布状态。' : sheetKind === 'banner' ? '配置首页轮播图及其跳转目标。' : '配置首页高优提示及引用目标。'" :saving="store.isSaving" :dirty="sheetDirty" size="wide" @submit="saveSheet" @request-close="requestSheetClose">
      <ContentForm v-if="sheetKind === 'content'" ref="contentFormRef" :value="contentForm" :issues="contentIssues" :saving="store.isSaving" @update:value="contentForm = $event" />
      <BannerForm v-else-if="sheetKind === 'banner'" ref="bannerFormRef" :value="bannerForm" :references="store.selectableReferences" :issues="bannerIssues" :saving="store.isSaving" @update:value="bannerForm = $event" />
      <PriorityHintForm v-else ref="hintFormRef" :value="hintForm" :references="store.selectableReferences" :issues="hintIssues" :saving="store.isSaving" @update:value="hintForm = $event" />
    </CrudSheet>

    <AlertDialog :open="discardConfirmOpen" @update:open="discardConfirmOpen = $event">
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>放弃未保存的修改？</AlertDialogTitle><AlertDialogDescription>当前抽屉中的修改尚未保存，关闭后无法恢复。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>继续编辑</AlertDialogCancel><Button variant="destructive" @click="closeSheet">放弃修改</Button></AlertDialogFooter></AlertDialogContent>
    </AlertDialog>

    <AlertDialog :open="Boolean(deleteTarget)" @update:open="!$event && (deleteTarget = null)">
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>确认删除{{ deleteTarget?.record.code }}？</AlertDialogTitle><AlertDialogDescription>删除后不可恢复，历史统计不会用于新记录。该操作仅影响本地演示数据。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><Button variant="destructive" :disabled="store.isSaving" @click="confirmDelete"><LoaderCircle v-if="store.isSaving" class="animate-spin motion-reduce:animate-none" aria-hidden="true" /><Trash2 v-else aria-hidden="true" />{{ store.isSaving ? '删除中' : '确认删除' }}</Button></AlertDialogFooter></AlertDialogContent>
    </AlertDialog>

    <Dialog :open="Boolean(deleteReferenceBlock)" @update:open="!$event && (deleteReferenceBlock = null)">
      <DialogContent class="max-w-md"><DialogHeader><DialogTitle>该内容无法删除</DialogTitle><DialogDescription>请先解除下列 Banner 或高优提示引用，再重新删除内容。</DialogDescription></DialogHeader><div class="rounded-xl border bg-destructive/5 p-4 text-sm"><p v-if="deleteReferenceBlock?.bannerCodes.length"><strong>Banner：</strong>{{ deleteReferenceBlock.bannerCodes.join('、') }}</p><p v-if="deleteReferenceBlock?.priorityHintCodes.length" class="mt-2"><strong>高优提示：</strong>{{ deleteReferenceBlock.priorityHintCodes.join('、') }}</p></div><DialogFooter><Button @click="deleteReferenceBlock = null">我知道了</Button></DialogFooter></DialogContent>
    </Dialog>

    <Dialog :open="syncDialogOpen" @update:open="syncDialogOpen = $event">
      <DialogContent class="w-[calc(100%-2rem)] max-w-xl overflow-hidden">
        <DialogHeader class="border-b px-6 py-5">
          <DialogTitle class="text-lg leading-6">
            同步状态{{ syncRecord ? ` · ${syncRecord.code}` : '' }}
          </DialogTitle>
          <DialogDescription class="max-w-lg leading-6">
            主办方来源为只读示例源，后续可通过窄接口替换真实同步服务。
          </DialogDescription>
        </DialogHeader>

        <div class="px-6 py-5">
          <dl class="overflow-hidden rounded-xl border bg-muted/15 text-sm">
            <div class="grid gap-4 border-b px-4 py-4 sm:grid-cols-2 sm:gap-6">
              <div class="min-w-0">
                <dt class="text-xs font-medium text-muted-foreground">对接源</dt>
                <dd class="mt-1.5 truncate font-semibold" :title="`${store.snapshot.organizerSync.sourceName}（${store.snapshot.organizerSync.sourceId}）`">
                  {{ store.snapshot.organizerSync.sourceName }}（{{ store.snapshot.organizerSync.sourceId }}）
                </dd>
              </div>
              <div>
                <dt class="text-xs font-medium text-muted-foreground">同步状态</dt>
                <dd class="mt-1.5">
                  <Badge variant="outline" :class="syncStatusBadgeClass(store.snapshot.organizerSync.status)">
                    {{ syncStatusLabel(store.snapshot.organizerSync.status) }}
                  </Badge>
                </dd>
              </div>
            </div>

            <div class="border-b px-4 py-4">
              <dt class="text-xs font-medium text-muted-foreground">最近同步时间</dt>
              <dd class="mt-1.5 font-semibold tabular-nums">
                {{ formatDateTime(store.snapshot.organizerSync.lastSyncedAt) }}
              </dd>
            </div>

            <div class="px-4 py-4">
              <dt class="text-xs font-medium text-muted-foreground">本次同步摘要</dt>
              <dd class="mt-3 grid grid-cols-3 gap-2">
                <div class="rounded-lg border bg-background px-3 py-2.5 text-center">
                  <span class="block text-xs text-muted-foreground">新增</span>
                  <strong class="mt-1 block text-lg tabular-nums">{{ store.snapshot.organizerSync.summary.created }}</strong>
                </div>
                <div class="rounded-lg border bg-background px-3 py-2.5 text-center">
                  <span class="block text-xs text-muted-foreground">变更</span>
                  <strong class="mt-1 block text-lg tabular-nums">{{ store.snapshot.organizerSync.summary.updated }}</strong>
                </div>
                <div class="rounded-lg border bg-background px-3 py-2.5 text-center">
                  <span class="block text-xs text-muted-foreground">下线</span>
                  <strong class="mt-1 block text-lg tabular-nums">{{ store.snapshot.organizerSync.summary.offline }}</strong>
                </div>
              </dd>
            </div>
          </dl>
        </div>

        <DialogFooter class="border-t bg-muted/15 px-6 py-4 max-sm:flex-col-reverse">
          <Button variant="outline" class="max-sm:w-full" @click="syncDialogOpen = false">关闭</Button>
          <Button class="max-sm:w-full" :disabled="store.isSyncing" @click="triggerSync">
            <LoaderCircle v-if="store.isSyncing" class="animate-spin motion-reduce:animate-none" aria-hidden="true" />
            <RefreshCw v-else aria-hidden="true" />
            {{ store.isSyncing ? '同步中' : '触发同步' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>
</template>
