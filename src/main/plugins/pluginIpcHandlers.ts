import { ipcMain, dialog, BrowserWindow } from 'electron'
import type { PluginManager } from './pluginManager'

export function registerPluginHandlers(pluginManager: PluginManager): void {
  ipcMain.handle('plugin:list', () => pluginManager.getPlugins())
  ipcMain.handle('plugin:toolbar-buttons', () => pluginManager.getToolbarButtons())
  ipcMain.handle('plugin:context-tabs', () => pluginManager.getContextTabs())

  ipcMain.handle('plugin:call', (_e, pluginId: string, tool: string, args: Record<string, unknown>) => {
    if (typeof pluginId !== 'string' || typeof tool !== 'string') {
      throw new Error('Invalid plugin call parameters')
    }

    // Validate pluginId exists and is running
    const plugins = pluginManager.getPlugins()
    const plugin = plugins.find((p) => p.id === pluginId)
    if (!plugin) throw new Error(`Unknown plugin: ${pluginId}`)
    if (plugin.status !== 'running') throw new Error(`Plugin ${pluginId} is not running`)

    // Validate tool is declared in manifest
    const declaredTools = plugin.manifest.tools.map((t) => t.name)
    if (!declaredTools.includes(tool)) {
      throw new Error(`Tool "${tool}" is not declared by plugin "${pluginId}"`)
    }

    return pluginManager.callTool(pluginId, tool, args)
  })

  ipcMain.handle('plugin:install', async (_e, pluginId: string) => {
    if (typeof pluginId !== 'string') throw new Error('Invalid plugin ID')

    const plugins = pluginManager.getPlugins()
    const plugin = plugins.find((p) => p.id === pluginId)
    if (!plugin) throw new Error(`Unknown plugin: ${pluginId}`)
    if (!plugin.manifest.install?.steps?.length) {
      throw new Error(`Plugin ${pluginId} has no install steps`)
    }

    // Show confirmation dialog with the commands that will be executed
    const window = BrowserWindow.getFocusedWindow()
    const stepsPreview = plugin.manifest.install.steps
      .map((s, i) => `  ${i + 1}. ${s}`)
      .join('\n')

    const result = await dialog.showMessageBox(window ?? BrowserWindow.getAllWindows()[0], {
      type: 'warning',
      title: 'Plugin Installation',
      message: `Install plugin "${plugin.manifest.name}"?`,
      detail: `The following commands will be executed:\n\n${stepsPreview}\n\nOnly install plugins from trusted sources.`,
      buttons: ['Cancel', 'Install'],
      defaultId: 0,
      cancelId: 0
    })

    if (result.response !== 1) {
      throw new Error('Installation cancelled by user')
    }

    return pluginManager.install(pluginId)
  })
}
