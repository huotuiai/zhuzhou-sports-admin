import type { AuthorizedNavigationGroup, AuthorizedNavigationNode } from '@/config/navigation'
import type { AuthMenu } from '@/types/auth'
import { DATA_DISPLAY_LABEL, SECURITY_DATA_LABEL, SECURITY_DATA_PATH, isLegacyDataDisplayMenu } from '@/config/data-display'
import { navigationRegistrationForPath } from '@/config/navigation'

function containsSecurityPage(nodes: readonly AuthorizedNavigationNode[]): boolean {
  return nodes.some(node => node.kind === 'page' ? node.path === SECURITY_DATA_PATH :
    node.kind === 'directory' && containsSecurityPage(node.children))
}

/**
 * Temporary presentation adapter for the old menu API. It runs AFTER authorization
 * and never adds records to the session or the role permission catalog.
 * Once the backend supplies a nested directory, its tree passes through unchanged.
 */
export function adaptLegacyDataDisplayNavigation(
  groups: AuthorizedNavigationGroup[],
  menus: readonly AuthMenu[],
  canAccess: (path: string) => boolean,
): AuthorizedNavigationGroup[] {
  const securityRegistration = navigationRegistrationForPath(SECURITY_DATA_PATH)
  const addSecurityPage = securityRegistration && canAccess(SECURITY_DATA_PATH) &&
    !groups.some(group => containsSecurityPage(group.items))
  return groups.map(group => ({
    ...group,
    items: group.items.map((item) => {
      if (item.kind !== 'page' || item.path !== '/') return item
      const legacyPage = menus.find(menu => menu.parentId === group.id && isLegacyDataDisplayMenu(menu))
      if (!legacyPage) return item
      return {
        kind: 'directory',
        id: `presentation:data-display:${legacyPage.id}`,
        label: DATA_DISPLAY_LABEL,
        icon: item.icon,
        children: [item, ...(addSecurityPage ? [{
          ...securityRegistration,
          kind: 'page' as const,
          label: SECURITY_DATA_LABEL,
        }] : [])],
      }
    }),
  }))
}
