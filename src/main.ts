import { createApp } from 'vue'
import App from '@/App.vue'
import { router } from '@/router'
import { pinia } from '@/stores'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'
import { configureHttpAuthHandlers } from '@/lib/http'
import { clearLegacyMockStorage } from '@/lib/legacy-mock-storage'
import 'vue-sonner/style.css'
import '@/style.css'

clearLegacyMockStorage()

const app = createApp(App)

app.use(pinia)
useThemeStore(pinia).initialize()
const authStore = useAuthStore(pinia)
configureHttpAuthHandlers({
  refresh: () => authStore.refresh(),
  onUnauthorized: () => {
    authStore.clearSession()
    const currentRoute = router.currentRoute.value
    if (currentRoute.name === 'login') return
    const redirect = currentRoute.fullPath
    window.setTimeout(() => {
      if (router.currentRoute.value.name === 'login') return
      void router.replace({ name: 'login', query: { redirect } }).catch(() => undefined)
    }, 0)
  },
})
app.use(router)
app.mount('#app')
