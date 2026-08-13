export interface AuthCredentials {
  username: string
  password: string
}

export interface AuthUser {
  id: string
  name: string
  username: string
}

export interface AuthSession {
  token: string
  expiresAt: string
  user: AuthUser
}

export interface AuthService {
  login(credentials: AuthCredentials): Promise<AuthSession>
  logout(): Promise<void>
}
