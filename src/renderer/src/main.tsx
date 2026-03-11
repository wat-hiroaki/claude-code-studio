import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './i18n'
import './assets/globals.css'

// Initialize dark mode
const savedTheme = localStorage.getItem('theme') || 'dark'
document.documentElement.classList.toggle('dark', savedTheme === 'dark')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
