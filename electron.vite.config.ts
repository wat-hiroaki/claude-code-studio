import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@main': resolve('src/main')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
        '@shared': resolve('src/shared'),
        '@components': resolve('src/renderer/src/components'),
        '@stores': resolve('src/renderer/src/stores'),
        '@lib': resolve('src/renderer/src/lib'),
        '@hooks': resolve('src/renderer/src/hooks'),
        '@appTypes': resolve('src/renderer/src/types')
      }
    },
    plugins: [react()],
    css: {
      postcss: resolve(__dirname, 'postcss.config.js')
    }
  }
})
