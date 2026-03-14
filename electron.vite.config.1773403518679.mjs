// electron.vite.config.ts
import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
var __electron_vite_injected_dirname = "C:\\Users\\user\\claude-code-desktop";
var electron_vite_config_default = defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        "@shared": resolve("src/shared")
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        "@shared": resolve("src/shared")
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        "@": resolve("src/renderer/src"),
        "@shared": resolve("src/shared")
      }
    },
    plugins: [react()],
    css: {
      postcss: resolve(__electron_vite_injected_dirname, "postcss.config.js")
    }
  }
});
export {
  electron_vite_config_default as default
};
