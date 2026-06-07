import { defineConfig } from "electron-expose"

export default defineConfig({
  root: "src",
  outDir: "src/generated/electron-expose",
  rendererGlobal: "src/renderer/global.d.ts",
})
