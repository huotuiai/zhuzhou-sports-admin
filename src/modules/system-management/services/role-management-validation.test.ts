import type { SystemPermission } from '../types'
import { describe, expect, it } from 'vitest'
import {
  validateRoleBasicInfoInput,
  validateRoleCreateInput,
  validateRolePermissionInput,
} from './role-management-validation'

const permissions: SystemPermission[] = [
  { id: '1', parentId: null, name: '系统管理', code: 'system', type: 'group', sort: 1 },
  { id: '2', parentId: '1', name: '角色管理', code: 'system:role', type: 'page', sort: 1 },
  { id: '3', parentId: '2', name: '新增角色', code: 'system:role:create', type: 'action', sort: 1 },
]

describe('dynamic role validation', () => {
  it('validates permissions against the API menu tree', () => {
    const issues = validateRoleCreateInput(
      { name: ' 场馆运营 ', description: '', permissionIds: ['1', '2'] },
      permissions,
    )
    expect(issues).toEqual([
      expect.objectContaining({ field: 'permissionIds', code: 'required' }),
    ])
  })

  it('rejects stale menu IDs and accepts a selected dynamic action', () => {
    expect(validateRolePermissionInput({ permissionIds: ['404'] }, permissions)).toEqual([
      expect.objectContaining({ code: 'not_found' }),
    ])
    expect(validateRolePermissionInput({ permissionIds: ['1', '2', '3'] }, permissions)).toEqual([])
  })

  it('validates role text without requiring a role list', () => {
    expect(validateRoleBasicInfoInput({ name: '场馆运营', description: '' })).toEqual([])
    expect(validateRoleCreateInput({ name: '场馆运营', description: '', permissionIds: ['1', '2', '3'] }, permissions)).toEqual([])
    expect(validateRoleBasicInfoInput({ name: ' ', description: '' })).toEqual([
      expect.objectContaining({ field: 'name', code: 'required' }),
    ])
  })
})
