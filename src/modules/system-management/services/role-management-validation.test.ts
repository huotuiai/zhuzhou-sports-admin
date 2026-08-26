import type { SystemPermission, SystemRole } from '../types'
import { describe, expect, it } from 'vitest'
import {
  validateRoleBasicInfoInput,
  validateRoleCreateInput,
  validateRolePermissionInput,
} from './role-management-validation'

const timestamp = '2026-08-26T00:00:00.000Z'
const permissions: SystemPermission[] = [
  { id: '1', parentId: null, name: '系统管理', code: 'system', type: 'group', sort: 1 },
  { id: '2', parentId: '1', name: '角色管理', code: 'system:role', type: 'page', sort: 1 },
  { id: '3', parentId: '2', name: '新增角色', code: 'system:role:create', type: 'action', sort: 1 },
]
const roles: SystemRole[] = [{
  id: '11', name: '场馆运营', kind: 'custom', permissionIds: ['1', '2', '3'], description: '',
  createdAt: timestamp, updatedAt: timestamp,
}]

describe('dynamic role validation', () => {
  it('validates duplicate names against API roles and permissions against the API menu tree', () => {
    const issues = validateRoleCreateInput(
      { name: ' 场馆运营 ', description: '', permissionIds: ['1', '2'] },
      roles,
      permissions,
    )
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'name', code: 'duplicate' }),
      expect.objectContaining({ field: 'permissionIds', code: 'required' }),
    ]))
  })

  it('rejects stale menu IDs and accepts a selected dynamic action', () => {
    expect(validateRolePermissionInput({ permissionIds: ['404'] }, permissions)).toEqual([
      expect.objectContaining({ code: 'not_found' }),
    ])
    expect(validateRolePermissionInput({ permissionIds: ['1', '2', '3'] }, permissions)).toEqual([])
  })

  it('excludes the edited role itself from duplicate-name validation', () => {
    expect(validateRoleBasicInfoInput({ name: '场馆运营', description: '' }, roles, '11')).toEqual([])
  })
})
