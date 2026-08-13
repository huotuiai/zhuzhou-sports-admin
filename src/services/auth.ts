import type { AuthCredentials, AuthService, AuthSession } from '@/types/auth'
import { createClientId } from '@/lib/id'

const DEMO_USERNAME = 'admin'
const DEMO_PASSWORD = '123456'

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds))
}

export const mockAuthService: AuthService = {
  async login(credentials: AuthCredentials): Promise<AuthSession> {
    await wait(650)

    if (credentials.username !== DEMO_USERNAME || credentials.password !== DEMO_PASSWORD) {
      throw new Error('账号或密码不正确，请核对后重试')
    }

    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString()

    return {
      token: `demo-${createClientId()}`,
      expiresAt,
      user: {
        id: 'u-001',
        name: '平台管理员',
        username: DEMO_USERNAME,
      },
    }
  },

  async logout() {
    await wait(150)
  },
}
