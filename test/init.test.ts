import { describe, expect, it } from "vitest"
import { initElectronExpose } from "../src/init"
import { createProject, read } from "./helpers"

const INIT_OPTIONS = {
  configPath: "electron-expose.config.ts",
  write: true,
  patchTsconfig: false,
  interactive: false,
}

describe("initElectronExpose", () => {
  it("creates config and patches main, preload, and tsconfig", async () => {
    const cwd = await createProject({
      "src/main.ts": 'import { app } from "electron"\n\napp.whenReady()\n',
      "src/preload.ts": 'console.log("preload")\n',
      "tsconfig.json":
        '{\n  "compilerOptions": {\n    "target": "ES2022"\n  }\n}\n',
    })

    await initElectronExpose({
      cwd,
      configPath: "electron-expose.config.ts",
      write: true,
      patchTsconfig: true,
      interactive: false,
    })

    await expect(read(cwd, "electron-expose.config.ts")).resolves.toContain(
      'root: "src"',
    )
    await expect(read(cwd, "src/main.ts")).resolves.toContain(
      "registerElectronExposeRoutes()",
    )
    await expect(read(cwd, "src/preload.ts")).resolves.toContain(
      "exposeElectronApi()",
    )
    await expect(read(cwd, "tsconfig.json")).resolves.toContain(
      '"experimentalDecorators": true',
    )
  })

  it("does not patch main/preload when write is false", async () => {
    const cwd = await createProject({
      "src/main.ts": 'import { app } from "electron"\n\napp.whenReady()\n',
      "src/preload.ts": 'console.log("preload")\n',
    })

    await initElectronExpose({
      cwd,
      configPath: "electron-expose.config.ts",
      write: false,
      patchTsconfig: false,
      interactive: false,
    })

    await expect(read(cwd, "electron-expose.config.ts")).resolves.toContain(
      'root: "src"',
    )
    await expect(read(cwd, "src/main.ts")).resolves.not.toContain(
      "registerElectronExposeRoutes",
    )
    await expect(read(cwd, "src/preload.ts")).resolves.not.toContain(
      "exposeElectronApi",
    )
  })

  it("creates tsconfig when patching decorators and no tsconfig exists", async () => {
    const cwd = await createProject({
      "src/main.ts": 'import { app } from "electron"\n\napp.whenReady()\n',
    })

    await initElectronExpose({
      cwd,
      configPath: "electron-expose.config.ts",
      write: false,
      patchTsconfig: true,
      interactive: false,
    })

    await expect(read(cwd, "tsconfig.json")).resolves.toContain(
      '"experimentalDecorators": true',
    )
  })

  it("inserts after multi-line imports and leading comments", async () => {
    const cwd = await createProject({
      "src/main.ts": [
        "// Main entry",
        "import {",
        "  app,",
        "  BrowserWindow,",
        '} from "electron"',
        'import path from "node:path" // trailing',
        "",
        "app.whenReady()",
        "",
      ].join("\n"),
      "src/preload.ts": [
        "import {",
        "  contextBridge,",
        '} from "electron"',
        "",
      ].join("\n"),
    })

    await initElectronExpose({ cwd, ...INIT_OPTIONS })

    await expect(read(cwd, "src/main.ts")).resolves.toBe(
      [
        "// Main entry",
        "import {",
        "  app,",
        "  BrowserWindow,",
        '} from "electron"',
        'import path from "node:path" // trailing',
        'import { registerElectronExposeRoutes } from "./generated/electron-expose/main"',
        "",
        "registerElectronExposeRoutes()",
        "",
        "app.whenReady()",
        "",
      ].join("\n"),
    )
    await expect(read(cwd, "src/preload.ts")).resolves.toBe(
      [
        "import {",
        "  contextBridge,",
        '} from "electron"',
        'import { exposeElectronApi } from "./generated/electron-expose/preload"',
        "",
        "exposeElectronApi()",
        "",
      ].join("\n"),
    )
  })

  it("inserts at the top of a file without imports, after a shebang", async () => {
    const cwd = await createProject({
      "src/main.ts": '#!/usr/bin/env node\nconsole.log("main")\n',
    })

    await initElectronExpose({ cwd, ...INIT_OPTIONS })

    await expect(read(cwd, "src/main.ts")).resolves.toBe(
      [
        "#!/usr/bin/env node",
        'import { registerElectronExposeRoutes } from "./generated/electron-expose/main"',
        "",
        "registerElectronExposeRoutes()",
        "",
        'console.log("main")',
        "",
      ].join("\n"),
    )
  })

  it("detects electron-vite entries and leaves the renderer entry alone", async () => {
    const rendererEntry = 'import { createApp } from "vue"\n'
    const cwd = await createProject({
      "src/main/index.ts": 'import { app } from "electron"\n',
      "src/preload/index.ts": 'import { contextBridge } from "electron"\n',
      "src/renderer/src/main.ts": rendererEntry,
    })

    await initElectronExpose({ cwd, ...INIT_OPTIONS })

    await expect(read(cwd, "src/main/index.ts")).resolves.toContain(
      'import { registerElectronExposeRoutes } from "../generated/electron-expose/main"',
    )
    await expect(read(cwd, "src/preload/index.ts")).resolves.toContain(
      'import { exposeElectronApi } from "../generated/electron-expose/preload"',
    )
    await expect(read(cwd, "src/renderer/src/main.ts")).resolves.toBe(
      rendererEntry,
    )
    await expect(read(cwd, "electron-expose.config.ts")).resolves.toContain(
      'rendererGlobal: "src/renderer/src/global.d.ts"',
    )
  })

  it("does not treat a renderer main.ts as the main process entry", async () => {
    const rendererEntry = 'import { createApp } from "vue"\n'
    const cwd = await createProject({
      "src/renderer/main.ts": rendererEntry,
    })

    await initElectronExpose({ cwd, ...INIT_OPTIONS })

    await expect(read(cwd, "src/renderer/main.ts")).resolves.toBe(rendererEntry)
  })
})
