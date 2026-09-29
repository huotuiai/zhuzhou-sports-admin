export const DATA_DISPLAY_LABEL = '数据展示'
export const OPERATIONS_DATA_LABEL = '运营数据'
export const SECURITY_DATA_LABEL = '安保数据'
export const SECURITY_DATA_PATH = '/operations/security-data'

/** Remove this mapping when the backend supplies independent security authorization. */
export const SECURITY_DATA_AUTHORIZATION_PATH = '/'

interface MenuPresentation {
  name: string
  menuType: number
  path: string | null
}

/** Identify the legacy page by its route, never by a deployment-specific ID or shared permission. */
export function isLegacyDataDisplayMenu(menu: MenuPresentation): boolean {
  return menu.menuType === 2 && menu.path?.split(/[?#]/u, 1)[0] === '/' &&
    (menu.name === '数据展示' || menu.name === '数据看板')
}

/** Display-only compatibility: keep the server's IDs, hierarchy and permissions intact. */
export function menuDisplayName(menu: MenuPresentation): string {
  return isLegacyDataDisplayMenu(menu) ? OPERATIONS_DATA_LABEL : menu.name
}
