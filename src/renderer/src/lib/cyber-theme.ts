import { useState, useEffect } from 'react'
import { useAppStore } from '@stores/useAppStore'

export const cyberPaletteDark = {
  bg: '#09090b',
  accent: '#71717a',
  cyan: '#0ea5e9',
  green: '#10b981',
  orange: '#f59e0b',
  red: '#ef4444',
  purple: '#8b5cf6',
  gray: '#52525b',
  darkGray: '#18181b',
  textMain: '#fafafa',
  textMuted: '#a1a1aa',
  panelBg: 'rgba(9, 9, 11, 0.9)',
  panelBorder: 'rgba(82, 82, 91, 0.5)'
}

export type CyberPalette = typeof cyberPaletteDark

export const cyberPaletteLight = {
  bg: '#f8fafc',
  accent: '#64748b',
  cyan: '#0284c7',
  green: '#059669',
  orange: '#d97706',
  red: '#dc2626',
  purple: '#7c3aed',
  gray: '#94a3b8',
  darkGray: '#e2e8f0',
  textMain: '#0f172a',
  textMuted: '#64748b',
  panelBg: 'rgba(255, 255, 255, 0.95)',
  panelBorder: 'rgba(148, 163, 184, 0.5)'
}

export function useResolvedTheme(): 'dark' | 'light' {
  const { theme } = useAppStore()
  const [systemDark, setSystemDark] = useState(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches
  )
  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent): void => setSystemDark(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])
  if (theme === 'system') return systemDark ? 'dark' : 'light'
  return theme
}
