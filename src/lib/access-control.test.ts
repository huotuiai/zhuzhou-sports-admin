import type { AuthMenu } from '@/types/auth'
import { describe, expect, it } from 'vitest'
import {
  buildAuthorizedNavigation,
  canAccessPath,
  effectivePermissionCodes,
  firstAccessibleRoute,
  hasPermission,
  navigationBreadcrumbs,
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

  it('groups the legacy dashboard for display without adding permissions or changing API menus', () => {
    const menus = [
      ...baseMenus,
      menu({ id: '11', name: '导出', menuType: 3, parentId: '10', permission: 'dashboard:export', visible: false }),
      menu({ id: '13', name: '数据大屏', menuType: 2, parentId: '1', path: '/operations/data-screen', permission: 'dashboard:view', sortOrder: 20 }),
    ]
    const before = structuredClone(menus)
    const context = { menus, isSuper: false }
    const navigation = buildAuthorizedNavigation(context)
    expect(navigation[1]?.items).toMatchObject([
      { kind: 'directory', label: '数据展示', children: [
        { kind: 'page', label: '运营数据', path: '/', permission: 'dashboard:view' },
        { kind: 'page', label: '安保数据', path: '/operations/security-data', authorizationPath: '/' },
      ] },
      { kind: 'page', label: '数据大屏', path: '/operations/data-screen' },
    ])
    expect(navigationBreadcrumbs(navigation, 'data-dashboard')).toEqual(['运营管理', '数据展示', '运营数据'])
    expect(navigationBreadcrumbs(navigation, 'data-screen')).toEqual(['运营管理', '数据大屏'])
    expect(navigationBreadcrumbs(navigation, 'security-data')).toEqual(['运营管理', '数据展示', '安保数据'])
    expect(menus).toEqual(before)
    expect(canAccessPath(context, '/')).toBe(true)
    expect(hasPermission(context, 'dashboard:export')).toBe(true)
    expect(hasPermission(context, 'security:view')).toBe(false)
    expect(canAccessPath(context, '/operations/security-data')).toBe(true)
    expect(canAccessPath({ ...context, isSuper: true }, '/operations/security-data')).toBe(true)
    expect(effectivePermissionCodes(context)).toEqual(['dashboard:export', 'dashboard:view', 'gate:export', 'gate:operate', 'gate:view'])
  })

  it('does not infer dashboard access from the data screen shared permission', () => {
    const context = { isSuper: false, menus: [
      baseMenus[0]!,
      menu({ id: '13', name: '数据大屏', menuType: 2, parentId: '1', path: '/operations/data-screen', permission: 'dashboard:view' }),
    ] }
    expect(buildAuthorizedNavigation(context)[0]?.items).toMatchObject([{ kind: 'page', label: '数据大屏' }])
    expect(buildAuthorizedNavigation(context)[0]?.items).toHaveLength(1)
    expect(canAccessPath(context, '/')).toBe(false)
    expect(canAccessPath(context, '/operations/security-data')).toBe(false)
    expect(canAccessPath({ ...context, isSuper: true }, '/operations/security-data')).toBe(false)
    expect(firstAccessibleRoute(context)).toEqual({ name: 'data-screen' })
  })

  it.each(['missing', 'disabled', 'hidden', 'mismatched'] as const)('does not show a derived security entry for a %s dashboard', (state) => {
    let menus = baseMenus
    if (state === 'missing') menus = menus.filter(item => item.id !== '10')
    else menus = menus.map(item => item.id === '10' ? {
      ...item,
      enabled: state !== 'disabled',
      visible: state !== 'hidden',
      permission: state === 'mismatched' ? 'different:view' : item.permission,
    } : item)
    expect(buildAuthorizedNavigation({ menus, isSuper: false }).map(group => group.id)).toEqual(['2'])
    expect(canAccessPath({ menus, isSuper: false }, '/operations/security-data')).toBe(state === 'hidden')
    if (state === 'missing' || state === 'disabled') {
      expect(canAccessPath({ menus, isSuper: true }, '/operations/security-data')).toBe(false)
    }
  })

  it('accepts real nested directories without adding a duplicate display group', () => {
    const context = { isSuper: false, menus: [
      menu({ id: '1', name: '运营管理', menuType: 1, parentId: '0' }),
      menu({ id: '150', name: '数据展示', menuType: 1, parentId: '1', sortOrder: 10 }),
      menu({ id: '10', name: '运营数据', menuType: 2, parentId: '150', path: '/', permission: 'dashboard:view' }),
      menu({ id: '11', name: '导出', menuType: 3, parentId: '10', permission: 'dashboard:export', visible: false }),
      menu({ id: '13', name: '数据大屏', menuType: 2, parentId: '1', path: '/operations/data-screen', permission: 'dashboard:view', sortOrder: 20 }),
    ] }
    const navigation = buildAuthorizedNavigation(context)
    expect(navigation).toHaveLength(1)
    expect(navigation[0]?.items).toMatchObject([
      { kind: 'directory', id: '150', label: '数据展示', children: [{ kind: 'page', label: '运营数据' }] },
      { kind: 'page', label: '数据大屏' },
    ])
    const directory = navigation[0]?.items[0]
    expect(directory?.kind === 'directory' && directory.children).toHaveLength(1)
    expect(canAccessPath(context, '/')).toBe(true)
    expect(canAccessPath(context, '/operations/security-data')).toBe(true)
    expect(hasPermission(context, 'dashboard:export')).toBe(true)
    expect(firstAccessibleRoute(context)).toEqual({ name: 'data-dashboard' })
    expect(navigationBreadcrumbs(navigation, 'data-dashboard')).toEqual(['运营管理', '数据展示', '运营数据'])
  })

  it('fails closed for disabled, missing or cyclic directory ancestors', () => {
    const root = menu({ id: '1', name: '运营管理', menuType: 1, parentId: '0' })
    const directory = menu({ id: '150', name: '数据展示', menuType: 1, parentId: '1' })
    const page = menu({ id: '10', name: '运营数据', menuType: 2, parentId: '150', path: '/', permission: 'dashboard:view' })
    const action = menu({ id: '11', name: '导出', menuType: 3, parentId: '10', permission: 'dashboard:export', visible: false })
    for (const menus of [
      [root, { ...directory, enabled: false }, page, action],
      [root, page, action],
      [{ ...root, parentId: '150' }, directory, page, action],
    ]) {
      const context = { menus, isSuper: false }
      expect(canAccessPath(context, '/')).toBe(false)
      expect(canAccessPath(context, '/operations/security-data')).toBe(false)
      expect(canAccessPath({ ...context, isSuper: true }, '/operations/security-data')).toBe(false)
      expect(hasPermission(context, 'dashboard:export')).toBe(false)
      expect(buildAuthorizedNavigation(context)).toEqual([])
      expect(firstAccessibleRoute(context)).toBeNull()
    }
  })

  it('keeps an early backend security menu behind the temporary source authorization', () => {
    const root = menu({ id: '1', name: '运营管理', menuType: 1, parentId: '0' })
    const security = menu({ id: '160', name: '安保数据', menuType: 2, parentId: '1', path: '/operations/security-data', permission: 'security:view', sortOrder: 1 })
    const screen = menu({ id: '13', name: '数据大屏', menuType: 2, parentId: '1', path: '/operations/data-screen', permission: 'dashboard:view', sortOrder: 20 })
    for (const isSuper of [false, true]) {
      const context = { menus: [root, security, screen], isSuper }
      expect(canAccessPath(context, '/operations/security-data')).toBe(false)
      expect(buildAuthorizedNavigation(context)[0]?.items).toMatchObject([{ kind: 'page', label: '数据大屏' }])
      expect(buildAuthorizedNavigation(context)[0]?.items).toHaveLength(1)
      expect(firstAccessibleRoute(context)).toEqual({ name: 'data-screen' })
    }

    const context = { menus: [root, security, baseMenus[2]!], isSuper: false }
    const navigation = buildAuthorizedNavigation(context)
    expect(canAccessPath(context, '/operations/security-data')).toBe(true)
    expect(navigation[0]?.items[0]).toMatchObject({ kind: 'page', label: '安保数据' })
    const displayDirectory = navigation[0]?.items[1]
    expect(displayDirectory?.kind === 'directory' && displayDirectory.children).toHaveLength(1)
  })

  it('shows one backend security entry in a real nested directory without mutating its menus', () => {
    const menus = [
      menu({ id: '1', name: '运营管理', menuType: 1, parentId: '0' }),
      menu({ id: '150', name: '数据展示', menuType: 1, parentId: '1' }),
      menu({ id: '10', name: '运营数据', menuType: 2, parentId: '150', path: '/', permission: 'dashboard:view', sortOrder: 1 }),
      menu({ id: '160', name: '安保数据', menuType: 2, parentId: '150', path: '/operations/security-data', permission: 'security:view', sortOrder: 2 }),
    ]
    const before = structuredClone(menus)
    const context = { menus, isSuper: false }
    const navigation = buildAuthorizedNavigation(context)
    expect(navigation[0]?.items).toHaveLength(1)
    expect(navigation[0]?.items[0]).toMatchObject({
      kind: 'directory', id: '150', children: [
        { kind: 'page', routeName: 'data-dashboard' },
        { kind: 'page', routeName: 'security-data' },
      ],
    })
    expect(navigationBreadcrumbs(navigation, 'security-data')).toEqual(['运营管理', '数据展示', '安保数据'])
    expect(menus).toEqual(before)
  })
})
