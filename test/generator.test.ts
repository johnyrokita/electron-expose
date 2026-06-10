import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  generateElectronExpose,
  listElectronExposeRoutes,
} from "../src/generator"

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

describe("generateElectronExpose", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("generates nested renderer API from decorated class methods", async () => {
    const cwd = await createProject({
      "electron-expose.config.ts": `
        export default { root: "src" }
      `,
      "src/main/routes/calculator.ts": `
        import { expose } from "electron-expose"
        export type Operation = "add" | "multiply"

        export class CalculatorRoutes {
          @expose("math.calculate")
          calculate(a: number, b: number, operation: Operation): number {
            return operation === "add" ? a + b : a * b
          }
        }
      `,
    })

    await generateElectronExpose({
      cwd,
      configPath: "electron-expose.config.ts",
    })

    await expect(
      read(cwd, "src/generated/electron-expose/main.ts"),
    ).resolves.toContain('ipcMain.handle("electron-expose:math.calculate"')
    await expect(
      read(cwd, "src/generated/electron-expose/main.ts"),
    ).resolves.toContain("const calculatorRoutes = new CalculatorRoutes()")
    await expect(
      read(cwd, "src/generated/electron-expose/types.ts"),
    ).resolves.toContain("math: {")
    await expect(
      read(cwd, "src/generated/electron-expose/types.ts"),
    ).resolves.toContain(
      "calculate(a: number, b: number, operation: Operation): Promise<number>",
    )
  })

  it("supports exported top-level functions through exposed()", async () => {
    const cwd = await createProject({
      "src/main/routes/system.ts": `
        import { exposed } from "electron-expose"
        export const ping = exposed("system.ping", (): string => "pong")
      `,
    })

    await generateElectronExpose({ cwd, configPath: "missing.config.ts" })

    await expect(
      read(cwd, "src/generated/electron-expose/main.ts"),
    ).resolves.toContain('ipcMain.handle("electron-expose:system.ping"')
    await expect(
      read(cwd, "src/generated/electron-expose/types.ts"),
    ).resolves.toContain("ping(): Promise<string>")
  })

  it("keeps optional and default parameters optional in renderer types", async () => {
    const cwd = await createProject({
      "src/main/routes/google-auth.ts": `
        import { exposed } from "electron-expose"

        export const listInboxEmails = exposed(
          "googleAuth.listInboxEmails",
          async (maxResults = 20): Promise<string[]> => [],
        )

        export const getEmail = exposed(
          "googleAuth.getEmail",
          async (id: string, label?: string): Promise<string> => id + label,
        )

        export const searchEmails = exposed(
          "googleAuth.searchEmails",
          async (page = 1, query: string): Promise<string[]> => [query, String(page)],
        )
      `,
    })

    await generateElectronExpose({ cwd, configPath: "missing.config.ts" })

    const types = await read(cwd, "src/generated/electron-expose/types.ts")
    expect(types).toContain("listInboxEmails(maxResults?: number)")
    expect(types).toContain("getEmail(id: string, label?: string)")
    expect(types).toContain(
      "searchEmails(page: number | undefined, query: string)",
    )

    const main = await read(cwd, "src/generated/electron-expose/main.ts")
    expect(main).toContain("maxResults?: number")
    expect(main).toContain("label?: string")
    expect(main).toContain("page: number | undefined, query: string")
  })

  it("ignores generated files while root scanning", async () => {
    const cwd = await createProject({
      "src/main/routes/ok.ts": `
        import { exposed } from "electron-expose"
        export const ok = exposed((): string => "ok")
      `,
      "src/generated/electron-expose/old.ts": `
        import { exposed } from "electron-expose"
        export const stale = exposed((): string => "stale")
      `,
    })

    await generateElectronExpose({ cwd, configPath: "missing.config.ts" })

    const types = await read(cwd, "src/generated/electron-expose/types.ts")
    expect(types).toContain("ok(): Promise<string>")
    expect(types).not.toContain("stale")
  })

  it("fails on duplicate route keys", async () => {
    const cwd = await createProject({
      "src/a.ts": `
        import { exposed } from "electron-expose"
        export const a = exposed("same.key", (): string => "a")
      `,
      "src/b.ts": `
        import { exposed } from "electron-expose"
        export const b = exposed("same.key", (): string => "b")
      `,
    })

    await expect(
      generateElectronExpose({ cwd, configPath: "missing.config.ts" }),
    ).rejects.toThrow('Duplicate exposed route key "same.key"')
  })

  it("fails on parent and child route key conflicts", async () => {
    const cwd = await createProject({
      "src/a.ts": `
        import { exposed } from "electron-expose"
        export const a = exposed("math", (): string => "a")
      `,
      "src/b.ts": `
        import { exposed } from "electron-expose"
        export const b = exposed("math.add", (): string => "b")
      `,
    })

    await expect(
      generateElectronExpose({ cwd, configPath: "missing.config.ts" }),
    ).rejects.toThrow(
      'Exposed route key "math" conflicts with nested key "math.add"',
    )
  })

  it("explains when source files match but no routes are exposed", async () => {
    const cwd = await createProject({
      "src/main/routes/plain.ts": `
        export function notExposed(): string {
          return "nope"
        }
      `,
    })

    await expect(
      generateElectronExpose({ cwd, configPath: "missing.config.ts" }),
    ).rejects.toThrow("No exposed routes found in 1 matched source file")
  })

  it("lists discovered routes without generating files", async () => {
    const cwd = await createProject({
      "src/main/routes/system.ts": `
        import { exposed } from "electron-expose"

        export const getVersion = exposed(
          "system.getVersion",
          async (): Promise<string> => "1.0.0",
        )

        export const listInboxEmails = exposed(
          "googleAuth.listInboxEmails",
          async (maxResults = 20): Promise<string[]> => [],
        )
      `,
    })
    const log = vi.spyOn(console, "log").mockImplementation(() => {})

    await listElectronExposeRoutes({ cwd, configPath: "missing.config.ts" })

    expect(log).toHaveBeenCalledOnce()
    expect(log.mock.calls[0]?.[0]).toContain(
      "googleAuth.listInboxEmails  (maxResults?: number) => Promise<string[]>  src/main/routes/system.ts",
    )
    expect(log.mock.calls[0]?.[0]).toContain(
      "system.getVersion  () => Promise<string>  src/main/routes/system.ts",
    )

    await expect(
      read(cwd, "src/generated/electron-expose/types.ts"),
    ).rejects.toThrow()
  })
})
