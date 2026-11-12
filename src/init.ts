import fs from "node:fs/promises"
import fsSync from "node:fs"
import path from "node:path"
import {
  confirm,
  intro,
  isCancel,
  log,
  outro,
  spinner,
  text,
} from "@clack/prompts"
import { applyEdits, modify } from "jsonc-parser"
import pc from "picocolors"
import { ts } from "ts-morph"

type InitOptions = {
  configPath: string
  cwd?: string
  root?: string
  write: boolean
  patchTsconfig: boolean
  interactive: boolean
}

type Detection = {
  cwd: string
  root: string
  main?: string
  preload?: string
  rendererGlobal: string
}

type TaskReporter = {
  start(message: string): void
  stop(message: string): void
}

// Known entry locations, checked in order. The `index.ts` entries cover the
// electron-vite and vite-plugin-electron layouts.
const MAIN_CANDIDATES = [
  "src/main.ts",
  "src/main/main.ts",
  "src/main/index.ts",
  "src/electron/main.ts",
  "electron/main.ts",
  "electron/main/index.ts",
  "app/main.ts",
]

const PRELOAD_CANDIDATES = [
  "src/preload.ts",
  "src/main/preload.ts",
  "src/preload/index.ts",
  "src/electron/preload.ts",
  "electron/preload.ts",
  "electron/preload/index.ts",
  "app/preload.ts",
]

export async function initElectronExpose(options: InitOptions): Promise<void> {
  const cwd = options.cwd ?? process.cwd()
  let detection = detectProject(cwd, options.root)
  const configPath = path.resolve(cwd, options.configPath)
  const canPrompt =
    options.interactive && process.stdin.isTTY && process.stdout.isTTY
  let shouldWrite = options.write
  let shouldPatchTsconfig = options.patchTsconfig

  if (canPrompt) {
    intro(pc.bgCyan(pc.black(" electron-expose init ")))
    printDetected(detection)

    const root = await text({
      message: "Source root to scan",
      placeholder: detection.root,
      defaultValue: detection.root,
    })
    if (isCancel(root)) return cancelInit()

    detection = detectProject(cwd, String(root))

    const writeAnswer = await confirm({
      message: "Patch detected main/preload files?",
      initialValue: Boolean(detection.main || detection.preload),
    })
    if (isCancel(writeAnswer)) return cancelInit()
    shouldWrite = Boolean(writeAnswer)

    const tsconfigAnswer = await confirm({
      message: "Enable experimentalDecorators in tsconfig.json?",
      initialValue: true,
    })
    if (isCancel(tsconfigAnswer)) return cancelInit()
    shouldPatchTsconfig = Boolean(tsconfigAnswer)
  } else {
    console.log(pc.cyan("electron-expose init"))
    printDetected(detection, false)
  }

  const s = createTaskReporter(canPrompt)
  s.start("Writing configuration")
  if (!fsSync.existsSync(configPath)) {
    await fs.writeFile(configPath, renderConfig(detection), "utf8")
    s.stop(`${pc.green("created")} ${path.relative(cwd, configPath)}`)
  } else {
    s.stop(`${pc.yellow("exists")} ${path.relative(cwd, configPath)}`)
  }

  const patched: string[] = []

  if (shouldPatchTsconfig) {
    s.start("Updating tsconfig.json")
    const tsconfig = await patchTsconfig(cwd)
    if (tsconfig) {
      patched.push(tsconfig)
      s.stop(`${pc.green("patched")} ${tsconfig}`)
    } else {
      s.stop(
        `${pc.yellow("skipped")} tsconfig.json already enables experimentalDecorators`,
      )
    }
  }

  if (shouldWrite && detection.main) {
    s.start("Patching main process entry")
    if (await patchMain(path.resolve(cwd, detection.main), detection)) {
      patched.push(detection.main)
      s.stop(`${pc.green("patched")} ${detection.main}`)
    } else {
      s.stop(
        `${pc.yellow("skipped")} ${detection.main} already imports registerElectronExposeRoutes`,
      )
    }
  }

  if (shouldWrite && detection.preload) {
    s.start("Patching preload entry")
    if (await patchPreload(path.resolve(cwd, detection.preload), detection)) {
      patched.push(detection.preload)
      s.stop(`${pc.green("patched")} ${detection.preload}`)
    } else {
      s.stop(
        `${pc.yellow("skipped")} ${detection.preload} already imports exposeElectronApi`,
      )
    }
  }

  if (shouldWrite && !detection.main && !detection.preload) {
    reportWarn(
      canPrompt,
      "No main/preload files were detected. Add registerElectronExposeRoutes() and exposeElectronApi() manually.",
    )
  } else if (!shouldWrite) {
    reportMessage(
      canPrompt,
      `Run ${pc.bold("electron-expose init --write")} to patch detected main/preload files.`,
    )
  }

  if (canPrompt) {
    outro(pc.green("electron-expose is ready"))
    return
  }

  if (patched.length > 0)
    console.log(`${pc.green("Patched")} ${patched.join(", ")}`)
}

