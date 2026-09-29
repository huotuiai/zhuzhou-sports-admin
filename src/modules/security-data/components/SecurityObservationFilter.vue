<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import type { ObservationWindow, SecurityPeriod } from '../types'
import { SECURITY_PERIODS } from '../lib/observation-window'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const props = defineProps<{
  window: ObservationWindow
  today: string
  isCurrent: boolean
  rangeLabel: string
  dateError: string
  isPeriodDisabled: (period: SecurityPeriod) => boolean
}>()

const emit = defineEmits<{
  selectDate: [date: string]
  selectPeriod: [period: unknown]
}>()

const dateInput = ref<string | number>(props.window.date)
watch(() => props.window.date, (date) => { dateInput.value = date })

async function changeDate(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  emit('selectDate', input.value)
  await nextTick()
  // Restore the accepted window after a cleared or invalid native date input.
  dateInput.value = props.window.date
}
</script>

<template>
  <Card class="min-w-0 gap-2 overflow-visible border border-[#ededed] px-4 py-4 shadow-none ring-0 dark:border-border">
    <div class="flex min-w-0 flex-wrap items-center gap-4">
      <Label for="security-date" class="shrink-0 text-sm">观测窗口</Label>
      <Input
        id="security-date"
        v-model="dateInput"
        type="date"
        :max="today"
        class="h-11 w-44 border-[#c9c9c9] bg-transparent shadow-none dark:border-border dark:[color-scheme:dark]"
        :aria-invalid="Boolean(dateError)"
        :aria-describedby="dateError ? 'security-date-error' : undefined"
        @change="changeDate"
      />
      <Select :model-value="window.period" @update:model-value="emit('selectPeriod', $event)">
        <SelectTrigger id="security-period" aria-label="观测时段" class="h-11 w-60 border-[#c9c9c9] bg-transparent shadow-none dark:border-border">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="period in SECURITY_PERIODS" :key="period.value" :value="period.value" :disabled="isPeriodDisabled(period.value)" class="min-h-11">
            {{ period.label }}
          </SelectItem>
        </SelectContent>
      </Select>
      <span class="text-sm tabular-nums" data-testid="security-window-range" aria-live="polite">{{ rangeLabel }}</span>
      <span v-if="isCurrent" class="ml-auto text-xs text-muted-foreground/65">每 5 分钟实时刷新</span>
    </div>
    <p v-if="dateError" id="security-date-error" role="alert" class="text-xs text-destructive">{{ dateError }}</p>
  </Card>
</template>
