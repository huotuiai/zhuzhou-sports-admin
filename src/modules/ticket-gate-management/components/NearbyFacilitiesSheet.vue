<script setup lang="ts">
import type { ParkingLot } from '@/modules/parking-management/types'
import type { ShuttlePoint } from '@/modules/shuttle-management/types'
import type { GateRelationDirection, GeoPoint, TicketGate, TicketGateRelationSnapshot } from '../types'
import { computed, ref, watch } from 'vue'
import { AlertTriangle, BusFront, Clock3, Link2, LoaderCircle, Plus, SquareParking, Unlink, X } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { parkingLotService } from '@/modules/parking-management/services/parking-lot-service'
import { shuttlePointService } from '@/modules/shuttle-management/services/shuttle-point-service'
import { estimateWalkingMinutes, ticketGateRelationService } from '../services/ticket-gate-relation-service'

const props = defineProps<{ open: boolean, gate: TicketGate | null }>()
const emit = defineEmits<{ 'update:open': [open: boolean] }>()

const activeTab = ref<'parking' | 'shuttle'>('parking')
const parkingLots = ref<ParkingLot[]>([])
const shuttlePoints = ref<ShuttlePoint[]>([])
const relations = ref<TicketGateRelationSnapshot>({ parkingRelations: [], shuttleRelations: [] })
const loading = ref(false)
const loadError = ref('')
const saving = ref(false)
const removingId = ref<string | null>(null)
const parkingLotId = ref('')
const parkingMinutes = ref('')
const shuttleDirection = ref<GateRelationDirection | ''>('')
const shuttlePointId = ref('')
const shuttleStationId = ref('')
const shuttleMinutes = ref('')

const parkingById = computed(() => new Map(parkingLots.value.map((item) => [item.id, item])))
const shuttleById = computed(() => new Map(shuttlePoints.value.map((item) => [item.id, item])))
const selectedShuttle = computed(() => shuttleById.value.get(shuttlePointId.value) ?? null)
const boundParkingIds = computed(() => new Set(relations.value.parkingRelations.map((item) => item.parkingLotId)))
const parkingOptions = computed(() => parkingLots.value.filter((item) => item.enabled && !boundParkingIds.value.has(item.id)))
const shuttleOptions = computed(() => shuttlePoints.value.filter((item) => item.enabled))

const parkingRows = computed(() => [...relations.value.parkingRelations].sort((first, second) => {
  if (first.walkingMinutes === null && second.walkingMinutes !== null) return 1
  if (first.walkingMinutes !== null && second.walkingMinutes === null) return -1
  if (first.walkingMinutes !== second.walkingMinutes) return (first.walkingMinutes ?? 0) - (second.walkingMinutes ?? 0)
  return (parkingById.value.get(first.parkingLotId)?.name ?? '').localeCompare(parkingById.value.get(second.parkingLotId)?.name ?? '', 'zh-CN')
}))

const shuttleRows = computed(() => [...relations.value.shuttleRelations].sort((first, second) => {
  if (first.walkingMinutes === null && second.walkingMinutes !== null) return 1
  if (first.walkingMinutes !== null && second.walkingMinutes === null) return -1
  if (first.walkingMinutes !== second.walkingMinutes) return (first.walkingMinutes ?? 0) - (second.walkingMinutes ?? 0)
  return shuttleRelationName(first.shuttlePointId, first.stationId).localeCompare(shuttleRelationName(second.shuttlePointId, second.stationId), 'zh-CN')
}))

function directionLabel(direction: GateRelationDirection): string {
  return ({ entry: '进场', exit: '出场', bidirectional: '双向' })[direction]
}

function shuttleRelationName(pointId: string, stationId: string): string {
  const point = shuttleById.value.get(pointId)
  const station = point?.stations.find((item) => item.id === stationId)
  return `${point?.routeName ?? '未知线路'} · ${station?.name ?? '未知站点'}`
}

