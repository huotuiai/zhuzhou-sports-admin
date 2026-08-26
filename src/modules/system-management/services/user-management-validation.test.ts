import type {
  SystemDepartment,
  SystemRole,
  SystemUser,
  UserManagementValidationContext,
} from '../types'
import { describe, expect, it } from 'vitest'
import {
  validateDepartmentInput,
  validateUserBasicInfoInput,
  validateUserCreateInput,
  validateUserPasswordResetInput,
} from './user-management-validation'

const timestamp = '2026-08-26T00:00:00.000Z'

function user(overrides: Partial<SystemUser> = {}): SystemUser {
  return {
    id: '1', username: 'venue_user', name: '场馆用户', phone: '', departmentIds: ['10'], roleIds: ['20'],
    status: 'enabled', builtIn: false, mustChangePassword: false, passwordUpdatedAt: timestamp,
    lastLoginAt: null, lockedAt: null, createdAt: timestamp, updatedAt: timestamp, ...overrides,
  }
}

function department(id: string, overrides: Partial<SystemDepartment> = {}): SystemDepartment {
  return {
    id, parentId: null, name: `部门 ${id}`, ownerUserId: null, sort: 10, status: 'enabled',
    createdAt: timestamp, updatedAt: timestamp, ...overrides,
  }
}

function role(): SystemRole {
  return {
    id: '20', name: '场馆运营', kind: 'custom', permissionIds: [], description: '',
    createdAt: timestamp, updatedAt: timestamp,
  }
}

function context(): UserManagementValidationContext {
  return {
    users: [user()],
    departments: [department('10'), department('11', { parentId: '10' })],
    roles: [role()],
  }
}

describe('user management validation', () => {
  it('validates API-aligned username, password, phone and real relations', () => {
    const issues = validateUserCreateInput({
      username: 'venue_user', name: '新用户', phone: '123', departmentIds: ['404'], roleIds: ['404'],
      password: '12345678', confirmPassword: 'different',
    }, context())

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'username', code: 'duplicate' }),
      expect.objectContaining({ field: 'phone', code: 'invalid' }),
      expect.objectContaining({ field: 'departmentIds', code: 'not_found' }),
      expect.objectContaining({ field: 'roleIds', code: 'not_found' }),
      expect.objectContaining({ field: 'password', code: 'invalid' }),
      expect.objectContaining({ field: 'confirmPassword', code: 'invalid' }),
    ]))
  })

  it('allows an existing disabled department during edit but blocks a new disabled assignment', () => {
    const validationContext = context()
    validationContext.departments[0]!.status = 'disabled'
    const current = validationContext.users[0]!
    const input = { name: '场馆用户', phone: '', departmentIds: ['10'], roleIds: ['20'], status: 'enabled' as const }

    expect(validateUserBasicInfoInput(input, validationContext, current)).toEqual([])
    expect(validateUserCreateInput({
      username: 'new_user', name: '新用户', phone: '', departmentIds: ['10'], roleIds: ['20'],
      password: 'Admin1234', confirmPassword: 'Admin1234',
    }, validationContext)).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'departmentIds', code: 'invalid' }),
    ]))
  })

  it('validates password reset rules independently', () => {
    expect(validateUserPasswordResetInput({ password: 'Admin1234', confirmPassword: 'Admin1234' })).toEqual([])
    expect(validateUserPasswordResetInput({ password: 'short', confirmPassword: '' })).toHaveLength(2)
  })

  it('validates department duplicates, cycles, leaders and sorting against real data', () => {
    const validationContext = context()
    const issues = validateDepartmentInput({
      parentId: '11', name: '部门 10', ownerUserId: '404', sort: 10000, status: 'enabled',
    }, validationContext, '10')

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'parentId', code: 'invalid' }),
      expect.objectContaining({ field: 'ownerUserId', code: 'not_found' }),
      expect.objectContaining({ field: 'sort', code: 'invalid' }),
    ]))
  })
})