function detectProject(cwd: string, configuredRoot?: string): Detection {
  const root = configuredRoot ?? detectSourceRoot(cwd)
  const main =
    findFirst(cwd, MAIN_CANDIDATES) ?? findByName(cwd, root, "main.ts")
  const preload =
    findFirst(cwd, PRELOAD_CANDIDATES) ?? findByName(cwd, root, "preload.ts")
  // The deepest existing renderer source directory, so the declaration lands
  // where the renderer's tsconfig already looks (electron-vite uses
  // `renderer/src`).
  const rendererDir =
    ["renderer/src", "renderer"].find((dir) =>
      fsSync.existsSync(path.join(cwd, root, dir)),
    ) ?? ""
  const rendererGlobal = path.join(root, rendererDir, "global.d.ts")

  return {
    cwd,
    root,
    main,
    preload,
    rendererGlobal: rendererGlobal.replaceAll(path.sep, "/"),
  }
}

function detectSourceRoot(cwd: string): string {
  for (const candidate of ["src", "app", "electron"]) {
    if (fsSync.existsSync(path.join(cwd, candidate))) return candidate
  }

  return "."
}

function findFirst(cwd: string, candidates: string[]): string | undefined {
  return candidates.find((candidate) =>
    fsSync.existsSync(path.join(cwd, candidate)),
  )
}

/**
 * Fallback for layouts not in the candidate lists: the shallowest file with the
 * given name under the source root. Renderer folders are skipped, since a
 * renderer entry is often called `main.ts` too.
 */
function findByName(
  cwd: string,
  root: string,
  fileName: string,
): string | undefined {
  const rootPath = path.resolve(cwd, root)
  if (!fsSync.existsSync(rootPath)) return undefined

  const queue = [rootPath]
  while (queue.length > 0) {
    const current = queue.shift() as string
    const entries = fsSync.readdirSync(current, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name)
      if (
        entry.isDirectory() &&
        ![
          "node_modules",
          "dist",
          "build",
          "out",
          ".vite",
          "generated",
          "renderer",
        ].includes(entry.name)
      ) {
        queue.push(fullPath)
      } else if (entry.isFile() && entry.name === fileName) {
        return path.relative(cwd, fullPath).replaceAll(path.sep, "/")
      }
    }
  }

  return undefined
}

function renderConfig(detection: Detection): string {
  return `import { defineConfig } from "electron-expose"

export default defineConfig({
  root: "${detection.root}",
  outDir: "${trimTrailingSlash(detection.root)}/generated/electron-expose",
  rendererGlobal: "${detection.rendererGlobal}",
})
`
}

async function patchTsconfig(cwd: string): Promise<string | undefined> {
  const tsconfigPath = path.join(cwd, "tsconfig.json")
  const relativePath = "tsconfig.json"

  if (!fsSync.existsSync(tsconfigPath)) {
    await fs.writeFile(
      tsconfigPath,
      `${JSON.stringify({ compilerOptions: { experimentalDecorators: true } }, null, 2)}\n`,
      "utf8",
    )
    return relativePath
  }

  const before = await fs.readFile(tsconfigPath, "utf8")
  if (/"experimentalDecorators"\s*:\s*true/.test(before)) return undefined

  const edits = modify(
    before,
    ["compilerOptions", "experimentalDecorators"],
    true,
    {
      formattingOptions: {
        insertSpaces: true,
        tabSize: 2,
      },
    },
  )

  await fs.writeFile(tsconfigPath, applyEdits(before, edits), "utf8")
  return relativePath
}

