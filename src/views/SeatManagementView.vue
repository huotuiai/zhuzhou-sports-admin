<script setup lang="ts">
import type { CrudDialogCloseRequest, CrudDialogMode, DataTableColumn } from '@/components/common'
import type {
  SeatFloor,
  SeatPlanningQuery,
  SeatZone,
  SeatZoneValidationIssue,
  SeatZoneWriteInput,
} from '@/modules/seat-management/types'
import {
  AlertTriangle, Ban, Building2, ChevronDown, Layers3,
  PencilLine, Plus, RotateCcw, ShieldAlert, Trash2, Unlink, X,
} from '@lucide/vue'
import { useEventListener } from '@vueuse/core'
import { computed, nextTick, onMounted, ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { toast } from 'vue-sonner'
import { CrudDialog, CrudSheet, DataTable, PaginationBar, QueryPanel } from '@/components/common'
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import SeatStatusBadge from '@/modules/seat-management/components/SeatStatusBadge.vue'
import VenueSeatForm from '@/modules/seat-management/components/VenueSeatForm.vue'
import { useSeatPlanningStore } from '@/modules/seat-management/stores/venue-seat-store'

const EMPTY_ZONE: SeatZoneWriteInput = {
  code: '', name: '', floorId: '', rowStart: 1, rowEnd: 30,
  gateIds: [], sortOrder: 1, status: 'enabled', remark: '',
}

const columns: readonly DataTableColumn<SeatZone>[] = [
  { key: 'code', label: '分区编号', width: '120px' },
  { key: 'name', label: '区域名称', minWidth: '220px' },
  { key: 'floor', label: '楼层', width: '100px', align: 'center' },
  { key: 'range', label: '座位范围', width: '120px', align: 'center' },
  { key: 'gates', label: '对应检票口', minWidth: '260px' },
  { key: 'sortOrder', label: '排序', width: '82px', align: 'center' },
  { key: 'status', label: '状态', width: '104px', align: 'center' },
  { key: 'actions', label: '操作', width: '252px', align: 'right' },
]

const store = useSeatPlanningStore()
const queryDraft = ref<SeatPlanningQuery>({ ...store.query, gateIds: [...store.query.gateIds] })
const zoneOpen = ref(false)
const zoneMode = ref<CrudDialogMode>('create')
const editingId = ref<string | null>(null)
const zoneValue = ref<SeatZoneWriteInput>({ ...EMPTY_ZONE, gateIds: [] })
const initialZoneValue = ref<SeatZoneWriteInput>({ ...EMPTY_ZONE, gateIds: [] })
const zoneIssues = ref<readonly SeatZoneValidationIssue[]>([])
const zoneFormRef = ref<{ validateAndFocus(): boolean } | null>(null)
const floorOpen = ref(false)
const floorName = ref('')
const initialFloorName = ref('')
const floorError = ref('')
const floorInput = ref<InstanceType<typeof Input> | null>(null)
const discardOpen = ref(false)
const discardKind = ref<'zone' | 'floor'>('zone')
const zoneDeleteTarget = ref<SeatZone | null>(null)
const zoneBlockedTarget = ref<SeatZone | null>(null)
const floorDeleteTarget = ref<SeatFloor | null>(null)
const floorBlockedTarget = ref<SeatFloor | null>(null)
const loadError = ref('')

const zoneDirty = computed(() => JSON.stringify(zoneValue.value) !== JSON.stringify(initialZoneValue.value))
const floorDirty = computed(() => floorName.value !== initialFloorName.value)
const hasQuery = computed(() => Boolean(store.query.keyword || store.query.floorId !== 'all' || store.query.status !== 'all' || store.query.gateIds.length))
const floorById = computed(() => new Map(store.floors.map((floor) => [floor.id, floor])))

function cloneQuery(query: SeatPlanningQuery): SeatPlanningQuery {
  return { ...query, gateIds: [...query.gateIds] }
}

function toWriteInput(zone: SeatZone): SeatZoneWriteInput {
  return {
    code: zone.code, name: zone.name, floorId: zone.floorId,
    rowStart: zone.rowStart, rowEnd: zone.rowEnd, gateIds: [...zone.gateIds],
    sortOrder: zone.sortOrder, status: zone.status, remark: zone.remark,
  }
}

async function applyQuery(): Promise<void> {
  if (!await store.queryZones(cloneQuery(queryDraft.value))) {
    toast.error(store.error ?? '座位分区查询失败')
  }
}

async function resetQuery(): Promise<void> {
  if (!await store.resetQuery()) {
    toast.error(store.error ?? '座位分区重置失败')
    return
  }
  queryDraft.value = cloneQuery(store.query)
}

function toggleQueryGate(gateId: string, checked: boolean | 'indeterminate'): void {
  const next = new Set(queryDraft.value.gateIds)
  if (checked === true) next.add(gateId)
  else next.delete(gateId)
  queryDraft.value = { ...queryDraft.value, gateIds: [...next] }
}

function openCreateZone(floorId?: string): void {
  store.resetError()
  const selectedFloor = store.floors.find((item) => item.id === floorId) ??
    store.floors.find((item) => item.id === queryDraft.value.floorId) ?? store.floors[0]
  if (!selectedFloor) {
    toast.error('请先新增楼层')
    return
  }
  zoneMode.value = 'create'
  editingId.value = null
  zoneValue.value = { ...EMPTY_ZONE, floorId: selectedFloor.id, gateIds: [], sortOrder: store.nextSortOrder(selectedFloor.id) }
  initialZoneValue.value = { ...zoneValue.value, gateIds: [] }
  zoneIssues.value = []
  zoneOpen.value = true
}

async function openEditZone(zone: SeatZone): Promise<void> {
  store.resetError()
  const detail = await store.getZone(zone.id)
  if (!detail) {
    toast.error(store.error ?? '座位分区详情加载失败')
    return
  }
  const value = toWriteInput(detail)
  zoneMode.value = 'edit'
  editingId.value = detail.id
  zoneValue.value = { ...value, gateIds: [...value.gateIds] }
  initialZoneValue.value = { ...value, gateIds: [...value.gateIds] }
  zoneIssues.value = []
  zoneOpen.value = true
}

function updateZoneValue(value: SeatZoneWriteInput): void {
  zoneValue.value = { ...value, gateIds: [...value.gateIds] }
  zoneIssues.value = []
  store.resetError()
}

function closeZone(): void {
  initialZoneValue.value = { ...zoneValue.value, gateIds: [...zoneValue.value.gateIds] }
  zoneOpen.value = false
  editingId.value = null
  zoneIssues.value = []
  if (discardKind.value === 'zone') discardOpen.value = false
}

function requestZoneClose(request: CrudDialogCloseRequest): void {
  if (request.dirty) {
    discardKind.value = 'zone'
    discardOpen.value = true
  } else closeZone()
}

async function saveZone(): Promise<void> {
  zoneIssues.value = store.validateZone(zoneValue.value, editingId.value ?? undefined).issues
  await nextTick()
  if (!zoneFormRef.value?.validateAndFocus() || zoneIssues.value.length) return
  const creating = zoneMode.value === 'create'
  const saved = creating
    ? await store.createZone(zoneValue.value)
    : editingId.value ? await store.updateZone(editingId.value, zoneValue.value) : null
  if (!saved) {
    toast.error(store.error ?? '座位分区保存失败')
    return
  }
  closeZone()
  toast.success(creating ? '座位分区已新增。' : '座位分区已更新。')
}

function openCreateFloor(): void {
  store.resetError()
  floorName.value = ''
  initialFloorName.value = ''
  floorError.value = ''
  floorOpen.value = true
  nextTick(() => floorInput.value?.$el?.focus?.())
}

function closeFloor(): void {
  initialFloorName.value = floorName.value
  floorOpen.value = false
  floorError.value = ''
  if (discardKind.value === 'floor') discardOpen.value = false
}

function requestFloorClose(request: CrudDialogCloseRequest): void {
  if (request.dirty) {
    discardKind.value = 'floor'
    discardOpen.value = true
  } else closeFloor()
}

async function saveFloor(): Promise<void> {
  const result = store.validateFloor({ name: floorName.value })
  floorError.value = result.issues[0]?.message ?? ''
  if (floorError.value) {
    await nextTick()
    floorInput.value?.$el?.focus?.()
    return
  }
  const floor = await store.createFloor({ name: floorName.value })
  if (!floor) {
    floorError.value = store.error ?? '楼层新增失败'
    toast.error(floorError.value)
    return
  }
  if (zoneOpen.value) updateZoneValue({ ...zoneValue.value, floorId: floor.id })
  closeFloor()
  toast.success('楼层已新增。')
}

function confirmDiscard(): void {
  if (discardKind.value === 'zone') closeZone()
  else closeFloor()
}

async function toggleZoneStatus(zone: SeatZone): Promise<void> {
  const nextStatus = zone.status === 'enabled' ? 'disabled' : 'enabled'
  const saved = await store.updateStatus(zone.id, nextStatus)
  if (!saved) toast.error(store.error ?? '状态更新失败')
  else toast.success(nextStatus === 'enabled' ? '分区已启用。' : '分区已停用。')
}

function requestZoneDelete(zone: SeatZone): void {
  if (zone.status === 'enabled') zoneBlockedTarget.value = zone
  else zoneDeleteTarget.value = zone
}

async function removeZone(): Promise<void> {
  if (!zoneDeleteTarget.value) return
  if (await store.removeZone(zoneDeleteTarget.value.id)) {
    zoneDeleteTarget.value = null
    toast.success('座位分区已删除。')
  } else toast.error(store.error ?? '分区删除失败')
}

function requestFloorDelete(floor: SeatFloor): void {
  if (store.totalZoneCount(floor.id) > 0) floorBlockedTarget.value = floor
  else floorDeleteTarget.value = floor
}

async function removeFloor(): Promise<void> {
  if (!floorDeleteTarget.value) return
  const id = floorDeleteTarget.value.id
  if (await store.removeFloor(id)) {
    if (zoneOpen.value && zoneValue.value.floorId === id) {
      updateZoneValue({ ...zoneValue.value, floorId: store.floors[0]?.id ?? '' })
    }
    floorDeleteTarget.value = null
    toast.success('楼层已删除。')
  } else toast.error(store.error ?? '楼层删除失败')
}

function confirmRouteLeave(): boolean {
  const dirty = (zoneOpen.value && zoneDirty.value) || (floorOpen.value && floorDirty.value)
  return !dirty || window.confirm('当前座位规划内容尚未保存，确定放弃吗？')
}

function beforeUnload(event: BeforeUnloadEvent): void {
  if ((zoneOpen.value && zoneDirty.value) || (floorOpen.value && floorDirty.value)) {
    event.preventDefault()
    event.returnValue = ''
  }
}

async function load(): Promise<void> {
  loadError.value = ''
  if (!await store.refresh()) {
    loadError.value = store.error ?? '座位规划数据加载失败'
    toast.error(loadError.value)
    return
  }
  queryDraft.value = cloneQuery(store.query)
}

onMounted(() => void load())
onBeforeRouteLeave(() => confirmRouteLeave())
useEventListener(window, 'beforeunload', beforeUnload)
</script>

<template>
  <section class="tech-grid min-h-[calc(100svh-4rem)] p-6" aria-labelledby="seat-planning-title">
    <div class="mx-auto flex w-full max-w-[1680px] flex-col gap-4">
      <header class="flex items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <span class="grid size-11 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary"><Layers3 class="size-5" aria-hidden="true" /></span>
          <div><h1 id="seat-planning-title" class="text-2xl font-semibold tracking-tight">座位规划管理</h1><p class="mt-1 text-sm text-muted-foreground">座位分区与检票口对应关系</p></div>
        </div>
        <div class="flex items-center gap-2">
          <Button size="lg" class="h-11 px-4" @click="openCreateZone()"><Plus aria-hidden="true" />新增分区</Button>
          <DropdownMenu>
            <DropdownMenuTrigger as-child><Button variant="outline" size="lg" class="h-11 px-4"><Building2 aria-hidden="true" />楼层管理<ChevronDown aria-hidden="true" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-64">
              <DropdownMenuLabel>场馆楼层</DropdownMenuLabel>
              <DropdownMenuItem class="min-h-10 px-3" @select="openCreateFloor"><Plus />新增楼层</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem v-for="floor in store.floors" :key="floor.id" class="min-h-10 px-3" @select="requestFloorDelete(floor)">
                <Building2 /><span class="min-w-0 flex-1 truncate">{{ floor.name }}</span><span class="text-xs text-muted-foreground">{{ store.totalZoneCount(floor.id) }} 个分区</span><Trash2 class="text-destructive" />
              </DropdownMenuItem>
              <p v-if="store.floors.length === 0" class="px-3 py-4 text-center text-xs text-muted-foreground">暂无楼层</p>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <QueryPanel :loading="store.isLoading" @query="applyQuery" @reset="resetQuery">
        <div class="space-y-2"><Label for="seat-zone-keyword">分区信息</Label><Input id="seat-zone-keyword" v-model="queryDraft.keyword" class="h-11" placeholder="分区编号或区域名称" autocomplete="off" /></div>
        <div class="space-y-2"><Label for="seat-zone-floor">楼层</Label><Select v-model="queryDraft.floorId"><SelectTrigger id="seat-zone-floor" class="h-11 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部楼层</SelectItem><SelectItem v-for="floor in store.floors" :key="floor.id" :value="floor.id">{{ floor.name }}</SelectItem></SelectContent></Select></div>
        <div class="space-y-2"><Label for="seat-zone-status">状态</Label><Select v-model="queryDraft.status"><SelectTrigger id="seat-zone-status" class="h-11 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部状态</SelectItem><SelectItem value="enabled">仅启用</SelectItem><SelectItem value="disabled">仅停用</SelectItem></SelectContent></Select></div>
        <div class="space-y-2">
          <Label id="seat-zone-gate-filter-label">检票口</Label>
          <DropdownMenu>
            <DropdownMenuTrigger as-child><Button variant="outline" class="h-11 w-full justify-between bg-background px-3 font-normal" aria-labelledby="seat-zone-gate-filter-label"><span class="truncate">{{ queryDraft.gateIds.length ? `已选 ${queryDraft.gateIds.length} 个检票口` : '全部检票口' }}</span><ChevronDown class="size-4 opacity-60" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="start" class="max-h-72 w-72 overflow-y-auto">
              <DropdownMenuLabel>匹配任意一个检票口</DropdownMenuLabel><DropdownMenuSeparator />
              <DropdownMenuCheckboxItem v-for="gate in store.ticketGates" :key="gate.id" :model-value="queryDraft.gateIds.includes(gate.id)" @update:model-value="toggleQueryGate(gate.id, $event)"><code class="mr-2 text-xs font-semibold">{{ gate.code }}</code><span class="truncate">{{ gate.name }}</span></DropdownMenuCheckboxItem>
              <p v-if="store.ticketGates.length === 0" class="px-2 py-4 text-center text-xs text-muted-foreground">暂无检票口</p>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </QueryPanel>

      <div v-if="loadError && !store.isLoading" class="flex items-center gap-3 rounded-xl border border-destructive/35 bg-destructive/8 p-4" role="alert">
        <AlertTriangle class="size-5 shrink-0 text-destructive" aria-hidden="true" /><p class="flex-1 text-sm text-destructive">{{ loadError }}</p><Button variant="outline" size="lg" class="h-11" @click="load"><RotateCcw aria-hidden="true" />重新加载</Button>
      </div>

      <DataTable :columns="columns" :rows="store.paginatedZones" row-key="id" :loading="store.isLoading" :empty-text="hasQuery ? '无匹配结果' : '暂无座位分区，请新增分区'" caption="座位分区信息表">
        <template #cell-code="{ row }"><code class="rounded-md border bg-muted/35 px-2 py-1 text-xs font-semibold">{{ row.code }}</code></template>
        <template #cell-name="{ row }"><span class="font-medium" :title="row.name">{{ row.name }}</span></template>
        <template #cell-floor="{ row }"><span>{{ floorById.get(row.floorId)?.name ?? '未知楼层' }}</span></template>
        <template #cell-range="{ row }"><span class="whitespace-nowrap font-medium tabular-nums">{{ row.rowStart }}–{{ row.rowEnd }} 排</span></template>
        <template #cell-gates="{ row }">
          <div v-if="store.zoneGateIds(row.code).length" class="flex max-w-72 flex-wrap gap-1.5">
            <Badge
              v-for="gateId in store.zoneGateIds(row.code).slice(0, 3)" :key="gateId" variant="outline"
              :class="!store.gateById.get(gateId)?.enabled ? 'border-muted-foreground/30 text-muted-foreground' : store.gateById.get(gateId)?.openStatus === 'restricted' ? 'border-destructive/30 text-destructive' : store.gateById.get(gateId)?.openStatus === 'closed' ? 'border-warning/30 text-warning' : ''"
              :title="`${store.gateById.get(gateId)?.name ?? '未知检票口'} · ${!store.gateById.get(gateId)?.enabled ? '停用' : store.gateById.get(gateId)?.openStatus === 'open' ? '开放' : store.gateById.get(gateId)?.openStatus === 'restricted' ? '管制' : '关闭'}`"
            >
              <ShieldAlert v-if="store.gateById.get(gateId)?.enabled && store.gateById.get(gateId)?.openStatus === 'restricted'" class="size-3" /><Ban v-else-if="!store.gateById.get(gateId)?.enabled || store.gateById.get(gateId)?.openStatus === 'closed'" class="size-3" />{{ store.gateById.get(gateId)?.code ?? '失效' }} {{ store.gateById.get(gateId)?.name ?? '' }}
            </Badge>
            <Badge v-if="store.zoneGateIds(row.code).length > 3" variant="secondary" :title="store.zoneGateIds(row.code).slice(3).map((id) => store.gateById.get(id)?.name ?? id).join('、')">+{{ store.zoneGateIds(row.code).length - 3 }}</Badge>
          </div>
          <span v-else class="text-xs text-destructive">未绑定检票口</span>
        </template>
        <template #cell-sortOrder="{ row }"><span class="tabular-nums">{{ row.sortOrder }}</span></template>
        <template #cell-status="{ row }"><SeatStatusBadge :status="row.status" /></template>
        <template #cell-actions="{ row }">
          <div class="flex justify-end gap-1">
            <Button variant="ghost" class="h-11 px-3" :disabled="store.detailLoadingId === row.id" @click="openEditZone(row)"><RotateCcw v-if="store.detailLoadingId === row.id" class="animate-spin motion-reduce:animate-none" /><PencilLine v-else />编辑</Button>
            <Button variant="ghost" class="h-11 px-3" :disabled="store.changingStatusId === row.id" @click="toggleZoneStatus(row)"><RotateCcw v-if="store.changingStatusId === row.id" class="animate-spin motion-reduce:animate-none" /><Ban v-else />{{ row.status === 'enabled' ? '停用' : '启用' }}</Button>
            <Button variant="ghost" class="h-11 px-3 text-destructive hover:text-destructive" @click="requestZoneDelete(row)"><Trash2 />删除</Button>
          </div>
        </template>
      </DataTable>

      <PaginationBar :page="store.currentPage" :page-size="store.pageSize" :total="store.total" :page-sizes="[20, 50, 100]" :disabled="store.isLoading" @update:page="store.setPage" @update:page-size="store.setPageSize" />
    </div>

    <CrudSheet :open="zoneOpen" :mode="zoneMode" :title="zoneMode === 'create' ? '新增座位分区' : `编辑座位分区 · ${zoneValue.code}`" description="维护分区范围、排序及其对应检票口。" :saving="store.isSaving" :dirty="zoneDirty" @submit="saveZone" @request-close="requestZoneClose">
      <VenueSeatForm :key="`${zoneMode}-${editingId ?? 'new'}`" ref="zoneFormRef" :mode="zoneMode" :value="zoneValue" :floors="store.floors" :zones="store.zones" :ticket-gates="store.ticketGates" :editing-id="editingId ?? undefined" :issues="zoneIssues" :saving="store.isSaving" @update:value="updateZoneValue" />
    </CrudSheet>

    <CrudDialog :open="floorOpen" mode="create" title="新增楼层" description="楼层用于座位分区归属与列表排序。" submit-label="确认新增" :saving="store.isSaving" :dirty="floorDirty" @submit="saveFloor" @request-close="requestFloorClose">
      <div class="space-y-2"><Label for="seat-floor-name">楼层名称 <span class="text-destructive">*</span></Label><Input id="seat-floor-name" ref="floorInput" v-model="floorName" maxlength="20" class="h-11" placeholder="例如：三层" :disabled="store.isSaving" :aria-invalid="Boolean(floorError)" :aria-describedby="floorError ? 'seat-floor-name-error' : undefined" @input="floorError = ''" /><p v-if="floorError" id="seat-floor-name-error" class="flex items-center gap-1.5 text-xs text-destructive" role="alert"><AlertTriangle class="size-3.5" />{{ floorError }}</p><p v-else class="text-xs leading-5 text-muted-foreground">楼层名称不可重复；楼层下存在分区时不能删除。</p></div>
    </CrudDialog>

    <AlertDialog :open="discardOpen" @update:open="discardOpen = $event"><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>放弃未保存的修改？</AlertDialogTitle><AlertDialogDescription>当前{{ discardKind === 'zone' ? '座位分区' : '楼层' }}内容尚未保存，关闭后将无法恢复。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel class="h-11">继续编辑</AlertDialogCancel><Button variant="destructive" class="h-11" @click="confirmDiscard"><X />放弃修改</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>

    <AlertDialog :open="Boolean(zoneBlockedTarget)" @update:open="!$event && (zoneBlockedTarget = null)"><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>该分区无法删除</AlertDialogTitle><AlertDialogDescription>“{{ zoneBlockedTarget?.name }}”当前处于启用状态，请先停用后再删除。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><Button class="h-11" @click="zoneBlockedTarget = null"><Unlink />我知道了</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog :open="Boolean(floorBlockedTarget)" @update:open="!$event && (floorBlockedTarget = null)"><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>该楼层无法删除</AlertDialogTitle><AlertDialogDescription>“{{ floorBlockedTarget?.name }}”已绑定 {{ floorBlockedTarget ? store.totalZoneCount(floorBlockedTarget.id) : 0 }} 个座位分区，请先迁移或删除这些分区。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><Button class="h-11" @click="floorBlockedTarget = null"><Unlink />我知道了</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog :open="Boolean(zoneDeleteTarget)" @update:open="!$event && (zoneDeleteTarget = null)"><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>确认删除“{{ zoneDeleteTarget?.name }}”？</AlertDialogTitle><AlertDialogDescription>删除后 H5 将无法匹配该分区，相关检票口绑定会同步清理；用户已收藏的该分区信息将失效，并提示“该分区已不存在”。此操作无法恢复。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel class="h-11">取消</AlertDialogCancel><Button variant="destructive" class="h-11" :disabled="Boolean(store.deletingId)" @click="removeZone"><Trash2 />{{ store.deletingId ? '删除中' : '确认删除' }}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog :open="Boolean(floorDeleteTarget)" @update:open="!$event && (floorDeleteTarget = null)"><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>确认删除楼层“{{ floorDeleteTarget?.name }}”？</AlertDialogTitle><AlertDialogDescription>该楼层当前没有座位分区，删除后无法恢复。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel class="h-11">取消</AlertDialogCancel><Button variant="destructive" class="h-11" :disabled="Boolean(store.deletingId)" @click="removeFloor"><Trash2 />{{ store.deletingId ? '删除中' : '确认删除' }}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>
</template>