function parseMinutes(value: string): number | null | undefined {
  const source = value.trim()
  if (!source) return null
  const parsed = Number(source)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

/** 兼容后续后端为停车场、线路或站点补充 navigationPoint/经纬度字段。 */
function facilityPoint(value: unknown): GeoPoint | null {
  if (!value || typeof value !== 'object') return null
  const source = value as { navigationPoint?: unknown, longitude?: unknown, latitude?: unknown, lng?: unknown, lat?: unknown }
  const point = source.navigationPoint && typeof source.navigationPoint === 'object'
    ? source.navigationPoint as { lng?: unknown, lat?: unknown }
    : source
  const lng = point.lng ?? source.longitude
  const lat = point.lat ?? source.latitude
  return typeof lng === 'number' && Number.isFinite(lng) && typeof lat === 'number' && Number.isFinite(lat)
    ? { lng, lat }
    : null
}

function suggestedMinutes(target: unknown): string {
  const minutes = estimateWalkingMinutes(props.gate?.navigationPoint ?? null, facilityPoint(target))
  return minutes === null ? '' : String(minutes)
}

function resetForms(): void {
  parkingLotId.value = ''
  parkingMinutes.value = ''
  shuttleDirection.value = ''
  shuttlePointId.value = ''
  shuttleStationId.value = ''
  shuttleMinutes.value = ''
}

async function refreshRelations(): Promise<void> {
  if (!props.gate) return
  relations.value = await ticketGateRelationService.listRelations(props.gate.id)
}

async function load(): Promise<void> {
  if (!props.open || !props.gate) return
  loading.value = true
  loadError.value = ''
  resetForms()
  try {
    const [nextParkingLots, nextShuttlePoints] = await Promise.all([parkingLotService.list(), shuttlePointService.list()])
    parkingLots.value = nextParkingLots
    shuttlePoints.value = nextShuttlePoints
    await ticketGateRelationService.reconcile(
      nextParkingLots.map((item) => item.id),
      nextShuttlePoints.flatMap((point) => point.stations.map((station) => `${point.id}:${station.id}`)),
    )
    await refreshRelations()
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '邻近设施加载失败'
  } finally {
    loading.value = false
  }
}

async function addParking(): Promise<void> {
  if (!props.gate || !parkingLotId.value) {
    toast.error('请选择停车场')
    return
  }
  const minutes = parseMinutes(parkingMinutes.value)
  if (minutes === undefined) {
    toast.error('步行时间须为大于 0 的整数，或留空')
    return
  }
  saving.value = true
  try {
    await ticketGateRelationService.bindParking({ gateId: props.gate.id, parkingLotId: parkingLotId.value, walkingMinutes: minutes })
    await refreshRelations()
    parkingLotId.value = ''
    parkingMinutes.value = ''
    toast.success('附近停车场已绑定。')
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '停车场绑定失败')
  } finally {
    saving.value = false
  }
}

async function addShuttle(): Promise<void> {
  if (!props.gate || !shuttleDirection.value || !shuttlePointId.value || !shuttleStationId.value) {
    toast.error('请依次选择方向、线路和站点')
    return
  }
  const minutes = parseMinutes(shuttleMinutes.value)
  if (minutes === undefined) {
    toast.error('步行时间须为大于 0 的整数，或留空')
    return
  }
  saving.value = true
  try {
    await ticketGateRelationService.bindShuttle({
      gateId: props.gate.id,
      shuttlePointId: shuttlePointId.value,
      stationId: shuttleStationId.value,
      direction: shuttleDirection.value,
      walkingMinutes: minutes,
    })
    await refreshRelations()
    shuttlePointId.value = ''
    shuttleStationId.value = ''
    shuttleMinutes.value = ''
    toast.success('附近接驳站已绑定。')
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '接驳站绑定失败')
  } finally {
    saving.value = false
  }
}

async function removeParking(id: string): Promise<void> {
  removingId.value = id
  try {
    await ticketGateRelationService.unbindParking(id)
    await refreshRelations()
    toast.success('停车场绑定已移除。')
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '移除失败')
  } finally {
    removingId.value = null
  }
}

async function removeShuttle(id: string): Promise<void> {
  removingId.value = id
  try {
    await ticketGateRelationService.unbindShuttle(id)
    await refreshRelations()
    toast.success('接驳站绑定已移除。')
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '移除失败')
  } finally {
    removingId.value = null
  }
}

function handleShuttlePoint(value: unknown): void {
  shuttlePointId.value = String(value ?? '')
  shuttleStationId.value = ''
  shuttleMinutes.value = ''
}

function handleParkingLot(value: unknown): void {
  parkingLotId.value = String(value ?? '')
  parkingMinutes.value = suggestedMinutes(parkingById.value.get(parkingLotId.value))
}

function handleShuttleStation(value: unknown): void {
  shuttleStationId.value = String(value ?? '')
  const station = selectedShuttle.value?.stations.find((item) => item.id === shuttleStationId.value)
  shuttleMinutes.value = suggestedMinutes(station ?? selectedShuttle.value)
}

watch(() => [props.open, props.gate?.id] as const, load, { immediate: true })
</script>