async function patchMain(
  filePath: string,
  detection: Detection,
): Promise<boolean> {
  const before = await fs.readFile(filePath, "utf8")
  if (before.includes("registerElectronExposeRoutes")) return false

  const importPath = relativeImport(
    path.dirname(filePath),
    path.resolve(
      detection.cwd,
      detection.root,
      "generated/electron-expose/main.ts",
    ),
  )
  const after = insertImportAndCall(
    before,
    "registerElectronExposeRoutes",
    importPath,
  )
  await fs.writeFile(filePath, after, "utf8")
  return true
}

async function patchPreload(
  filePath: string,
  detection: Detection,
): Promise<boolean> {
  const before = await fs.readFile(filePath, "utf8")
  if (before.includes("exposeElectronApi")) return false

  const importPath = relativeImport(
    path.dirname(filePath),
    path.resolve(
      detection.cwd,
      detection.root,
      "generated/electron-expose/preload.ts",
    ),
  )
  const after = insertImportAndCall(before, "exposeElectronApi", importPath)
  await fs.writeFile(filePath, after, "utf8")
  return true
}

/**
 * Adds an import and a call to it right after the file's last import
 * declaration, or at the top of the file when it has none.
 *
 * The file is parsed rather than scanned line by line, so multi-line imports
 * and leading comments are handled.
 */
function insertImportAndCall(
  source: string,
  name: string,
  importPath: string,
): string {
  const eol = source.includes("\r\n") ? "\r\n" : "\n"
  const inserted = [
    `import { ${name} } from "${importPath}"`,
    "",
    `${name}()`,
  ].join(eol)

  const lastImport = ts
    .createSourceFile("entry.ts", source, ts.ScriptTarget.Latest)
    .statements.filter(ts.isImportDeclaration)
    .at(-1)

  if (!lastImport) {
    // Keep a shebang on the first line.
    const start = source.startsWith("#!") ? source.indexOf("\n") + 1 : 0
    const rest = source.slice(start)
    return `${source.slice(0, start)}${inserted}${eol}${rest ? eol : ""}${rest}`
  }

  // Insert after the line the import ends on, keeping any trailing comment.
  const lineEnd = source.indexOf("\n", lastImport.end)
  const head = lineEnd === -1 ? source : source.slice(0, lineEnd + 1)
  const rest =
    lineEnd === -1 ? "" : source.slice(lineEnd + 1).replace(/^\s*\n/, "")
  const separator = head.endsWith("\n") ? "" : eol
  return `${head}${separator}${inserted}${eol}${rest ? eol : ""}${rest}`
}

function relativeImport(fromDir: string, toFile: string): string {
  const parsed = path.parse(toFile)
  const withoutExtension = path.join(parsed.dir, parsed.name)
  let specifier = path
    .relative(fromDir, withoutExtension)
    .replaceAll(path.sep, "/")
  if (!specifier.startsWith(".")) specifier = `./${specifier}`
  return specifier
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "")
}

function createTaskReporter(interactive: boolean): TaskReporter {
  if (interactive) return spinner()

  return {
    start(message: string) {
      console.log(pc.dim(`- ${message}`))
    },
    stop(message: string) {
      console.log(message)
    },
  }
}

function printDetected(detection: Detection, interactive = true): void {
  const message = [
    `${pc.dim("root")}    ${pc.cyan(detection.root)}`,
    `${pc.dim("main")}    ${detection.main ? pc.cyan(detection.main) : pc.yellow("not found")}`,
    `${pc.dim("preload")} ${detection.preload ? pc.cyan(detection.preload) : pc.yellow("not found")}`,
  ].join("\n")

  if (interactive) {
    log.message(message)
    return
  }

  console.log(message)
}

function reportWarn(interactive: boolean, message: string): void {
  if (interactive) {
    log.warn(message)
    return
  }

  console.log(pc.yellow(message))
}

function reportMessage(interactive: boolean, message: string): void {
  if (interactive) {
    log.message(message)
    return
  }

  console.log(message)
}

function cancelInit(): void {
  outro(pc.yellow("init cancelled"))
}
