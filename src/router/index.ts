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
          name: 'home',
          component: () => import('@/views/HomeView.vue'),
          meta: { title: '首页' },
        },
        {
          path: 'area-control',
          name: 'area-control',
          component: () => import('@/views/AreaControlView.vue'),
          meta: { title: '管制区域', sectionTitle: '应用管理' },
        },
        {
          path: 'parking-management',
          name: 'parking-management',
          component: () => import('@/views/ParkingManagementView.vue'),
          meta: { title: '停车场列表', sectionTitle: '应用管理' },
        },
        {
          path: 'ticket-gates',
          name: 'ticket-gate-management',
          component: () => import('@/views/TicketGateManagementView.vue'),
          meta: { title: '检票口管理', sectionTitle: '应用管理' },
        },
        {
          path: 'shuttle-points',
          name: 'shuttle-point-management',
          component: () => import('@/views/ShuttlePointManagementView.vue'),
          meta: { title: '接驳点管理', sectionTitle: '应用管理' },
        },
        {
          path: 'seats',
          name: 'seat-management',
          component: () => import('@/views/SeatManagementView.vue'),
          meta: { title: '座位管理', sectionTitle: '应用管理' },
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
          path: 'system/permissions',
          name: 'permission-management',
          component: () => import('@/views/PermissionManagementView.vue'),
          meta: { title: '权限管理', sectionTitle: '系统管理' },
        },
      ],
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      redirect: () => {
        const authStore = useAuthStore(pinia)
        return authStore.isAuthenticated ? { name: 'home' } : { name: 'login' }
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
    return { name: 'home' }
  }

  document.title = `${String(to.meta.title ?? '智慧管理')}｜株洲体育中心智慧管理平台`
  return true
})

router.afterEach(() => pageProgress.finish())
router.onError(() => pageProgress.finish())
