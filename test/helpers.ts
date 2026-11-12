import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import fg from "fast-glob"
import ts from "typescript"

// Just enough of Electron's API for generated code to type-check without
// loading the real declarations. The example app covers the real ones.
const ELECTRON_STUB = `declare module "electron" {
  export const ipcMain: {
    handle(channel: string, listener: (event: unknown, ...args: any[]) => unknown): void
  }
  export const ipcRenderer: {
    invoke(channel: string, ...args: unknown[]): Promise<any>
  }
  export const contextBridge: {
    exposeInMainWorld(name: string, api: unknown): void
  }
}
`

/** Creates a temporary project from a map of relative paths to contents. */
export async function createProject(files: Record<string, string>) {
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

export async function read(cwd: string, file: string) {
  return fs.readFile(path.join(cwd, file), "utf8")
}

/**
 * Type-checks every TypeScript file in a project under `strict`, with
 * `electron-expose` resolved to this repo's source. Returns one line per
 * diagnostic, so a passing project returns an empty array.
 */
export async function typecheck(cwd: string): Promise<string[]> {
  await fs.writeFile(path.join(cwd, "electron.d.ts"), ELECTRON_STUB, "utf8")

  const files = await fg("**/*.{ts,tsx}", {
    cwd,
    absolute: true,
    ignore: ["electron-expose.config.ts"],
  })
  const program = ts.createProgram(files, {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    experimentalDecorators: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    types: [],
    paths: { "electron-expose": [path.resolve("src/index.ts")] },
  })

  return ts.getPreEmitDiagnostics(program).map((diagnostic) => {
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")
    if (!diagnostic.file || diagnostic.start === undefined) return message

    const { line } = diagnostic.file.getLineAndCharacterOfPosition(
      diagnostic.start,
    )
    return `${path.relative(cwd, diagnostic.file.fileName)}:${line + 1} ${message}`
  })
}
