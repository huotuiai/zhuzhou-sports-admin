<script setup lang="ts">
import type { ControlZoneGeometry } from '@/modules/area-control/types'
import {
  ChevronDown,
  Focus,
  Layers3,
  LoaderCircle,
  LocateFixed,
  PanelRightOpen,
  Pentagon,
  Plus,
  RectangleHorizontal,
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type GeometryType = ControlZoneGeometry['type']

const props = withDefaults(defineProps<{
  readonly?: boolean
  readonlyReason?: string
  disabled?: boolean
  hasZones?: boolean
  drawing?: boolean
  showPanelButton?: boolean
}>(), {
  readonly: false,
  readonlyReason: '当前尺寸仅支持查看，请使用电脑进行区域编辑。',
  disabled: false,
  hasZones: false,
  drawing: false,
  showPanelButton: true,
})

const emit = defineEmits<{
  create: [geometryType: GeometryType]
  'return-to-zhuzhou': []
  'fit-all': []
  'open-mobile-panel': []
}>()

function requestCreate(geometryType: GeometryType) {
  if (props.readonly || props.disabled || props.drawing) return
  emit('create', geometryType)
}
</script>

<template>
  <section
    class="glass-panel w-fit max-w-[calc(100vw-2rem)] rounded-xl border p-1.5"
    aria-label="区域管制地图工具"
  >
    <div class="flex flex-wrap items-center gap-1.5">
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button
            size="lg"
            class="h-11 min-w-32 gap-2 px-3"
            :disabled="readonly || disabled || drawing"
            :aria-describedby="readonly ? 'area-control-readonly-hint' : undefined"
          >
            <LoaderCircle v-if="drawing" class="animate-spin motion-reduce:animate-none" aria-hidden="true" />
            <Plus v-else aria-hidden="true" />
            <span>{{ drawing ? '正在绘制' : '新建区域' }}</span>
            <ChevronDown v-if="!drawing" class="ml-auto size-3.5 opacity-70" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" class="w-52 p-1.5">
          <DropdownMenuLabel class="px-2 py-2 text-xs text-muted-foreground">
            选择绘制形状
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem class="h-11 gap-2 px-2" @select="requestCreate('rectangle')">
            <RectangleHorizontal aria-hidden="true" />
            <div>
              <p class="font-medium">矩形区域</p>
              <p class="text-xs text-muted-foreground">拖动绘制轴对齐矩形</p>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem class="h-11 gap-2 px-2" @select="requestCreate('polygon')">
            <Pentagon aria-hidden="true" />
            <div>
              <p class="font-medium">多边形区域</p>
              <p class="text-xs text-muted-foreground">依次点击设置区域顶点</p>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div class="mx-0.5 hidden h-6 w-px bg-border sm:block" aria-hidden="true" />

      <Button
        variant="outline"
        size="lg"
        class="h-11 gap-2 px-3"
        :disabled="disabled"
        @click="emit('return-to-zhuzhou')"
      >
        <LocateFixed aria-hidden="true" />
        <span class="hidden sm:inline">返回株洲</span>
        <span class="sm:hidden">株洲</span>
      </Button>

      <Button
        variant="outline"
        size="lg"
        class="h-11 gap-2 px-3"
        :disabled="disabled || !hasZones"
        @click="emit('fit-all')"
      >
        <Focus aria-hidden="true" />
        <span class="hidden sm:inline">适配全部区域</span>
        <span class="sm:hidden">适配全部</span>
      </Button>

      <Button
        v-if="showPanelButton"
        variant="outline"
        size="icon-lg"
        class="h-11 w-11 lg:hidden"
        aria-label="打开管制区域列表"
        @click="emit('open-mobile-panel')"
      >
        <PanelRightOpen aria-hidden="true" />
      </Button>
    </div>

    <p
      v-if="readonly"
      id="area-control-readonly-hint"
      class="mt-1.5 flex max-w-md items-start gap-1.5 px-2 pb-1 text-xs leading-5 text-muted-foreground"
      role="status"
    >
      <Layers3 class="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      {{ readonlyReason }}
    </p>
  </section>
</template>
