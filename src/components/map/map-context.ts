import type { InjectionKey, ShallowRef } from 'vue'
import type { AMapMapLike, AMapRuntime } from './amap-runtime'
import { inject } from 'vue'

export interface AMapContext {
  runtime: ShallowRef<AMapRuntime | null>
  map: ShallowRef<AMapMapLike | null>
  ready: ShallowRef<boolean>
}

export const amapContextKey: InjectionKey<AMapContext> = Symbol('amap-context')

export function useAmapContext(): AMapContext {
  const context = inject(amapContextKey)
  if (!context) throw new Error('AMap layer must be rendered inside AMapCanvas')
  return context
}

