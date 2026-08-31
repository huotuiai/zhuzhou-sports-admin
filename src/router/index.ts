import { createRouter, createWebHistory } from 'vue-router'
import { pinia } from '@/stores'
import { useAuthStore } from '@/stores/auth'
import { pageProgress } from '@/composables/use-page-progress'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { guestOnly: true, title: '登录' },
    },
    {
      path: '/',
      component: () => import('@/layouts/AdminLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          name: 'data-dashboard',
          component: () => import('@/views/DataDashboardView.vue'),
          meta: { title: '数据看板', sectionTitle: '运营管理', menuPath: '/', requiredPermission: 'dashboard:view' },
        },
        {
          path: 'operations/data-screen',
          name: 'data-screen',
          component: () => import('@/views/DataScreenView.vue'),
          meta: { title: '数据大屏', sectionTitle: '运营管理', menuPath: '/operations/data-screen', requiredPermission: 'dashboard:view' },
        },
        {
          path: 'operations/data-dashboard',
          redirect: { name: 'data-dashboard' },
        },
        {
          path: 'area-control',
          name: 'area-control',
          component: () => import('@/views/AreaControlView.vue'),
          meta: { title: '交通管制', sectionTitle: '运营管理', menuPath: '/area-control', requiredPermission: 'control:view' },
        },
        {
          path: 'parking-management',
          name: 'parking-management',
          component: () => import('@/views/ParkingManagementView.vue'),
          meta: { title: '停车区管理', sectionTitle: '场地管理', menuPath: '/parking-management', requiredPermission: 'parking:view' },
        },
        {
          path: 'ticket-gates',
          name: 'ticket-gate-management',
          component: () => import('@/views/TicketGateManagementView.vue'),
          meta: { title: '检票口管理', sectionTitle: '场地管理', menuPath: '/ticket-gates', requiredPermission: 'gate:view' },
        },
        {
          path: 'shuttle-points',
          name: 'shuttle-point-management',
          component: () => import('@/views/ShuttlePointManagementView.vue'),
          meta: { title: '接驳车管理', sectionTitle: '场地管理', menuPath: '/shuttle-points', requiredPermission: 'shuttle:view' },
        },
        {
          path: 'vr-links',
          name: 'vr-link-management',
          component: () => import('@/views/VrLinkManagementView.vue'),
          meta: { title: 'VR 地点绑定', sectionTitle: '场地管理', menuPath: '/vr-links', requiredPermission: 'vr:view' },
        },
        {
          path: 'seats',
          name: 'seat-management',
          component: () => import('@/views/SeatManagementView.vue'),
          meta: { title: '座位规划管理', sectionTitle: '场地管理', menuPath: '/seats', requiredPermission: 'seat:view' },
        },
        {
          path: 'operations/content',
          name: 'content-management',
          component: () => import('@/views/ContentManagementView.vue'),
          meta: { title: '内容管理', sectionTitle: '运营管理', menuPath: '/operations/content', requiredPermission: 'content:view' },
        },
        {
          path: 'system',
          name: 'system-entry',
          component: () => import('@/views/EmptyRouteView.vue'),
          meta: { title: '系统管理' },
        },
        {
          path: 'system/users',
          name: 'user-management',
          component: () => import('@/views/UserManagementView.vue'),
          meta: { title: '用户管理', sectionTitle: '系统管理', menuPath: '/system/users', requiredPermission: 'user:view' },
        },
        {
          path: 'system/roles',
          name: 'role-management',
          component: () => import('@/views/RoleManagementView.vue'),
          meta: { title: '角色管理', sectionTitle: '系统管理', menuPath: '/system/roles', requiredPermission: 'role:view' },
        },
        {
          path: 'system/external-data',
          name: 'external-data-integration',
          component: () => import('@/views/ExternalDataIntegrationView.vue'),
          meta: { title: '外部数据对接', sectionTitle: '系统管理', menuPath: '/system/external-data', requiredPermission: 'integration:view' },
        },
        {
          path: 'system/operation-logs',
          name: 'operation-logs',
          component: () => import('@/views/OperationLogView.vue'),
          meta: { title: '操作日志', sectionTitle: '系统管理', menuPath: '/system/operation-logs', requiredPermission: 'audit:view' },
        },
        {
          path: 'system/user-services',
          name: 'user-service-management',
          component: () => import('@/views/UserServiceManagementView.vue'),
          meta: { title: '用户服务管理', sectionTitle: '系统管理', menuPath: '/system/user-services', requiredPermission: 'service:view' },
        },
        {
          path: 'system/permissions',
          redirect: { name: 'role-management' },
        },
        {
          path: 'no-access',
          name: 'no-access',
          component: () => import('@/views/AccessDeniedView.vue'),
          meta: { title: '权限不足' },
        },
      ],
    },
    {
      path: '/resolve-access',
      name: 'access-fallback',
      component: () => import('@/views/EmptyRouteView.vue'),
      meta: { requiresAuth: true, title: '正在跳转' },
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      redirect: '/resolve-access',
    },
  ],
})

router.beforeEach(async (to) => {
  pageProgress.start()
  const authStore = useAuthStore(pinia)
  await authStore.initialize()

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  if (to.meta.guestOnly && authStore.isAuthenticated) {
    return authStore.firstAccessibleRoute ?? { name: 'no-access' }
  }

  if ((to.name === 'access-fallback' || to.name === 'system-entry') && authStore.isAuthenticated) {
    return authStore.firstAccessibleRoute ?? { name: 'no-access' }
  }

  const menuPath = typeof to.meta.menuPath === 'string' ? to.meta.menuPath : ''
  const requiredPermission = typeof to.meta.requiredPermission === 'string' ? to.meta.requiredPermission : ''
  const forbidden = Boolean(menuPath) && (!authStore.canAccessPath(menuPath) || (requiredPermission && !authStore.hasPermission(requiredPermission)))
  document.title = `${forbidden ? '权限不足' : String(to.meta.title ?? '智慧管理')}｜株洲体育中心智慧管理平台`
  return true
})

router.afterEach(() => pageProgress.finish())
router.onError(() => pageProgress.finish())
