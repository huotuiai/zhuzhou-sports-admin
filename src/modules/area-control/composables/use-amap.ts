import * as AMapLoader from '@amap/amap-jsapi-loader'

export const AMAP_PLUGINS = [
  'AMap.MouseTool',
  'AMap.RectangleEditor',
  'AMap.PolygonEditor',
  'AMap.DistrictSearch',
  'AMap.Scale',
  'AMap.ToolBar',
] as const

export interface AMapEventTarget {
  on(eventName: string, handler: AMapEventHandler): void
  off(eventName: string, handler: AMapEventHandler): void
}

export type AMapEventHandler = (event: unknown) => void

export interface AMapLngLatLike {
  getLng(): number
  getLat(): number
}

export interface AMapBoundsLike {
  getSouthWest(): AMapLngLatLike
  getNorthEast(): AMapLngLatLike
}

export interface AMapOverlayLike extends AMapEventTarget {
  getArea?(): number
  getBounds?(): AMapBoundsLike
  getPath?(): AMapLngLatLike[] | AMapLngLatLike[][]
  setBounds?(bounds: AMapBoundsLike): void
  setOptions(options: Record<string, unknown>): void
  setPath?(path: readonly (readonly [number, number])[]): void
  setPosition?(position: readonly [number, number]): void
}

export interface AMapMapLike {
  add(overlays: AMapOverlayLike | readonly AMapOverlayLike[]): void
  addControl(control: unknown): void
  destroy(): void
  remove(overlays: AMapOverlayLike | readonly AMapOverlayLike[]): void
  setCenter(center: readonly [number, number]): void
  setFitView(
    overlays?: readonly AMapOverlayLike[],
    immediately?: boolean,
    avoid?: readonly [number, number, number, number],
    maxZoom?: number,
  ): void
  setMapStyle(style: string): void
  setZoom(zoom: number): void
}

export interface AMapMouseToolLike extends AMapEventTarget {
  close(removeOverlay?: boolean): void
  polygon(options: Record<string, unknown>): void
  rectangle(options: Record<string, unknown>): void
}

export interface AMapEditorLike extends AMapEventTarget {
  close(): void
  open(): void
}

export interface AMapDistrictResult {
  districtList?: Array<{
    boundaries?: AMapLngLatLike[][]
    center?: AMapLngLatLike
  }>
  info?: string
}

export interface AMapDistrictSearchLike {
  search(
    keyword: string,
    callback: (status: string, result: AMapDistrictResult | string) => void,
  ): void
}

interface AMapConstructor<TInstance, TOptions extends object = Record<string, unknown>> {
  new(options?: TOptions): TInstance
}

interface AMapMapConstructor {
  new(container: HTMLElement, options?: Record<string, unknown>): AMapMapLike
}

interface AMapOverlayConstructor {
  new(options?: Record<string, unknown>): AMapOverlayLike
}

interface AMapEditorConstructor {
  new(map: AMapMapLike, overlay?: AMapOverlayLike): AMapEditorLike
}

interface AMapMouseToolConstructor {
  new(map: AMapMapLike): AMapMouseToolLike
}

interface AMapBoundsConstructor {
  new(
    southWest: readonly [number, number],
    northEast: readonly [number, number],
  ): AMapBoundsLike
}

export interface AMapRuntime {
  Bounds: AMapBoundsConstructor
  Circle: AMapOverlayConstructor
  DistrictSearch: AMapConstructor<AMapDistrictSearchLike>
  Map: AMapMapConstructor
  MouseTool: AMapMouseToolConstructor
  Polygon: AMapOverlayConstructor
  PolygonEditor: AMapEditorConstructor
  Rectangle: AMapOverlayConstructor
  RectangleEditor: AMapEditorConstructor
  Scale: AMapConstructor<unknown>
  Text: AMapOverlayConstructor
  ToolBar: AMapConstructor<unknown>
}

export class AMapConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AMapConfigurationError'
  }
}

let sdkPromise: Promise<AMapRuntime> | undefined

interface AMapLoaderBridge {
  load(options: {
    key: string
    version: string
    plugins: string[]
  }): Promise<unknown>
  reset?: () => void
}

const loader = AMapLoader as unknown as AMapLoaderBridge

function readConfiguration() {
  const key = import.meta.env.VITE_AMAP_KEY?.trim()
  const securityJsCode = import.meta.env.VITE_AMAP_SECURITY_JS_CODE?.trim()
  const serviceHost = import.meta.env.VITE_AMAP_SERVICE_HOST?.trim()

  if (!key) {
    throw new AMapConfigurationError(
      '未配置高德地图 Key，请在 .env.local 中设置 VITE_AMAP_KEY。',
    )
  }

  if (!securityJsCode && !serviceHost) {
    throw new AMapConfigurationError(
      '未配置高德地图安全验证，请设置 VITE_AMAP_SECURITY_JS_CODE 或 VITE_AMAP_SERVICE_HOST。',
    )
  }

  return { key, securityJsCode, serviceHost }
}

function configureSecurity(securityJsCode?: string, serviceHost?: string) {
  window._AMapSecurityConfig = {
    ...(securityJsCode ? { securityJsCode } : {}),
    ...(serviceHost ? { serviceHost } : {}),
  }
}

export function resetAmapLoader() {
  sdkPromise = undefined
  loader.reset?.()
}

export function useAmap() {
  async function loadAmap(): Promise<AMapRuntime> {
    if (!sdkPromise) {
      try {
        const { key, securityJsCode, serviceHost } = readConfiguration()
        configureSecurity(securityJsCode, serviceHost)
        sdkPromise = loader.load({
          key,
          version: '2.0',
          plugins: [...AMAP_PLUGINS],
        }).then((runtime) => runtime as unknown as AMapRuntime)
      }
      catch (error) {
        sdkPromise = undefined
        throw error
      }
    }

    try {
      return await sdkPromise
    }
    catch (error) {
      sdkPromise = undefined
      throw error
    }
  }

  return { loadAmap, resetAmapLoader }
}
