// @vitest-environment jsdom
import type { App } from 'vue'
import type { AMapEventHandler, AMapRuntime } from './amap-runtime'
import type { MapGeometry } from './types'
import { createApp, h, nextTick, shallowRef } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AMapGeometryEditor from './AMapGeometryEditor.vue'
import { loadAmap } from './amap-runtime'

vi.mock('./amap-runtime', async (importOriginal) => ({
  ...await importOriginal<typeof import('./amap-runtime')>(),
  loadAmap: vi.fn(),
}))

const polygon: MapGeometry = {
  type: 'polygon',
  path: [
    { lng: 113.1, lat: 27.84 },
    { lng: 113.11, lat: 27.84 },
    { lng: 113.11, lat: 27.85 },
  ],
}

function eventTarget() {
  const listeners = new Map<string, AMapEventHandler>()
  return {
    listeners,
    on: vi.fn((event: string, handler: AMapEventHandler) => listeners.set(event, handler)),
    off: vi.fn((event: string) => listeners.delete(event)),
  }
}

function createRuntime() {
  const map = {
    add: vi.fn(),
    addControl: vi.fn(),
    destroy: vi.fn(),
    remove: vi.fn(),
    resize: vi.fn(),
    setCenter: vi.fn(),
    setFitView: vi.fn(),
    setMapStyle: vi.fn(),
    setZoom: vi.fn(),
  }
  const mouseTool = {
    ...eventTarget(),
    polygon: vi.fn(),
    rectangle: vi.fn(),
    circle: vi.fn(),
    close: vi.fn(),
  }
  const editor = { ...eventTarget(), open: vi.fn(), close: vi.fn() }
  const makeOverlay = (options: { path?: Array<[number, number]> } = {}) => ({
    ...eventTarget(),
    setOptions: vi.fn(),
    getPath: () => (options.path ?? []).map(([lng, lat]) => ({
      getLng: () => lng,
      getLat: () => lat,
    })),
  })
  const runtime = {
    Map: vi.fn(function () { return map }),
    MouseTool: vi.fn(function () { return mouseTool }),
    Polygon: vi.fn(function (options) { return makeOverlay(options) }),
    PolygonEditor: vi.fn(function () { return editor }),
    RectangleEditor: vi.fn(function () { return editor }),
    CircleEditor: vi.fn(function () { return editor }),
  } as unknown as AMapRuntime
  return { runtime, map, mouseTool, editor, makeOverlay }
}

const mounted: Array<{ app: App, host: HTMLDivElement }> = []

async function settle() {
  await Promise.resolve()
  await nextTick()
  await nextTick()
}

function mountEditor(initialGeometry: MapGeometry | null = null, disabled = false) {
  const fixture = createRuntime()
  let resolveLoad!: (runtime: AMapRuntime) => void
  let rejectLoad!: (error: Error) => void
  vi.mocked(loadAmap).mockReturnValueOnce(new Promise((resolve, reject) => {
    resolveLoad = resolve
    rejectLoad = reject
  }))
  const model = shallowRef(initialGeometry)
  const updates = vi.fn((geometry: MapGeometry | null) => { model.value = geometry })
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({
    setup: () => () => h(AMapGeometryEditor, {
      modelValue: model.value,
      disabled,
      'onUpdate:modelValue': updates,
    }),
  })
  app.mount(host)
  mounted.push({ app, host })

  return {
    ...fixture,
    host,
    model,
    updates,
    rejectLoad,
    async ready() {
      resolveLoad(fixture.runtime)
      await settle()
    },
    async click(label: string) {
      const button = Array.from(host.querySelectorAll('button')).find(button => button.textContent?.trim() === label)
      if (!button) throw new Error(`Button not found: ${label}`)
      button.click()
      await settle()
    },
  }
}

