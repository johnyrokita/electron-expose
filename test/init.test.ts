import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { initElectronExpose } from "../src/init"

async function createProject(files: Record<string, string>) {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "electron-expose-"))

  await Promise.all(
    Object.entries(files).map(async ([file, contents]) => {
      const fullPath = path.join(cwd, file)
      await fs.mkdir(path.dirname(fullPath), { recursive: true })
      await fs.writeFile(fullPath, contents, "utf8")
    }),
  )

  return cwd
}

async function read(cwd: string, file: string) {
  return fs.readFile(path.join(cwd, file), "utf8")
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
})
