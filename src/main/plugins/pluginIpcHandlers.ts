import { ipcMain } from 'electron'
import type { PluginManager } from './pluginManager'

export function registerPluginHandlers(pluginManager: PluginManager): void {
  ipcMain.handle('plugin:list', () => pluginManager.getPlugins())
  ipcMain.handle('plugin:toolbar-buttons', () => pluginManager.getToolbarButtons())
  ipcMain.handle('plugin:context-tabs', () => pluginManager.getContextTabs())
  ipcMain.handle('plugin:call', (_e, pluginId: string, tool: string, args: Record<string, unknown>) =>
    pluginManager.callTool(pluginId, tool, args)
  )
  ipcMain.handle('plugin:install', (_e, pluginId: string) => pluginManager.install(pluginId))
}
