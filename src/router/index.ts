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
          meta: { title: '数据看板', sectionTitle: '运营管理' },
        },
        {
          path: 'operations/data-screen',
          name: 'data-screen',
          component: () => import('@/views/EmptyRouteView.vue'),
          meta: { title: '数据大屏', sectionTitle: '运营管理' },
        },
        {
          path: 'operations/data-dashboard',
          redirect: { name: 'data-dashboard' },
        },
        {
          path: 'area-control',
          name: 'area-control',
          component: () => import('@/views/AreaControlView.vue'),
          meta: { title: '交通管制', sectionTitle: '运营管理' },
        },
        {
          path: 'parking-management',
          name: 'parking-management',
          component: () => import('@/views/ParkingManagementView.vue'),
          meta: { title: '停车区管理', sectionTitle: '场地管理' },
        },
        {
          path: 'ticket-gates',
          name: 'ticket-gate-management',
          component: () => import('@/views/TicketGateManagementView.vue'),
          meta: { title: '检票口管理', sectionTitle: '场地管理' },
        },
        {
          path: 'shuttle-points',
          name: 'shuttle-point-management',
          component: () => import('@/views/ShuttlePointManagementView.vue'),
          meta: { title: '接驳车管理', sectionTitle: '场地管理' },
        },
        {
          path: 'seats',
          name: 'seat-management',
          component: () => import('@/views/SeatManagementView.vue'),
          meta: { title: '座位规划管理', sectionTitle: '场地管理' },
        },
        {
          path: 'operations/content',
          name: 'content-management',
          component: () => import('@/views/ContentManagementView.vue'),
          meta: { title: '内容管理', sectionTitle: '运营管理' },
        },
        {
          path: 'system',
          redirect: { name: 'user-management' },
        },
        {
          path: 'system/users',
          name: 'user-management',
          component: () => import('@/views/UserManagementView.vue'),
          meta: { title: '用户管理', sectionTitle: '系统管理' },
        },
        {
          path: 'system/roles',
          name: 'role-management',
          component: () => import('@/views/RoleManagementView.vue'),
          meta: { title: '角色管理', sectionTitle: '系统管理' },
        },
        {
          path: 'system/external-data',
          name: 'external-data-integration',
          component: () => import('@/views/EmptyRouteView.vue'),
          meta: { title: '外部数据对接', sectionTitle: '系统管理' },
        },
        {
          path: 'system/operation-logs',
          name: 'operation-logs',
          component: () => import('@/views/OperationLogView.vue'),
          meta: { title: '操作日志', sectionTitle: '系统管理' },
        },
        {
          path: 'system/user-services',
          name: 'user-service-management',
          component: () => import('@/views/UserServiceManagementView.vue'),
          meta: { title: '用户服务管理', sectionTitle: '系统管理' },
        },
        {
          path: 'system/permissions',
          redirect: { name: 'role-management' },
        },
      ],
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      redirect: () => {
        const authStore = useAuthStore(pinia)
        return authStore.isAuthenticated ? { name: 'data-dashboard' } : { name: 'login' }
      },
    },
  ],
})

router.beforeEach((to) => {
  pageProgress.start()
  const authStore = useAuthStore(pinia)

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  if (to.meta.guestOnly && authStore.isAuthenticated) {
    return { name: 'data-dashboard' }
  }

  document.title = `${String(to.meta.title ?? '智慧管理')}｜株洲体育中心智慧管理平台`
  return true
})

router.afterEach(() => pageProgress.finish())
router.onError(() => pageProgress.finish())
