import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './i18n'
import './assets/globals.css'

// Initialize theme from localStorage
const savedTheme = localStorage.getItem('theme') || 'dark'
const isDark =
  savedTheme === 'dark' ||
  (savedTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
document.documentElement.classList.toggle('dark', isDark)
window.api?.setTitleBarTheme(isDark)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// Linux: force repaint when window regains visibility after desktop switch
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    document.body.style.display = 'none'
    void document.body.offsetHeight
    document.body.style.display = ''
  }
})