describe('AMapGeometryEditor drawing initialization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('ResizeObserver', class {
      observe = vi.fn()
      disconnect = vi.fn()
    })
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })

  afterEach(() => {
    for (const { app, host } of mounted.splice(0)) {
      app.unmount()
      host.remove()
    }
    vi.unstubAllGlobals()
  })

  it('starts the default polygon only after the map becomes ready and saves a completed drawing', async () => {
    const fixture = mountEditor()
    await settle()
    expect(fixture.mouseTool.polygon).not.toHaveBeenCalled()

    await fixture.ready()
    expect(fixture.mouseTool.polygon).toHaveBeenCalledOnce()
    expect(fixture.host.textContent).toContain('正在绘制多边形')

    const drawn = fixture.makeOverlay({ path: [[113.1, 27.84], [113.11, 27.84], [113.11, 27.85]] })
    fixture.mouseTool.listeners.get('draw')?.({ obj: drawn })
    await settle()

    expect(fixture.model.value).toEqual(polygon)
    expect(fixture.updates).toHaveBeenCalledOnce()
    expect(fixture.mouseTool.close).toHaveBeenCalledWith(false)
    expect(fixture.editor.open).toHaveBeenCalledOnce()
    expect(fixture.host.textContent).not.toContain('正在绘制')
  })

  it('opens an existing region for editing without starting a replacement drawing', async () => {
    const fixture = mountEditor(polygon)
    await fixture.ready()

    expect(fixture.mouseTool.polygon).not.toHaveBeenCalled()
    expect(fixture.editor.open).toHaveBeenCalledOnce()
    expect(fixture.map.add).toHaveBeenCalledOnce()
    expect(fixture.model.value).toEqual(polygon)
    expect(fixture.updates).not.toHaveBeenCalled()
    expect(fixture.host.textContent).not.toContain('正在绘制')
  })

  it('switches from the default polygon to rectangle and circle drawing', async () => {
    const fixture = mountEditor()
    await fixture.ready()

    await fixture.click('矩形')
    expect(fixture.mouseTool.rectangle).toHaveBeenCalledOnce()
    expect(fixture.host.textContent).toContain('正在绘制矩形')

    await fixture.click('圆形')
    expect(fixture.mouseTool.circle).toHaveBeenCalledOnce()
    expect(fixture.mouseTool.close).toHaveBeenCalledWith(true)
    expect(fixture.host.textContent).toContain('正在绘制圆形')
    expect(fixture.updates).not.toHaveBeenCalled()
  })

  it('uses a type chosen before readiness and clears the temporary not-ready error', async () => {
    const fixture = mountEditor()
    await fixture.click('矩形')
    expect(fixture.host.textContent).toContain('地图尚未就绪')

    await fixture.ready()
    expect(fixture.mouseTool.rectangle).toHaveBeenCalledOnce()
    expect(fixture.mouseTool.polygon).not.toHaveBeenCalled()
    expect(fixture.host.textContent).toContain('正在绘制矩形')
    expect(fixture.host.textContent).not.toContain('地图尚未就绪')
  })

  it('ends automatic drawing when coordinates are imported and edits the imported region', async () => {
    const fixture = mountEditor()
    await fixture.ready()

    const textarea = fixture.host.querySelector('textarea')!
    textarea.value = '[[113.1,27.84],[113.11,27.84],[113.11,27.85]]'
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    await settle()
    await fixture.click('导入坐标')

    expect(fixture.model.value).toEqual(polygon)
    expect(fixture.mouseTool.close).toHaveBeenCalledWith(true)
    expect(fixture.editor.open).toHaveBeenCalledOnce()
    expect(fixture.host.textContent).not.toContain('正在绘制')

    fixture.mouseTool.listeners.get('draw')?.({ obj: fixture.makeOverlay() })
    await settle()
    expect(fixture.updates).toHaveBeenCalledOnce()
    expect(fixture.model.value).toEqual(polygon)
  })

  it('allows Escape to cancel the automatic drawing and redraw to restart it', async () => {
    const fixture = mountEditor()
    await fixture.ready()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }))
    await settle()
    expect(fixture.host.textContent).not.toContain('正在绘制')
    expect(fixture.mouseTool.close).toHaveBeenCalledWith(true)
    expect(fixture.updates).not.toHaveBeenCalled()

    await fixture.click('重绘')
    expect(fixture.mouseTool.polygon).toHaveBeenCalledTimes(2)
    expect(fixture.host.textContent).toContain('正在绘制多边形')
  })

  it('starts default drawing after retrying an initial map load failure', async () => {
    const fixture = mountEditor()
    await settle()
    fixture.rejectLoad(new Error('地图加载失败'))
    await settle()
    expect(fixture.mouseTool.polygon).not.toHaveBeenCalled()

    vi.mocked(loadAmap).mockResolvedValueOnce(fixture.runtime)
    await fixture.click('重新加载')
    expect(fixture.mouseTool.polygon).toHaveBeenCalledOnce()
    expect(fixture.host.textContent).toContain('正在绘制多边形')
  })

  it('does not start automatic drawing when disabled', async () => {
    const fixture = mountEditor(null, true)
    await fixture.ready()

    expect(fixture.mouseTool.polygon).not.toHaveBeenCalled()
    expect(fixture.host.textContent).not.toContain('正在绘制')
  })
})
