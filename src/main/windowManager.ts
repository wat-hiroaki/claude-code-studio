import { app, shell, BrowserWindow, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import type { Database } from '@main/database'
import { t } from '@main/i18n'

function createTrayIcon(): Electron.NativeImage {
  const size = 16
  const canvas = Buffer.alloc(size * size * 4) // RGBA

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = size / 2 - 0.5
      const cy = size / 2 - 0.5
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
      const idx = (y * size + x) * 4

      if (dist < size / 2 - 1) {
        canvas[idx] = 99      // R
        canvas[idx + 1] = 102 // G
        canvas[idx + 2] = 241 // B
        canvas[idx + 3] = 255 // A
      } else if (dist < size / 2) {
        canvas[idx] = 99
        canvas[idx + 1] = 102
        canvas[idx + 2] = 241
        canvas[idx + 3] = 128
      }
    }
  }

  return nativeImage.createFromBuffer(canvas, { width: size, height: size })
}

export function createWindow(database: Database): BrowserWindow {
  const settings = database.getSettings()
  const bounds = settings.windowBounds

  const mainWindow = new BrowserWindow({
    width: bounds?.width ?? 1280,
    height: bounds?.height ?? 800,
    x: bounds?.x,
    y: bounds?.y,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#1a1a2e',
      symbolColor: '#e0e0e0',
      height: 36
    },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true
    }
  })

  if (bounds?.isMaximized) {
    mainWindow.maximize()
  }

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // Save window bounds on resize/move
  const saveWindowBounds = (): void => {
    if (!mainWindow) return
    const isMaximized = mainWindow.isMaximized()
    const windowBounds = isMaximized ? settings.windowBounds : { ...mainWindow.getBounds(), isMaximized: false }
    if (windowBounds) {
      database.updateSettings({ windowBounds: { ...windowBounds, isMaximized } })
    }
  }
  mainWindow.on('resize', saveWindowBounds)
  mainWindow.on('move', saveWindowBounds)
  mainWindow.on('maximize', saveWindowBounds)
  mainWindow.on('unmaximize', saveWindowBounds)

  mainWindow.webContents.setWindowOpenHandler((details) => {
    try {
      const url = new URL(details.url)
      if (url.protocol === 'https:' || url.protocol === 'http:') {
        shell.openExternal(details.url)
      }
    } catch { /* invalid URL, ignore */ }
    return { action: 'deny' }
  })

  // Minimize to tray instead of closing
  mainWindow.on('close', (e) => {
    if (!(app as any).isQuitting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

export function createTray(
  database: Database,
  getMainWindow: () => BrowserWindow | null
): Tray {
  const icon = createTrayIcon()
  const tray = new Tray(icon)
  tray.setToolTip('Claude Code Studio')

  updateTrayMenu(tray, database, getMainWindow)

  tray.on('click', () => {
    getMainWindow()?.show()
  })

  return tray
}

export function updateTrayMenu(
  tray: Tray,
  database: Database,
  getMainWindow: () => BrowserWindow | null
): void {
  const stats = database.getTeamStats()
  const contextMenu = Menu.buildFromTemplate([
    { label: t('tray.status').replace('{{active}}', String(stats.active)).replace('{{error}}', String(stats.error)), enabled: false },
    { type: 'separator' },
    { label: t('tray.showWindow'), click: () => getMainWindow()?.show() },
    { label: t('tray.dashboard'), click: () => {
      getMainWindow()?.show()
      getMainWindow()?.webContents.send('notification', 'Dashboard', 'Toggle dashboard from tray')
    }},
    { type: 'separator' },
    {
      label: t('tray.quit'),
      click: () => {
        ;(app as any).isQuitting = true
        app.quit()
      }
    }
  ])
  tray.setContextMenu(contextMenu)
}
