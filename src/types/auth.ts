export interface AuthCredentials {
  username: string
  password: string
}

export type AuthUserStatus = 0 | 1 | 2

export interface AuthUser {
  id: string
  name: string
  username: string
  displayName?: string | null
  mobile?: string | null
  email?: string | null
  avatarUrl?: string | null
  isSuper?: boolean
  status?: AuthUserStatus
  loginFailCount?: number
  mustChangePassword?: boolean
  lastLoginAt?: string | null
  remark?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

export type AuthMenuType = 1 | 2 | 3

export interface AuthMenu {
  id: string
  parentId: string | null
  name: string
  menuType: AuthMenuType
  path: string | null
  component: string | null
  permission: string | null
  icon: string | null
  sortOrder: number
  visible: boolean
  enabled: boolean
  remark: string | null
}

export interface AuthProfile {
  user: AuthUser
  roleIds: string[]
  roleCodes: string[]
  menus: AuthMenu[]
}

export interface AuthSession extends AuthProfile {
  accessToken: string
  tokenType: string
  expiresAt: string
}

export interface AuthService {
  login(credentials: AuthCredentials): Promise<AuthSession>
  getProfile(): Promise<AuthProfile>
  refresh(currentSession: AuthSession): Promise<AuthSession>
  logout(): Promise<void>
}
