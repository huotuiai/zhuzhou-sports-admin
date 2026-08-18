import * as AMapLoader from '@amap/amap-jsapi-loader'

export type AMapEventHandler = (event: unknown) => void

export interface AMapEventTarget {
  on(eventName: string, handler: AMapEventHandler): void
  off(eventName: string, handler: AMapEventHandler): void
}

export interface AMapLngLatLike {
  getLng(): number
  getLat(): number
}

export interface AMapBoundsLike {
  getSouthWest(): AMapLngLatLike
  getNorthEast(): AMapLngLatLike
}

export interface AMapOverlayLike extends AMapEventTarget {
  getBounds?(): AMapBoundsLike
  getCenter?(): AMapLngLatLike
  getPath?(): AMapLngLatLike[] | AMapLngLatLike[][]
  getPosition?(): AMapLngLatLike
  getRadius?(): number
  setBounds?(bounds: AMapBoundsLike): void
  setCenter?(center: readonly [number, number]): void
  setContent?(content: HTMLElement | string): void
  setOptions(options: Record<string, unknown>): void
  setPath?(path: readonly (readonly [number, number])[]): void
  setPosition?(position: readonly [number, number]): void
  setRadius?(radius: number): void
}

export interface AMapMapLike {
  add(overlays: AMapOverlayLike | readonly AMapOverlayLike[]): void
  addControl(control: unknown): void
  destroy(): void
  remove(overlays: AMapOverlayLike | readonly AMapOverlayLike[]): void
  resize?(): void
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
  circle(options: Record<string, unknown>): void
  close(removeOverlay?: boolean): void
  polygon(options: Record<string, unknown>): void
  rectangle(options: Record<string, unknown>): void
}

export interface AMapEditorLike extends AMapEventTarget {
  close(): void
  open(): void
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
  new(southWest: readonly [number, number], northEast: readonly [number, number]): AMapBoundsLike
}

export interface AMapRuntime {
  Bounds: AMapBoundsConstructor
  Circle: AMapOverlayConstructor
  CircleEditor: AMapEditorConstructor
  Map: AMapMapConstructor
  Marker: AMapOverlayConstructor
  MouseTool: AMapMouseToolConstructor
  Polygon: AMapOverlayConstructor
  PolygonEditor: AMapEditorConstructor
  Polyline: AMapOverlayConstructor
  Rectangle: AMapOverlayConstructor
  RectangleEditor: AMapEditorConstructor
  Scale: AMapConstructor<unknown>
  Text: AMapOverlayConstructor
  ToolBar: AMapConstructor<unknown>
}

interface AMapLoaderBridge {
  load(options: { key: string, version: string, plugins: string[] }): Promise<unknown>
  reset?: () => void
}

const loader = AMapLoader as unknown as AMapLoaderBridge

export class AMapConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AMapConfigurationError'
  }
}

function readConfiguration() {
  const key = import.meta.env.VITE_AMAP_KEY?.trim()
  const securityJsCode = import.meta.env.VITE_AMAP_SECURITY_JS_CODE?.trim()
  const serviceHost = import.meta.env.VITE_AMAP_SERVICE_HOST?.trim()
  if (!key) throw new AMapConfigurationError('未配置高德地图 Key，请在 .env.local 中设置 VITE_AMAP_KEY。')
  if (!securityJsCode && !serviceHost) {
    throw new AMapConfigurationError('未配置高德地图安全验证，请设置 VITE_AMAP_SECURITY_JS_CODE 或 VITE_AMAP_SERVICE_HOST。')
  }
  return { key, securityJsCode, serviceHost }
}

export async function loadAmap(plugins: readonly string[] = []): Promise<AMapRuntime> {
  const { key, securityJsCode, serviceHost } = readConfiguration()
  window._AMapSecurityConfig = {
    ...(securityJsCode ? { securityJsCode } : {}),
    ...(serviceHost ? { serviceHost } : {}),
  }
  return loader.load({ key, version: '2.0', plugins: [...new Set(plugins)] }) as Promise<AMapRuntime>
}

export function resetAmapLoader(): void {
  loader.reset?.()
}

export function toLngLatTuple(point: { lng: number, lat: number }): readonly [number, number] {
  return [point.lng, point.lat]
}

