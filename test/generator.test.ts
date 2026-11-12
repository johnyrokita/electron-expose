import fs from "node:fs/promises"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  generateElectronExpose,
  listElectronExposeRoutes,
  watchElectronExpose,
} from "../src/generator"
import { createProject, read, typecheck } from "./helpers"

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

          @expose({})
          ping(): string {
            return "pong"
          }
        }
      `,
      "src/renderer/checks.ts": `
        export async function checks() {
          const sum: number = await window.api.math.calculate(1, 2, "add")
          const pong: string = await window.api.ping()
          // @ts-expect-error not an Operation
          await window.api.math.calculate(1, 2, "divide")
          return [sum, pong]
        }
      `,
    })

    await generateElectronExpose({
      cwd,
      configPath: "electron-expose.config.ts",
    })

    const main = await read(cwd, "src/generated/electron-expose/main.ts")
    expect(main).toContain('handle("math.calculate"')
    expect(main).toContain(
      "const m0CalculatorRoutes = new m0.CalculatorRoutes()",
    )

    const types = await read(cwd, "src/generated/electron-expose/types.ts")
    expect(types).toContain("math: {")
    expect(types).toContain(
      'calculate: Route<m0.CalculatorRoutes["calculate"]>',
    )
    await expect(typecheck(cwd)).resolves.toEqual([])
  })

  it("supports exported top-level functions through exposed()", async () => {
    const cwd = await createProject({
      "src/main/routes/system.ts": `
        import { exposed } from "electron-expose"
        export const ping = exposed("system.ping", (): string => "pong")

        function readVersion(): string {
          return "1.0.0"
        }
        export const getVersion = exposed("system.getVersion", readVersion)
      `,
      "src/renderer/checks.ts": `
        export async function checks() {
          const pong: string = await window.api.system.ping()
          const version: string = await window.api.system.getVersion()
          return [pong, version]
        }
      `,
    })

    await generateElectronExpose({ cwd })

    await expect(
      read(cwd, "src/generated/electron-expose/main.ts"),
    ).resolves.toContain('handle("system.ping"')
    await expect(
      read(cwd, "src/generated/electron-expose/types.ts"),
    ).resolves.toContain("ping: Route<typeof m0.ping>")
    await expect(typecheck(cwd)).resolves.toEqual([])
  })

  it("keeps optional and default parameters optional in renderer types", async () => {
    const cwd = await createProject({
      "src/main/routes/google-auth.ts": `
        import { exposed } from "electron-expose"

        export const listInboxEmails = exposed(
          "googleAuth.listInboxEmails",
          async (maxResults = 20): Promise<string[]> => [String(maxResults)],
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
      "src/renderer/checks.ts": `
        export async function checks() {
          const { googleAuth } = window.api
          await googleAuth.listInboxEmails()
          await googleAuth.listInboxEmails(5)
          await googleAuth.getEmail("id")
          await googleAuth.getEmail("id", "label")
          await googleAuth.searchEmails(undefined, "query")
          // @ts-expect-error query is required
          await googleAuth.searchEmails()
        }
      `,
    })

    await generateElectronExpose({ cwd })

    await expect(typecheck(cwd)).resolves.toEqual([])
  })

  // Each route here produced generated code that did not compile, or was
  // silently typed as unknown, when signatures were copied as text.
  it("derives renderer types that survive awkward signatures", async () => {
    const cwd = await createProject({
      "src/shared/a.types.ts": `
        export type Item = { a: string }
        export type Other = { o: number }
        export default interface Settings { theme: string }
      `,
      "src/shared/b.ts": `
        export type Item = { b: number }
      `,
      "src/main/routes/one.ts": `
        import { exposed } from "electron-expose"
        import type Settings from "../../shared/a.types"
        import type { Item, Other as Renamed } from "../../shared/a.types"

        type Local = { hidden: true }

        export const list = exposed("one.list", async (): Promise<Item[]> => [])
        export const defaults = exposed(
          "one.defaults",
          async ({ limit = 10 }: { limit?: number }): Promise<number> => limit,
        )
        export const inferred = exposed("one.inferred", async (input: Item) => ({
          got: input.a,
        }))
        export const generic = exposed(
          "one.generic",
          async <K extends keyof Item>(key: K): Promise<Item[K]> =>
            ({ a: "x" })[key],
        )
        export const local = exposed(
          "one.local",
          async (): Promise<Local> => ({ hidden: true }),
        )
        export const aliased = exposed(
          "one.aliased",
          async (): Promise<Renamed> => ({ o: 1 }),
        )
        export const settings = exposed(
          "one.settings",
          async (): Promise<Settings> => ({ theme: "dark" }),
        )
        export const rest = exposed(
          "one.rest",
          async (...ids: string[]): Promise<number> => ids.length,
        )
        export const mixed = exposed(
          "one.mixed",
          (n: number): number | Promise<number> => n,
        )
      `,
      "src/main/routes/two.ts": `
        import { exposed } from "electron-expose"
        import type { Item } from "../../shared/b"

        // Same export name as one.ts, and the same type name from another module.
        export const list = exposed("two.list", async (): Promise<Item[]> => [])
      `,
      "src/renderer/checks.ts": `
        export async function checks() {
          const { one, two } = window.api
          const a: { a: string }[] = await one.list()
          const b: { b: number }[] = await two.list()
          const c: number = await one.defaults({ limit: 3 })
          const d: { got: string } = await one.inferred({ a: "x" })
          const e: string = await one.generic("a")
          // @ts-expect-error not a key of Item
          await one.generic("missing")
          const f: { hidden: true } = await one.local()
          const g: { o: number } = await one.aliased()
          const h: { theme: string } = await one.settings()
          const i: number = await one.rest("a", "b", "c")
          const j: number = await one.mixed(1)
          return [a, b, c, d, e, f, g, h, i, j]
        }
      `,
    })

    await generateElectronExpose({ cwd })

    await expect(typecheck(cwd)).resolves.toEqual([])
  })

  it("copies route doc comments onto the renderer types", async () => {
    const cwd = await createProject({
      "src/main/routes/updates.ts": `
        import { expose, exposed } from "electron-expose"

        /**
         * Installs the downloaded update.
         * Quits the app when it finishes.
         */
        export const install = exposed("updates.install", async (): Promise<void> => {})

        export class UpdateRoutes {
          /** Checks for a new version. */
          @expose("updates.check")
          check(): boolean {
            return false
          }
        }
      `,
    })

    await generateElectronExpose({ cwd })

    const types = await read(cwd, "src/generated/electron-expose/types.ts")
    expect(types).toContain(
      [
        "    /**",
        "     * Installs the downloaded update.",
        "     * Quits the app when it finishes.",
        "     */",
        "    install: Route<typeof m0.install>",
      ].join("\n"),
    )
    expect(types).toContain(
      [
        "    /** Checks for a new version. */",
        '    check: Route<m0.UpdateRoutes["check"]>',
      ].join("\n"),
    )
  })

  it("supports a global API name that is not an identifier", async () => {
    const cwd = await createProject({
      "electron-expose.config.ts": `
        export default { globalApiName: "my-api" }
      `,
      "src/main/routes/ok.ts": `
        import { exposed } from "electron-expose"
        export const ok = exposed((): string => "ok")
      `,
      "src/renderer/checks.ts": `
        export async function checks() {
          const ok: string = await window["my-api"].ok()
          return ok
        }
      `,
    })

    await generateElectronExpose({ cwd })

    await expect(
      read(cwd, "src/generated/electron-expose/preload.ts"),
    ).resolves.toContain('exposeInMainWorld("my-api"')
    await expect(typecheck(cwd)).resolves.toEqual([])
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

    await generateElectronExpose({ cwd })

    const types = await read(cwd, "src/generated/electron-expose/types.ts")
    expect(types).toContain("ok: Route<typeof m0.ok>")
    expect(types).not.toContain("stale")
  })

  it("does not rewrite generated files that are already up to date", async () => {
    const cwd = await createProject({
      "src/main/routes/ok.ts": `
        import { exposed } from "electron-expose"
        export const ok = exposed((): string => "ok")
      `,
    })
    const generated = [
      "src/generated/electron-expose/main.ts",
      "src/generated/electron-expose/preload.ts",
      "src/generated/electron-expose/types.ts",
      "src/renderer/global.d.ts",
    ]
    const old = new Date("2020-01-01T00:00:00Z")

    await generateElectronExpose({ cwd })
    for (const file of generated)
      await fs.utimes(path.join(cwd, file), old, old)
    await generateElectronExpose({ cwd })

    for (const file of generated) {
      const { mtime } = await fs.stat(path.join(cwd, file))
      expect(mtime).toEqual(old)
    }
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

    await expect(generateElectronExpose({ cwd })).rejects.toThrow(
      'Duplicate exposed route key "same.key"',
    )
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

    await expect(generateElectronExpose({ cwd })).rejects.toThrow(
      'Exposed route key "math" conflicts with nested key "math.add"',
    )
  })

  it.each([
    ["static", "static stat(): string"],
    ["private", "private secret(): string"],
  ])("fails on an exposed %s method", async (_kind, signature) => {
    const cwd = await createProject({
      "src/routes.ts": `
        import { expose } from "electron-expose"
        export class Routes {
          @expose("routes.bad")
          ${signature} {
            return "nope"
          }
        }
      `,
    })

    await expect(generateElectronExpose({ cwd })).rejects.toThrow(
      "must be a public instance method",
    )
  })

  it("fails when an explicitly given config file does not exist", async () => {
    const cwd = await createProject({
      "src/main/routes/ok.ts": `
        import { exposed } from "electron-expose"
        export const ok = exposed((): string => "ok")
      `,
    })

    await expect(
      generateElectronExpose({ cwd, configPath: "typo.config.ts" }),
    ).rejects.toThrow("Config file not found: typo.config.ts")
  })

  it("explains when source files match but no routes are exposed", async () => {
    const cwd = await createProject({
      "src/main/routes/plain.ts": `
        export function notExposed(): string {
          return "nope"
        }
      `,
    })

    await expect(generateElectronExpose({ cwd })).rejects.toThrow(
      "No exposed routes found in 1 matched source file",
    )
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

        export const uptime = exposed("system.uptime", () => 42)
      `,
    })
    const log = vi.spyOn(console, "log").mockImplementation(() => {})

    await listElectronExposeRoutes({ cwd })

    expect(log).toHaveBeenCalledOnce()
    expect(log.mock.calls[0]?.[0]).toContain(
      "googleAuth.listInboxEmails  (maxResults?: number) => Promise<string[]>  src/main/routes/system.ts",
    )
    expect(log.mock.calls[0]?.[0]).toContain(
      "system.getVersion  () => Promise<string>  src/main/routes/system.ts",
    )
    expect(log.mock.calls[0]?.[0]).toContain(
      "system.uptime  () => Promise<number>  src/main/routes/system.ts",
    )

    await expect(
      read(cwd, "src/generated/electron-expose/types.ts"),
    ).rejects.toThrow()
  })
})

describe("watchElectronExpose", () => {
  it("regenerates when a route file is added", async () => {
    const cwd = await createProject({
      "src/main/routes/ok.ts": `
        import { exposed } from "electron-expose"
        export const ok = exposed((): string => "ok")
      `,
    })
    vi.spyOn(console, "log").mockImplementation(() => {})

    const stop = await watchElectronExpose({ cwd })
    try {
      await fs.writeFile(
        path.join(cwd, "src/main/routes/added.ts"),
        `
          import { exposed } from "electron-expose"
          export const added = exposed((): string => "added")
        `,
        "utf8",
      )

      await vi.waitFor(
        async () => {
          await expect(
            read(cwd, "src/generated/electron-expose/types.ts"),
          ).resolves.toContain("added: Route<typeof m0.added>")
        },
        { timeout: 10_000, interval: 100 },
      )
    } finally {
      stop()
    }
  })
})
