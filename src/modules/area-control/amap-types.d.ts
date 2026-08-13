/// <reference types="@amap/amap-jsapi-types" />

/**
 * The official AMap typings intentionally leave several optional plugins loose.
 * Keep the small bridge used by this module here instead of leaking `any` into
 * the map component.
 */
interface Window {
  _AMapSecurityConfig?: {
    securityJsCode?: string
    serviceHost?: string
  }
}