<template>
  <Sheet :open="open" @update:open="emit('update:open', $event)">
    <SheetContent side="right" :show-close-button="false" class="!w-[min(760px,calc(100vw-2rem))] !max-w-none gap-0 p-0 sm:!max-w-[760px]">
      <SheetHeader class="relative shrink-0 border-b px-5 py-4 pr-16 text-left">
        <SheetTitle class="text-lg font-semibold">邻近设施配置</SheetTitle>
        <SheetDescription class="mt-1.5 leading-5">{{ gate?.code }} · {{ gate?.name }}，维护 H5 入场方案使用的停车场和接驳站。</SheetDescription>
        <Button variant="ghost" size="icon-lg" class="absolute right-3 top-3 h-11 w-11" aria-label="关闭邻近设施抽屉" @click="emit('update:open', false)"><X /></Button>
      </SheetHeader>

      <div class="flex min-h-0 flex-1 flex-col">
        <div class="border-b px-5 pt-4">
          <div class="inline-flex rounded-xl border bg-muted/30 p-1" role="tablist" aria-label="邻近设施类型">
            <button type="button" role="tab" :aria-selected="activeTab === 'parking'" :class="['flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors', activeTab === 'parking' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground']" @click="activeTab = 'parking'"><SquareParking class="size-4" />附近停车场</button>
            <button type="button" role="tab" :aria-selected="activeTab === 'shuttle'" :class="['flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors', activeTab === 'shuttle' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground']" @click="activeTab = 'shuttle'"><BusFront class="size-4" />附近接驳站</button>
          </div>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto p-5">
          <div v-if="loading" class="grid min-h-64 place-items-center text-sm text-muted-foreground" aria-live="polite"><div class="flex items-center gap-2"><LoaderCircle class="size-5 animate-spin motion-reduce:animate-none" />正在加载关联数据</div></div>
          <div v-else-if="loadError" class="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/8 p-4" role="alert"><AlertTriangle class="size-5 shrink-0 text-destructive" /><p class="flex-1 text-sm text-destructive">{{ loadError }}</p><Button variant="outline" class="h-11" @click="load">重试</Button></div>

          <template v-else-if="activeTab === 'parking'">
            <section aria-labelledby="bound-parking-title">
              <div class="mb-3 flex items-center justify-between"><h3 id="bound-parking-title" class="font-semibold">已绑定停车场</h3><Badge variant="secondary">{{ parkingRows.length }} 个</Badge></div>
              <div v-if="parkingRows.length" class="space-y-2">
                <div v-for="relation in parkingRows" :key="relation.id" class="flex min-h-16 items-center gap-3 rounded-xl border bg-card/70 px-3 py-2.5">
                  <span class="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><SquareParking class="size-5" /></span>
                  <div class="min-w-0 flex-1"><div class="flex flex-wrap items-center gap-2"><p class="truncate font-medium">{{ parkingById.get(relation.parkingLotId)?.name }}</p><Badge v-if="!parkingById.get(relation.parkingLotId)?.enabled" variant="destructive">已停用</Badge></div><p class="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Clock3 class="size-3.5" />{{ relation.walkingMinutes === null ? '未估算，归入其他路线' : `步行约 ${relation.walkingMinutes} 分钟` }}</p></div>
                  <Button variant="ghost" class="h-11 text-destructive hover:text-destructive" :disabled="removingId === relation.id" @click="removeParking(relation.id)"><LoaderCircle v-if="removingId === relation.id" class="animate-spin" /><Unlink v-else />移除</Button>
                </div>
              </div>
              <div v-else class="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">暂无绑定停车场</div>
            </section>

            <section class="mt-6 rounded-xl border border-dashed bg-muted/15 p-4" aria-labelledby="add-parking-title">
              <h3 id="add-parking-title" class="mb-4 flex items-center gap-2 font-semibold"><Link2 class="size-4 text-primary" />添加停车场</h3>
              <div class="grid grid-cols-[minmax(0,1fr)_140px_auto] items-end gap-3">
                <div class="space-y-2"><Label for="nearby-parking">停车场</Label><Select :model-value="parkingLotId" @update:model-value="handleParkingLot"><SelectTrigger id="nearby-parking" class="h-11 w-full"><SelectValue placeholder="请选择停车场" /></SelectTrigger><SelectContent><SelectItem v-for="lot in parkingOptions" :key="lot.id" :value="lot.id">{{ lot.code }} · {{ lot.name }}</SelectItem></SelectContent></Select></div>
                <div class="space-y-2"><Label for="nearby-parking-minutes">步行分钟</Label><Input id="nearby-parking-minutes" v-model="parkingMinutes" type="number" min="1" step="1" class="h-11" placeholder="可留空" /></div>
                <Button class="h-11 px-4" :disabled="saving || !parkingOptions.length" @click="addParking"><LoaderCircle v-if="saving" class="animate-spin" /><Plus v-else />添加</Button>
              </div>
            </section>
          </template>

          <template v-else>
            <section aria-labelledby="bound-shuttle-title">
              <div class="mb-3 flex items-center justify-between"><h3 id="bound-shuttle-title" class="font-semibold">已绑定接驳站</h3><Badge variant="secondary">{{ shuttleRows.length }} 个</Badge></div>
              <div v-if="shuttleRows.length" class="space-y-2">
                <div v-for="relation in shuttleRows" :key="relation.id" class="flex min-h-16 items-center gap-3 rounded-xl border bg-card/70 px-3 py-2.5">
                  <span class="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><BusFront class="size-5" /></span>
                  <div class="min-w-0 flex-1"><div class="flex flex-wrap items-center gap-2"><p class="truncate font-medium">{{ shuttleRelationName(relation.shuttlePointId, relation.stationId) }}</p><Badge variant="outline">{{ directionLabel(relation.direction) }}</Badge><Badge v-if="!shuttleById.get(relation.shuttlePointId)?.enabled" variant="destructive">已停运</Badge></div><p class="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Clock3 class="size-3.5" />{{ relation.walkingMinutes === null ? '未估算，归入其他路线' : `步行约 ${relation.walkingMinutes} 分钟` }}</p></div>
                  <Button variant="ghost" class="h-11 text-destructive hover:text-destructive" :disabled="removingId === relation.id" @click="removeShuttle(relation.id)"><LoaderCircle v-if="removingId === relation.id" class="animate-spin" /><Unlink v-else />移除</Button>
                </div>
              </div>
              <div v-else class="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">暂无绑定接驳站</div>
            </section>

            <section class="mt-6 rounded-xl border border-dashed bg-muted/15 p-4" aria-labelledby="add-shuttle-title">
              <h3 id="add-shuttle-title" class="mb-4 flex items-center gap-2 font-semibold"><Link2 class="size-4 text-primary" />添加接驳站</h3>
              <p class="mb-3 text-xs leading-5 text-muted-foreground">现有接驳线路按“双向”适配，可用于进场、出场或双向关系。</p>
              <div class="grid grid-cols-2 gap-3">
                <div class="space-y-2"><Label for="nearby-direction">方向</Label><Select v-model="shuttleDirection"><SelectTrigger id="nearby-direction" class="h-11 w-full"><SelectValue placeholder="先选方向" /></SelectTrigger><SelectContent><SelectItem value="entry">进场</SelectItem><SelectItem value="exit">出场</SelectItem><SelectItem value="bidirectional">双向</SelectItem></SelectContent></Select></div>
                <div class="space-y-2"><Label for="nearby-route">线路</Label><Select :model-value="shuttlePointId" :disabled="!shuttleDirection" @update:model-value="handleShuttlePoint"><SelectTrigger id="nearby-route" class="h-11 w-full"><SelectValue placeholder="再选线路" /></SelectTrigger><SelectContent><SelectItem v-for="point in shuttleOptions" :key="point.id" :value="point.id">{{ point.routeName }}</SelectItem></SelectContent></Select></div>
                <div class="space-y-2"><Label for="nearby-station">站点</Label><Select :model-value="shuttleStationId" :disabled="!selectedShuttle" @update:model-value="handleShuttleStation"><SelectTrigger id="nearby-station" class="h-11 w-full"><SelectValue placeholder="再选站点" /></SelectTrigger><SelectContent><SelectItem v-for="station in selectedShuttle?.stations ?? []" :key="station.id" :value="station.id">{{ station.name }}</SelectItem></SelectContent></Select></div>
                <div class="space-y-2"><Label for="nearby-shuttle-minutes">步行分钟</Label><Input id="nearby-shuttle-minutes" v-model="shuttleMinutes" type="number" min="1" step="1" class="h-11" placeholder="可留空" /></div>
              </div>
              <div class="mt-3 flex justify-end"><Button class="h-11 px-4" :disabled="saving || !shuttleOptions.length" @click="addShuttle"><LoaderCircle v-if="saving" class="animate-spin" /><Plus v-else />添加接驳站</Button></div>
            </section>
          </template>
        </div>
      </div>
    </SheetContent>
  </Sheet>
</template>
