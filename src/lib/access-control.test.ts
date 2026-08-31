import type { AuthMenu } from '@/types/auth'
import { describe, expect, it } from 'vitest'
import {
  buildAuthorizedNavigation,
  canAccessPath,
  effectivePermissionCodes,
  firstAccessibleRoute,
  hasPermission,
  normalizeMenuPath,
} from './access-control'

function menu(patch: Partial<AuthMenu> & Pick<AuthMenu, 'id' | 'name' | 'menuType'>): AuthMenu {
  return {
    parentId: null,
    path: null,
    component: null,
    permission: null,
    icon: null,
    sortOrder: 0,
    visible: true,
    enabled: true,
    remark: null,
    ...patch,
  }
}

const baseMenus: AuthMenu[] = [
  menu({ id: '1', name: '运营管理', menuType: 1, parentId: '0', sortOrder: 20 }),
  menu({ id: '2', name: '场地管理', menuType: 1, parentId: '0', sortOrder: 10 }),
  menu({ id: '10', name: '数据展示', menuType: 2, parentId: '1', path: '/', permission: 'dashboard:view', sortOrder: 10 }),
  menu({ id: '20', name: '检票口', menuType: 2, parentId: '2', path: '/ticket-gates', permission: 'gate:view', sortOrder: 20 }),
  menu({ id: '21', name: '操作', menuType: 3, parentId: '20', permission: 'gate:operate', visible: false }),
  menu({ id: '22', name: '导出', menuType: 3, parentId: '20', permission: 'gate:export', visible: false }),
]

describe('access control', () => {
  it('normalizes query strings, hashes and trailing slashes', () => {
    expect(normalizeMenuPath('/ticket-gates/?status=open#list')).toBe('/ticket-gates')
    expect(normalizeMenuPath('/')).toBe('/')
    expect(normalizeMenuPath('')).toBe('')
  })

  it('builds visible navigation with backend labels, grouping and ordering', () => {
    const navigation = buildAuthorizedNavigation({ menus: baseMenus, isSuper: false })
    expect(navigation.map(group => group.label)).toEqual(['场地管理', '运营管理'])
    expect(navigation[0]?.items[0]).toMatchObject({ label: '检票口', routeName: 'ticket-gate-management', permission: 'gate:view' })
    expect(firstAccessibleRoute({ menus: baseMenus, isSuper: false })).toEqual({ name: 'ticket-gate-management' })
  })

  it('keeps invisible action permissions effective while hiding invisible pages', () => {
    const menus = baseMenus.map(item => item.id === '20' ? { ...item, visible: false } : item)
    const context = { menus, isSuper: false }
    expect(effectivePermissionCodes(context)).toContain('gate:operate')
    expect(hasPermission(context, 'gate:export')).toBe(true)
    expect(canAccessPath(context, '/ticket-gates?status=open')).toBe(true)
    expect(buildAuthorizedNavigation(context).flatMap(group => group.items)).not.toContainEqual(expect.objectContaining({ path: '/ticket-gates' }))
  })

  it('disables descendants when an ancestor is disabled or missing', () => {
    const disabled = baseMenus.map(item => item.id === '2' ? { ...item, enabled: false } : item)
    expect(canAccessPath({ menus: disabled, isSuper: false }, '/ticket-gates')).toBe(false)
    expect(hasPermission({ menus: disabled, isSuper: false }, 'gate:operate')).toBe(false)

    const missingParent = baseMenus.filter(item => item.id !== '2')
    expect(canAccessPath({ menus: missingParent, isSuper: false }, '/ticket-gates')).toBe(false)

    const invalidActionParent = [
      ...baseMenus,
      menu({ id: '40', name: '非法操作', menuType: 3, parentId: '2', permission: 'parking:operate', visible: false }),
    ]
    expect(hasPermission({ menus: invalidActionParent, isSuper: false }, 'parking:operate')).toBe(false)
  })

  it('ignores unknown or mismatched page paths and fails closed for empty menus', () => {
    const menus = [
      ...baseMenus,
      menu({ id: '30', name: '未知页面', menuType: 2, parentId: '1', path: '/unknown', permission: 'dashboard:view' }),
    ]
    expect(canAccessPath({ menus, isSuper: false }, '/unknown')).toBe(false)
    expect(canAccessPath({ menus: baseMenus.map(item => item.id === '20' ? { ...item, permission: 'parking:view' } : item), isSuper: false }, '/ticket-gates')).toBe(false)
    expect(firstAccessibleRoute({ menus: [], isSuper: false })).toBeNull()
  })

  it('lets super users bypass permission strings but not disabled menu structure', () => {
    const mismatched = baseMenus.map(item => item.id === '20' ? { ...item, permission: null } : item)
    expect(canAccessPath({ menus: mismatched, isSuper: true }, '/ticket-gates')).toBe(true)
    expect(hasPermission({ menus: mismatched, isSuper: true }, 'gate:operate')).toBe(true)

    const disabled = mismatched.map(item => item.id === '2' ? { ...item, enabled: false } : item)
    expect(canAccessPath({ menus: disabled, isSuper: true }, '/ticket-gates')).toBe(false)
  })
})
