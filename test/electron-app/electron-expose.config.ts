import { defineConfig } from "../../src/index"

export default defineConfig({
  routes: "test/electron-app/src/main/routes/**/*.ts",
  outDir: "test/electron-app/src/generated/electron-expose",
  rendererGlobal: "test/electron-app/src/renderer/global.d.ts",
})
