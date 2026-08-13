import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ThemeMode = 'dark' | 'light'

const THEME_KEY = 'zz-sports-theme'

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'dark' || value === 'light'
}

export const useThemeStore = defineStore('theme', () => {
  const mode = ref<ThemeMode>('dark')

  function applyTheme() {
    const isDark = mode.value === 'dark'
    document.documentElement.classList.toggle('dark', isDark)
    document.documentElement.style.colorScheme = mode.value
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      'content',
      isDark ? '#020617' : '#f8fafc',
    )
  }

  function initialize() {
    const savedTheme = localStorage.getItem(THEME_KEY)
    mode.value = isThemeMode(savedTheme) ? savedTheme : 'dark'
    applyTheme()
  }

  function setTheme(nextMode: ThemeMode) {
    mode.value = nextMode
    localStorage.setItem(THEME_KEY, nextMode)
    applyTheme()
  }

  function toggleTheme() {
    setTheme(mode.value === 'dark' ? 'light' : 'dark')
  }

  return { mode, initialize, setTheme, toggleTheme }
})
